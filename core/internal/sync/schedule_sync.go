package sync

import (
	"context"
	"encoding/json"
	"omsu_mirror/internal/models"
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
			continue
		}

		if err := s.UpdateSchedule(ctx, key, entityType, entityID, schedule); err != nil {
			log.Error().Err(err).Msgf("Failed to update cache for %s", key)
		}
	}

	if err := s.scheduleRepo.PutSyncMeta(ctx, "last_schedule_sync", time.Now().Format(time.RFC3339)); err != nil {
		log.Warn().Err(err).Msg("Failed to update sync metadata")
	}

	return nil
}

func (s *Syncer) UpdateSchedule(ctx context.Context, key string, entityType string, entityID int, schedule []models.Day) error {
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
