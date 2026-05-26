package sync

import (
	"context"
	"encoding/json"
	"omsu_mirror/internal/models"
	"omsu_mirror/internal/storage"
	"omsu_mirror/internal/webhook"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

// safeMarshalJSON marshals v to JSON string, logging and returning empty on error.
func safeMarshalJSON(v interface{}) string {
	data, err := json.Marshal(v)
	if err != nil {
		log.Error().Err(err).Msg("safeMarshalJSON: failed to marshal value")
		return ""
	}
	return string(data)
}

func (s *Syncer) SyncActiveSchedules(ctx context.Context) error {
	keys, err := s.scheduleRepo.GetActiveScheduleKeys(ctx, 24*time.Hour)
	if err != nil {
		return err
	}

	log.Info().Msgf("Syncing %d active schedules...", len(keys))

	const numWorkers = 5
	sem := make(chan struct{}, numWorkers)
	var mu sync.Mutex
	var hasErrors bool
	var lastErr error
	var wg sync.WaitGroup

	for _, key := range keys {
		key := key
		select {
		case <-ctx.Done():
			wg.Wait()
			return ctx.Err()
		default:
		}

		wg.Add(1)
		sem <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-sem }()

			select {
			case <-ctx.Done():
				return
			default:
			}

			parts := strings.Split(key, ":")
			if len(parts) != 2 {
				return
			}

			entityType := parts[0]
			entityID, err := strconv.Atoi(parts[1])
			if err != nil {
				log.Warn().Err(err).Msgf("Invalid key format: %s", key)
				return
			}

			var schedule []models.Day
			switch entityType {
			case "group":
				schedule, err = s.client.FetchGroupSchedule(ctx, entityID)
			case "tutor":
				schedule, err = s.client.FetchTutorSchedule(ctx, entityID)
			case "auditory":
				schedule, err = s.client.FetchAuditorySchedule(ctx, entityID)
			default:
				log.Warn().Msgf("Unknown entity type in key: %s", key)
				return
			}

			if err != nil {
				log.Error().Err(err).Msgf("Failed to sync schedule for %s", key)
				mu.Lock()
				hasErrors = true
				lastErr = err
				mu.Unlock()
				return
			}

			if err := s.UpdateSchedule(ctx, key, entityType, entityID, schedule); err != nil {
				log.Error().Err(err).Msgf("Failed to update cache for %s", key)
				mu.Lock()
				hasErrors = true
				lastErr = err
				mu.Unlock()
				return
			}
		}()
	}

	wg.Wait()

	if hasErrors {
		s.recordFailure(ctx, "sync_active_schedules", lastErr)
		return lastErr
	}

	if err := s.scheduleRepo.PutSyncMeta(ctx, "last_schedule_sync", time.Now().Format(time.RFC3339)); err != nil {
		log.Warn().Err(err).Msg("Failed to update sync metadata")
	}

	s.recordSuccess(ctx, "sync_active_schedules")
	return nil
}

func (s *Syncer) UpdateSchedule(ctx context.Context, key string, entityType string, entityID int, schedule []models.Day) error {
	// 1. Get old schedule for diffing
	oldData, _, err := s.scheduleRepo.GetSchedule(ctx, key)
	if err == nil && oldData != nil {
		var oldResp models.BFFResponse
		if err := json.Unmarshal(oldData, &oldResp); err == nil {
			var oldSchedule []models.Day
			dataBytes, err := json.Marshal(oldResp.Data)
			if err != nil {
				log.Warn().Err(err).Msg("Failed to re-marshal old schedule data for diff")
			} else if err := json.Unmarshal(dataBytes, &oldSchedule); err == nil {
				s.compareAndLogChanges(ctx, entityType, entityID, oldSchedule, schedule)
			}
		}
	}

	jsonData, err := json.Marshal(models.BFFResponse{
		Success:  true,
		Data:     schedule,
		CachedAt: time.Now(),
		Source:   "cache",
	})
	if err != nil {
		return err
	}

	if err := s.scheduleRepo.PutSchedule(ctx, key, entityType, entityID, jsonData, "", s.cfg.CacheScheduleTTL); err != nil {
		return err
	}

	s.memoryCache.Set(key, jsonData)
	return nil
}

type lessonWithDay struct {
	models.Lesson
	Day string
}

