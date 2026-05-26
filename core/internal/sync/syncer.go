package sync

import (
	"context"
	"omsu_mirror/internal/cache"
	"omsu_mirror/internal/config"
	"omsu_mirror/internal/notifications"
	"omsu_mirror/internal/storage"
	"omsu_mirror/internal/upstream"
	"omsu_mirror/internal/webhook"
	"sync"
	"sync/atomic"
	"time"

	"github.com/rs/zerolog/log"
)

type UpstreamStatus struct {
	IsHealthy           bool      `json:"healthy"`
	LastSuccessSync     time.Time `json:"last_success,omitempty"`
	LastFailTime        time.Time `json:"last_fail,omitempty"`
	lastErrAtomic       atomic.Value
	LastError           string    `json:"last_error,omitempty"`
	ConsecutiveFailures int       `json:"consecutive_failures"`
	TotalFailures       int       `json:"total_failures"`
	mu                  sync.RWMutex
}

func (u *UpstreamStatus) getLastError() string {
	if v := u.lastErrAtomic.Load(); v != nil {
		return v.(string)
	}
	return ""
}

func (u *UpstreamStatus) setLastError(err string) {
	u.lastErrAtomic.Store(err)
}

type Deps struct {
	Client           *upstream.Client
	DictRepo         *storage.DictRepo
	ScheduleRepo     *storage.ScheduleRepo
	MemoryCache      *cache.MemoryCache
	SearchIndex      *cache.SearchIndex
	IncidentRepo     *storage.IncidentRepo
	ChangeRepo       *storage.ChangeRepo
	SubscriptionRepo *storage.SubscriptionRepo
	WebhookRepo      *storage.WebhookRepo
	WebhookNotifier  *webhook.Notifier
	FCM              *notifications.FCMClient
}

type Syncer struct {
	cfg              *config.Config
	client           *upstream.Client
	dictRepo         *storage.DictRepo
	scheduleRepo     *storage.ScheduleRepo
	incidentRepo     *storage.IncidentRepo
	changeRepo       *storage.ChangeRepo
	subscriptionRepo *storage.SubscriptionRepo
	webhookRepo      *storage.WebhookRepo
	webhookNotifier  *webhook.Notifier
	fcm              *notifications.FCMClient
	memoryCache      *cache.MemoryCache
	searchIndex      *cache.SearchIndex
	mu               sync.Mutex
	status           *UpstreamStatus
	dictSema         chan struct{}
	schedSema        chan struct{}
	wg               sync.WaitGroup
}

func (s *Syncer) Wait() {
	s.wg.Wait()
}

func NewSyncer(cfg *config.Config, deps *Deps) *Syncer {
	s := &Syncer{
		cfg:              cfg,
		client:           deps.Client,
		dictRepo:         deps.DictRepo,
		scheduleRepo:     deps.ScheduleRepo,
		incidentRepo:     deps.IncidentRepo,
		changeRepo:       deps.ChangeRepo,
		subscriptionRepo: deps.SubscriptionRepo,
		webhookRepo:      deps.WebhookRepo,
		webhookNotifier:  deps.WebhookNotifier,
		fcm:              deps.FCM,
		memoryCache:      deps.MemoryCache,
		searchIndex:      deps.SearchIndex,
		status: &UpstreamStatus{
			IsHealthy: true,
		},
		dictSema:  make(chan struct{}, 1),
		schedSema: make(chan struct{}, 1),
	}
	s.status.lastErrAtomic.Store("")
	return s
}

func (s *Syncer) GetUpstreamStatus() UpstreamStatus {
	s.status.mu.RLock()
	defer s.status.mu.RUnlock()
	return UpstreamStatus{
		IsHealthy:           s.status.IsHealthy,
		LastSuccessSync:     s.status.LastSuccessSync,
		LastFailTime:        s.status.LastFailTime,
		LastError:           s.status.getLastError(),
		ConsecutiveFailures: s.status.ConsecutiveFailures,
		TotalFailures:       s.status.TotalFailures,
	}
}

func (s *Syncer) recordSuccess(ctx context.Context, contextMsg string) {
	s.status.mu.Lock()
	defer s.status.mu.Unlock()

	if !s.status.IsHealthy {
		log.Info().Msg("Upstream has recovered")
		_ = s.incidentRepo.LogIncident(ctx, "up", "Upstream is back online context: "+contextMsg, "")
	}

	s.status.IsHealthy = true
	s.status.LastSuccessSync = time.Now()
	s.status.ConsecutiveFailures = 0
	s.status.setLastError("")
}

func (s *Syncer) recordFailure(ctx context.Context, contextMsg string, err error) {
	s.status.mu.Lock()
	defer s.status.mu.Unlock()

	wasHealthy := s.status.IsHealthy
	s.status.IsHealthy = false
	s.status.LastFailTime = time.Now()
	s.status.setLastError(err.Error())
	s.status.ConsecutiveFailures++
	s.status.TotalFailures++

	if wasHealthy {
		log.Warn().Err(err).Msgf("Upstream has gone down %s", contextMsg)
		_ = s.incidentRepo.LogIncident(ctx, "down", "Upstream is unavailable during: "+contextMsg, err.Error())
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
	notifyTicker := time.NewTicker(1 * time.Minute)
	cleanTicker := time.NewTicker(1 * time.Hour) // Cleanup old cache and incidents periodically

	defer dictTicker.Stop()
	defer schedTicker.Stop()
	defer notifyTicker.Stop()
	defer cleanTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Info().Msg("Syncer stopping...")
			return
		case <-dictTicker.C:
			s.wg.Add(1)
			go func() {
				defer s.wg.Done()
				select {
				case <-ctx.Done():
					return
				case s.dictSema <- struct{}{}:
					defer func() { <-s.dictSema }()
				default:
					log.Warn().Msg("Dictionary sync skipped: already in progress")
					return
				}
				log.Info().Msg("Starting periodic dictionary synchronization...")
				if err := s.SyncDictionaries(ctx); err != nil {
					log.Error().Err(err).Msg("Periodic dictionary sync failed")
				}
			}()
		case <-schedTicker.C:
			s.wg.Add(1)
			go func() {
				defer s.wg.Done()
				select {
				case <-ctx.Done():
					return
				case s.schedSema <- struct{}{}:
					defer func() { <-s.schedSema }()
				default:
					log.Warn().Msg("Active schedules sync skipped: already in progress")
					return
				}
				log.Info().Msg("Starting periodic active schedules synchronization...")
				if err := s.SyncActiveSchedules(ctx); err != nil {
					log.Error().Err(err).Msg("Periodic active schedules sync failed")
				}
			}()
		case <-notifyTicker.C:
			s.wg.Add(1)
			go func() {
				defer s.wg.Done()
				select {
				case <-ctx.Done():
					return
				default:
				}
				if err := s.SyncScheduledNotifications(ctx); err != nil {
					log.Error().Err(err).Msg("Scheduled notification processing failed")
				}
			}()
		case <-cleanTicker.C:
			s.wg.Add(1)
			go func() {
				defer s.wg.Done()
				select {
				case <-ctx.Done():
					return
				default:
				}
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

				if s.webhookNotifier != nil {
					log.Info().Msg("Replaying failed webhook deliveries...")
					s.webhookNotifier.ReplayFailed(ctx, 50)
				}
			}()
		}
	}
}
