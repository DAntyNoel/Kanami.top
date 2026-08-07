package monitor

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"kanami.local/cliproxy-memory-killbot/internal/config"
	"kanami.local/cliproxy-memory-killbot/internal/dockerapi"
)

const (
	levelNormal   = "normal"
	levelWarning  = "warning"
	levelCritical = "critical"
	maxEvents     = 100
)

type SourceState struct {
	HasSample          bool      `json:"has_sample"`
	ObservedAt         time.Time `json:"observed_at,omitempty"`
	Bytes              uint64    `json:"bytes"`
	LimitBytes         uint64    `json:"limit_bytes,omitempty"`
	ProcessCount       uint64    `json:"process_count,omitempty"`
	WarnConsecutive    int       `json:"warn_consecutive"`
	RestartConsecutive int       `json:"restart_consecutive"`
	ErrorConsecutive   int       `json:"error_consecutive"`
	Level              string    `json:"level"`
	LastError          string    `json:"last_error,omitempty"`
}

type Event struct {
	Timestamp time.Time `json:"timestamp"`
	Kind      string    `json:"kind"`
	Source    string    `json:"source,omitempty"`
	Message   string    `json:"message"`
}

type persistedState struct {
	Version           int         `json:"version"`
	Container         SourceState `json:"container"`
	RestartLatched    bool        `json:"restart_latched"`
	RestartInFlight   bool        `json:"restart_in_flight"`
	LastRestartAt     time.Time   `json:"last_restart_at,omitempty"`
	CooldownUntil     time.Time   `json:"cooldown_until,omitempty"`
	LastRestartReason string      `json:"last_restart_reason,omitempty"`
	LastRestartResult string      `json:"last_restart_result,omitempty"`
	Events            []Event     `json:"events"`
}

type SourceDetails struct {
	SourceState
	WarnBytes      uint64 `json:"warn_bytes"`
	RestartBytes   uint64 `json:"restart_bytes"`
	RecoveryBytes  uint64 `json:"recovery_bytes"`
	WarnSamples    int    `json:"warn_samples"`
	RestartSamples int    `json:"restart_samples"`
}

type DetailedStatus struct {
	State             string        `json:"state"`
	Message           string        `json:"message"`
	GeneratedAt       time.Time     `json:"generated_at"`
	Container         SourceDetails `json:"container"`
	RestartLatched    bool          `json:"restart_latched"`
	RestartInFlight   bool          `json:"restart_in_flight"`
	LastRestartAt     time.Time     `json:"last_restart_at,omitempty"`
	CooldownUntil     time.Time     `json:"cooldown_until,omitempty"`
	LastRestartReason string        `json:"last_restart_reason,omitempty"`
	LastRestartResult string        `json:"last_restart_result,omitempty"`
	Events            []Event       `json:"events"`
}

type diagnosticSnapshot struct {
	Timestamp time.Time `json:"timestamp"`
	Container struct {
		WorkingSetBytes    uint64 `json:"working_set_bytes"`
		LimitBytes         uint64 `json:"limit_bytes"`
		WarnConsecutive    int    `json:"warn_consecutive"`
		RestartConsecutive int    `json:"restart_consecutive"`
	} `json:"container"`
	RestartReason string    `json:"restart_reason"`
	RestartResult string    `json:"restart_result"`
	CompletedAt   time.Time `json:"completed_at,omitempty"`
}

type RestartAction struct {
	Reason       string
	SnapshotPath string
	snapshot     diagnosticSnapshot
}

type Manager struct {
	mu          sync.Mutex
	cfg         config.Killbot
	state       persistedState
	statePath   string
	snapshotDir string
}

func New(cfg config.Killbot, now time.Time) (*Manager, error) {
	if err := os.MkdirAll(cfg.DataDir, 0o700); err != nil {
		return nil, fmt.Errorf("create killbot data directory: %w", err)
	}
	snapshotDir := filepath.Join(cfg.DataDir, "snapshots")
	if err := os.MkdirAll(snapshotDir, 0o700); err != nil {
		return nil, fmt.Errorf("create diagnostic snapshot directory: %w", err)
	}
	m := &Manager{
		cfg:         cfg,
		statePath:   filepath.Join(cfg.DataDir, "state.json"),
		snapshotDir: snapshotDir,
		state: persistedState{
			Version:   1,
			Container: SourceState{Level: levelNormal},
			Events:    make([]Event, 0),
		},
	}
	if err := m.loadState(); err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if m.state.RestartInFlight {
		m.state.RestartInFlight = false
		m.state.RestartLatched = false
		m.state.LastRestartResult = "outcome_unknown"
		m.addEventLocked(now, "restart_outcome_unknown", "killbot", "Killbot restarted while an action was in progress; cooldown retained and a later retry remains possible.")
		if err := m.writeStateLocked(); err != nil {
			return nil, err
		}
	}
	return m, nil
}

