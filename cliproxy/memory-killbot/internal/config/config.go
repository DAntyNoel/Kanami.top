package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type SourceThresholds struct {
	WarnBytes      uint64
	RestartBytes   uint64
	RecoveryBytes  uint64
	WarnSamples    int
	RestartSamples int
}

type Killbot struct {
	ListenAddress     string
	DockerSocket      string
	ContainerName     string
	DataDir           string
	SampleInterval    time.Duration
	DockerTimeout     time.Duration
	RestartTimeout    time.Duration
	RestartCooldown   time.Duration
	ErrorSamples      int
	SnapshotRetention int
	Container         SourceThresholds
}

func LoadKillbot() (Killbot, error) {
	cfg := Killbot{
		ListenAddress: envString("KILLBOT_LISTEN_ADDRESS", ":8080"),
		DockerSocket:  envString("KILLBOT_DOCKER_SOCKET", "/var/run/docker.sock"),
		ContainerName: envString("KILLBOT_CONTAINER_NAME", "kanami-cliproxy-api"),
		DataDir:       envString("KILLBOT_DATA_DIR", "/data"),
	}

	var err error
	if cfg.SampleInterval, err = envDuration("KILLBOT_SAMPLE_INTERVAL", 30*time.Second); err != nil {
		return cfg, err
	}
	if cfg.DockerTimeout, err = envDuration("KILLBOT_DOCKER_TIMEOUT", 8*time.Second); err != nil {
		return cfg, err
	}
	if cfg.RestartTimeout, err = envDuration("KILLBOT_RESTART_TIMEOUT", 15*time.Second); err != nil {
		return cfg, err
	}
	if cfg.RestartCooldown, err = envDuration("KILLBOT_RESTART_COOLDOWN", 30*time.Minute); err != nil {
		return cfg, err
	}
	if cfg.ErrorSamples, err = envInt("KILLBOT_ERROR_SAMPLES", 3); err != nil {
		return cfg, err
	}
	if cfg.SnapshotRetention, err = envInt("KILLBOT_SNAPSHOT_RETENTION", 20); err != nil {
		return cfg, err
	}

	if cfg.Container, err = loadThresholds("KILLBOT_CONTAINER", "8GiB", "12GiB", "6GiB", 3, 3); err != nil {
		return cfg, err
	}

	if cfg.SampleInterval < time.Second {
		return cfg, fmt.Errorf("KILLBOT_SAMPLE_INTERVAL must be at least 1s")
	}
	if cfg.RestartCooldown < cfg.SampleInterval {
		return cfg, fmt.Errorf("KILLBOT_RESTART_COOLDOWN must be at least the sample interval")
	}
	if cfg.ErrorSamples < 1 || cfg.SnapshotRetention < 1 {
		return cfg, fmt.Errorf("error samples and snapshot retention must be positive")
	}
	return cfg, nil
}

func loadThresholds(prefix, warnDefault, restartDefault, recoveryDefault string, warnSamplesDefault, restartSamplesDefault int) (SourceThresholds, error) {
	var out SourceThresholds
	var err error
	if out.WarnBytes, err = envBytes(prefix+"_WARN_BYTES", warnDefault); err != nil {
		return out, err
	}
	if out.RestartBytes, err = envBytes(prefix+"_RESTART_BYTES", restartDefault); err != nil {
		return out, err
	}
	if out.RecoveryBytes, err = envBytes(prefix+"_RECOVERY_BYTES", recoveryDefault); err != nil {
		return out, err
	}
	if out.WarnSamples, err = envInt(prefix+"_WARN_SAMPLES", warnSamplesDefault); err != nil {
		return out, err
	}
	if out.RestartSamples, err = envInt(prefix+"_RESTART_SAMPLES", restartSamplesDefault); err != nil {
		return out, err
	}
	if out.RecoveryBytes >= out.WarnBytes || out.WarnBytes >= out.RestartBytes {
		return out, fmt.Errorf("%s thresholds must satisfy recovery < warn < restart", prefix)
	}
	if out.WarnSamples < 1 || out.RestartSamples < 1 {
		return out, fmt.Errorf("%s sample counts must be positive", prefix)
	}
	return out, nil
}

func envString(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func envDuration(name string, fallback time.Duration) (time.Duration, error) {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback, nil
	}
	parsed, err := time.ParseDuration(value)
	if err != nil || parsed <= 0 {
		return 0, fmt.Errorf("%s must be a positive duration: %q", name, value)
	}
	return parsed, nil
}

func envInt(name string, fallback int) (int, error) {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 1 {
		return 0, fmt.Errorf("%s must be a positive integer: %q", name, value)
	}
	return parsed, nil
}

func envBytes(name, fallback string) (uint64, error) {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		value = fallback
	}
	parsed, err := ParseBytes(value)
	if err != nil {
		return 0, fmt.Errorf("%s: %w", name, err)
	}
	return parsed, nil
}

func ParseBytes(value string) (uint64, error) {
	normalized := strings.ToUpper(strings.TrimSpace(value))
	units := []struct {
		suffix     string
		multiplier uint64
	}{
		{"TIB", 1 << 40}, {"GIB", 1 << 30}, {"MIB", 1 << 20}, {"KIB", 1 << 10},
		{"TB", 1000 * 1000 * 1000 * 1000}, {"GB", 1000 * 1000 * 1000}, {"MB", 1000 * 1000}, {"KB", 1000},
		{"B", 1},
	}
	for _, unit := range units {
		if strings.HasSuffix(normalized, unit.suffix) {
			number := strings.TrimSpace(strings.TrimSuffix(normalized, unit.suffix))
			return parseByteNumber(number, unit.multiplier, value)
		}
	}
	return parseByteNumber(normalized, 1, value)
}

func parseByteNumber(number string, multiplier uint64, original string) (uint64, error) {
	parsed, err := strconv.ParseUint(number, 10, 64)
	if err != nil || parsed == 0 {
		return 0, fmt.Errorf("invalid positive byte size %q", original)
	}
	if parsed > ^uint64(0)/multiplier {
		return 0, fmt.Errorf("byte size overflows uint64: %q", original)
	}
	return parsed * multiplier, nil
}
