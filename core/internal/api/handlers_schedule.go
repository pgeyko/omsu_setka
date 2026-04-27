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
// @Param week_start query string false "Week start date in YYYY-MM-DD format"
// @Success 200 {object} models.BFFResponse{data=[]models.Day}
// @Failure 400 {object} map[string]string
// @Failure 503 {object} map[string]string
// @Router /schedule/group/{id} [get]
func _() {}

// @Summary Get tutor schedule
// @Description Returns the schedule for a specific tutor. Lazy-fetches if not in cache.
// @Tags Schedules
// @Produce json
// @Param id path int true "Tutor ID"
// @Param week_start query string false "Week start date in YYYY-MM-DD format"
// @Success 200 {object} models.BFFResponse{data=[]models.Day}
// @Failure 400 {object} map[string]string
// @Failure 503 {object} map[string]string
// @Router /schedule/tutor/{id} [get]
func _() {}

// @Summary Get auditory schedule
// @Description Returns the schedule for a specific auditory. Lazy-fetches if not in cache.
// @Tags Schedules
// @Produce json
// @Param id path int true "Auditory ID"
// @Param week_start query string false "Week start date in YYYY-MM-DD format"
// @Success 200 {object} models.BFFResponse{data=[]models.Day}
// @Failure 400 {object} map[string]string
// @Failure 503 {object} map[string]string
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

// filterScheduleDay returns only the one Day entry matching targetDate (formatted as "02.01.2006"),
// plus has_prev / has_next pagination flags computed as if the full week were returned.
func (s *Server) filterScheduleDay(schedule []models.Day, weekStartStr string, targetDate time.Time) models.BFFResponse {
	weekStart, err := time.Parse("2006-01-02", weekStartStr)
	if err != nil {
		return models.BFFResponse{Success: true, Data: []models.Day{}}
	}
	weekEnd := weekStart.AddDate(0, 0, 7)

	var found *models.Day
	hasPrev := false
	hasNext := false

	for i := range schedule {
		dayTime, err := time.Parse("02.01.2006", schedule[i].Day)
		if err != nil {
			continue
		}
		if dayTime.Equal(targetDate) {
			d := schedule[i]
			found = &d
		}
		if dayTime.Before(weekStart) {
			hasPrev = true
		}
		if dayTime.Equal(weekEnd) || dayTime.After(weekEnd) {
			hasNext = true
		}
	}

	result := []models.Day{}
	if found != nil {
		result = []models.Day{*found}
	}

	return models.BFFResponse{
		Success:   true,
		Data:      result,
		WeekStart: weekStartStr,
		WeekEnd:   weekEnd.Format("2006-01-02"),
		HasPrev:   hasPrev,
		HasNext:   hasNext,
	}
}

