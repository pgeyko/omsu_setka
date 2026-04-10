package storage

import (
	"context"
	"time"
)

type ScheduleChange struct {
	ID         int       `json:"id"`
	EntityType string    `json:"entity_type"`
	EntityID   int       `json:"entity_id"`
	ChangeType string    `json:"change_type"` // "added", "removed", "modified"
	LessonID   int       `json:"lesson_id"`
	OldData    string    `json:"old_data,omitempty"`
	NewData    string    `json:"new_data,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

type ChangeRepo struct {
	db *SQLite
}

func NewChangeRepo(db *SQLite) *ChangeRepo {
	return &ChangeRepo{db: db}
}

func (r *ChangeRepo) LogChange(ctx context.Context, change ScheduleChange) error {
	_, err := r.db.DB.ExecContext(ctx, `
		INSERT INTO schedule_changes (entity_type, entity_id, change_type, lesson_id, old_data, new_data)
		VALUES (?, ?, ?, ?, ?, ?)
	`, change.EntityType, change.EntityID, change.ChangeType, change.LessonID, change.OldData, change.NewData)
	return err
}

func (r *ChangeRepo) GetChanges(ctx context.Context, entityType string, entityID int, limit int) ([]ScheduleChange, error) {
	rows, err := r.db.DB.QueryContext(ctx, `
		SELECT id, entity_type, entity_id, change_type, lesson_id, COALESCE(old_data, ''), COALESCE(new_data, ''), created_at
		FROM schedule_changes
		WHERE entity_type = ? AND entity_id = ?
		ORDER BY created_at DESC
		LIMIT ?
	`, entityType, entityID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var changes []ScheduleChange
	for rows.Next() {
		var c ScheduleChange
		if err := rows.Scan(&c.ID, &c.EntityType, &c.EntityID, &c.ChangeType, &c.LessonID, &c.OldData, &c.NewData, &c.CreatedAt); err != nil {
			return nil, err
		}
		changes = append(changes, c)
	}
	return changes, nil
}
