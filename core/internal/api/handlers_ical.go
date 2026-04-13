package api

import (
	"encoding/json"
	"fmt"
	"omsu_mirror/internal/models"
	"strconv"
	"time"

	ics "github.com/arran4/golang-ical"
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog/log"
)

// @Summary Get schedule in iCal format
// @Description Returns the full schedule for a group, tutor, or auditory as an .ics file.
// @Tags Schedules
// @Produce text/calendar
// @Param type path string true "Entity type (group, tutor, auditory)"
// @Param id path int true "Entity ID"
// @Param token query string false "Access token (if configured)"
// @Success 200 {string} string "iCal Calendar Data"
// @Router /schedule/{type}/{id}/ical [get]
func (s *Server) handleGetICal(entityType string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		idStr := c.Params("id")
		token := c.Query("token")

		// 1. Security Check (Optional Token)
		if s.Cfg.ICalAccessToken != "" && token != s.Cfg.ICalAccessToken {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "invalid access token"})
		}

	id, err := strconv.Atoi(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid ID"})
	}

	key := fmt.Sprintf("%s:%d", entityType, id)
	icalKey := "ical:" + key

	// 2. Try Cache
	if data, ok := s.MemoryCache.Get(icalKey); ok {
		c.Set("Content-Type", "text/calendar; charset=utf-8")
		c.Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"schedule_%s_%d.ics\"", entityType, id))
		return c.Send(data)
	}

	// 3. Fetch Full Schedule
	schedule, err := s.fetchFullSchedule(c, entityType, id)
	if err != nil {
		log.Error().Err(err).Msgf("Failed to fetch schedule for iCal: %s", key)
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "schedule data unavailable"})
	}

	// 4. Generate iCal
	cal := ics.NewCalendar()
	cal.SetMethod(ics.MethodPublish)
	cal.SetProductId("-//omsu_mirror//NONSGML v1.0//RU")
	cal.SetName(fmt.Sprintf("Расписание %s %d", entityType, id))

	loc, _ := time.LoadLocation("Asia/Omsk")
	if loc == nil {
		loc = time.FixedZone("OMST", 6*3600)
	}

	for _, day := range schedule {
		date, err := time.ParseInLocation("02.01.2006", day.Day, loc)
		if err != nil {
			continue
		}

		for _, lesson := range day.Lessons {
			slot, ok := models.TimeSlots[lesson.Time]
			if !ok {
				continue
			}

			// Parse slot times (e.g., "08:45")
			var startH, startM, endH, endM int
			fmt.Sscanf(slot.Start, "%d:%d", &startH, &startM)
			fmt.Sscanf(slot.End, "%d:%d", &endH, &endM)

			start := time.Date(date.Year(), date.Month(), date.Day(), startH, startM, 0, 0, loc)
			end := time.Date(date.Year(), date.Month(), date.Day(), endH, endM, 0, 0, loc)

			event := cal.AddEvent(fmt.Sprintf("%s-%d-%d", key, date.Unix(), lesson.ID))
			event.SetCreatedTime(time.Now())
			event.SetDtStampTime(time.Now())
			event.SetStartAt(start)
			event.SetEndAt(end)
			event.SetSummary(lesson.Lesson)
			event.SetLocation(lesson.AuditCorps)
			
			desc := fmt.Sprintf("Преподаватель: %s\nТип: %s", lesson.Teacher, lesson.TypeWork)
			if lesson.SubgroupName != "" {
				desc += fmt.Sprintf("\nПодгруппа: %s", lesson.SubgroupName)
			}
			event.SetDescription(desc)
		}
	}

	icsData := cal.Serialize()
	
	// 5. Cache and Return (30 mins TTL as per roadmap)
	s.MemoryCache.SetWithTTL(icalKey, []byte(icsData), 30*time.Minute)

	c.Set("Content-Type", "text/calendar; charset=utf-8")
	c.Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"schedule_%s_%d.ics\"", entityType, id))
	return c.SendString(icsData)
	}
}

// fetchFullSchedule is an internal helper to retrieve the complete schedule array.
func (s *Server) fetchFullSchedule(c *fiber.Ctx, entityType string, id int) ([]models.Day, error) {
	key := fmt.Sprintf("%s:%d", entityType, id)
	
	// Check L1
	if data, ok := s.MemoryCache.Get(key); ok {
		var resp models.BFFResponse
		if err := json.Unmarshal(data, &resp); err == nil {
			// BFFResponse.Data is interface{}, need to convert to []models.Day
			if days, ok := resp.Data.([]interface{}); ok {
				var schedule []models.Day
				daysBytes, _ := json.Marshal(days)
				json.Unmarshal(daysBytes, &schedule)
				return schedule, nil
			}
		}
	}

	// Check L2
	data, meta, err := s.ScheduleRepo.GetSchedule(c.Context(), key)
	if err == nil && data != nil && time.Now().Before(meta.ExpiresAt) {
		var resp models.BFFResponse
		if err := json.Unmarshal(data, &resp); err == nil {
			if days, ok := resp.Data.([]interface{}); ok {
				var schedule []models.Day
				daysBytes, _ := json.Marshal(days)
				json.Unmarshal(daysBytes, &schedule)
				return schedule, nil
			}
		}
	}

	// Fetch Upstream
	var schedule []models.Day
	switch entityType {
	case "group":
		schedule, err = s.Client.FetchGroupSchedule(c.Context(), id)
	case "tutor":
		schedule, err = s.Client.FetchTutorSchedule(c.Context(), id)
	case "auditory":
		schedule, err = s.Client.FetchAuditorySchedule(c.Context(), id)
	default:
		return nil, fmt.Errorf("unknown entity type: %s", entityType)
	}
	
	return schedule, err
}
