package api

import (
	_ "omsu_mirror/docs"
	"omsu_mirror/internal/cache"
	"omsu_mirror/internal/config"
	"omsu_mirror/internal/notifications"
	"omsu_mirror/internal/storage"
	"omsu_mirror/internal/sync"
	"omsu_mirror/internal/upstream"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/etag"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/swagger"
)

type Server struct {
	App              *fiber.App
	Cfg              *config.Config
	Client           *upstream.Client
	DictRepo         *storage.DictRepo
	ScheduleRepo     *storage.ScheduleRepo
	ChangeRepo       *storage.ChangeRepo
	SubscriptionRepo *storage.SubscriptionRepo
	FCM              *notifications.FCMClient
	MemoryCache      *cache.MemoryCache
	SearchIndex      *cache.SearchIndex
	Syncer           *sync.Syncer
	IncidentRepo     *storage.IncidentRepo
}

func NewServer(
	cfg *config.Config,
	client *upstream.Client,
	dictRepo *storage.DictRepo,
	scheduleRepo *storage.ScheduleRepo,
	memoryCache *cache.MemoryCache,
	searchIndex *cache.SearchIndex,
	syncer *sync.Syncer,
	incidentRepo *storage.IncidentRepo,
	changeRepo *storage.ChangeRepo,
	subscriptionRepo *storage.SubscriptionRepo,
	fcm *notifications.FCMClient,
) *Server {
	app := fiber.New(fiber.Config{
		Prefork:       cfg.ServerPrefork,
		ReadTimeout:   cfg.ServerReadTimeout,
		WriteTimeout:  cfg.ServerWriteTimeout,
		AppName:       "omsu_mirror v1.0",
		CaseSensitive: true,
		BodyLimit:     1024,         // 1 KB — API doesn't accept large bodies
		ReadBufferSize: 4096,
		ProxyHeader:    fiber.HeaderXForwardedFor, // Correctly detect client IP behind Nginx
		// 19.3 Enable trusted proxies (Docker bridge subnet by default)
		TrustedProxies: []string{"172.16.0.0/12", "192.168.0.0/16", "10.0.0.0/8"},
	})

	// Global Middleware
	app.Use(recover.New())
	app.Use(SecurityHeadersMiddleware())
	app.Use(cors.New(cors.Config{
		AllowOrigins: cfg.CORSAllowedOrigins,
	}))
	app.Use(etag.New())
	app.Use(LoggerMiddleware())

	s := &Server{
		App:              app,
		Cfg:              cfg,
		Client:           client,
		DictRepo:         dictRepo,
		ScheduleRepo:     scheduleRepo,
		ChangeRepo:       changeRepo,
		SubscriptionRepo: subscriptionRepo,
		FCM:              fcm,
		MemoryCache:      memoryCache,
		SearchIndex:      searchIndex,
		Syncer:           syncer,
		IncidentRepo:     incidentRepo,
	}

	s.setupRoutes()

	return s
}

func (s *Server) setupRoutes() {
	// Hide Swagger in production
	if s.Cfg.AppEnv != "production" {
		s.App.Get("/swagger/*", AdminAuth(s.Cfg), swagger.HandlerDefault)
	}

	v1 := s.App.Group("/api/v1")

	// General rate limit for all API endpoints
	v1.Use(RateLimitMiddleware(s.Cfg.RateLimitGeneral, s.Cfg.RateLimitWindow))

	// Dictionaries
	v1.Get("/groups", s.handleGetGroups)
	v1.Get("/groups/:id", s.handleGetGroupByID)
	v1.Get("/auditories", s.handleGetAuditories)
	v1.Get("/auditories/:id", s.handleGetAuditoryByID)
	v1.Get("/tutors", s.handleGetTutors)
	v1.Get("/tutors/:id", s.handleGetTutorByID)

	// Schedules
	v1.Get("/schedule/group/:id", s.handleGetSchedule("group"))
	v1.Get("/schedule/tutor/:id", s.handleGetSchedule("tutor"))
	v1.Get("/schedule/auditory/:id", s.handleGetSchedule("auditory"))

	// iCal Export
	v1.Get("/schedule/group/:id/ical", s.handleGetICal)
	v1.Get("/schedule/tutor/:id/ical", s.handleGetICal)
	v1.Get("/schedule/auditory/:id/ical", s.handleGetICal)

	// Changes
	v1.Get("/changes/:type/:id", s.handleGetChanges)

	// Notifications
	v1.Post("/subscribe", s.handleSubscribe)
	v1.Post("/unsubscribe", s.handleUnsubscribe)
	v1.Patch("/notifications/settings", s.handleUpdateNotificationSettings)
	v1.Get("/notifications/settings/:type/:id", s.handleGetNotificationSettings)

	// Search — use stricter rate limit directly
	v1.Get("/search", RateLimitMiddleware(s.Cfg.RateLimitSearch, s.Cfg.RateLimitWindow), s.handleSearch)

	// Meta
	v1.Get("/health", s.handleHealth)
	v1.Get("/incidents", s.handleGetIncidents)
	v1.Get("/sync/status", s.handleSyncStatus)
	v1.Post("/sync/trigger", AdminAuth(s.Cfg), s.handleSyncTrigger)
}

func (s *Server) Start() error {
	return s.App.Listen(":" + s.Cfg.ServerPort)
}

func (s *Server) Shutdown() error {
	return s.App.Shutdown()
}
