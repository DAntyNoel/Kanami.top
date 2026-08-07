package monitor

import (
	"encoding/json"
	"os"
	"testing"
	"time"

	"kanami.local/cliproxy-memory-killbot/internal/config"
	"kanami.local/cliproxy-memory-killbot/internal/dockerapi"
)

func testConfig(dir string) config.Killbot {
	return config.Killbot{
		DataDir:           dir,
		RestartCooldown:   time.Second,
		ErrorSamples:      2,
		SnapshotRetention: 3,
		Container:         config.SourceThresholds{WarnBytes: 100, RestartBytes: 200, RecoveryBytes: 50, WarnSamples: 2, RestartSamples: 2},
	}
}

func TestRestartIsLatchedUntilRecovery(t *testing.T) {
	base := time.Date(2026, 8, 7, 6, 0, 0, 0, time.UTC)
	m, err := New(testConfig(t.TempDir()), base)
	if err != nil {
		t.Fatal(err)
	}

	first := dockerapi.Stats{ObservedAt: base, WorkingSetBytes: 250, LimitBytes: 300}
	if action, err := m.RecordContainer(first); err != nil || action != nil {
		t.Fatalf("first critical sample action=%v err=%v", action, err)
	}
	first.ObservedAt = base.Add(time.Second)
	action, err := m.RecordContainer(first)
	if err != nil || action == nil {
		t.Fatalf("second critical sample action=%v err=%v", action, err)
	}
	if action.SnapshotPath == "" {
		t.Fatal("pre-restart snapshot was not persisted")
	}
	var pending diagnosticSnapshot
	data, err := os.ReadFile(action.SnapshotPath)
	if err != nil || json.Unmarshal(data, &pending) != nil {
		t.Fatalf("read pending snapshot: %v", err)
	}
	if pending.RestartResult != "pending" || pending.Container.WorkingSetBytes != 250 {
		t.Fatalf("unexpected pending snapshot: %+v", pending)
	}
	if err := m.CompleteRestart(action, nil); err != nil {
		t.Fatal(err)
	}

	first.ObservedAt = base.Add(2 * time.Second)
	if repeated, err := m.RecordContainer(first); err != nil || repeated != nil {
		t.Fatalf("latched incident repeated action=%v err=%v", repeated, err)
	}

	low := dockerapi.Stats{ObservedAt: base.Add(3 * time.Second), WorkingSetBytes: 40, LimitBytes: 300}
	if action, err := m.RecordContainer(low); err != nil || action != nil {
		t.Fatalf("recovery action=%v err=%v", action, err)
	}
	details := m.Details(base.Add(3 * time.Second))
	if details.RestartLatched {
		t.Fatal("restart latch did not clear after recovery")
	}

	first.ObservedAt = base.Add(4 * time.Second)
	_, _ = m.RecordContainer(first)
	first.ObservedAt = base.Add(5 * time.Second)
	secondAction, err := m.RecordContainer(first)
	if err != nil || secondAction == nil {
		t.Fatalf("new incident did not trigger action=%v err=%v", secondAction, err)
	}
}

func TestDetailsReportRepeatedMonitorErrors(t *testing.T) {
	base := time.Now().UTC()
	m, err := New(testConfig(t.TempDir()), base)
	if err != nil {
		t.Fatal(err)
	}
	_ = m.RecordContainerError(base, os.ErrDeadlineExceeded)
	_ = m.RecordContainerError(base.Add(time.Second), os.ErrDeadlineExceeded)
	details := m.Details(base.Add(2 * time.Second))
	if details.State != "warning" || details.Container.ErrorConsecutive != 2 {
		t.Fatalf("unexpected status after monitor errors: %+v", details)
	}
}

func TestInterruptedRestartRetainsCooldownButAllowsRetry(t *testing.T) {
	base := time.Date(2026, 8, 7, 6, 0, 0, 0, time.UTC)
	dir := t.TempDir()
	cfg := testConfig(dir)
	firstManager, err := New(cfg, base)
	if err != nil {
		t.Fatal(err)
	}
	high := dockerapi.Stats{ObservedAt: base, WorkingSetBytes: 250, LimitBytes: 300}
	_, _ = firstManager.RecordContainer(high)
	high.ObservedAt = base.Add(time.Second)
	action, err := firstManager.RecordContainer(high)
	if err != nil || action == nil {
		t.Fatalf("failed to create pending restart: action=%v err=%v", action, err)
	}

	restartedManager, err := New(cfg, base.Add(1500*time.Millisecond))
	if err != nil {
		t.Fatal(err)
	}
	details := restartedManager.Details(base.Add(1500 * time.Millisecond))
	if details.RestartInFlight || details.RestartLatched || details.LastRestartResult != "outcome_unknown" {
		t.Fatalf("unsafe interrupted-action recovery: %+v", details)
	}

	high.ObservedAt = base.Add(2 * time.Second)
	retry, err := restartedManager.RecordContainer(high)
	if err != nil || retry == nil {
		t.Fatalf("retry was not allowed after retained cooldown: action=%v err=%v", retry, err)
	}
}
