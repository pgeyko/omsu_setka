package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"omsu_mirror/internal/diff"
	"omsu_mirror/internal/models"
	"omsu_mirror/internal/storage"
	"time"

	"github.com/rs/zerolog/log"
)

func (s *Syncer) SyncScheduledNotifications(ctx context.Context) error {
	// Use UTC as the base and apply each subscription's timezone locally.
	now := time.Now().UTC()
	log.Info().Msgf("Checking scheduled notifications at %s", now.Format(time.RFC3339))

	if err := s.processDailyDigests(ctx, now); err != nil {
		log.Error().Err(err).Msg("Failed to process daily digests")
	}
	if err := s.processLessonReminders(ctx, now); err != nil {
		log.Error().Err(err).Msg("Failed to process lesson reminders")
	}
	return nil
}

func locationFor(timezone string) *time.Location {
	if timezone == "" {
		return time.FixedZone("OMST", 6*3600)
	}
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		log.Warn().Err(err).Str("timezone", timezone).Msg("Unknown timezone, falling back to Asia/Omsk")
		return time.FixedZone("OMST", 6*3600)
	}
	return loc
}

func (s *Syncer) processDailyDigests(ctx context.Context, now time.Time) error {
	rows, err := s.subscriptionRepo.GetDigestSubscriptions(ctx)
	if err != nil {
		return err
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var sub storage.Subscription
		if err := rows.Scan(
			&sub.FCMToken, &sub.EntityType, &sub.EntityID, &sub.Timezone,
			&sub.Subgroup, &sub.DigestTime, &sub.LastDigestAt,
		); err != nil {
			log.Error().Err(err).Msg("Failed to scan subscription row for digest")
			continue
		}

		loc := locationFor(sub.Timezone)
		localNow := now.In(loc)
		if localNow.Format("15:04") != sub.DigestTime {
			continue
		}
		todayStr := localNow.Format("2006-01-02")
		if sub.LastDigestAt == todayStr {
			continue
		}

		count++
		subgroup := diff.NormalizeSubgroup(sub.Subgroup)
		log.Debug().Msgf("Processing daily digest for token=%.8s... entity=%s:%d timezone=%s",
			sub.FCMToken, sub.EntityType, sub.EntityID, sub.Timezone)

		targetDate := localNow.AddDate(0, 0, 1)
		var schedule []models.Lesson
		var fetchErr error

		// Look ahead up to 3 days if tomorrow is a weekend and has no lessons.
		for i := 0; i < 3; i++ {
			schedule, fetchErr = s.getScheduleForDay(ctx, sub.EntityType, sub.EntityID, targetDate, subgroup)
			if fetchErr != nil {
				log.Warn().Err(fetchErr).Msgf("Digest: skipping notification for token=%.8s... because schedule data is unavailable", sub.FCMToken)
				break
			}
			if len(schedule) > 0 {
				break
			}
			if targetDate.Weekday() == time.Saturday || targetDate.Weekday() == time.Sunday {
				targetDate = targetDate.AddDate(0, 0, 1)
			} else {
				break
			}
		}

		if fetchErr != nil {
			continue
		}

		var title, body string
		if len(schedule) == 0 {
			if targetDate.Format("2006-01-02") == localNow.AddDate(0, 0, 1).Format("2006-01-02") {
				title = "Завтра занятий нет! 🎉"
				body = "Можно немного перевести дух."
			} else {
				title = "На ближайшие дни занятий нет! 🎉"
				body = "Можно отдыхать и набираться сил."
			}
		} else {
			// Count unique time slots to handle overlapping lessons (split subgroups).
			uniqueSlots := make(map[int]struct{})
			firstSlot := 99
			for _, lesson := range schedule {
				uniqueSlots[lesson.Time] = struct{}{}
				if lesson.Time < firstSlot {
					firstSlot = lesson.Time
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

		s.fcm.SendToTokens(ctx, []string{sub.FCMToken}, title, body, map[string]string{
			"type": sub.EntityType,
			"id":   fmt.Sprintf("%d", sub.EntityID),
			"kind": "digest",
		})
		_ = s.subscriptionRepo.MarkDigestSent(ctx, sub.FCMToken, sub.EntityType, sub.EntityID, todayStr)
	}

	if count > 0 {
		log.Info().Msgf("Processed %d daily digests", count)
	}
	return nil
}

func (s *Syncer) processLessonReminders(ctx context.Context, now time.Time) error {
	rows, err := s.subscriptionRepo.GetSubscriptionsWithReminders(ctx)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var sub storage.Subscription
		if err := rows.Scan(
			&sub.FCMToken, &sub.EntityType, &sub.EntityID, &sub.BeforeMinutes,
			&sub.Subgroup, &sub.LastReminderAt, &sub.Timezone,
		); err != nil {
			continue
		}

		loc := locationFor(sub.Timezone)
		localNow := now.In(loc)
		targetTime := localNow.Add(time.Duration(sub.BeforeMinutes) * time.Minute)
		targetTimeStr := targetTime.Format("15:04")
		todayDateStr := targetTime.Format("2006-01-02")
		reminderDateTimeStr := todayDateStr + " " + targetTimeStr

		if sub.LastReminderAt == reminderDateTimeStr {
			continue
		}

		subgroup := diff.NormalizeSubgroup(sub.Subgroup)
		schedule, err := s.getScheduleForDay(ctx, sub.EntityType, sub.EntityID, targetTime, subgroup)
		if err != nil {
			continue
		}

		for _, lesson := range schedule {
			startTime := models.TimeSlots[lesson.Time].Start
			if startTime != targetTimeStr {
				continue
			}

			title := fmt.Sprintf("Скоро: %s", lesson.Lesson)
			body := fmt.Sprintf("Начнется в %s (%s)", startTime, lesson.AuditCorps)

			s.fcm.SendToTokens(ctx, []string{sub.FCMToken}, title, body, map[string]string{
				"type": sub.EntityType,
				"id":   fmt.Sprintf("%d", sub.EntityID),
				"kind": "reminder",
			})

			_ = s.subscriptionRepo.MarkReminderSent(ctx, sub.FCMToken, sub.EntityType, sub.EntityID, reminderDateTimeStr)
			break
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
		if day.Day != dateStr {
			continue
		}
		if subgroup == "" {
			return day.Lessons, nil
		}
		filtered := make([]models.Lesson, 0, len(day.Lessons))
		for _, lesson := range day.Lessons {
			lessonSubgroup := diff.NormalizeSubgroup(lesson.SubgroupName)
			if lessonSubgroup == "" || lessonSubgroup == subgroup {
				filtered = append(filtered, lesson)
			}
		}
		return filtered, nil
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
