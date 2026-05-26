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

// Update updates an existing webhook subscriber's fields.
func (r *WebhookRepo) Update(ctx context.Context, id int, secret string, groupIDs []int, enabled bool) error {
	groupIDsJSON, err := json.Marshal(groupIDs)
	if err != nil {
		return err
	}
	_, err = r.db.DB.ExecContext(ctx, `
		UPDATE webhook_subscribers
		SET secret = ?, group_ids = ?, enabled = ?
		WHERE id = ?
	`, secret, string(groupIDsJSON), enabled, id)
	return err
}

type FailedDelivery struct {
	ID            int       `json:"id"`
	SubscriberID  int       `json:"subscriber_id"`
	URL           string    `json:"url"`
	Payload       []byte    `json:"payload"`
	EventID       string    `json:"event_id"`
	Timestamp     string    `json:"timestamp"`
	Error         string    `json:"error"`
	AttemptCount  int       `json:"attempt_count"`
	CreatedAt     time.Time `json:"created_at"`
}

type FailedDeliveryRepo struct {
	db *SQLite
}

func NewFailedDeliveryRepo(db *SQLite) *FailedDeliveryRepo {
	return &FailedDeliveryRepo{db: db}
}

func (r *FailedDeliveryRepo) Save(ctx context.Context, subscriberID int, url string, payload []byte, eventID, timestamp, errorStr string) (int64, error) {
	result, err := r.db.DB.ExecContext(ctx, `
		INSERT INTO webhook_failed_deliveries (subscriber_id, url, payload, event_id, timestamp, error)
		VALUES (?, ?, ?, ?, ?, ?)
	`, subscriberID, url, payload, eventID, timestamp, errorStr)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

func (r *FailedDeliveryRepo) List(ctx context.Context, subscriberID, limit int) ([]FailedDelivery, error) {
	rows, err := r.db.DB.QueryContext(ctx, `
		SELECT id, subscriber_id, url, payload, event_id, timestamp, error, attempt_count, created_at
		FROM webhook_failed_deliveries
		WHERE subscriber_id = ?
		ORDER BY created_at DESC
		LIMIT ?
	`, subscriberID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var deliveries []FailedDelivery
	for rows.Next() {
		var d FailedDelivery
		if err := rows.Scan(&d.ID, &d.SubscriberID, &d.URL, &d.Payload, &d.EventID, &d.Timestamp, &d.Error, &d.AttemptCount, &d.CreatedAt); err != nil {
			return nil, err
		}
		deliveries = append(deliveries, d)
	}
	return deliveries, nil
}

func (r *FailedDeliveryRepo) GetPending(ctx context.Context, limit int) ([]FailedDelivery, error) {
	rows, err := r.db.DB.QueryContext(ctx, `
		SELECT id, subscriber_id, url, payload, event_id, timestamp, error, attempt_count, created_at
		FROM webhook_failed_deliveries
		ORDER BY created_at ASC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var deliveries []FailedDelivery
	for rows.Next() {
		var d FailedDelivery
		if err := rows.Scan(&d.ID, &d.SubscriberID, &d.URL, &d.Payload, &d.EventID, &d.Timestamp, &d.Error, &d.AttemptCount, &d.CreatedAt); err != nil {
			return nil, err
		}
		deliveries = append(deliveries, d)
	}
	return deliveries, nil
}

func (r *FailedDeliveryRepo) Delete(ctx context.Context, id int) error {
	_, err := r.db.DB.ExecContext(ctx, `DELETE FROM webhook_failed_deliveries WHERE id = ?`, id)
	return err
}

func (r *FailedDeliveryRepo) DeleteByEventID(ctx context.Context, eventID string) error {
	_, err := r.db.DB.ExecContext(ctx, `DELETE FROM webhook_failed_deliveries WHERE event_id = ?`, eventID)
	return err
}

func (r *FailedDeliveryRepo) IncrementAttempt(ctx context.Context, id int) error {
	_, err := r.db.DB.ExecContext(ctx, `
		UPDATE webhook_failed_deliveries
		SET attempt_count = attempt_count + 1
		WHERE id = ?
	`, id)
	return err
}

// UpsertByURL creates or updates a webhook subscriber by its URL.
// Uses atomic UPSERT to prevent race conditions.
// Returns the subscriber ID and whether a new record was created.
func (r *WebhookRepo) UpsertByURL(ctx context.Context, s WebhookSubscriber) (int, bool, error) {
	groupIDsJSON, err := json.Marshal(s.GroupIDs)
	if err != nil {
		return 0, false, err
	}

	result, err := r.db.DB.ExecContext(ctx, `
		INSERT INTO webhook_subscribers (url, secret, group_ids, enabled)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(url) DO UPDATE SET
			secret = excluded.secret,
			group_ids = excluded.group_ids,
			enabled = excluded.enabled
	`, s.URL, s.Secret, string(groupIDsJSON), s.Enabled)
	if err != nil {
		return 0, false, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return 0, false, err
	}

	// changes() returns 1 for insert, 0 for ON CONFLICT update
	var modified int
	if err := r.db.DB.QueryRowContext(ctx, `SELECT changes()`).Scan(&modified); err != nil {
		modified = 0
	}

	return int(id), modified == 1, nil
}
