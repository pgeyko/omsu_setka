package storage

import (
	"context"
	"time"
)

type Incident struct {
	ID        int       `json:"id"`
	EventType string    `json:"event_type"` // "down", "up", "error", "slow"
	Message   string    `json:"message"`
	ErrorText string    `json:"error_text,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type IncidentRepo struct {
	db *SQLite
}

func NewIncidentRepo(db *SQLite) *IncidentRepo {
	return &IncidentRepo{db: db}
}

func (r *IncidentRepo) LogIncident(ctx context.Context, eventType, message, errorText string) error {
	_, err := r.db.DB.ExecContext(ctx, `
		INSERT INTO upstream_incidents (event_type, message, error_text) 
		VALUES (?, ?, ?)
	`, eventType, message, errorText)
	return err
}

func (r *IncidentRepo) GetIncidents(ctx context.Context, limit, offset int) ([]Incident, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	rows, err := r.db.DB.QueryContext(ctx, `
		SELECT id, event_type, message, COALESCE(error_text, ''), created_at 
		FROM upstream_incidents 
		ORDER BY created_at DESC 
		LIMIT ? OFFSET ?
	`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var incidents []Incident
	for rows.Next() {
		var inc Incident
		if err := rows.Scan(&inc.ID, &inc.EventType, &inc.Message, &inc.ErrorText, &inc.CreatedAt); err != nil {
			return nil, err
		}
		incidents = append(incidents, inc)
	}
	if incidents == nil {
		incidents = []Incident{}
	}
	return incidents, nil
}

func (r *IncidentRepo) CleanOld(ctx context.Context, maxRows int) (int64, error) {
	res, err := r.db.DB.ExecContext(ctx, `
		DELETE FROM upstream_incidents 
		WHERE id NOT IN (
			SELECT id FROM upstream_incidents ORDER BY created_at DESC LIMIT ?
		)
	`, maxRows)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
