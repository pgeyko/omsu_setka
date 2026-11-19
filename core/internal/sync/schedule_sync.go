package sync

import (
	"context"
	"encoding/json"
	"omsu_mirror/internal/diff"
	"omsu_mirror/internal/models"
	"omsu_mirror/internal/storage"
	"omsu_mirror/internal/webhook"
	"sort"
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
	activeKeys, err := s.scheduleRepo.GetActiveScheduleKeys(ctx, 24*time.Hour)
	if err != nil {
		return err
	}

	// A schedule can be cold (nobody opened it recently) but still have
	// subscribers or webhook consumers. Keep those in the sync set too.
	keySet := make(map[string]struct{}, len(activeKeys))
	for _, key := range activeKeys {
		keySet[key] = struct{}{}
	}
	if s.subscriptionRepo != nil {
		if subKeys, err := s.subscriptionRepo.GetScheduleKeys(ctx); err == nil {
			for _, key := range subKeys {
				keySet[key] = struct{}{}
			}
		} else {
			log.Warn().Err(err).Msg("Failed to load subscribed schedule keys")
		}
	}
	if s.webhookRepo != nil {
		if subscribers, err := s.webhookRepo.GetEnabled(ctx); err == nil {
			for _, sub := range subscribers {
				for _, groupID := range sub.GroupIDs {
					if groupID > 0 {
						keySet["group:"+strconv.Itoa(groupID)] = struct{}{}
					}
				}
			}
		} else {
			log.Warn().Err(err).Msg("Failed to load webhook schedule keys")
		}
	}

	keys := make([]string, 0, len(keySet))
	for key := range keySet {
		keys = append(keys, key)
	}
	sort.Strings(keys)

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
	globalChange := false
	affectedSubgroups := make(map[string]struct{})
	var webhookChanges []webhook.Change

	addAffected := func(subgroup string) {
		if subgroup == "" {
			globalChange = true
			return
		}
		affectedSubgroups[subgroup] = struct{}{}
	}

	// Check for removed or modified
	for id, oldL := range oldLessons {
		newL, exists := newLessons[id]
		if !exists {
			oldJSON := safeMarshalJSON(oldL.Lesson)
			subgroup := diff.NormalizeSubgroup(oldL.SubgroupName)
			if err := s.changeRepo.LogChange(ctx, storage.ScheduleChange{
				EntityType: entityType,
				EntityID:   entityID,
				ChangeType: "removed",
				LessonID:   id,
				Day:        convertDate(oldL.Day),
				Pair:       oldL.Time,
				Subgroup:   subgroup,
				Subject:    oldL.Lesson.Lesson,
				OldData:    oldJSON,
			}); err != nil {
				log.Error().Err(err).Msg("Failed to log removed schedule change")
			}
			addAffected(subgroup)
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
			oldSubgroup := diff.NormalizeSubgroup(oldL.SubgroupName)
			newSubgroup := diff.NormalizeSubgroup(newL.SubgroupName)
			subgroup := newSubgroup
			if subgroup == "" {
				subgroup = oldSubgroup
			}
			changes := diff.Lessons(oldL.Lesson, newL.Lesson, convertDate(oldL.Day), convertDate(newL.Day))
			if err := s.changeRepo.LogChange(ctx, storage.ScheduleChange{
				EntityType: entityType,
				EntityID:   entityID,
				ChangeType: "modified",
				LessonID:   id,
				Day:        convertDate(newL.Day),
				Pair:       newL.Time,
				Subgroup:   subgroup,
				Subject:    newL.Lesson.Lesson,
				Diff:       changes,
				OldData:    oldJSON,
				NewData:    newJSON,
			}); err != nil {
				log.Error().Err(err).Msg("Failed to log modified schedule change")
			}
			addAffected(oldSubgroup)
			addAffected(newSubgroup)
			hasChanges = true
			webhookChanges = append(webhookChanges, lessonDiffToChanges(oldL, newL)...)
		}
	}

	// Check for added
	for id, newL := range newLessons {
		if _, exists := oldLessons[id]; !exists {
			newJSON := safeMarshalJSON(newL.Lesson)
			subgroup := diff.NormalizeSubgroup(newL.SubgroupName)
			if err := s.changeRepo.LogChange(ctx, storage.ScheduleChange{
				EntityType: entityType,
				EntityID:   entityID,
				ChangeType: "added",
				LessonID:   id,
				Day:        convertDate(newL.Day),
				Pair:       newL.Time,
				Subgroup:   subgroup,
				Subject:    newL.Lesson.Lesson,
				NewData:    newJSON,
			}); err != nil {
				log.Error().Err(err).Msg("Failed to log added schedule change")
			}
			addAffected(subgroup)
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

		subgroups := make([]string, 0, len(affectedSubgroups))
		for subgroup := range affectedSubgroups {
			subgroups = append(subgroups, subgroup)
		}
		sort.Strings(subgroups)

		// Send push notifications only to subscribers that enabled changes and
		// match the affected subgroup. A global change (empty subgroup) goes to
		// all subscribers of the entity.
		tokens, err := s.subscriptionRepo.GetTokensForChange(ctx, entityType, entityID, subgroups, globalChange)
		if err == nil && len(tokens) > 0 {
			data := map[string]string{
				"type": entityType,
				"id":   strconv.Itoa(entityID),
				"kind": "change",
			}
			if len(webhookChanges) > 0 {
				data["day"] = webhookChanges[0].Date
				data["pair"] = strconv.Itoa(webhookChanges[0].Pair)
			}
			invalidTokens := s.fcm.SendToTokens(ctx, tokens, "Изменение в расписании! 🔄", "Замечены изменения в расписании, нажми чтобы посмотреть.", data)
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
	changes := make([]webhook.Change, 0)
	for _, change := range diff.Lessons(oldL.Lesson, newL.Lesson, convertDate(oldL.Day), convertDate(newL.Day)) {
		field := change.Field
		switch change.Field {
		case "lesson":
			field = "subject"
		case "day":
			field = "date"
		case "type_work":
			field = "type"
		case "time":
			field = "pair"
		case "subgroupName":
			field = "subgroup"
		case "auditCorps":
			field = auditChangeField(change.Old, change.New)
		}
		changes = append(changes, webhook.Change{
			Date:    convertDate(newL.Day),
			Pair:    newL.Time,
			Field:   field,
			Old:     change.Old,
			New:     change.New,
			Subject: newL.Lesson.Lesson,
		})
	}
	return changes
}

func auditChangeField(oldValue, newValue string) string {
	oldParts := strings.Split(oldValue, "-")
	newParts := strings.Split(newValue, "-")
	if len(oldParts) == 2 && len(newParts) == 2 {
		oldBuilding := strings.TrimSpace(oldParts[0])
		newBuilding := strings.TrimSpace(newParts[0])
		oldRoom := strings.TrimSpace(oldParts[1])
		newRoom := strings.TrimSpace(newParts[1])
		if oldBuilding == newBuilding && oldRoom != newRoom {
			return "room"
		}
	}
	return "building"
}

func convertDate(dayStr string) string {
	t, err := time.Parse("02.01.2006", dayStr)
	if err != nil {
		return dayStr
	}
	return t.Format("2006-01-02")
}

func (s *Syncer) isLessonEqual(l1, l2 models.Lesson) bool {
	return diff.Equal(l1, l2)
}

// SyncEntity fetches one schedule immediately. It is used after a subscription
// or webhook registration so a cold schedule starts being tracked.
func (s *Syncer) SyncEntity(ctx context.Context, entityType string, entityID int) error {
	if entityType != "group" && entityType != "tutor" && entityType != "auditory" {
		return nil
	}
	key := entityType + ":" + strconv.Itoa(entityID)
	var schedule []models.Day
	var err error
	switch entityType {
	case "group":
		schedule, err = s.client.FetchGroupSchedule(ctx, entityID)
	case "tutor":
		schedule, err = s.client.FetchTutorSchedule(ctx, entityID)
	case "auditory":
		schedule, err = s.client.FetchAuditorySchedule(ctx, entityID)
	}
	if err != nil {
		return err
	}
	return s.UpdateSchedule(ctx, key, entityType, entityID, schedule)
}