func (m *Manager) RecordContainer(stats dockerapi.Stats) (*RestartAction, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := stats.ObservedAt.UTC()
	if now.IsZero() {
		now = time.Now().UTC()
	}
	m.state.Container.HasSample = true
	m.state.Container.ObservedAt = now
	m.state.Container.Bytes = stats.WorkingSetBytes
	m.state.Container.LimitBytes = stats.LimitBytes
	m.state.Container.ProcessCount = stats.PIDs
	m.state.Container.ErrorConsecutive = 0
	m.state.Container.LastError = ""
	action := m.applySampleLocked(now, "container", &m.state.Container, m.cfg.Container)
	return action, m.writeStateLocked()
}

func (m *Manager) RecordContainerError(now time.Time, sampleErr error) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	source := &m.state.Container
	source.ErrorConsecutive++
	source.LastError = truncate(sampleErr.Error(), 512)
	if source.ErrorConsecutive == m.cfg.ErrorSamples {
		m.addEventLocked(now, "monitor_error", "container", "Docker stats collection failed repeatedly: "+source.LastError)
	}
	return m.writeStateLocked()
}

func (m *Manager) applySampleLocked(now time.Time, sourceName string, source *SourceState, thresholds config.SourceThresholds) *RestartAction {
	previousLevel := source.Level
	if source.Bytes >= thresholds.WarnBytes {
		source.WarnConsecutive++
	} else {
		source.WarnConsecutive = 0
	}
	if source.Bytes >= thresholds.RestartBytes {
		source.RestartConsecutive++
	} else {
		source.RestartConsecutive = 0
	}

	switch {
	case source.RestartConsecutive >= thresholds.RestartSamples:
		source.Level = levelCritical
	case source.WarnConsecutive >= thresholds.WarnSamples:
		source.Level = levelWarning
	default:
		source.Level = levelNormal
	}

	if source.Level != previousLevel {
		switch source.Level {
		case levelWarning:
			m.addEventLocked(now, "warning", sourceName, "Memory stayed above the warning threshold for the configured consecutive samples.")
		case levelCritical:
			m.addEventLocked(now, "critical", sourceName, "Memory stayed above the restart threshold for the configured consecutive samples.")
		case levelNormal:
			m.addEventLocked(now, "condition_cleared", sourceName, "Consecutive threshold condition cleared.")
		}
	}

	if m.state.RestartLatched && !m.state.RestartInFlight && m.allSourcesRecoveredLocked() {
		m.state.RestartLatched = false
		m.addEventLocked(now, "restart_latch_cleared", "killbot", "The target fell below its recovery threshold.")
	}

	if source.Level != levelCritical || m.state.RestartLatched || m.state.RestartInFlight || now.Before(m.state.CooldownUntil) {
		return nil
	}
	return m.prepareRestartLocked(now, sourceName)
}

func (m *Manager) allSourcesRecoveredLocked() bool {
	if m.state.Container.HasSample && m.state.Container.Bytes >= m.cfg.Container.RecoveryBytes {
		return false
	}
	return true
}

func (m *Manager) prepareRestartLocked(now time.Time, source string) *RestartAction {
	reason := source + "_memory_sustained"
	m.state.RestartLatched = true
	m.state.RestartInFlight = true
	m.state.LastRestartAt = now
	m.state.CooldownUntil = now.Add(m.cfg.RestartCooldown)
	m.state.LastRestartReason = reason
	m.state.LastRestartResult = "pending"
	m.addEventLocked(now, "restart_requested", source, "A single guarded CLIProxyAPI restart was requested for this incident.")

	snapshot := diagnosticSnapshot{Timestamp: now, RestartReason: reason, RestartResult: "pending"}
	snapshot.Container.WorkingSetBytes = m.state.Container.Bytes
	snapshot.Container.LimitBytes = m.state.Container.LimitBytes
	snapshot.Container.WarnConsecutive = m.state.Container.WarnConsecutive
	snapshot.Container.RestartConsecutive = m.state.Container.RestartConsecutive
	filename := fmt.Sprintf("%s-%s.json", now.UTC().Format("20060102T150405.000000000Z"), source)
	path := filepath.Join(m.snapshotDir, filename)
	if err := writeJSONAtomic(path, snapshot); err != nil {
		m.addEventLocked(now, "snapshot_error", "killbot", "Failed to persist the pre-restart diagnostic snapshot: "+truncate(err.Error(), 256))
		path = ""
	} else {
		m.pruneSnapshotsLocked()
	}
	return &RestartAction{Reason: reason, SnapshotPath: path, snapshot: snapshot}
}

