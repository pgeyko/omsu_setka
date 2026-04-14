package storage

import (
	"database/sql"
	"fmt"
	_ "modernc.org/sqlite"
	"omsu_mirror/internal/config"
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

	// Open database
	db, err := sql.Open("sqlite", cfg.SQLitePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// SQLite with WAL mode can handle multiple readers and one writer.
	// We increase the connection pool to prevent API hangs during background syncs.
	db.SetMaxOpenConns(25)
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

		`CREATE TABLE IF NOT EXISTS schedule_changes (
			id           INTEGER PRIMARY KEY AUTOINCREMENT,
			entity_type  TEXT NOT NULL,
			entity_id    INTEGER NOT NULL,
			change_type  TEXT NOT NULL,
			lesson_id    INTEGER NOT NULL,
			old_data     TEXT,
			new_data     TEXT,
			created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE INDEX IF NOT EXISTS idx_changes_entity ON schedule_changes(entity_type, entity_id);`,

		`CREATE TABLE IF NOT EXISTS user_subscriptions (
			fcm_token    TEXT NOT NULL,
			entity_type  TEXT NOT NULL,
			entity_id    INTEGER NOT NULL,
			created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (fcm_token, entity_type, entity_id)
		);`,
		`CREATE INDEX IF NOT EXISTS idx_sub_entity ON user_subscriptions(entity_type, entity_id);`,
	}

	for _, q := range queries {
		if _, err := s.DB.Exec(q); err != nil {
			return err
		}
	}

	// 2. Add missing columns to user_subscriptions
	existingCols := make(map[string]bool)
	rows, err := s.DB.Query("PRAGMA table_info(user_subscriptions)")
	if err != nil {
		return fmt.Errorf("failed to query table info: %w", err)
	}
	for rows.Next() {
		var cid int
		var name, dtype string
		var notnull, pk int
		var dfltValue interface{}
		if err := rows.Scan(&cid, &name, &dtype, &notnull, &dfltValue, &pk); err != nil {
			rows.Close()
			return fmt.Errorf("failed to scan table info: %w", err)
		}
		existingCols[name] = true
	}
	rows.Close()

	newColumnsList := []struct {
		name string
		def  string
	}{
		{"notify_on_change", "INTEGER DEFAULT 1"},
		{"notify_daily_digest", "INTEGER DEFAULT 0"},
		{"digest_time", "TEXT DEFAULT '19:00'"},
		{"notify_before_lesson", "INTEGER DEFAULT 0"},
		{"before_minutes", "INTEGER DEFAULT 30"},
		{"timezone", "TEXT DEFAULT 'Asia/Omsk'"},
		{"last_digest_at", "TEXT"},
		{"subgroup", "TEXT"},
	}

	for _, col := range newColumnsList {
		if !existingCols[col.name] {
			log.Info().Msgf("Migration: adding column %s to user_subscriptions", col.name)
			query := fmt.Sprintf("ALTER TABLE user_subscriptions ADD COLUMN %s %s", col.name, col.def)
			if _, err := s.DB.Exec(query); err != nil {
				log.Error().Err(err).Msgf("Failed to add column %s", col.name)
			}
		}
	}

	return nil
}

func (s *SQLite) Close() error {
	return s.DB.Close()
}
