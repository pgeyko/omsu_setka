package main

import (
	"context"
	"omsu_mirror/internal/api"
	"omsu_mirror/internal/cache"
	"omsu_mirror/internal/config"
	"omsu_mirror/internal/storage"
	"omsu_mirror/internal/sync"
	"omsu_mirror/internal/upstream"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

// @title Omsu Schedule Mirror API
// @version 1.0
// @description High-performance BFF for Omsu university schedule.
// @host localhost:8080
// @BasePath /api/v1
func main() {
	// 1. Load config
	cfg := config.Load()

	// 2. Setup logging
	setupLogger(cfg)
	log.Info().Msg("Starting omsu_mirror BFF...")

	// 3. Initialize Storage
	db, err := storage.NewSQLite(cfg)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to initialize SQLite")
	}
	defer db.Close()

	dictRepo := storage.NewDictRepo(db)
	scheduleRepo := storage.NewScheduleRepo(db)
	incidentRepo := storage.NewIncidentRepo(db)

	// 4. Initialize Upstream Client
	client := upstream.NewClient(cfg)

	// 5. Initialize Cache & Index
	memoryCache := cache.NewMemoryCache()
	searchIndex := cache.NewSearchIndex()

	// 6. Initialize Syncer
	syncer := sync.NewSyncer(cfg, client, dictRepo, scheduleRepo, memoryCache, searchIndex, incidentRepo)

	// 7. Initialize API Server
	server := api.NewServer(cfg, client, dictRepo, scheduleRepo, memoryCache, searchIndex, syncer, incidentRepo)

	// Context for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 8. Start Background Sync
	go syncer.Run(ctx)

	// 9. Start API Server
	go func() {
		if err := server.Start(); err != nil {
			log.Fatal().Err(err).Msg("Server failed to start")
		}
	}()

	// 10. Handle Graceful Shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	<-quit
	log.Info().Msg("Shutting down gracefully...")

	cancel() // Stop syncer

	// Wait for syncer to clean up if needed
	time.Sleep(500 * time.Millisecond)

	if err := server.Shutdown(); err != nil {
		log.Error().Err(err).Msg("Server forced to shutdown")
	}

	log.Info().Msg("omsu_mirror stopped")
}

func setupLogger(cfg *config.Config) {
	level, err := zerolog.ParseLevel(cfg.LogLevel)
	if err != nil {
		level = zerolog.InfoLevel
	}
	zerolog.SetGlobalLevel(level)

	if cfg.LogFormat == "console" {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339})
	}
}
