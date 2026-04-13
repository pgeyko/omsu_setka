package storage

import (
	"context"
	"database/sql"
)

type Subscription struct {
	FCMToken           string `json:"fcm_token"`
	EntityType         string `json:"entity_type"`
	EntityID           int    `json:"entity_id"`
	NotifyOnChange     bool   `json:"notify_on_change"`
	NotifyDailyDigest  bool   `json:"notify_daily_digest"`
	DigestTime         string `json:"digest_time"`
	NotifyBeforeLesson bool   `json:"notify_before_lesson"`
	BeforeMinutes      int    `json:"before_minutes"`
	Timezone           string `json:"timezone"`
}

type SubscriptionRepo struct {
	db *SQLite
}

func NewSubscriptionRepo(db *SQLite) *SubscriptionRepo {
	return &SubscriptionRepo{db: db}
}

func (r *SubscriptionRepo) Subscribe(ctx context.Context, sub Subscription) error {
	// Set defaults if not provided (for older clients or standard subscribe)
	if sub.DigestTime == "" {
		sub.DigestTime = "19:00"
	}
	if sub.Timezone == "" {
		sub.Timezone = "Asia/Omsk"
	}
	if sub.BeforeMinutes == 0 {
		sub.BeforeMinutes = 30
	}

	_, err := r.db.DB.ExecContext(ctx, `
		INSERT INTO user_subscriptions (
			fcm_token, entity_type, entity_id, 
			notify_on_change, notify_daily_digest, digest_time, 
			notify_before_lesson, before_minutes, timezone
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(fcm_token, entity_type, entity_id) DO UPDATE SET
			notify_on_change = excluded.notify_on_change,
			notify_daily_digest = excluded.notify_daily_digest,
			digest_time = excluded.digest_time,
			notify_before_lesson = excluded.notify_before_lesson,
			before_minutes = excluded.before_minutes,
			timezone = excluded.timezone
	`, 
		sub.FCMToken, sub.EntityType, sub.EntityID,
		sub.NotifyOnChange, sub.NotifyDailyDigest, sub.DigestTime,
		sub.NotifyBeforeLesson, sub.BeforeMinutes, sub.Timezone,
	)
	return err
}

func (r *SubscriptionRepo) Unsubscribe(ctx context.Context, token string, entityType string, entityID int) error {
	_, err := r.db.DB.ExecContext(ctx, `
		DELETE FROM user_subscriptions 
		WHERE fcm_token = ? AND entity_type = ? AND entity_id = ?
	`, token, entityType, entityID)
	return err
}

func (r *SubscriptionRepo) GetSubscriptionCount(ctx context.Context, token string) (int, error) {
	var count int
	err := r.db.DB.QueryRowContext(ctx, "SELECT COUNT(*) FROM user_subscriptions WHERE fcm_token = ?", token).Scan(&count)
	return count, err
}

func (r *SubscriptionRepo) DeleteTokens(ctx context.Context, tokens []string) error {
	if len(tokens) == 0 {
		return nil
	}

	// Simple IN (?) implementation for small arrays
	// For large arrays, a more robust solution with batching might be needed
	query := "DELETE FROM user_subscriptions WHERE fcm_token IN ("
	args := make([]interface{}, len(tokens))
	for i, t := range tokens {
		if i > 0 {
			query += ","
		}
		query += "?"
		args[i] = t
	}
	query += ")"

	_, err := r.db.DB.ExecContext(ctx, query, args...)
	return err
}

func (r *SubscriptionRepo) GetAllSubscriptionsByToken(ctx context.Context, token string) ([]Subscription, error) {
	rows, err := r.db.DB.QueryContext(ctx, `
		SELECT 
			fcm_token, entity_type, entity_id,
			notify_on_change, notify_daily_digest, digest_time,
			notify_before_lesson, before_minutes, timezone
		FROM user_subscriptions 
		WHERE fcm_token = ?
	`, token)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var subs []Subscription
	for rows.Next() {
		var s Subscription
		if err := rows.Scan(
			&s.FCMToken, &s.EntityType, &s.EntityID,
			&s.NotifyOnChange, &s.NotifyDailyDigest, &s.DigestTime,
			&s.NotifyBeforeLesson, &s.BeforeMinutes, &s.Timezone,
		); err != nil {
			return nil, err
		}
		subs = append(subs, s)
	}
	return subs, nil
}

func (r *SubscriptionRepo) GetTokensByEntity(ctx context.Context, entityType string, entityID int) ([]string, error) {
	rows, err := r.db.DB.QueryContext(ctx, "SELECT fcm_token FROM user_subscriptions WHERE entity_type = ? AND entity_id = ?", entityType, entityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tokens []string
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err != nil {
			return nil, err
		}
		tokens = append(tokens, t)
	}
	return tokens, nil
}

func (r *SubscriptionRepo) GetSubscriptionsForDigest(ctx context.Context, timeStr string, todayStr string) (*sql.Rows, error) {
	return r.db.DB.QueryContext(ctx, `
		SELECT fcm_token, entity_type, entity_id, timezone
		FROM user_subscriptions
		WHERE notify_daily_digest = 1 
		  AND digest_time = ? 
		  AND (last_digest_at IS NULL OR last_digest_at != ?)
	`, timeStr, todayStr)
}

func (r *SubscriptionRepo) MarkDigestSent(ctx context.Context, token, entityType string, entityID int, todayStr string) error {
	_, err := r.db.DB.ExecContext(ctx, `
		UPDATE user_subscriptions 
		SET last_digest_at = ?
		WHERE fcm_token = ? AND entity_type = ? AND entity_id = ?
	`, todayStr, token, entityType, entityID)
	return err
}

func (r *SubscriptionRepo) GetSubscriptionsWithReminders(ctx context.Context) (*sql.Rows, error) {
	return r.db.DB.QueryContext(ctx, `
		SELECT fcm_token, entity_type, entity_id, before_minutes
		FROM user_subscriptions
		WHERE notify_before_lesson = 1
	`)
}
