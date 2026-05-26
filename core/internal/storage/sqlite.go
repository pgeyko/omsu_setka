package storage

import (
	"context"
	"database/sql"
	"fmt"
	_ "modernc.org/sqlite"
	"omsu_mirror/internal/config"
	"omsu_mirror/internal/storage/migrations"
	"os"
	"path/filepath"
	"time"

	"github.com/rs/zerolog/log"
)

type SQLite struct {
	DB *sql.DB
}

func NewSQLite(cfg *config.Config) (*SQLite, error) {
	// Ensure directory exists
	dir := filepath.Dir(cfg.SQLitePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create storage dir: %w", err)
	}

	// Build DSN with PRAGMA parameters that apply to ALL connections from the pool.
	// Using _pragma= in DSN is the only reliable way with database/sql connection pooling.
	dsn := cfg.SQLitePath
	if cfg.SQLiteWALMode {
		dsn += "?_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)"
	} else {
		dsn += "?_pragma=synchronous(FULL)"
	}
	dsn += fmt.Sprintf("&_pragma=busy_timeout(%d)&_pragma=foreign_keys(ON)", cfg.SQLiteBusyTimeout)

	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// SQLite with WAL mode can handle multiple readers and one writer.
	// We increase the connection pool to prevent API hangs during background syncs.
	db.SetMaxOpenConns(4)
	db.SetMaxIdleConns(4)
	db.SetConnMaxLifetime(30 * time.Minute)

	s := &SQLite{DB: db}
	if err := migrations.Migrate(db); err != nil {
		return nil, fmt.Errorf("failed to migrate schema: %w", err)
	}

	return s, nil
}

func (s *SQLite) RunPeriodicVACUUM(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			log.Info().Msg("Running periodic VACUUM...")
			if _, err := s.DB.Exec("PRAGMA wal_checkpoint(TRUNCATE);"); err != nil {
				log.Warn().Err(err).Msg("VACUUM: wal_checkpoint failed")
			}
			if _, err := s.DB.Exec("VACUUM;"); err != nil {
				log.Warn().Err(err).Msg("VACUUM failed")
			} else {
				log.Info().Msg("VACUUM completed successfully")
			}
		}
	}
}

func (s *SQLite) Close() error {
	return s.DB.Close()
}
