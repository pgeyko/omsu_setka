package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"omsu_mirror/internal/models"
	"omsu_mirror/internal/storage"
	"time"

	"github.com/rs/zerolog/log"
)

func (s *Syncer) SyncScheduledNotifications(ctx context.Context) error {
	loc, _ := time.LoadLocation("Asia/Omsk")
	if loc == nil {
		loc = time.FixedZone("OMST", 6*3600) // UTC+6
	}
	now := time.Now().In(loc)
	todayStr := now.Format("2006-01-02")
	currentTimeStr := now.Format("15:04")

	// 1. Process Daily Digests
	if err := s.processDailyDigests(ctx, now, todayStr, currentTimeStr); err != nil {
		log.Error().Err(err).Msg("Failed to process daily digests")
	}

	// 2. Process Lesson Reminders
	if err := s.processLessonReminders(ctx, now); err != nil {
		log.Error().Err(err).Msg("Failed to process lesson reminders")
	}

	return nil
}

func (s *Syncer) processDailyDigests(ctx context.Context, now time.Time, todayStr, currentTimeStr string) error {
	// Find subscriptions that need digest right now
	rows, err := s.subscriptionRepo.GetSubscriptionsForDigest(ctx, currentTimeStr, todayStr)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var sub storage.Subscription
		if err := rows.Scan(&sub.FCMToken, &sub.EntityType, &sub.EntityID, &sub.Timezone); err != nil {
			continue
		}

		// Get tomorrow's schedule
		tomorrow := now.AddDate(0, 0, 1)
		schedule, err := s.getScheduleForDay(ctx, sub.EntityType, sub.EntityID, tomorrow)
		
		var title, body string
		if err != nil || len(schedule) == 0 {
			title = "Завтра выходной! 🎉"
			body = "На завтра занятий не найдено. Можно отдыхать!"
		} else {
			firstLesson := schedule[0]
			startTime := models.TimeSlots[firstLesson.Time].Start
			title = fmt.Sprintf("Расписание на завтра (%s)", tomorrow.Format("02.01"))
			body = fmt.Sprintf("У вас %d занятий завтра. Первое начинается в %s.", len(schedule), startTime)
		}

		// Send FCM
		s.fcm.SendToTokens(ctx, []string{sub.FCMToken}, title, body, map[string]string{
			"type": sub.EntityType,
			"id":   fmt.Sprintf("%d", sub.EntityID),
			"kind": "digest",
		})

		s.subscriptionRepo.MarkDigestSent(ctx, sub.FCMToken, sub.EntityType, sub.EntityID, todayStr)
	}

	return nil
}

func (s *Syncer) processLessonReminders(ctx context.Context, now time.Time) error {
	// Find subscriptions with reminders enabled
	rows, err := s.subscriptionRepo.GetSubscriptionsWithReminders(ctx)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var sub storage.Subscription
		if err := rows.Scan(&sub.FCMToken, &sub.EntityType, &sub.EntityID, &sub.BeforeMinutes); err != nil {
			continue
		}

		// Check if any lesson starts in exactly beforeMinutes
		targetTime := now.Add(time.Duration(sub.BeforeMinutes) * time.Minute)
		targetTimeStr := targetTime.Format("15:04")

		schedule, err := s.getScheduleForDay(ctx, sub.EntityType, sub.EntityID, targetTime)
		if err != nil {
			continue
		}

		for _, lesson := range schedule {
			startTime := models.TimeSlots[lesson.Time].Start
			if startTime == targetTimeStr {
				// Match! Send notification
				title := "Скоро занятие"
				body := fmt.Sprintf("%s в %s (%s)", lesson.Lesson, startTime, lesson.AuditCorps)
				
				s.fcm.SendToTokens(ctx, []string{sub.FCMToken}, title, body, map[string]string{
					"type": sub.EntityType,
					"id":   fmt.Sprintf("%d", sub.EntityID),
					"kind": "reminder",
				})
				break // Only one notification per minute/subscription
			}
		}
	}

	return nil
}

func (s *Syncer) getScheduleForDay(ctx context.Context, entityType string, entityID int, date time.Time) ([]models.Lesson, error) {
	key := fmt.Sprintf("%s:%d", entityType, entityID)
	data, _, err := s.scheduleRepo.GetSchedule(ctx, key)
	if err != nil || data == nil {
		return nil, fmt.Errorf("no schedule in cache")
	}

	var days []models.Day
	if err := json.Unmarshal(data, &days); err != nil {
		return nil, err
	}

	dateStr := date.Format("02.01.2006")
	for _, day := range days {
		if day.Day == dateStr {
			return day.Lessons, nil
		}
	}

	return nil, nil
}
