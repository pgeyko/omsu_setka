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
		ON CONFLICT(fcm_token) DO UPDATE SET
			entity_type = excluded.entity_type,
			entity_id = excluded.entity_id
	`, sub.FCMToken, sub.EntityType, sub.EntityID)
	return err
}

func (r *SubscriptionRepo) Unsubscribe(ctx context.Context, token string) error {
	_, err := r.db.DB.ExecContext(ctx, "DELETE FROM user_subscriptions WHERE fcm_token = ?", token)
	return err
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
