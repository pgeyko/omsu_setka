package api

import (
	"encoding/json"
	"fmt"
	"omsu_mirror/internal/models"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog/log"
)

// @Summary Get group schedule
// @Description Returns the schedule for a specific group. Lazy-fetches if not in cache.
// @Tags Schedules
// @Produce json
// @Param id path int true "Group ID (real_group_id)"
// @Success 200 {object} models.BFFResponse{data=[]models.Day}
// @Router /schedule/group/{id} [get]
func _() {}

// @Summary Get tutor schedule
// @Description Returns the schedule for a specific tutor. Lazy-fetches if not in cache.
// @Tags Schedules
// @Produce json
// @Param id path int true "Tutor ID"
// @Success 200 {object} models.BFFResponse{data=[]models.Day}
// @Router /schedule/tutor/{id} [get]
func _() {}

// @Summary Get auditory schedule
// @Description Returns the schedule for a specific auditory. Lazy-fetches if not in cache.
// @Tags Schedules
// @Produce json
// @Param id path int true "Auditory ID"
// @Success 200 {object} models.BFFResponse{data=[]models.Day}
// @Router /schedule/auditory/{id} [get]
func _() {}

func (s *Server) handleGetSchedule(entityType string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		idStr := c.Params("id")
		id, err := strconv.Atoi(idStr)
		if err != nil || id < 1 || id > 999999 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid ID: must be a number between 1 and 999999"})
		}

		key := fmt.Sprintf("%s:%d", entityType, id)

		// 1. Try L1 Cache
		if data, ok := s.MemoryCache.Get(key); ok {
			c.Set("X-Cache-Status", "HIT-L1")
			c.Set("Content-Type", "application/json")
			return c.Send(data)
		}

		// 2. Try L2 Cache (SQLite)
		data, meta, err := s.ScheduleRepo.GetSchedule(c.Context(), key)
		if err != nil {
			log.Error().Err(err).Msgf("Failed to query L2 cache for %s", key)
		}

		if data != nil && time.Now().Before(meta.ExpiresAt) {
			s.MemoryCache.Set(key, data) // Warm up L1
			c.Set("X-Cache-Status", "HIT-L2")
			c.Set("Content-Type", "application/json")
			return c.Send(data)
		}

		// 3. Lazy Fetch from Upstream
		log.Info().Msgf("Lazy fetching schedule for %s...", key)
		var schedule []models.Day
		switch entityType {
		case "group":
			schedule, err = s.Client.FetchGroupSchedule(c.Context(), id)
		case "tutor":
			schedule, err = s.Client.FetchTutorSchedule(c.Context(), id)
		case "auditory":
			schedule, err = s.Client.FetchAuditorySchedule(c.Context(), id)
		}

		if err != nil {
			// If upstream is down, try to serve stale L2 data if present
			if data != nil {
				c.Set("X-Cache-Status", "STALE")
				c.Set("Content-Type", "application/json")
				return c.Send(data)
			}
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "upstream unavailable and no cache found"})
		}

		// 4. Wrap and Cache
		resp := models.BFFResponse{
			Success:  true,
			Data:     schedule,
			CachedAt: time.Now(),
			Source:   "upstream",
		}
		jsonData, _ := json.Marshal(resp)
		
		// Update persistent L2
		if err := s.ScheduleRepo.PutSchedule(c.Context(), key, entityType, id, jsonData, "", s.Cfg.CacheScheduleTTL); err != nil {
			log.Error().Err(err).Msgf("Failed to update L2 cache for %s", key)
		}
		
		// Update L1
		s.MemoryCache.Set(key, jsonData)

		c.Set("X-Cache-Status", "MISS")
		return c.JSON(resp)
	}
}
