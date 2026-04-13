package storage

import (
	"context"
)

type Subscription struct {
	FCMToken   string `json:"fcm_token"`
	EntityType string `json:"entity_type"`
	EntityID   int    `json:"entity_id"`
}

type SubscriptionRepo struct {
	db *SQLite
}

func NewSubscriptionRepo(db *SQLite) *SubscriptionRepo {
	return &SubscriptionRepo{db: db}
}

func (r *SubscriptionRepo) Subscribe(ctx context.Context, sub Subscription) error {
	_, err := r.db.DB.ExecContext(ctx, `
		INSERT INTO user_subscriptions (fcm_token, entity_type, entity_id)
		VALUES (?, ?, ?)
		ON CONFLICT(fcm_token, entity_type, entity_id) DO NOTHING
	`, sub.FCMToken, sub.EntityType, sub.EntityID)
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
	rows, err := r.db.DB.QueryContext(ctx, "SELECT fcm_token, entity_type, entity_id FROM user_subscriptions WHERE fcm_token = ?", token)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var subs []Subscription
	for rows.Next() {
		var s Subscription
		if err := rows.Scan(&s.FCMToken, &s.EntityType, &s.EntityID); err != nil {
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
