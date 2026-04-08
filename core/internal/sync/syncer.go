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

type UpstreamStatus struct {
	IsHealthy           bool      `json:"healthy"`
	LastSuccessSync     time.Time `json:"last_success,omitempty"`
	LastFailTime        time.Time `json:"last_fail,omitempty"`
	LastError           string    `json:"last_error,omitempty"`
	ConsecutiveFailures int       `json:"consecutive_failures"`
	TotalFailures       int       `json:"total_failures"`
	sync.RWMutex
}

type Syncer struct {
	cfg          *config.Config
	client       *upstream.Client
	dictRepo     *storage.DictRepo
	scheduleRepo *storage.ScheduleRepo
	incidentRepo *storage.IncidentRepo
	memoryCache  *cache.MemoryCache
	searchIndex  *cache.SearchIndex
	mu           sync.Mutex
	status       *UpstreamStatus
}

func NewSyncer(
	cfg *config.Config,
	client *upstream.Client,
	dictRepo *storage.DictRepo,
	scheduleRepo *storage.ScheduleRepo,
	memoryCache *cache.MemoryCache,
	searchIndex *cache.SearchIndex,
	incidentRepo *storage.IncidentRepo,
) *Syncer {
	return &Syncer{
		cfg:          cfg,
		client:       client,
		dictRepo:     dictRepo,
		scheduleRepo: scheduleRepo,
		incidentRepo: incidentRepo,
		memoryCache:  memoryCache,
		searchIndex:  searchIndex,
		status: &UpstreamStatus{
			IsHealthy: true, // Optimistically assume healthy until proven otherwise
		},
	}
}

func (s *Syncer) GetUpstreamStatus() UpstreamStatus {
	s.status.RLock()
	defer s.status.RUnlock()
	return UpstreamStatus{
		IsHealthy:           s.status.IsHealthy,
		LastSuccessSync:     s.status.LastSuccessSync,
		LastFailTime:        s.status.LastFailTime,
		LastError:           s.status.LastError,
		ConsecutiveFailures: s.status.ConsecutiveFailures,
		TotalFailures:       s.status.TotalFailures,
	}
}

func (s *Syncer) recordSuccess(ctx context.Context, contextMsg string) {
	s.status.Lock()
	defer s.status.Unlock()

	if !s.status.IsHealthy {
		log.Info().Msg("Upstream has recovered")
		s.incidentRepo.LogIncident(ctx, "up", "Upstream is back online context: "+contextMsg, "")
	}

	s.status.IsHealthy = true
	s.status.LastSuccessSync = time.Now()
	s.status.ConsecutiveFailures = 0
	s.status.LastError = ""
}

func (s *Syncer) recordFailure(ctx context.Context, contextMsg string, err error) {
	s.status.Lock()
	defer s.status.Unlock()

	wasHealthy := s.status.IsHealthy
	s.status.IsHealthy = false
	s.status.LastFailTime = time.Now()
	s.status.LastError = err.Error()
	s.status.ConsecutiveFailures++
	s.status.TotalFailures++

	if wasHealthy {
		log.Warn().Err(err).Msgf("Upstream has gone down %s", contextMsg)
		s.incidentRepo.LogIncident(ctx, "down", "Upstream is unavailable during: "+contextMsg, err.Error())
	} else if s.status.ConsecutiveFailures%10 == 0 {
		log.Info().Msgf("Upstream still down (%d consecutive failures) %s", s.status.ConsecutiveFailures, contextMsg)
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

	log.Info().Msg("Warming up L1 cache from L2 storage...")
	if keys, err := s.scheduleRepo.GetActiveScheduleKeys(ctx, 2*time.Hour); err == nil {
		for _, key := range keys {
			if data, _, err := s.scheduleRepo.GetSchedule(ctx, key); err == nil && data != nil {
				s.memoryCache.Set(key, data)
			}
		}
		log.Info().Msgf("Pre-loaded %d schedule items into memory cache", len(keys))
	} else {
		log.Error().Err(err).Msg("Failed to warm up cache")
	}

	dictTicker := time.NewTicker(s.cfg.SyncDictInterval)
	schedTicker := time.NewTicker(s.cfg.SyncScheduleInterval)
	auditTicker := time.NewTicker(s.cfg.SyncAuditInterval)
	cleanTicker := time.NewTicker(1 * time.Hour) // Cleanup old cache and incidents periodically

	defer dictTicker.Stop()
	defer schedTicker.Stop()
	defer auditTicker.Stop()
	defer cleanTicker.Stop()

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
			log.Info().Msg("Starting periodic auditory synchronization...")
			if err := s.SyncDictionaries(ctx); err != nil {
				log.Error().Err(err).Msg("Periodic auditory sync failed")
			}
		case <-cleanTicker.C:
			log.Info().Msg("Running periodic cleanup tasks...")
			if n, err := s.scheduleRepo.CleanExpired(ctx); err != nil {
				log.Error().Err(err).Msg("Failed to clean expired schedules")
			} else if n > 0 {
				log.Info().Msgf("Cleaned %d expired schedule entries", n)
			}
			
			if n, err := s.incidentRepo.CleanOld(ctx, 500); err != nil {
				log.Error().Err(err).Msg("Failed to clean old incidents")
			} else if n > 0 {
				log.Info().Msgf("Cleaned %d old incident entries", n)
			}
		}
	}
}
