package killbot

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"kanami.local/cliproxy-memory-killbot/internal/config"
	"kanami.local/cliproxy-memory-killbot/internal/dockerapi"
	"kanami.local/cliproxy-memory-killbot/internal/monitor"
)

type Docker interface {
	ContainerStats(context.Context, string) (dockerapi.Stats, error)
	RestartContainer(context.Context, string, time.Duration) error
}

type Controller struct {
	cfg     config.Killbot
	docker  Docker
	manager *monitor.Manager
	logger  *log.Logger
}

func New(cfg config.Killbot, docker Docker, manager *monitor.Manager, logger *log.Logger) *Controller {
	return &Controller{cfg: cfg, docker: docker, manager: manager, logger: logger}
}

func (c *Controller) Run(ctx context.Context) {
	c.sampleAndLog(ctx)
	ticker := time.NewTicker(c.cfg.SampleInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.sampleAndLog(ctx)
		}
	}
}

func (c *Controller) sampleAndLog(ctx context.Context) {
	if err := c.SampleOnce(ctx); err != nil {
		c.logger.Printf("memory sample cycle failed: %v", err)
	}
}

func (c *Controller) SampleOnce(ctx context.Context) error {
	statsCtx, cancelStats := context.WithTimeout(ctx, c.cfg.DockerTimeout)
	stats, statsErr := c.docker.ContainerStats(statsCtx, c.cfg.ContainerName)
	cancelStats()
	if statsErr != nil {
		persistErr := c.manager.RecordContainerError(time.Now().UTC(), statsErr)
		return errors.Join(statsErr, persistErr)
	}

	action, persistErr := c.manager.RecordContainer(stats)
	if action == nil {
		return persistErr
	}
	c.logger.Printf("guarded restart requested after sustained container working-set pressure; diagnostic snapshot persisted=%t", action.SnapshotPath != "")
	restartCtx, cancelRestart := context.WithTimeout(ctx, c.cfg.RestartTimeout+10*time.Second)
	restartErr := c.docker.RestartContainer(restartCtx, c.cfg.ContainerName, c.cfg.RestartTimeout)
	cancelRestart()
	completeErr := c.manager.CompleteRestart(action, restartErr)
	if restartErr != nil {
		return errors.Join(persistErr, fmt.Errorf("guarded restart failed: %w", restartErr), completeErr)
	}
	c.logger.Print("guarded restart completed; further restarts are latched until recovery")
	return errors.Join(persistErr, completeErr)
}
