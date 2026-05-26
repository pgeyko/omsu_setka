package service

import (
	"context"
	"encoding/json"
	"fmt"
	"omsu_mirror/internal/cache"
	"omsu_mirror/internal/config"
	"omsu_mirror/internal/models"
	"omsu_mirror/internal/storage"
	"omsu_mirror/internal/upstream"
	"time"

	"github.com/rs/zerolog/log"
	"golang.org/x/sync/singleflight"
)

type ScheduleResult struct {
	Data     []byte
	CachedAt time.Time
	Source   string
}

type ScheduleService struct {
	cfg          *config.Config
	memoryCache  *cache.MemoryCache
	scheduleRepo *storage.ScheduleRepo
	client       *upstream.Client
	requestGroup singleflight.Group
}

func NewScheduleService(cfg *config.Config, mc *cache.MemoryCache, sr *storage.ScheduleRepo, client *upstream.Client) *ScheduleService {
	return &ScheduleService{
		cfg:          cfg,
		memoryCache:  mc,
		scheduleRepo: sr,
		client:       client,
	}
}

func (s *ScheduleService) GetSchedule(ctx context.Context, entityType string, entityID int) (*ScheduleResult, error) {
	key := fmt.Sprintf("%s:%d", entityType, entityID)

	if data, ok := s.memoryCache.Get(key); ok {
		return &ScheduleResult{Data: data, CachedAt: time.Now(), Source: "HIT-L1"}, nil
	}

	data, meta, err := s.scheduleRepo.GetSchedule(ctx, key)
	if err != nil {
		log.Error().Err(err).Msgf("Failed to query L2 cache for %s", key)
	}
	if data != nil && meta != nil && time.Now().Before(meta.ExpiresAt) {
		s.memoryCache.Set(key, data)
		return &ScheduleResult{Data: data, CachedAt: meta.ExpiresAt.Add(-s.cfg.CacheScheduleTTL), Source: "HIT-L2"}, nil
	}

	result, err, _ := s.requestGroup.Do(key, func() (interface{}, error) {
		return s.fetchFromUpstream(ctx, entityType, entityID, key)
	})
	if err != nil {
		if data != nil {
			return &ScheduleResult{Data: data, Source: "STALE"}, nil
		}
		return nil, err
	}
	return result.(*ScheduleResult), nil
}

func (s *ScheduleService) fetchFromUpstream(ctx context.Context, entityType string, entityID int, key string) (*ScheduleResult, error) {
	log.Info().Msgf("Fetching schedule for %s from upstream...", key)

	var schedule []models.Day
	var err error
	switch entityType {
	case "group":
		schedule, err = s.client.FetchGroupSchedule(ctx, entityID)
	case "tutor":
		schedule, err = s.client.FetchTutorSchedule(ctx, entityID)
	case "auditory":
		schedule, err = s.client.FetchAuditorySchedule(ctx, entityID)
	default:
		return nil, fmt.Errorf("unknown entity type: %s", entityType)
	}
	if err != nil {
		return nil, err
	}

	resp := models.BFFResponse{
		Success:  true,
		Data:     schedule,
		CachedAt: time.Now(),
		Source:   "upstream",
	}

	jsonData, err := json.Marshal(resp)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal schedule: %w", err)
	}

	if err := s.scheduleRepo.PutSchedule(ctx, key, entityType, entityID, jsonData, "", s.cfg.CacheScheduleTTL); err != nil {
		log.Error().Err(err).Msgf("Failed to update L2 cache for %s", key)
	}
	s.memoryCache.Set(key, jsonData)

	return &ScheduleResult{Data: jsonData, CachedAt: resp.CachedAt, Source: "MISS"}, nil
}
