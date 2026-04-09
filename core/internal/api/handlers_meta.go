package api

import (
	"context"
	"omsu_mirror/internal/models"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog/log"
)

var startTime = time.Now()

// @Summary Get health status
// @Description Returns service uptime and cache statistics.
// @Tags Meta
// @Produce json
// @Success 200 {object} models.BFFResponse
// @Router /health [get]
func (s *Server) handleHealth(c *fiber.Ctx) error {
	stats := s.MemoryCache.Stats()
	
	dictSync, _ := s.ScheduleRepo.GetSyncMeta(c.Context(), "last_dict_sync")
	schedSync, _ := s.ScheduleRepo.GetSyncMeta(c.Context(), "last_schedule_sync")

	health := fiber.Map{
		"status": "ok",
		"uptime": time.Since(startTime).Truncate(time.Second).String(),
		"upstream": s.Syncer.GetUpstreamStatus(),
		"last_sync": fiber.Map{
			"dictionaries": dictSync,
			"schedules":    schedSync,
		},
		"cache":  stats,
	}

	return c.JSON(models.BFFResponse{
		Success:  true,
		Data:     health,
		CachedAt: startTime, // Stable timestamp
		Source:   "upstream",
	})
}

// @Summary Get sync status
// @Description Returns the last synchronization timestamps for dictionaries and schedules.
// @Tags Meta
// @Produce json
// @Success 200 {object} models.BFFResponse
// @Router /sync/status [get]
func (s *Server) handleSyncStatus(c *fiber.Ctx) error {
	dictSync, _ := s.ScheduleRepo.GetSyncMeta(c.Context(), "last_dict_sync")
	schedSync, _ := s.ScheduleRepo.GetSyncMeta(c.Context(), "last_schedule_sync")

	status := fiber.Map{
		"last_dict_sync":     dictSync,
		"last_schedule_sync": schedSync,
	}

	return c.JSON(models.BFFResponse{
		Success:  true,
		Data:     status,
		CachedAt: startTime, // Stable timestamp
		Source:   "cache",
	})
}

// @Summary Get recent incidents
// @Description Returns recent health incidents for the upstream service.
// @Tags Meta
// @Produce json
// @Success 200 {object} models.BFFResponse
// @Router /incidents [get]
func (s *Server) handleGetIncidents(c *fiber.Ctx) error {
	limit, _ := strconv.Atoi(c.Query("limit", "50"))
	offset, _ := strconv.Atoi(c.Query("offset", "0"))

	incidents, err := s.IncidentRepo.GetIncidents(c.Context(), limit, offset)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to retrieve incidents"})
	}

	return c.JSON(models.BFFResponse{
		Success:  true,
		Data:     incidents,
		CachedAt: startTime, // Stable timestamp
		Source:   "database",
	})
}

// @Summary Trigger manual sync
// @Description Forces a background synchronization of dictionaries and active schedules. (Admin only)
// @Tags Meta
// @Security ApiKeyAuth
// @Param X-Admin-Key header string true "Admin Secret Key"
// @Success 200 {object} models.BFFResponse
// @Failure 401 {object} map[string]string
// @Router /sync/trigger [post]
func (s *Server) handleSyncTrigger(c *fiber.Ctx) error {
	// Run in background to not block the request
	go func() {
		ctx := context.Background() // Use fresh context for background task
		log.Info().Msg("Manual sync trigger received")
		if err := s.Syncer.SyncDictionaries(ctx); err != nil {
			log.Error().Err(err).Msg("Manual dictionary sync failed")
		}
		if err := s.Syncer.SyncActiveSchedules(ctx); err != nil {
			log.Error().Err(err).Msg("Manual active schedules sync failed")
		}
		log.Info().Msg("Manual sync completed")
	}()

	return c.JSON(models.BFFResponse{
		Success:  true,
		Data:     "Synchronization triggered successfully",
		CachedAt: time.Now(),
		Source:   "cache",
	})
}
