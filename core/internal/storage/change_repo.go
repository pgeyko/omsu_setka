package storage

import (
	"context"
	"encoding/json"
	"time"

	"omsu_mirror/internal/diff"
)

type ScheduleChange struct {
	ID         int           `json:"id"`
	EntityType string        `json:"entity_type"`
	EntityID   int           `json:"entity_id"`
	ChangeType string        `json:"change_type"` // "added", "removed", "modified"
	LessonID   int           `json:"lesson_id"`
	Day        string        `json:"day,omitempty"`      // ISO date of the lesson
	Pair       int           `json:"pair,omitempty"`     // lesson time slot
	Subgroup   string        `json:"subgroup,omitempty"` // normalized subgroup number
	Subject    string        `json:"subject,omitempty"`  // readable lesson name
	Diff       []diff.Change `json:"changes,omitempty"`  // normalized field changes
	OldData    string        `json:"old_data,omitempty"` // raw Lesson JSON
	NewData    string        `json:"new_data,omitempty"` // raw Lesson JSON
	CreatedAt  time.Time     `json:"created_at"`
}

type ChangeFilter struct {
	EntityType string
	EntityID   int
	Subgroup   string
	Limit      int
	BeforeID   int
	Since      *time.Time
}

type ChangeRepo struct {
	db *SQLite
}

func NewChangeRepo(db *SQLite) *ChangeRepo {
	return &ChangeRepo{db: db}
}

func marshalDiff(changes []diff.Change) string {
	if len(changes) == 0 {
		return ""
	}
	data, err := json.Marshal(changes)
	if err != nil {
		return ""
	}
	return string(data)
}

func unmarshalDiff(value string) []diff.Change {
	if value == "" {
		return nil
	}
	var changes []diff.Change
	if err := json.Unmarshal([]byte(value), &changes); err != nil {
		return nil
	}
	return changes
}

func (r *ChangeRepo) LogChange(ctx context.Context, change ScheduleChange) error {
	_, err := r.db.DB.ExecContext(ctx, `
		INSERT INTO schedule_changes (
			entity_type, entity_id, change_type, lesson_id,
			lesson_day, lesson_time, subgroup, subject, diff, old_data, new_data
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, change.EntityType, change.EntityID, change.ChangeType, change.LessonID,
		change.Day, change.Pair, change.Subgroup, change.Subject,
		marshalDiff(change.Diff), change.OldData, change.NewData)
	return err
}

// GetChanges keeps the original per-entity contract for compatibility.
func (r *ChangeRepo) GetChanges(ctx context.Context, entityType string, entityID int, limit int) ([]ScheduleChange, error) {
	return r.GetChangesFiltered(ctx, ChangeFilter{
		EntityType: entityType,
		EntityID:   entityID,
		Limit:      limit,
	})
}

func (r *ChangeRepo) GetChangesFiltered(ctx context.Context, filter ChangeFilter) ([]ScheduleChange, error) {
	if filter.Limit <= 0 {
		filter.Limit = 20
	}
	if filter.Limit > 100 {
		filter.Limit = 100
	}

	query := `
		SELECT id, entity_type, entity_id, change_type, lesson_id,
		       COALESCE(lesson_day, ''), COALESCE(lesson_time, 0),
		       COALESCE(subgroup, ''), COALESCE(subject, ''),
		       COALESCE(diff, ''),
		       COALESCE(old_data, ''), COALESCE(new_data, ''), created_at
		FROM schedule_changes
		WHERE 1 = 1`
	args := make([]interface{}, 0, 6)

	if filter.EntityType != "" {
		query += " AND entity_type = ?"
		args = append(args, filter.EntityType)
	}
	if filter.EntityID > 0 {
		query += " AND entity_id = ?"
		args = append(args, filter.EntityID)
	}
	if filter.Subgroup != "" {
		query += " AND (subgroup IS NULL OR subgroup = '' OR subgroup = ?)"
		args = append(args, filter.Subgroup)
	}
	if filter.BeforeID > 0 {
		query += " AND id < ?"
		args = append(args, filter.BeforeID)
	}
	if filter.Since != nil {
		query += " AND created_at >= ?"
		args = append(args, filter.Since.UTC().Format("2006-01-02 15:04:05"))
	}

	query += " ORDER BY id DESC LIMIT ?"
	args = append(args, filter.Limit)

	rows, err := r.db.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	changes := make([]ScheduleChange, 0)
	for rows.Next() {
		var c ScheduleChange
		var diffJSON string
		if err := rows.Scan(
			&c.ID, &c.EntityType, &c.EntityID, &c.ChangeType, &c.LessonID,
			&c.Day, &c.Pair, &c.Subgroup, &c.Subject, &diffJSON,
			&c.OldData, &c.NewData, &c.CreatedAt,
		); err != nil {
			return nil, err
		}
		c.Diff = unmarshalDiff(diffJSON)
		changes = append(changes, c)
	}
	return changes, nil
}

func (r *ChangeRepo) CleanOld(ctx context.Context, before time.Time) (int64, error) {
	res, err := r.db.DB.ExecContext(ctx, "DELETE FROM schedule_changes WHERE created_at < ?", before.UTC().Format("2006-01-02 15:04:05"))
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
