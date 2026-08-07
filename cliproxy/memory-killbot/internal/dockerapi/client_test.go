package dockerapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestContainerStatsUsesWorkingSet(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/containers/kanami-cliproxy-api/stats" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("stream") != "false" {
			t.Fatal("stats request must disable streaming")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"read":"2026-08-07T06:00:00Z","memory_stats":{"usage":10737418240,"limit":15032385536,"stats":{"total_inactive_file":2147483648}},"pids_stats":{"current":16}}`))
	}))
	defer server.Close()

	client := newForHTTP(server.URL, server.Client())
	stats, err := client.ContainerStats(context.Background(), "kanami-cliproxy-api")
	if err != nil {
		t.Fatal(err)
	}
	if stats.WorkingSetBytes != 8<<30 {
		t.Fatalf("working set = %d, want %d", stats.WorkingSetBytes, uint64(8<<30))
	}
	if stats.LimitBytes != 14<<30 || stats.PIDs != 16 {
		t.Fatalf("unexpected stats: %+v", stats)
	}
}

func TestRestartContainer(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s", r.Method)
		}
		if r.URL.Path != "/containers/kanami-cliproxy-api/restart" || r.URL.Query().Get("t") != "15" {
			t.Fatalf("unexpected restart URL: %s", r.URL.String())
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	client := newForHTTP(server.URL, server.Client())
	if err := client.RestartContainer(context.Background(), "kanami-cliproxy-api", 15*time.Second); err != nil {
		t.Fatal(err)
	}
}
