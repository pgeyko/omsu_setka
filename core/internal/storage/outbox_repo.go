package storage

import (
	"context"
	"encoding/json"
	"time"
)

type OutboxMessage struct {
	ID                int
	FCMToken          string
	Title             string
	Body              string
	Data              string // JSON object for FCM data
	Kind              string // change, digest, reminder
	SubscriptionToken string
	EntityType        string
	EntityID          int
	MarkDate          string
	Attempts          int
	NextAttemptAt     time.Time
	Status            string
	LastError         string
	CreatedAt         time.Time
	SentAt            *time.Time
}

type OutboxRepo struct {
	db *SQLite
}

func NewOutboxRepo(db *SQLite) *OutboxRepo {
	return &OutboxRepo{db: db}
}

func (r *OutboxRepo) Enqueue(ctx context.Context, msg OutboxMessage) error {
	if msg.SubscriptionToken != "" && msg.MarkDate != "" {
		var exists int
		err := r.db.DB.QueryRowContext(ctx, `
			SELECT 1 FROM notification_outbox
			WHERE subscription_token = ? AND kind = ? AND mark_date = ?
			  AND entity_type = ? AND entity_id = ?
			  AND status IN ('pending', 'processing', 'sent', 'failed')
			LIMIT 1
		`, msg.SubscriptionToken, msg.Kind, msg.MarkDate, msg.EntityType, msg.EntityID).Scan(&exists)
		if err == nil {
			return nil
		}
	}
	if msg.Kind == "" {
		msg.Kind = "change"
	}
	_, err := r.db.DB.ExecContext(ctx, `
		INSERT INTO notification_outbox (
			fcm_token, title, body, data, kind,
			subscription_token, entity_type, entity_id, mark_date,
			attempts, next_attempt_at, status
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, 'pending')
	`, msg.FCMToken, msg.Title, msg.Body, msg.Data, msg.Kind,
		msg.SubscriptionToken, msg.EntityType, msg.EntityID, msg.MarkDate)
	return err
}

func (r *OutboxRepo) GetPending(ctx context.Context, now time.Time, limit int) ([]OutboxMessage, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.db.DB.QueryContext(ctx, `
		SELECT id, fcm_token, title, body, COALESCE(data, ''), kind,
		       COALESCE(subscription_token, ''), COALESCE(entity_type, ''),
		       COALESCE(entity_id, 0), COALESCE(mark_date, ''),
		       attempts, next_attempt_at, status, COALESCE(last_error, ''),
		       created_at, sent_at
		FROM notification_outbox
		WHERE status = 'pending' AND next_attempt_at <= ?
		ORDER BY id ASC
		LIMIT ?
	`, now.UTC().Format("2006-01-02 15:04:05"), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []OutboxMessage
	for rows.Next() {
		var msg OutboxMessage
		var sentAt *time.Time
		if err := rows.Scan(
			&msg.ID, &msg.FCMToken, &msg.Title, &msg.Body, &msg.Data, &msg.Kind,
			&msg.SubscriptionToken, &msg.EntityType, &msg.EntityID, &msg.MarkDate,
			&msg.Attempts, &msg.NextAttemptAt, &msg.Status, &msg.LastError,
			&msg.CreatedAt, &sentAt,
		); err != nil {
			return nil, err
		}
		msg.SentAt = sentAt
		messages = append(messages, msg)
	}
	return messages, nil
}

func (r *OutboxRepo) MarkSent(ctx context.Context, id int) error {
	_, err := r.db.DB.ExecContext(ctx, `
		UPDATE notification_outbox
		SET status = 'sent', sent_at = CURRENT_TIMESTAMP, last_error = ''
		WHERE id = ?
	`, id)
	return err
}

func (r *OutboxRepo) MarkRetry(ctx context.Context, id, attempts int, next time.Time, lastError string) error {
	_, err := r.db.DB.ExecContext(ctx, `
		UPDATE notification_outbox
		SET attempts = ?, next_attempt_at = ?, last_error = ?
		WHERE id = ?
	`, attempts, next.UTC().Format("2006-01-02 15:04:05"), lastError, id)
	return err
}

func (r *OutboxRepo) MarkFailed(ctx context.Context, id int, lastError string) error {
	_, err := r.db.DB.ExecContext(ctx, `
		UPDATE notification_outbox
		SET status = 'failed', last_error = ?
		WHERE id = ?
	`, lastError, id)
	return err
}

func (r *OutboxRepo) CleanOld(ctx context.Context, before time.Time) (int64, error) {
	res, err := r.db.DB.ExecContext(ctx, `
		DELETE FROM notification_outbox
		WHERE status IN ('sent', 'failed') AND created_at < ?
	`, before.UTC().Format("2006-01-02 15:04:05"))
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (m OutboxMessage) DataMap() map[string]string {
	if m.Data == "" {
		return map[string]string{}
	}
	var data map[string]string
	if err := json.Unmarshal([]byte(m.Data), &data); err != nil {
		return map[string]string{}
	}
	return data
}