func (m *Manager) CompleteRestart(action *RestartAction, restartErr error) error {
	if action == nil {
		return nil
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now().UTC()
	m.state.RestartInFlight = false
	if restartErr != nil {
		m.state.LastRestartResult = "failed"
		// Keep cooldown protection, but allow one retry after it expires. A
		// transient Docker API error must not disable protection indefinitely.
		m.state.RestartLatched = false
		m.addEventLocked(now, "restart_failed", "killbot", "Guarded restart failed: "+truncate(restartErr.Error(), 512))
		action.snapshot.RestartResult = "failed"
	} else {
		m.state.LastRestartResult = "succeeded"
		m.addEventLocked(now, "restart_succeeded", "killbot", "Guarded restart completed; latch remains until recovery.")
		action.snapshot.RestartResult = "succeeded"
	}
	action.snapshot.CompletedAt = now
	var snapshotErr error
	if action.SnapshotPath != "" {
		snapshotErr = writeJSONAtomic(action.SnapshotPath, action.snapshot)
	}
	return errors.Join(snapshotErr, m.writeStateLocked())
}

func (m *Manager) Details(now time.Time) DetailedStatus {
	m.mu.Lock()
	defer m.mu.Unlock()
	now = now.UTC()
	state, message := m.statusLocked(now)
	events := append([]Event(nil), m.state.Events...)
	return DetailedStatus{
		State:             state,
		Message:           message,
		GeneratedAt:       now,
		Container:         SourceDetails{SourceState: m.state.Container, WarnBytes: m.cfg.Container.WarnBytes, RestartBytes: m.cfg.Container.RestartBytes, RecoveryBytes: m.cfg.Container.RecoveryBytes, WarnSamples: m.cfg.Container.WarnSamples, RestartSamples: m.cfg.Container.RestartSamples},
		RestartLatched:    m.state.RestartLatched,
		RestartInFlight:   m.state.RestartInFlight,
		LastRestartAt:     m.state.LastRestartAt,
		CooldownUntil:     m.state.CooldownUntil,
		LastRestartReason: m.state.LastRestartReason,
		LastRestartResult: m.state.LastRestartResult,
		Events:            events,
	}
}

func (m *Manager) statusLocked(now time.Time) (string, string) {
	switch {
	case m.state.RestartInFlight:
		return "restarting", "A guarded restart is in progress."
	case m.state.Container.Level == levelCritical:
		return "critical", "Sustained container memory pressure reached the restart threshold."
	case m.state.Container.Level == levelWarning,
		m.state.Container.ErrorConsecutive >= m.cfg.ErrorSamples,
		now.Before(m.state.CooldownUntil):
		return "warning", "Memory pressure, monitoring errors, or restart cooldown requires review."
	default:
		return "normal", "Container memory monitoring is normal."
	}
}

func (m *Manager) addEventLocked(now time.Time, kind, source, message string) {
	m.state.Events = append(m.state.Events, Event{Timestamp: now.UTC(), Kind: kind, Source: source, Message: message})
	if len(m.state.Events) > maxEvents {
		m.state.Events = append([]Event(nil), m.state.Events[len(m.state.Events)-maxEvents:]...)
	}
}

func (m *Manager) loadState() error {
	data, err := os.ReadFile(m.statePath)
	if err != nil {
		return err
	}
	var loaded persistedState
	if err := json.Unmarshal(data, &loaded); err != nil {
		return fmt.Errorf("decode persisted killbot state: %w", err)
	}
	if loaded.Version != 1 {
		return fmt.Errorf("unsupported killbot state version %d", loaded.Version)
	}
	if loaded.Container.Level == "" {
		loaded.Container.Level = levelNormal
	}
	if len(loaded.Events) > maxEvents {
		loaded.Events = append([]Event(nil), loaded.Events[len(loaded.Events)-maxEvents:]...)
	}
	m.state = loaded
	return nil
}

func (m *Manager) writeStateLocked() error {
	return writeJSONAtomic(m.statePath, m.state)
}

func writeJSONAtomic(path string, value any) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Errorf("encode JSON: %w", err)
	}
	data = append(data, '\n')
	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0o600); err != nil {
		return fmt.Errorf("write %s: %w", filepath.Base(tmpPath), err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("replace %s: %w", filepath.Base(path), err)
	}
	return nil
}

func (m *Manager) pruneSnapshotsLocked() {
	entries, err := os.ReadDir(m.snapshotDir)
	if err != nil {
		return
	}
	type snapshotFile struct {
		name string
		when time.Time
	}
	files := make([]snapshotFile, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		info, err := entry.Info()
		if err == nil {
			files = append(files, snapshotFile{name: entry.Name(), when: info.ModTime()})
		}
	}
	if len(files) <= m.cfg.SnapshotRetention {
		return
	}
	sort.Slice(files, func(i, j int) bool { return files[i].when.Before(files[j].when) })
	for _, file := range files[:len(files)-m.cfg.SnapshotRetention] {
		_ = os.Remove(filepath.Join(m.snapshotDir, file.name))
	}
}

func truncate(value string, limit int) string {
	value = strings.TrimSpace(value)
	if len(value) <= limit {
		return value
	}
	return value[:limit] + "..."
}
