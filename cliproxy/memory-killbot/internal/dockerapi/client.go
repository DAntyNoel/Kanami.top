package dockerapi

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type Client struct {
	httpClient *http.Client
	baseURL    string
}

type Stats struct {
	ObservedAt      time.Time `json:"observed_at"`
	UsageBytes      uint64    `json:"usage_bytes"`
	InactiveBytes   uint64    `json:"inactive_bytes"`
	WorkingSetBytes uint64    `json:"working_set_bytes"`
	LimitBytes      uint64    `json:"limit_bytes"`
	PIDs            uint64    `json:"pids"`
}

type statsResponse struct {
	Read        time.Time `json:"read"`
	MemoryStats struct {
		Usage uint64            `json:"usage"`
		Limit uint64            `json:"limit"`
		Stats map[string]uint64 `json:"stats"`
	} `json:"memory_stats"`
	PIDsStats struct {
		Current uint64 `json:"current"`
	} `json:"pids_stats"`
}

func New(socketPath string, timeout time.Duration) *Client {
	dialer := &net.Dialer{Timeout: timeout}
	transport := &http.Transport{
		DisableCompression: true,
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			return dialer.DialContext(ctx, "unix", socketPath)
		},
	}
	return &Client{
		// Request deadlines are owned by the caller. A global Client.Timeout can
		// incorrectly abort a healthy restart that honors Docker's stop grace.
		httpClient: &http.Client{Transport: transport},
		baseURL:    "http://docker",
	}
}

func newForHTTP(baseURL string, client *http.Client) *Client {
	return &Client{httpClient: client, baseURL: strings.TrimRight(baseURL, "/")}
}

func (c *Client) ContainerStats(ctx context.Context, containerName string) (Stats, error) {
	path := "/containers/" + url.PathEscape(containerName) + "/stats?stream=false&one-shot=true"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return Stats{}, fmt.Errorf("create Docker stats request: %w", err)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return Stats{}, fmt.Errorf("query Docker stats: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return Stats{}, dockerStatusError("query stats", resp)
	}

	var raw statsResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&raw); err != nil {
		return Stats{}, fmt.Errorf("decode Docker stats: %w", err)
	}
	inactive := raw.MemoryStats.Stats["total_inactive_file"]
	if inactive == 0 {
		inactive = raw.MemoryStats.Stats["inactive_file"]
	}
	workingSet := raw.MemoryStats.Usage
	if inactive < workingSet {
		workingSet -= inactive
	}
	observedAt := raw.Read
	if observedAt.IsZero() {
		observedAt = time.Now().UTC()
	}
	return Stats{
		ObservedAt:      observedAt.UTC(),
		UsageBytes:      raw.MemoryStats.Usage,
		InactiveBytes:   inactive,
		WorkingSetBytes: workingSet,
		LimitBytes:      raw.MemoryStats.Limit,
		PIDs:            raw.PIDsStats.Current,
	}, nil
}

func (c *Client) RestartContainer(ctx context.Context, containerName string, timeout time.Duration) error {
	seconds := int(timeout.Round(time.Second) / time.Second)
	if seconds < 1 {
		seconds = 1
	}
	path := "/containers/" + url.PathEscape(containerName) + "/restart?t=" + strconv.Itoa(seconds)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, nil)
	if err != nil {
		return fmt.Errorf("create Docker restart request: %w", err)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("restart container through Docker: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		return dockerStatusError("restart container", resp)
	}
	return nil
}

func dockerStatusError(operation string, resp *http.Response) error {
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	detail := strings.TrimSpace(string(body))
	if detail == "" {
		detail = http.StatusText(resp.StatusCode)
	}
	return fmt.Errorf("Docker %s returned %d: %s", operation, resp.StatusCode, detail)
}