func (s *Syncer) compareAndLogChanges(ctx context.Context, entityType string, entityID int, oldSched, newSched []models.Day) {
	oldLessons := make(map[int]lessonWithDay)
	for _, day := range oldSched {
		for _, lesson := range day.Lessons {
			oldLessons[lesson.ID] = lessonWithDay{Lesson: lesson, Day: day.Day}
		}
	}

	newLessons := make(map[int]lessonWithDay)
	for _, day := range newSched {
		for _, lesson := range day.Lessons {
			newLessons[lesson.ID] = lessonWithDay{Lesson: lesson, Day: day.Day}
		}
	}

	hasChanges := false
	var webhookChanges []webhook.Change

	// Check for removed or modified
	for id, oldL := range oldLessons {
		newL, exists := newLessons[id]
		if !exists {
			oldJSON := safeMarshalJSON(oldL.Lesson)
			_ = s.changeRepo.LogChange(ctx, storage.ScheduleChange{
				EntityType: entityType,
				EntityID:   entityID,
				ChangeType: "removed",
				LessonID:   id,
				OldData:    oldJSON,
			})
			hasChanges = true
			oldLessonJSON := safeMarshalJSON(oldL.Lesson)
			webhookChanges = append(webhookChanges, webhook.Change{
				Date:    convertDate(oldL.Day),
				Pair:    oldL.Time,
				Field:   "full",
				Old:     string(oldLessonJSON),
				New:     "",
				Subject: oldL.Lesson.Lesson,
			})
		} else if oldL.Day != newL.Day || !s.isLessonEqual(oldL.Lesson, newL.Lesson) {
			oldJSON := safeMarshalJSON(oldL.Lesson)
			newJSON := safeMarshalJSON(newL.Lesson)
			_ = s.changeRepo.LogChange(ctx, storage.ScheduleChange{
				EntityType: entityType,
				EntityID:   entityID,
				ChangeType: "modified",
				LessonID:   id,
				OldData:    oldJSON,
				NewData:    newJSON,
			})
			hasChanges = true
			webhookChanges = append(webhookChanges, lessonDiffToChanges(oldL, newL)...)
		}
	}

	// Check for added
	for id, newL := range newLessons {
		if _, exists := oldLessons[id]; !exists {
			newJSON := safeMarshalJSON(newL.Lesson)
			_ = s.changeRepo.LogChange(ctx, storage.ScheduleChange{
				EntityType: entityType,
				EntityID:   entityID,
				ChangeType: "added",
				LessonID:   id,
				NewData:    newJSON,
			})
			hasChanges = true
			newLessonJSON := safeMarshalJSON(newL.Lesson)
			webhookChanges = append(webhookChanges, webhook.Change{
				Date:    convertDate(newL.Day),
				Pair:    newL.Time,
				Field:   "full",
				Old:     "",
				New:     newLessonJSON,
				Subject: newL.Lesson.Lesson,
			})
		}
	}

	if hasChanges {
		msg := "Schedule changed for " + entityType + ":" + strconv.Itoa(entityID)
		_ = s.incidentRepo.LogIncident(ctx, "schedule_change", msg, "")
		log.Info().Msg(msg)

		// Send push notifications to subscribers
		tokens, err := s.subscriptionRepo.GetTokensByEntity(ctx, entityType, entityID)
		if err == nil && len(tokens) > 0 {
			invalidTokens := s.fcm.SendToTokens(ctx, tokens, "Изменение в расписании! 🔄", "Замечены изменения в расписании, нажми чтобы посмотреть.", map[string]string{
				"type": entityType,
				"id":   strconv.Itoa(entityID),
			})
			if len(invalidTokens) > 0 {
				if err := s.subscriptionRepo.DeleteTokens(ctx, invalidTokens); err != nil {
					log.Warn().Err(err).Msg("Failed to cleanup invalid FCM tokens")
				}
			}
		}

		if s.webhookNotifier != nil {
			s.webhookNotifier.Notify(ctx, entityType, entityID, webhookChanges)
		}
	}
}

func lessonDiffToChanges(oldL, newL lessonWithDay) []webhook.Change {
	var changes []webhook.Change

	if oldL.Lesson.Lesson != newL.Lesson.Lesson {
		changes = append(changes, webhook.Change{
			Date:    convertDate(newL.Day),
			Pair:    newL.Time,
			Field:   "subject",
			Old:     oldL.Lesson.Lesson,
			New:     newL.Lesson.Lesson,
			Subject: newL.Lesson.Lesson,
		})
	}
	if oldL.Teacher != newL.Teacher {
		changes = append(changes, webhook.Change{
			Date:    convertDate(newL.Day),
			Pair:    newL.Time,
			Field:   "teacher",
			Old:     oldL.Teacher,
			New:     newL.Teacher,
			Subject: newL.Lesson.Lesson,
		})
	}
	if oldL.AuditCorps != newL.AuditCorps {
		field := "building"
		oldParts := strings.Split(oldL.AuditCorps, "-")
		newParts := strings.Split(newL.AuditCorps, "-")
		if len(oldParts) == 2 && len(newParts) == 2 {
			oldB := strings.TrimSpace(oldParts[0])
			newB := strings.TrimSpace(newParts[0])
			oldR := strings.TrimSpace(oldParts[1])
			newR := strings.TrimSpace(newParts[1])
			if oldB == newB && oldR != newR {
				field = "room"
			}
		}
		changes = append(changes, webhook.Change{
			Date:    convertDate(newL.Day),
			Pair:    newL.Time,
			Field:   field,
			Old:     oldL.AuditCorps,
			New:     newL.AuditCorps,
			Subject: newL.Lesson.Lesson,
		})
	}
	if oldL.Time != newL.Time {
		changes = append(changes, webhook.Change{
			Date:    convertDate(newL.Day),
			Pair:    newL.Time,
			Field:   "pair",
			Old:     strconv.Itoa(oldL.Time),
			New:     strconv.Itoa(newL.Time),
			Subject: newL.Lesson.Lesson,
		})
	}
	if oldL.Day != newL.Day {
		changes = append(changes, webhook.Change{
			Date:    convertDate(newL.Day),
			Pair:    newL.Time,
			Field:   "date",
			Old:     convertDate(oldL.Day),
			New:     convertDate(newL.Day),
			Subject: newL.Lesson.Lesson,
		})
	}
	if oldL.SubgroupName != newL.SubgroupName {
		changes = append(changes, webhook.Change{
			Date:    convertDate(newL.Day),
			Pair:    newL.Time,
			Field:   "subgroup",
			Old:     oldL.SubgroupName,
			New:     newL.SubgroupName,
			Subject: newL.Lesson.Lesson,
		})
	}

	return changes
}

func convertDate(dayStr string) string {
	t, err := time.Parse("02.01.2006", dayStr)
	if err != nil {
		return dayStr
	}
	return t.Format("2006-01-02")
}

func (s *Syncer) isLessonEqual(l1, l2 models.Lesson) bool {
	return l1.Time == l2.Time &&
		l1.Lesson == l2.Lesson &&
		l1.Teacher == l2.Teacher &&
		l1.AuditCorps == l2.AuditCorps &&
		l1.SubgroupName == l2.SubgroupName
}
