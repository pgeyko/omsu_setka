package api

import (
	"context"
	"encoding/json"
	"fmt"
	"omsu_mirror/internal/apperrors"
	"omsu_mirror/internal/diff"
	"omsu_mirror/internal/models"
	"omsu_mirror/internal/storage"
	"sort"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog/log"
)

// @Summary Get group schedule
// @Description Returns the schedule for a specific group. Lazy-fetches if not in cache.
// @Tags Schedules
// @Produce json
// @Param id path int true "Group dictionary ID (dict_groups.id)"
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

// @Summary Get schedule changes feed
// @Description Returns a filterable, paginated feed of schedule changes. Omit entity filters for all entities.
// @Tags Changes
// @Produce json
// @Param entity_type query string false "group, tutor, auditory"
// @Param entity_id query int false "Entity ID"
// @Param subgroup query string false "Subgroup number (1, 2)"
// @Param limit query int false "1..100, default 20"
// @Param before_id query int false "Cursor for pagination (last received id)"
// @Param since query string false "RFC3339 or YYYY-MM-DD lower bound by created_at"
// @Param scope query string false "all — ignore entity filters"
// @Success 200 {object} models.BFFResponse
// @Router /changes [get]
func (s *Server) handleGetChangesFeed(c *fiber.Ctx) error {
	entityType := c.Query("entity_type")
	scope := c.Query("scope")
	if scope == "all" {
		entityType = ""
	}
	if entityType != "" && !isValidEntityType(entityType) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid entity type"})
	}

	entityID, err := strconv.Atoi(c.Query("entity_id", "0"))
	if err != nil || entityID < 0 || entityID > 999999 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid entity id"})
	}
	if scope == "all" {
		entityID = 0
	}
	if entityID > 0 && entityType == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "entity_type is required with entity_id"})
	}

	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	beforeID, _ := strconv.Atoi(c.Query("before_id", "0"))
	if beforeID < 0 {
		beforeID = 0
	}

	subgroup := diff.NormalizeSubgroup(c.Query("subgroup"))

	var since *time.Time
	if raw := c.Query("since"); raw != "" {
		parsed, parseErr := time.Parse(time.RFC3339, raw)
		if parseErr != nil {
			parsed, parseErr = time.Parse("2006-01-02", raw)
		}
		if parseErr != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid since, expected RFC3339 or YYYY-MM-DD"})
		}
		since = &parsed
	}

	items, err := s.ChangeRepo.GetChangesFiltered(c.Context(), storage.ChangeFilter{
		EntityType: entityType,
		EntityID:   entityID,
		Subgroup:   subgroup,
		Limit:      limit,
		BeforeID:   beforeID,
		Since:      since,
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch changes"})
	}

	nextBeforeID := 0
	if len(items) == limit && len(items) > 0 {
		nextBeforeID = items[len(items)-1].ID
	}
	for i := range items {
		enrichScheduleChange(&items[i])
	}

	return c.JSON(models.BFFResponse{
		Success: true,
		Data: fiber.Map{
			"items":          items,
			"next_before_id": nextBeforeID,
		},
		CachedAt: time.Now(),
		Source:   "cache",
	})
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
func enrichScheduleChange(item *storage.ScheduleChange) {
	raw := item.NewData
	if raw == "" {
		raw = item.OldData
	}
	if raw == "" {
		return
	}
	var lesson models.Lesson
	if err := json.Unmarshal([]byte(raw), &lesson); err != nil {
		return
	}
	if item.Pair == 0 {
		item.Pair = lesson.Time
	}
	if item.Subject == "" {
		item.Subject = lesson.Lesson
	}
	if item.Subgroup == "" {
		item.Subgroup = lesson.SubgroupNumber
		if item.Subgroup == "" {
			item.Subgroup = diff.NormalizeSubgroup(lesson.SubgroupName)
		}
	}
}

func collectSubgroups(days []models.Day) []string {
	seen := make(map[string]struct{})
	for _, day := range days {
		for _, lesson := range day.Lessons {
			value := lesson.SubgroupNumber
			if value == "" {
				value = diff.NormalizeSubgroup(lesson.SubgroupName)
			}
			if value != "" {
				seen[value] = struct{}{}
			}
		}
	}
	result := make([]string, 0, len(seen))
	for value := range seen {
		result = append(result, value)
	}
	sort.Slice(result, func(i, j int) bool {
		left, leftErr := strconv.Atoi(result[i])
		right, rightErr := strconv.Atoi(result[j])
		if leftErr == nil && rightErr == nil {
			return left < right
		}
		return result[i] < result[j]
	})
	return result
}

// @Summary Get group subgroups
// @Description Returns all subgroup numbers used in the cached group schedule (all weeks).
// @Tags Schedules
// @Produce json
// @Param id path int true "Group dictionary ID (dict_groups.id)"
// @Success 200 {object} models.BFFResponse{data=[]string}
// @Failure 400 {object} map[string]string
// @Failure 503 {object} map[string]string
// @Router /schedule/group/{id}/subgroups [get]
func (s *Server) handleGroupSubgroups(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id < 1 || id > 999999 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": apperrors.ErrInvalidID.Error()})
	}

	result, err := s.ScheduleService.GetSchedule(c.Context(), "group", id)
	if err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": apperrors.ErrUpstreamUnavailable.Error()})
	}

	var wrapper struct {
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(result.Data, &wrapper); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to read schedule"})
	}
	var days []models.Day
	if err := json.Unmarshal(wrapper.Data, &days); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to read schedule"})
	}

	return c.JSON(models.BFFResponse{
		Success:  true,
		Data:     collectSubgroups(days),
		CachedAt: result.CachedAt,
		Source:   result.Source,
	})
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
	for i := range changes {
		enrichScheduleChange(&changes[i])
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
type subscribeRequest struct {
	FCMToken           string `json:"fcm_token"`
	EntityType         string `json:"entity_type"`
	EntityID           int    `json:"entity_id"`
	NotifyOnChange     *bool  `json:"notify_on_change"`
	NotifyDailyDigest  bool   `json:"notify_daily_digest"`
	DigestTime         string `json:"digest_time"`
	NotifyBeforeLesson bool   `json:"notify_before_lesson"`
	BeforeMinutes      int    `json:"before_minutes"`
	Timezone           string `json:"timezone"`
	Subgroup           string `json:"subgroup"`
}

// @Param subscription body subscribeRequest true "Subscription"
// @Success 200 {object} map[string]bool
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 422 {object} map[string]string
// @Failure 429 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /subscribe [post]
func (s *Server) handleSubscribe(c *fiber.Ctx) error {
	var req subscribeRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.FCMToken == "" || req.EntityType == "" || req.EntityID == 0 {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": "missing required fields"})
	}
	if !isValidEntityType(req.EntityType) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid entity type"})
	}

	exists, err := s.DictRepo.Exists(c.Context(), req.EntityType, req.EntityID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to check entity"})
	}
	if !exists {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "entity not found"})
	}

	notifyOnChange := true
	if req.NotifyOnChange != nil {
		notifyOnChange = *req.NotifyOnChange
	}
	sub := storage.Subscription{
		FCMToken:           req.FCMToken,
		EntityType:         req.EntityType,
		EntityID:           req.EntityID,
		NotifyOnChange:     notifyOnChange,
		NotifyDailyDigest:  req.NotifyDailyDigest,
		DigestTime:         req.DigestTime,
		NotifyBeforeLesson: req.NotifyBeforeLesson,
		BeforeMinutes:      req.BeforeMinutes,
		Timezone:           req.Timezone,
		Subgroup:           diff.NormalizeSubgroup(req.Subgroup),
	}

	// 25.5 Add subscription limit check
	count, err := s.SubscriptionRepo.GetSubscriptionCount(c.Context(), sub.FCMToken)
	if err == nil && count >= 10 {
		return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "maximum subscriptions limit reached (10)"})
	}

	if err := s.SubscriptionRepo.Subscribe(c.Context(), sub); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to subscribe"})
	}

	// Warm the schedule immediately so a newly subscribed entity starts being
	// tracked before the next periodic sync.
	go func(entityType string, entityID int) {
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()
		if err := s.Syncer.SyncEntity(ctx, entityType, entityID); err != nil {
			log.Warn().Err(err).Str("entity", entityType).Int("id", entityID).Msg("Failed to warm subscribed schedule")
		}
	}(sub.EntityType, sub.EntityID)

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
