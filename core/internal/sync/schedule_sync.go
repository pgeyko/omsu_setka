package sync

import (
	"context"
	"encoding/json"
	"omsu_mirror/internal/models"
	"omsu_mirror/internal/storage"
	"strconv"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
)

func (s *Syncer) SyncActiveSchedules(ctx context.Context) error {
	keys, err := s.scheduleRepo.GetActiveScheduleKeys(ctx, 24*time.Hour)
	if err != nil {
		return err
	}

	log.Info().Msgf("Syncing %d active schedules...", len(keys))

	var hasErrors bool
	var lastErr error

	for _, key := range keys {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		parts := strings.Split(key, ":")
		if len(parts) != 2 {
			continue
		}

		entityType := parts[0]
		entityID, err := strconv.Atoi(parts[1])
		if err != nil {
			log.Warn().Err(err).Msgf("Invalid key format: %s", key)
			continue
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
			continue
		}

		if err != nil {
			log.Error().Err(err).Msgf("Failed to sync schedule for %s", key)
			hasErrors = true
			lastErr = err
			continue
		}

		if err := s.UpdateSchedule(ctx, key, entityType, entityID, schedule); err != nil {
			log.Error().Err(err).Msgf("Failed to update cache for %s", key)
			hasErrors = true
			lastErr = err
		}
	}

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

func (s *Syncer) SyncAuditorySchedules(ctx context.Context) error {
	// For now, it just triggers SyncActiveSchedules or does nothing
	// Later we can implement background sync for all auditories to keep free-rooms data fresh
	return nil
}

func (s *Syncer) UpdateSchedule(ctx context.Context, key string, entityType string, entityID int, schedule []models.Day) error {
	// 1. Get old schedule for diffing
	oldData, _, err := s.scheduleRepo.GetSchedule(ctx, key)
	if err == nil && oldData != nil {
		var oldResp models.BFFResponse
		if err := json.Unmarshal(oldData, &oldResp); err == nil {
			var oldSchedule []models.Day
			// Re-marshal and unmarshal to get proper models.Day slice if needed,
			// or just use map[string]interface{} for generic diff.
			// Let's try to convert back to []models.Day for typed diff.
			dataBytes, _ := json.Marshal(oldResp.Data)
			if err := json.Unmarshal(dataBytes, &oldSchedule); err == nil {
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

func (s *Syncer) compareAndLogChanges(ctx context.Context, entityType string, entityID int, oldSched, newSched []models.Day) {
	type lessonWithDay struct {
		models.Lesson
		Day string
	}

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

	// Check for removed or modified
	for id, oldL := range oldLessons {
		newL, exists := newLessons[id]
		if !exists {
			// Removed
			oldJSON, _ := json.Marshal(oldL.Lesson)
			s.changeRepo.LogChange(ctx, storage.ScheduleChange{
				EntityType: entityType,
				EntityID:   entityID,
				ChangeType: "removed",
				LessonID:   id,
				OldData:    string(oldJSON),
			})
			hasChanges = true
		} else if oldL.Day != newL.Day || !s.isLessonEqual(oldL.Lesson, newL.Lesson) {
			// Modified or Moved to another day
			oldJSON, _ := json.Marshal(oldL.Lesson)
			newJSON, _ := json.Marshal(newL.Lesson)
			s.changeRepo.LogChange(ctx, storage.ScheduleChange{
				EntityType: entityType,
				EntityID:   entityID,
				ChangeType: "modified",
				LessonID:   id,
				OldData:    string(oldJSON),
				NewData:    string(newJSON),
			})
			hasChanges = true
		}
	}

	// Check for added
	for id, newL := range newLessons {
		if _, exists := oldLessons[id]; !exists {
			// Added
			newJSON, _ := json.Marshal(newL.Lesson)
			s.changeRepo.LogChange(ctx, storage.ScheduleChange{
				EntityType: entityType,
				EntityID:   entityID,
				ChangeType: "added",
				LessonID:   id,
				NewData:    string(newJSON),
			})
			hasChanges = true
		}
	}

	if hasChanges {
		msg := "Schedule changed for " + entityType + ":" + strconv.Itoa(entityID)
		s.incidentRepo.LogIncident(ctx, "schedule_change", msg, "")
		log.Info().Msg(msg)

		// Send push notifications to subscribers
		tokens, err := s.subscriptionRepo.GetTokensByEntity(ctx, entityType, entityID)
		if err == nil && len(tokens) > 0 {
			s.fcm.SendToTokens(ctx, tokens, "Изменение в расписании! 🔄", "Замечены изменения в расписании, нажми чтобы посмотреть.", map[string]string{
				"type": entityType,
				"id":   strconv.Itoa(entityID),
			})
		}
	}
}

func (s *Syncer) isLessonEqual(l1, l2 models.Lesson) bool {
	return l1.Time == l2.Time &&
		l1.Lesson == l2.Lesson &&
		l1.Teacher == l2.Teacher &&
		l1.AuditCorps == l2.AuditCorps &&
		l1.SubgroupName == l2.SubgroupName
}

