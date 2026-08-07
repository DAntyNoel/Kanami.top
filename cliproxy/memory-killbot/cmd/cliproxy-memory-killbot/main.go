package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"kanami.local/cliproxy-memory-killbot/internal/config"
	"kanami.local/cliproxy-memory-killbot/internal/dockerapi"
	"kanami.local/cliproxy-memory-killbot/internal/killbot"
	"kanami.local/cliproxy-memory-killbot/internal/monitor"
)

func main() {
	mode := "run"
	if len(os.Args) > 1 {
		mode = os.Args[1]
	}
	var err error
	switch mode {
	case "run":
		err = run()
	case "healthcheck":
		err = healthcheck()
	default:
		err = fmt.Errorf("unknown mode %q", mode)
	}
	if err != nil {
		log.Printf("cliproxy memory killbot stopped: %v", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.LoadKillbot()
	if err != nil {
		return err
	}
	manager, err := monitor.New(cfg, time.Now().UTC())
	if err != nil {
		return err
	}
	clientTimeout := cfg.DockerTimeout
	if needed := cfg.RestartTimeout + 10*time.Second; needed > clientTimeout {
		clientTimeout = needed
	}
	dockerClient := dockerapi.New(cfg.DockerSocket, clientTimeout)
	logger := log.New(os.Stdout, "killbot: ", log.LstdFlags|log.LUTC)
	controller := killbot.New(cfg, dockerClient, manager, logger)

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", healthHandler)
	mux.HandleFunc("/status", statusHandler(manager))
	server := &http.Server{
		Addr:              cfg.ListenAddress,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       30 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go controller.Run(ctx)
	serverErr := make(chan error, 1)
	go func() {
		logger.Printf("local status server listening on %s", cfg.ListenAddress)
		serverErr <- server.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return server.Shutdown(shutdownCtx)
	case err := <-serverErr:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, "ok\n")
}

func statusHandler(manager *monitor.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", http.MethodGet)
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		_ = json.NewEncoder(w).Encode(manager.Details(time.Now().UTC()))
	}
}

func healthcheck() error {
	endpoint := os.Getenv("KILLBOT_HEALTHCHECK_URL")
	if endpoint == "" {
		endpoint = "http://127.0.0.1:8080/healthz"
	}
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(endpoint)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("health endpoint returned %d", resp.StatusCode)
	}
	return nil
}
