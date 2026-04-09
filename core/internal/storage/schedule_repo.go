package storage

import (
	"context"
	"database/sql"
	"time"
)

type ScheduleRepo struct {
	db *SQLite
}

func NewScheduleRepo(db *SQLite) *ScheduleRepo {
	return &ScheduleRepo{db: db}
}

type CacheMeta struct {
	ETag      string
	FetchedAt time.Time
	ExpiresAt time.Time
	HitCount  int
}

func (r *ScheduleRepo) PutSchedule(ctx context.Context, key string, entityType string, entityID int, data []byte, etag string, ttl time.Duration) error {
	fetchedAt := time.Now()
	expiresAt := fetchedAt.Add(ttl)

	_, err := r.db.DB.ExecContext(ctx, `
		INSERT INTO schedule_cache (cache_key, entity_type, entity_id, data, etag, fetched_at, expires_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(cache_key) DO UPDATE SET
			data = excluded.data,
			etag = excluded.etag,
			fetched_at = excluded.fetched_at,
			expires_at = excluded.expires_at
	`, key, entityType, entityID, data, etag, fetchedAt, expiresAt)
	return err
}

func (r *ScheduleRepo) GetSchedule(ctx context.Context, key string) ([]byte, *CacheMeta, error) {
	var data []byte
	var meta CacheMeta

	err := r.db.DB.QueryRowContext(ctx, `
		SELECT data, etag, fetched_at, expires_at, hit_count 
		FROM schedule_cache 
		WHERE cache_key = ?
	`, key).Scan(&data, &meta.ETag, &meta.FetchedAt, &meta.ExpiresAt, &meta.HitCount)

	if err == sql.ErrNoRows {
		return nil, nil, nil
	}
	if err != nil {
		return nil, nil, err
	}

	return data, &meta, nil
}

func (r *ScheduleRepo) GetSchedulesByType(ctx context.Context, entityType string) (map[int][]byte, error) {
	rows, err := r.db.DB.QueryContext(ctx, "SELECT entity_id, data FROM schedule_cache WHERE entity_type = ?", entityType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	res := make(map[int][]byte)
	for rows.Next() {
		var id int
		var data []byte
		if err := rows.Scan(&id, &data); err != nil {
			return nil, err
		}
		res[id] = data
	}
	return res, nil
}

func (r *ScheduleRepo) GetActiveScheduleKeys(ctx context.Context, threshold time.Duration) ([]string, error) {
	since := time.Now().Add(-threshold)
	rows, err := r.db.DB.QueryContext(ctx, "SELECT cache_key FROM schedule_cache WHERE last_hit_at > ?", since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keys []string
	for rows.Next() {
		var k string
		if err := rows.Scan(&k); err != nil {
			return nil, err
		}
		keys = append(keys, k)
	}
	return keys, nil
}

func (r *ScheduleRepo) CleanExpired(ctx context.Context) (int64, error) {
	res, err := r.db.DB.ExecContext(ctx, "DELETE FROM schedule_cache WHERE expires_at < ?", time.Now())
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (r *ScheduleRepo) PutSyncMeta(ctx context.Context, key string, value string) error {
	_, err := r.db.DB.ExecContext(ctx, `
		INSERT INTO sync_metadata (key, value, updated_at)
		VALUES (?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(key) DO UPDATE SET
			value = excluded.value,
			updated_at = excluded.updated_at
	`, key, value)
	return err
}

func (r *ScheduleRepo) GetSyncMeta(ctx context.Context, key string) (string, error) {
	var val string
	err := r.db.DB.QueryRowContext(ctx, "SELECT value FROM sync_metadata WHERE key = ?", key).Scan(&val)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return val, err
}
