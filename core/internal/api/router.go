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
	s.App.Get("/swagger/*", swagger.HandlerDefault)

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

	// Search — stricter rate limit
	search := v1.Group("/search")
	search.Use(RateLimitMiddleware(s.Cfg.RateLimitSearch, s.Cfg.RateLimitWindow))
	search.Get("/", s.handleSearch)

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
