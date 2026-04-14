package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"omsu_mirror/internal/models"
	"omsu_mirror/internal/storage"
	"strings"
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
	log.Info().Msgf("Checking notifications for time=%s today=%s", currentTimeStr, todayStr)

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

	count := 0
	for rows.Next() {
		count++
		var sub storage.Subscription
		if err := rows.Scan(&sub.FCMToken, &sub.EntityType, &sub.EntityID, &sub.Timezone, &sub.Subgroup); err != nil {
			log.Error().Err(err).Msg("Failed to scan subscription row for digest")
			continue
		}

		log.Debug().Msgf("Processing daily digest for token=%.8s... entity=%s:%d", sub.FCMToken, sub.EntityType, sub.EntityID)

		// Get next study day schedule
		targetDate := now.AddDate(0, 0, 1)
		var schedule []models.Lesson
		
		// Look ahead up to 3 days if tomorrow is weekend and has no lessons
		for i := 0; i < 3; i++ {
			var err error
			schedule, err = s.getScheduleForDay(ctx, sub.EntityType, sub.EntityID, targetDate, sub.Subgroup)
			if err != nil {
				log.Warn().Err(err).Msgf("Digest: skipping notification for token=%.8s... because schedule data is unavailable", sub.FCMToken)
				break
			}
			if len(schedule) > 0 {
				break
			}
			// Skip weekend if no lessons
			if targetDate.Weekday() == time.Saturday || targetDate.Weekday() == time.Sunday {
				targetDate = targetDate.AddDate(0, 0, 1)
			} else {
				break
			}
		}

		var title, body string
		if len(schedule) == 0 {
			title = "На ближайшие дни занятий нет! 🎉"
			body = "Можно отдыхать и набираться сил."
		} else {
			// Count unique time slots to handle overlapping lessons (e.g. split subgroups)
			uniqueSlots := make(map[int]struct{})
			firstSlot := 99
			for _, l := range schedule {
				uniqueSlots[l.Time] = struct{}{}
				if l.Time < firstSlot {
					firstSlot = l.Time
				}
			}

			startTime := models.TimeSlots[firstSlot].Start
			title = fmt.Sprintf("Расписание на: %s", targetDate.Format("02.01"))
			body = fmt.Sprintf("У вас %d %s на %s. Первое начинается в %s.",
				len(uniqueSlots),
				getLessonWord(len(uniqueSlots)),
				targetDate.Format("02.01"),
				startTime,
			)
		}

		// Send FCM
		s.fcm.SendToTokens(ctx, []string{sub.FCMToken}, title, body, map[string]string{
			"type": sub.EntityType,
			"id":   fmt.Sprintf("%d", sub.EntityID),
			"kind": "digest",
		})

		s.subscriptionRepo.MarkDigestSent(ctx, sub.FCMToken, sub.EntityType, sub.EntityID, todayStr)
	}

	if count > 0 {
		log.Info().Msgf("Processed %d daily digests for %s", count, currentTimeStr)
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
		if err := rows.Scan(&sub.FCMToken, &sub.EntityType, &sub.EntityID, &sub.BeforeMinutes, &sub.Subgroup, &sub.LastReminderAt); err != nil {
			continue
		}

		// Check if any lesson starts in exactly beforeMinutes
		targetTime := now.Add(time.Duration(sub.BeforeMinutes) * time.Minute)
		targetTimeStr := targetTime.Format("15:04")
		todayDateStr := targetTime.Format("2006-01-02")
		reminderDateTimeStr := todayDateStr + " " + targetTimeStr

		schedule, err := s.getScheduleForDay(ctx, sub.EntityType, sub.EntityID, targetTime, sub.Subgroup)
		if err != nil {
			continue
		}

		for _, lesson := range schedule {
			startTime := models.TimeSlots[lesson.Time].Start
			if startTime == targetTimeStr {
				// Prevent duplicates
				if sub.LastReminderAt == reminderDateTimeStr {
					break
				}

				// Match! Send notification
				title := fmt.Sprintf("Расписание на: %s", targetTime.Format("02.01"))
				body := fmt.Sprintf("%s в %s (%s)", lesson.Lesson, startTime, lesson.AuditCorps)
				
				s.fcm.SendToTokens(ctx, []string{sub.FCMToken}, title, body, map[string]string{
					"type": sub.EntityType,
					"id":   fmt.Sprintf("%d", sub.EntityID),
					"kind": "reminder",
				})

				s.subscriptionRepo.MarkReminderSent(ctx, sub.FCMToken, sub.EntityType, sub.EntityID, reminderDateTimeStr)
				break // Only one notification per minute/subscription
			}
		}
	}

	return nil
}

func (s *Syncer) getScheduleForDay(ctx context.Context, entityType string, entityID int, date time.Time, subgroup string) ([]models.Lesson, error) {
	key := fmt.Sprintf("%s:%d", entityType, entityID)
	data, _, err := s.scheduleRepo.GetSchedule(ctx, key)
	if err != nil || data == nil {
		return nil, fmt.Errorf("no schedule in cache")
	}

	var bff models.BFFResponse
	if err := json.Unmarshal(data, &bff); err != nil {
		return nil, fmt.Errorf("failed to unmarshal bff response: %w", err)
	}

	dataBytes, err := json.Marshal(bff.Data)
	if err != nil {
		return nil, fmt.Errorf("failed to re-marshal bff data: %w", err)
	}

	var days []models.Day
	if err := json.Unmarshal(dataBytes, &days); err != nil {
		return nil, fmt.Errorf("failed to unmarshal days: %w", err)
	}

	dateStr := date.Format("02.01.2006")
	for _, day := range days {
		if day.Day == dateStr {
			if subgroup == "" {
				return day.Lessons, nil
			}
			// Filter by subgroup
			var filtered []models.Lesson
			for _, lesson := range day.Lessons {
				if lesson.SubgroupName == "" || 
				   lesson.SubgroupName == subgroup || 
				   strings.HasSuffix(lesson.SubgroupName, "/"+subgroup) {
					filtered = append(filtered, lesson)
				}
			}
			return filtered, nil
		}
	}

	return nil, nil
}



func getLessonWord(count int) string {
	if count%10 == 1 && count%100 != 11 {
		return "занятие"
	}
	if count%10 >= 2 && count%10 <= 4 && (count%100 < 10 || count%100 >= 20) {
		return "занятия"
	}
	return "занятий"
}
