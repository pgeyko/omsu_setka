package storage

import (
	"database/sql"
	"fmt"
	_ "modernc.org/sqlite"
	"omsu_mirror/internal/config"
	"os"
	"path/filepath"
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

	// 19.3 For in-memory DB, we must limit to 1 connection to share the same private memory space
	if cfg.SQLitePath == ":memory:" {
		db.SetMaxOpenConns(1)
	}

	// Configure WAL mode for concurrency
	if cfg.SQLiteWALMode {
		if _, err := db.Exec("PRAGMA journal_mode=WAL;"); err != nil {
			return nil, fmt.Errorf("failed to enable WAL: %w", err)
		}
	}

	// Set busy timeout
	if _, err := db.Exec(fmt.Sprintf("PRAGMA busy_timeout=%d;", cfg.SQLiteBusyTimeout)); err != nil {
		return nil, fmt.Errorf("failed to set busy timeout: %w", err)
	}

	s := &SQLite{DB: db}
	if err := s.migrate(); err != nil {
		return nil, fmt.Errorf("failed to migrate schema: %w", err)
	}

	return s, nil
}

func (s *SQLite) migrate() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS dict_groups (
			id          INTEGER PRIMARY KEY,
			name        TEXT NOT NULL,
			real_group_id INTEGER,
			updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE INDEX IF NOT EXISTS idx_groups_name ON dict_groups(name);`,
		`CREATE INDEX IF NOT EXISTS idx_groups_real_id ON dict_groups(real_group_id);`,

		`CREATE TABLE IF NOT EXISTS dict_auditories (
			id          INTEGER PRIMARY KEY,
			name        TEXT NOT NULL,
			building    TEXT NOT NULL DEFAULT '0',
			updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE INDEX IF NOT EXISTS idx_audit_name ON dict_auditories(name);`,
		`CREATE INDEX IF NOT EXISTS idx_audit_building ON dict_auditories(building);`,

		`CREATE TABLE IF NOT EXISTS dict_tutors (
			id          INTEGER PRIMARY KEY,
			name        TEXT NOT NULL,
			updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE INDEX IF NOT EXISTS idx_tutors_name ON dict_tutors(name);`,

		`CREATE TABLE IF NOT EXISTS schedule_cache (
			cache_key   TEXT PRIMARY KEY,
			entity_type TEXT NOT NULL,
			entity_id   INTEGER NOT NULL,
			data        BLOB NOT NULL,
			etag        TEXT,
			fetched_at  DATETIME NOT NULL,
			expires_at  DATETIME NOT NULL,
			hit_count   INTEGER DEFAULT 0,
			last_hit_at DATETIME
		);`,
		`CREATE INDEX IF NOT EXISTS idx_sched_type ON schedule_cache(entity_type);`,
		`CREATE INDEX IF NOT EXISTS idx_sched_expires ON schedule_cache(expires_at);`,
		`CREATE INDEX IF NOT EXISTS idx_sched_hits ON schedule_cache(hit_count DESC);`,

		`CREATE TABLE IF NOT EXISTS sync_metadata (
			key         TEXT PRIMARY KEY,
			value       TEXT,
			updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
		);`,

		`CREATE TABLE IF NOT EXISTS upstream_incidents (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			event_type  TEXT NOT NULL,
			message     TEXT,
			error_text  TEXT,
			created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE INDEX IF NOT EXISTS idx_incidents_created ON upstream_incidents(created_at DESC);`,
	}

	for _, q := range queries {
		if _, err := s.DB.Exec(q); err != nil {
			return err
		}
	}
	return nil
}

func (s *SQLite) Close() error {
	return s.DB.Close()
}