// handleGetScheduleDay handles GET /schedule/:type/:id/day?date=YYYY-MM-DD.
// It computes the Monday of the requested date's week, fetches or loads the week schedule,
// then returns only the single matching day — exactly 1 upstream/cache fetch.
//
// @Summary Get single day schedule
// @Description Returns the schedule for a specific day. Loads the whole week from cache if needed.
// @Tags Schedules
// @Produce json
// @Param type path string true "Entity type: group, tutor, auditory"
// @Param id path int true "Entity ID"
// @Param date query string true "Target date in YYYY-MM-DD format"
// @Success 200 {object} models.BFFResponse{data=[]models.Day}
// @Failure 400 {object} map[string]string
// @Failure 503 {object} map[string]string
// @Router /schedule/{type}/{id}/day [get]
func (s *Server) handleGetScheduleDay(entityType string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		idStr := c.Params("id")
		id, err := strconv.Atoi(idStr)
		if err != nil || id < 1 || id > 999999 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid ID"})
		}

		dateStr := c.Query("date")
		if dateStr == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "date query parameter is required (YYYY-MM-DD)"})
		}

		targetDate, err := time.Parse("2006-01-02", dateStr)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid date format, expected YYYY-MM-DD"})
		}

		// Compute Monday of the requested date's week
		weekday := int(targetDate.Weekday())
		if weekday == 0 {
			weekday = 7 // Sunday → 7 in ISO week
		}
		monday := targetDate.AddDate(0, 0, -(weekday - 1))
		monday = time.Date(monday.Year(), monday.Month(), monday.Day(), 0, 0, 0, 0, time.UTC)
		weekStartStr := monday.Format("2006-01-02")

		key := fmt.Sprintf("%s:%d", entityType, id)

		// Helper to unmarshal and filter to single day
		extractDay := func(raw []byte, source string, cachedAt time.Time) (models.BFFResponse, bool) {
			var wrapper struct {
				Data json.RawMessage `json:"data"`
			}
			if err := json.Unmarshal(raw, &wrapper); err != nil {
				return models.BFFResponse{}, false
			}
			var fullSchedule []models.Day
			if err := json.Unmarshal(wrapper.Data, &fullSchedule); err != nil {
				return models.BFFResponse{}, false
			}
			resp := s.filterScheduleDay(fullSchedule, weekStartStr, targetDate)
			resp.CachedAt = cachedAt
			resp.Source = source
			return resp, true
		}

		// 1. L1 Memory cache
		if data, ok := s.MemoryCache.Get(key); ok {
			c.Set("X-Cache-Status", "HIT-L1")
			if resp, ok := extractDay(data, "cache", time.Now()); ok {
				return c.JSON(resp)
			}
		}

		// 2. L2 SQLite cache
		data, meta, err := s.ScheduleRepo.GetSchedule(c.Context(), key)
		if err != nil {
			log.Error().Err(err).Msgf("Failed to query L2 cache for %s", key)
		}
		if data != nil && time.Now().Before(meta.ExpiresAt) {
			s.MemoryCache.Set(key, data)
			c.Set("X-Cache-Status", "HIT-L2")
			if resp, ok := extractDay(data, "cache", meta.ExpiresAt.Add(-s.Cfg.CacheScheduleTTL)); ok {
				return c.JSON(resp)
			}
		}

		// 3. Fetch from upstream
		log.Info().Msgf("Lazy fetching schedule for %s (day request: %s)...", key, dateStr)
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
			// Serve stale if available
			if data != nil {
				c.Set("X-Cache-Status", "STALE")
				if resp, ok := extractDay(data, "stale", time.Time{}); ok {
					return c.JSON(resp)
				}
			}
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "upstream unavailable and no cache found"})
		}

		// 4. Cache and respond
		fullResp := models.BFFResponse{
			Success:  true,
			Data:     schedule,
			CachedAt: time.Now(),
			Source:   "upstream",
		}
		jsonData, err := json.Marshal(fullResp)
		if err != nil {
			log.Error().Err(err).Msg("Failed to marshal schedule response")
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
		}

		if err := s.ScheduleRepo.PutSchedule(c.Context(), key, entityType, id, jsonData, "", s.Cfg.CacheScheduleTTL); err != nil {
			log.Error().Err(err).Msgf("Failed to update L2 cache for %s", key)
		}
		s.MemoryCache.Set(key, jsonData)

		c.Set("X-Cache-Status", "MISS")
		resp := s.filterScheduleDay(schedule, weekStartStr, targetDate)
		resp.CachedAt = fullResp.CachedAt
		resp.Source = fullResp.Source
		return c.JSON(resp)
	}
}


// @Summary Get schedule changes
// @Description Returns recent schedule changes for a group, tutor, or auditory.
// @Tags Changes
// @Produce json
// @Param type path string true "Entity type: group, tutor, auditory"
// @Param id path int true "Entity ID"
// @Success 200 {object} models.BFFResponse{data=[]storage.ScheduleChange}
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /changes/{type}/{id} [get]
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

// @Summary Subscribe to schedule notifications
// @Description Creates or updates a notification subscription for a group, tutor, or auditory.
// @Tags Notifications
// @Accept json
// @Produce json
// @Param subscription body storage.Subscription true "Subscription"
// @Success 200 {object} map[string]bool
// @Failure 400 {object} map[string]string
// @Failure 422 {object} map[string]string
// @Failure 429 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /subscribe [post]
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

// UnsubscribeRequest is the request body for removing a notification subscription.
type UnsubscribeRequest struct {
	Token      string `json:"fcm_token"`
	EntityType string `json:"entity_type"`
	EntityID   int    `json:"entity_id"`
}

// @Summary Unsubscribe from schedule notifications
// @Description Removes a notification subscription for a group, tutor, or auditory.
// @Tags Notifications
// @Accept json
// @Produce json
// @Param subscription body UnsubscribeRequest true "Subscription identity"
// @Success 200 {object} map[string]bool
// @Failure 400 {object} map[string]string
// @Failure 422 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /unsubscribe [post]
func (s *Server) handleUnsubscribe(c *fiber.Ctx) error {
	var body UnsubscribeRequest
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
