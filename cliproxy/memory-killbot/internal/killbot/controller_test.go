package killbot

import (
	"context"
	"io"
	"log"
	"testing"
	"time"

	"kanami.local/cliproxy-memory-killbot/internal/config"
	"kanami.local/cliproxy-memory-killbot/internal/dockerapi"
	"kanami.local/cliproxy-memory-killbot/internal/monitor"
)

type fakeDocker struct {
	stats        dockerapi.Stats
	restartCount int
}

func (f *fakeDocker) ContainerStats(context.Context, string) (dockerapi.Stats, error) {
	f.stats.ObservedAt = f.stats.ObservedAt.Add(time.Second)
	return f.stats, nil
}

func (f *fakeDocker) RestartContainer(context.Context, string, time.Duration) error {
	f.restartCount++
	return nil
}

func TestSustainedPressureRestartsExactlyOncePerIncident(t *testing.T) {
	cfg := config.Killbot{
		ContainerName:     "fake-target",
		DataDir:           t.TempDir(),
		DockerTimeout:     time.Second,
		RestartTimeout:    time.Second,
		RestartCooldown:   time.Minute,
		ErrorSamples:      2,
		SnapshotRetention: 2,
		Container: config.SourceThresholds{
			WarnBytes: 100, RestartBytes: 200, RecoveryBytes: 50,
			WarnSamples: 2, RestartSamples: 2,
		},
	}
	manager, err := monitor.New(cfg, time.Now().UTC())
	if err != nil {
		t.Fatal(err)
	}
	docker := &fakeDocker{stats: dockerapi.Stats{ObservedAt: time.Now().UTC(), WorkingSetBytes: 250, LimitBytes: 300}}
	controller := New(cfg, docker, manager, log.New(io.Discard, "", 0))
	for i := 0; i < 8; i++ {
		if err := controller.SampleOnce(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	if docker.restartCount != 1 {
		t.Fatalf("restart count = %d, want exactly 1", docker.restartCount)
	}
	details := manager.Details(time.Now().UTC())
	if !details.RestartLatched || details.LastRestartResult != "succeeded" {
		t.Fatalf("unexpected guarded restart state: %+v", details)
	}
}
