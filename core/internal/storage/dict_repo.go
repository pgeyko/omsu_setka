package storage

import (
	"context"
	"database/sql"
	"strings"

	"omsu_mirror/internal/models"
)

type DictRepo struct {
	db *SQLite
}

func NewDictRepo(db *SQLite) *DictRepo {
	return &DictRepo{db: db}
}

func (r *DictRepo) UpsertGroups(ctx context.Context, groups []models.Group) error {
	if len(groups) == 0 {
		return nil
	}

	tx, err := r.db.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	chunkSize := 500
	for i := 0; i < len(groups); i += chunkSize {
		end := i + chunkSize
		if end > len(groups) {
			end = len(groups)
		}
		chunk := groups[i:end]

		var b strings.Builder
		b.WriteString("INSERT INTO dict_groups (id, name, real_group_id, updated_at) VALUES ")
		args := make([]interface{}, 0, len(chunk)*3)

		for j, g := range chunk {
			if j > 0 {
				b.WriteString(", ")
			}
			b.WriteString("(?, ?, ?, CURRENT_TIMESTAMP)")
			args = append(args, g.ID, g.Name, g.RealGroupID)
		}

		b.WriteString(` ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			real_group_id = excluded.real_group_id,
			updated_at = excluded.updated_at`)

		if _, err := tx.ExecContext(ctx, b.String(), args...); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (r *DictRepo) GetAllGroups(ctx context.Context) ([]models.Group, error) {
	rows, err := r.db.DB.QueryContext(ctx, "SELECT id, name, real_group_id FROM dict_groups")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	groups := make([]models.Group, 0)
	for rows.Next() {
		var g models.Group
		if err := rows.Scan(&g.ID, &g.Name, &g.RealGroupID); err != nil {
			return nil, err
		}
		groups = append(groups, g)
	}
	return groups, nil
}

func (r *DictRepo) UpsertAuditories(ctx context.Context, auds []models.Auditory) error {
	if len(auds) == 0 {
		return nil
	}

	tx, err := r.db.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	chunkSize := 500
	for i := 0; i < len(auds); i += chunkSize {
		end := i + chunkSize
		if end > len(auds) {
			end = len(auds)
		}
		chunk := auds[i:end]

		var b strings.Builder
		b.WriteString("INSERT INTO dict_auditories (id, name, building, updated_at) VALUES ")
		args := make([]interface{}, 0, len(chunk)*3)

		for j, a := range chunk {
			if j > 0 {
				b.WriteString(", ")
			}
			b.WriteString("(?, ?, ?, CURRENT_TIMESTAMP)")
			args = append(args, a.ID, a.Name, a.Building)
		}

		b.WriteString(` ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			building = excluded.building,
			updated_at = excluded.updated_at`)

		if _, err := tx.ExecContext(ctx, b.String(), args...); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (r *DictRepo) GetAllAuditories(ctx context.Context) ([]models.Auditory, error) {
	rows, err := r.db.DB.QueryContext(ctx, "SELECT id, name, building FROM dict_auditories")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	auds := make([]models.Auditory, 0)
	for rows.Next() {
		var a models.Auditory
		if err := rows.Scan(&a.ID, &a.Name, &a.Building); err != nil {
			return nil, err
		}
		auds = append(auds, a)
	}
	return auds, nil
}

func (r *DictRepo) UpsertTutors(ctx context.Context, tutors []models.Tutor) error {
	if len(tutors) == 0 {
		return nil
	}

	tx, err := r.db.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	chunkSize := 500
	for i := 0; i < len(tutors); i += chunkSize {
		end := i + chunkSize
		if end > len(tutors) {
			end = len(tutors)
		}
		chunk := tutors[i:end]

		var b strings.Builder
		b.WriteString("INSERT INTO dict_tutors (id, name, updated_at) VALUES ")
		args := make([]interface{}, 0, len(chunk)*2)

		for j, t := range chunk {
			if j > 0 {
				b.WriteString(", ")
			}
			b.WriteString("(?, ?, CURRENT_TIMESTAMP)")
			args = append(args, t.ID, t.Name)
		}

		b.WriteString(` ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			updated_at = excluded.updated_at`)

		if _, err := tx.ExecContext(ctx, b.String(), args...); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (r *DictRepo) GetAllTutors(ctx context.Context) ([]models.Tutor, error) {
	rows, err := r.db.DB.QueryContext(ctx, "SELECT id, name FROM dict_tutors")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tutors := make([]models.Tutor, 0)
	for rows.Next() {
		var t models.Tutor
		if err := rows.Scan(&t.ID, &t.Name); err != nil {
			return nil, err
		}
		tutors = append(tutors, t)
	}
	return tutors, nil
}

func (r *DictRepo) GetGroupByID(ctx context.Context, id int) (*models.Group, error) {
	var g models.Group
	err := r.db.DB.QueryRowContext(ctx, "SELECT id, name, real_group_id FROM dict_groups WHERE id = ?", id).
		Scan(&g.ID, &g.Name, &g.RealGroupID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &g, nil
}

func (r *DictRepo) GetAuditoryByID(ctx context.Context, id int) (*models.Auditory, error) {
	var a models.Auditory
	err := r.db.DB.QueryRowContext(ctx, "SELECT id, name, building FROM dict_auditories WHERE id = ?", id).
		Scan(&a.ID, &a.Name, &a.Building)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *DictRepo) GetTutorByID(ctx context.Context, id int) (*models.Tutor, error) {
	var t models.Tutor
	err := r.db.DB.QueryRowContext(ctx, "SELECT id, name FROM dict_tutors WHERE id = ?", id).
		Scan(&t.ID, &t.Name)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &t, nil
}
