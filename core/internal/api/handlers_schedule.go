package api

import (
	"encoding/json"
	"fmt"
	"omsu_mirror/internal/apperrors"
	"omsu_mirror/internal/models"
	"omsu_mirror/internal/storage"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
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
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil || id < 1 || id > 999999 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": apperrors.ErrInvalidID.Error()})
		}

		weekStartStr := c.Query("week_start")

		result, err := s.ScheduleService.GetSchedule(c.Context(), entityType, id)
		if err != nil {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": apperrors.ErrUpstreamUnavailable.Error()})
		}

		c.Set("X-Cache-Status", result.Source)

		if weekStartStr != "" {
			key := fmt.Sprintf("%s:%d", entityType, id)
			var fullSchedule []models.Day
			var cachedAt time.Time
			if typed, ok := s.MemoryCache.GetTyped(key); ok {
				cacheEntry, ok := typed.(struct {
					Days     []models.Day
					CachedAt time.Time
				})
				if ok {
					fullSchedule = cacheEntry.Days
					cachedAt = cacheEntry.CachedAt
				} else {
					s.MemoryCache.Invalidate(key)
				}
			}
			if fullSchedule == nil {
				var cached struct {
					Data     json.RawMessage `json:"data"`
					CachedAt time.Time       `json:"cached_at"`
				}
				if err := json.Unmarshal(result.Data, &cached); err == nil {
					cachedAt = cached.CachedAt
					if err := json.Unmarshal(cached.Data, &fullSchedule); err == nil {
						s.MemoryCache.SetTyped(key, struct {
							Days     []models.Day
							CachedAt time.Time
						}{fullSchedule, cachedAt})
					}
				}
			}
			if fullSchedule != nil {
				filteredResp := s.filterSchedule(fullSchedule, weekStartStr)
				filteredResp.CachedAt = cachedAt
				filteredResp.Source = "cache"
				return c.JSON(filteredResp)
			}
		}

		c.Set("Content-Type", "application/json")
		return c.Send(result.Data)
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
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil || id < 1 || id > 999999 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": apperrors.ErrInvalidID.Error()})
		}

		dateStr := c.Query("date")
		if dateStr == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "date query parameter is required (YYYY-MM-DD)"})
		}

		targetDate, err := time.Parse("2006-01-02", dateStr)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid date format, expected YYYY-MM-DD"})
		}

		weekday := int(targetDate.Weekday())
		if weekday == 0 {
			weekday = 7
		}
		monday := targetDate.AddDate(0, 0, -(weekday - 1))
		monday = time.Date(monday.Year(), monday.Month(), monday.Day(), 0, 0, 0, 0, time.UTC)
		weekStartStr := monday.Format("2006-01-02")

		result, err := s.ScheduleService.GetSchedule(c.Context(), entityType, id)
		if err != nil {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": apperrors.ErrUpstreamUnavailable.Error()})
		}

		c.Set("X-Cache-Status", result.Source)

		key := fmt.Sprintf("%s:%d", entityType, id)
		var fullSchedule []models.Day
		if typed, ok := s.MemoryCache.GetTyped(key); ok {
			if fs, ok := typed.([]models.Day); ok {
				fullSchedule = fs
			} else {
				s.MemoryCache.Invalidate(key)
			}
		}
		if fullSchedule == nil {
			var wrapper struct {
				Data json.RawMessage `json:"data"`
			}
			if err := json.Unmarshal(result.Data, &wrapper); err != nil {
				return c.Send(result.Data)
			}
			if err := json.Unmarshal(wrapper.Data, &fullSchedule); err != nil {
				return c.Send(result.Data)
			}
			s.MemoryCache.SetTyped(key, fullSchedule)
		}

		resp := s.filterScheduleDay(fullSchedule, weekStartStr, targetDate)
		resp.CachedAt = result.CachedAt
		resp.Source = result.Source
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
