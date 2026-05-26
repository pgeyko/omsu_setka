package migrations

import (
	"database/sql"
	"fmt"

	"github.com/rs/zerolog/log"
)

func Migrate(db *sql.DB) error {
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

		`CREATE TABLE IF NOT EXISTS webhook_subscribers (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			url        TEXT NOT NULL,
			secret     TEXT NOT NULL,
			group_ids  TEXT NOT NULL DEFAULT '[]',
			enabled    INTEGER NOT NULL DEFAULT 1,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_subscribers_url ON webhook_subscribers(url);`,
		`CREATE TABLE IF NOT EXISTS webhook_failed_deliveries (
			id             INTEGER PRIMARY KEY AUTOINCREMENT,
			subscriber_id  INTEGER NOT NULL,
			url            TEXT NOT NULL,
			payload        BLOB NOT NULL,
			event_id       TEXT NOT NULL,
			timestamp      TEXT NOT NULL,
			error          TEXT NOT NULL,
			attempt_count  INTEGER DEFAULT 3,
			created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (subscriber_id) REFERENCES webhook_subscribers(id)
		);`,
		`CREATE INDEX IF NOT EXISTS idx_failed_deliveries_created ON webhook_failed_deliveries(created_at);`,
		`CREATE TABLE IF NOT EXISTS schema_version (
				id          INTEGER PRIMARY KEY CHECK (id = 1),
				version     INTEGER NOT NULL,
				updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
			);`,
	}

	for _, q := range queries {
		if _, err := db.Exec(q); err != nil {
			return err
		}
	}

	existingCols := make(map[string]bool)
	rows, err := db.Query("PRAGMA table_info(user_subscriptions)")
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
		{"last_reminder_at", "TEXT"},
		{"subgroup", "TEXT"},
	}

	for _, col := range newColumnsList {
		if !existingCols[col.name] {
			log.Info().Msgf("Migration: adding column %s to user_subscriptions", col.name)
			query := fmt.Sprintf("ALTER TABLE user_subscriptions ADD COLUMN %s %s", col.name, col.def)
			if _, err := db.Exec(query); err != nil {
				log.Error().Err(err).Msgf("Failed to add column %s", col.name)
			}
		}
	}

	return setSchemaVersion(db, 1)
}

func setSchemaVersion(db *sql.DB, version int) error {
	_, err := db.Exec(`
		INSERT INTO schema_version (id, version, updated_at)
		VALUES (1, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(id) DO UPDATE SET
			version = excluded.version,
			updated_at = CURRENT_TIMESTAMP
	`, version)
	return err
}
