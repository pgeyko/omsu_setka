package sync

import (
	"context"
	"omsu_mirror/internal/cache"
	"omsu_mirror/internal/config"
	"omsu_mirror/internal/storage"
	"omsu_mirror/internal/upstream"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

type Syncer struct {
	cfg          *config.Config
	client       *upstream.Client
	dictRepo     *storage.DictRepo
	scheduleRepo *storage.ScheduleRepo
	memoryCache   *cache.MemoryCache
	searchIndex  *cache.SearchIndex
	mu           sync.Mutex
}

func NewSyncer(
	cfg *config.Config,
	client *upstream.Client,
	dictRepo *storage.DictRepo,
	scheduleRepo *storage.ScheduleRepo,
	memoryCache *cache.MemoryCache,
	searchIndex *cache.SearchIndex,
) *Syncer {
	return &Syncer{
		cfg:          cfg,
		client:       client,
		dictRepo:     dictRepo,
		scheduleRepo: scheduleRepo,
		memoryCache:   memoryCache,
		searchIndex:  searchIndex,
	}
}

func (s *Syncer) Run(ctx context.Context) {
	if s.cfg.SyncOnStartup {
		log.Info().Msg("Starting startup synchronization...")
		if err := s.SyncDictionaries(ctx); err != nil {
			log.Error().Err(err).Msg("Startup dictionary sync failed")
		}
		if err := s.SyncActiveSchedules(ctx); err != nil {
			log.Error().Err(err).Msg("Startup active schedules sync failed")
		}
	}

	dictTicker := time.NewTicker(s.cfg.SyncDictInterval)
	schedTicker := time.NewTicker(s.cfg.SyncScheduleInterval)
	auditTicker := time.NewTicker(s.cfg.SyncAuditInterval)
	defer dictTicker.Stop()
	defer schedTicker.Stop()
	defer auditTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Info().Msg("Syncer stopping...")
			return
		case <-dictTicker.C:
			log.Info().Msg("Starting periodic dictionary synchronization...")
			if err := s.SyncDictionaries(ctx); err != nil {
				log.Error().Err(err).Msg("Periodic dictionary sync failed")
			}
		case <-schedTicker.C:
			log.Info().Msg("Starting periodic active schedules synchronization...")
			if err := s.SyncActiveSchedules(ctx); err != nil {
				log.Error().Err(err).Msg("Periodic active schedules sync failed")
			}
		case <-auditTicker.C:
			// Auditories can be synced less frequently or as part of dict
			log.Info().Msg("Starting periodic auditory synchronization...")
			if err := s.SyncDictionaries(ctx); err != nil {
				log.Error().Err(err).Msg("Periodic auditory sync failed")
			}
		}
	}
}
