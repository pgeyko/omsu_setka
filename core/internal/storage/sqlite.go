package storage

import (
	"database/sql"
	"fmt"
	_ "modernc.org/sqlite"
	"omsu_mirror/internal/config"
	"omsu_mirror/internal/storage/migrations"
	"os"
	"path/filepath"
	"time"
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

	// Open database
	db, err := sql.Open("sqlite", cfg.SQLitePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// SQLite with WAL mode can handle multiple readers and one writer.
	// We increase the connection pool to prevent API hangs during background syncs.
	db.SetMaxOpenConns(4)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)

	// Configure WAL mode for concurrency
	if cfg.SQLiteWALMode {
		if _, err := db.Exec("PRAGMA journal_mode=WAL;"); err != nil {
			return nil, fmt.Errorf("failed to enable WAL: %w", err)
		}
		// NORMAL is recommended for WAL mode to improve performance while being safe
		if _, err := db.Exec("PRAGMA synchronous=NORMAL;"); err != nil {
			return nil, fmt.Errorf("failed to set synchronous mode: %w", err)
		}
	}

	// Set busy timeout
	if _, err := db.Exec(fmt.Sprintf("PRAGMA busy_timeout=%d;", cfg.SQLiteBusyTimeout)); err != nil {
		return nil, fmt.Errorf("failed to set busy timeout: %w", err)
	}

	s := &SQLite{DB: db}
	if err := migrations.Migrate(db); err != nil {
		return nil, fmt.Errorf("failed to migrate schema: %w", err)
	}

	return s, nil
}

func (s *SQLite) Close() error {
	return s.DB.Close()
}
