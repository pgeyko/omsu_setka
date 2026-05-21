package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

type WebhookSubscriber struct {
	ID        int       `json:"id"`
	URL       string    `json:"url"`
	Secret    string    `json:"-"`
	GroupIDs  []int     `json:"group_ids"`
	Enabled   bool      `json:"enabled"`
	CreatedAt time.Time `json:"created_at"`
}

type WebhookRepo struct {
	db *SQLite
}

func NewWebhookRepo(db *SQLite) *WebhookRepo {
	return &WebhookRepo{db: db}
}

func (r *WebhookRepo) GetEnabled(ctx context.Context) ([]WebhookSubscriber, error) {
	rows, err := r.db.DB.QueryContext(ctx, `
		SELECT id, url, secret, group_ids, enabled, created_at
		FROM webhook_subscribers
		WHERE enabled = 1
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var subscribers []WebhookSubscriber
	for rows.Next() {
		var s WebhookSubscriber
		var groupIDsStr string
		if err := rows.Scan(&s.ID, &s.URL, &s.Secret, &groupIDsStr, &s.Enabled, &s.CreatedAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(groupIDsStr), &s.GroupIDs); err != nil {
			s.GroupIDs = []int{}
		}
		subscribers = append(subscribers, s)
	}
	return subscribers, nil
}

func (r *WebhookRepo) GetAll(ctx context.Context) ([]WebhookSubscriber, error) {
	rows, err := r.db.DB.QueryContext(ctx, `
		SELECT id, url, secret, group_ids, enabled, created_at
		FROM webhook_subscribers
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var subscribers []WebhookSubscriber
	for rows.Next() {
		var s WebhookSubscriber
		var groupIDsStr string
		if err := rows.Scan(&s.ID, &s.URL, &s.Secret, &groupIDsStr, &s.Enabled, &s.CreatedAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(groupIDsStr), &s.GroupIDs); err != nil {
			s.GroupIDs = []int{}
		}
		subscribers = append(subscribers, s)
	}
	return subscribers, nil
}

func (r *WebhookRepo) Create(ctx context.Context, s WebhookSubscriber) (int, error) {
	groupIDsJSON, err := json.Marshal(s.GroupIDs)
	if err != nil {
		return 0, err
	}

	result, err := r.db.DB.ExecContext(ctx, `
		INSERT INTO webhook_subscribers (url, secret, group_ids, enabled)
		VALUES (?, ?, ?, ?)
	`, s.URL, s.Secret, string(groupIDsJSON), s.Enabled)
	if err != nil {
		return 0, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return 0, err
	}
	return int(id), nil
}

func (r *WebhookRepo) Delete(ctx context.Context, id int) error {
	_, err := r.db.DB.ExecContext(ctx, `DELETE FROM webhook_subscribers WHERE id = ?`, id)
	return err
}

func (r *WebhookRepo) GetByID(ctx context.Context, id int) (*WebhookSubscriber, error) {
	var s WebhookSubscriber
	var groupIDsStr string
	err := r.db.DB.QueryRowContext(ctx, `
		SELECT id, url, secret, group_ids, enabled, created_at
		FROM webhook_subscribers
		WHERE id = ?
	`, id).Scan(&s.ID, &s.URL, &s.Secret, &groupIDsStr, &s.Enabled, &s.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if err := json.Unmarshal([]byte(groupIDsStr), &s.GroupIDs); err != nil {
		s.GroupIDs = []int{}
	}
	return &s, nil
}
