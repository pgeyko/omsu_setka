package api

import (
	_ "omsu_mirror/docs"
	"omsu_mirror/internal/cache"
	"omsu_mirror/internal/config"
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
	App          *fiber.App
	Cfg          *config.Config
	Client       *upstream.Client
	DictRepo     *storage.DictRepo
	ScheduleRepo *storage.ScheduleRepo
	MemoryCache   *cache.MemoryCache
	SearchIndex  *cache.SearchIndex
	Syncer       *sync.Syncer
	IncidentRepo *storage.IncidentRepo
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
) *Server {
	app := fiber.New(fiber.Config{
		Prefork:       cfg.ServerPrefork,
		ReadTimeout:   cfg.ServerReadTimeout,
		WriteTimeout:  cfg.ServerWriteTimeout,
		AppName:       "omsu_mirror v1.0",
		CaseSensitive: true,
		BodyLimit:     1024,         // 1 KB — API doesn't accept large bodies
		ReadBufferSize: 4096,
		ProxyHeader:    "X-Real-IP",  // Correctly detect client IP behind Nginx
		EnableTrustedProxyCheck: true,
		TrustedProxies: []string{"127.0.0.1", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"},
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
		App:          app,
		Cfg:          cfg,
		Client:       client,
		DictRepo:     dictRepo,
		ScheduleRepo: scheduleRepo,
		MemoryCache:   memoryCache,
		SearchIndex:  searchIndex,
		Syncer:       syncer,
		IncidentRepo: incidentRepo,
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

	generalLimiter := RateLimitMiddleware(s.Cfg.RateLimitGeneral, s.Cfg.RateLimitWindow)

	// Dictionaries
	v1.Get("/groups", generalLimiter, s.handleGetGroups)
	v1.Get("/groups/:id", generalLimiter, s.handleGetGroupByID)
	v1.Get("/auditories", generalLimiter, s.handleGetAuditories)
	v1.Get("/auditories/:id", generalLimiter, s.handleGetAuditoryByID)
	v1.Get("/tutors", generalLimiter, s.handleGetTutors)
	v1.Get("/tutors/:id", generalLimiter, s.handleGetTutorByID)

	// Schedules
	v1.Get("/schedule/group/:id", generalLimiter, s.handleGetSchedule("group"))
	v1.Get("/schedule/tutor/:id", generalLimiter, s.handleGetSchedule("tutor"))
	v1.Get("/schedule/auditory/:id", generalLimiter, s.handleGetSchedule("auditory"))

	// Search — stricter rate limit
	search := v1.Group("/search")
	search.Use(RateLimitMiddleware(s.Cfg.RateLimitSearch, s.Cfg.RateLimitWindow))
	search.Get("/", s.handleSearch)

	// Meta
	v1.Get("/health", generalLimiter, s.handleHealth)
	v1.Get("/incidents", generalLimiter, s.handleGetIncidents)
	v1.Get("/sync/status", generalLimiter, s.handleSyncStatus)
	v1.Post("/sync/trigger", generalLimiter, AdminAuth(s.Cfg), s.handleSyncTrigger)
}

func (s *Server) Start() error {
	return s.App.Listen(":" + s.Cfg.ServerPort)
}

func (s *Server) Shutdown() error {
	return s.App.Shutdown()
}
