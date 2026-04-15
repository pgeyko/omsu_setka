package api

import (
	"encoding/json"
	"fmt"
	"omsu_mirror/internal/models"
	"omsu_mirror/internal/storage"
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

		weekStartStr := c.Query("week_start")

		// 1. Try L1 Cache
		if data, ok := s.MemoryCache.Get(key); ok {
			c.Set("X-Cache-Status", "HIT-L1")
			// If we need filtering, we must unmarshal even from cache
			if weekStartStr != "" {
				var cached struct {
					Data     json.RawMessage `json:"data"`
					CachedAt time.Time       `json:"cached_at"`
				}
				if err := json.Unmarshal(data, &cached); err == nil {
					var fullSchedule []models.Day
					if err := json.Unmarshal(cached.Data, &fullSchedule); err == nil {
						filteredResp := s.filterSchedule(fullSchedule, weekStartStr)
						filteredResp.CachedAt = cached.CachedAt
						filteredResp.Source = "cache"
						return c.JSON(filteredResp)
					}
				}
			}
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

			if weekStartStr != "" {
				var cached struct {
					Data     json.RawMessage `json:"data"`
					CachedAt time.Time       `json:"cached_at"`
				}
				if err := json.Unmarshal(data, &cached); err == nil {
					var fullSchedule []models.Day
					if err := json.Unmarshal(cached.Data, &fullSchedule); err == nil {
						filteredResp := s.filterSchedule(fullSchedule, weekStartStr)
						filteredResp.CachedAt = cached.CachedAt
						filteredResp.Source = "cache"
						return c.JSON(filteredResp)
					}
				}
			}
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
				if weekStartStr != "" {
					var cached struct {
						Data     json.RawMessage `json:"data"`
						CachedAt time.Time       `json:"cached_at"`
					}
					if err := json.Unmarshal(data, &cached); err == nil {
						var fullSchedule []models.Day
						if err := json.Unmarshal(cached.Data, &fullSchedule); err == nil {
							filteredResp := s.filterSchedule(fullSchedule, weekStartStr)
							filteredResp.CachedAt = cached.CachedAt
							filteredResp.Source = "stale"
							return c.JSON(filteredResp)
						}
					}
				}
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

		jsonData, err := json.Marshal(resp)
		if err != nil {
			log.Error().Err(err).Msg("Failed to marshal schedule response")
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
		}

		// Update persistent L2
		if err := s.ScheduleRepo.PutSchedule(c.Context(), key, entityType, id, jsonData, "", s.Cfg.CacheScheduleTTL); err != nil {
			log.Error().Err(err).Msgf("Failed to update L2 cache for %s", key)
		}

		// Update L1
		s.MemoryCache.Set(key, jsonData)

		c.Set("X-Cache-Status", "MISS")
		if weekStartStr != "" {
			filteredResp := s.filterSchedule(schedule, weekStartStr)
			filteredResp.CachedAt = resp.CachedAt
			filteredResp.Source = resp.Source
			return c.JSON(filteredResp)
		}

		return c.JSON(resp)
	}
}

func (s *Server) filterSchedule(schedule []models.Day, weekStartStr string) models.BFFResponse {
	weekStart, err := time.Parse("2006-01-02", weekStartStr)
	if err != nil {
		// If invalid date, return everything to be safe
		return models.BFFResponse{Success: true, Data: schedule}
	}

	weekEnd := weekStart.AddDate(0, 0, 7)
	filtered := make([]models.Day, 0)

	hasNext := false
	hasPrev := false

	for _, day := range schedule {
		dayTime, err := time.Parse("02.01.2006", day.Day)
		if err != nil {
			continue
		}

		if (dayTime.Equal(weekStart) || dayTime.After(weekStart)) && dayTime.Before(weekEnd) {
			filtered = append(filtered, day)
		}

		if dayTime.Before(weekStart) {
			hasPrev = true
		}
		if dayTime.Equal(weekEnd) || dayTime.After(weekEnd) {
			hasNext = true
		}
	}

	return models.BFFResponse{
		Success:   true,
		Data:      filtered,
		WeekStart: weekStartStr,
		WeekEnd:   weekEnd.Format("2006-01-02"),
		HasPrev:   hasPrev,
		HasNext:   hasNext,
	}
}

func (s *Server) handleGetChanges(c *fiber.Ctx) error {
	entityType := c.Params("type")
	if !isValidEntityType(entityType) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid entity type"})
	}

	idStr := c.Params("id")
	id, err := strconv.Atoi(idStr)
	if err != nil || id < 1 || id > 999999 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid ID"})
	}

	changes, err := s.ChangeRepo.GetChanges(c.Context(), entityType, id, 20)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch changes"})
	}

	return c.JSON(models.BFFResponse{
		Success:  true,
		Data:     changes,
		CachedAt: time.Now(),
		Source:   "cache",
	})
}

func (s *Server) handleSubscribe(c *fiber.Ctx) error {
	var sub storage.Subscription
	if err := c.BodyParser(&sub); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if sub.FCMToken == "" || sub.EntityType == "" || sub.EntityID == 0 {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": "missing required fields"})
	}

	// Set NotifyOnChange to true by default as requested
	sub.NotifyOnChange = true

	// 25.5 Add subscription limit check
	count, err := s.SubscriptionRepo.GetSubscriptionCount(c.Context(), sub.FCMToken)
	if err == nil && count >= 10 {
		return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "maximum subscriptions limit reached (10)"})
	}

	if err := s.SubscriptionRepo.Subscribe(c.Context(), sub); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to subscribe"})
	}

	return c.JSON(fiber.Map{"success": true})
}

func (s *Server) handleUnsubscribe(c *fiber.Ctx) error {
	var body struct {
		Token      string `json:"fcm_token"`
		EntityType string `json:"entity_type"`
		EntityID   int    `json:"entity_id"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if body.Token == "" {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": "missing fcm_token"})
	}

	if body.EntityType == "" || body.EntityID == 0 {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": "missing entity_type or entity_id"})
	}

	if err := s.SubscriptionRepo.Unsubscribe(c.Context(), body.Token, body.EntityType, body.EntityID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to unsubscribe"})
	}

	return c.JSON(fiber.Map{"success": true})
}
