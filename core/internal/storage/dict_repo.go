package storage

import (
	"context"
	"database/sql"
	"omsu_mirror/internal/models"
)

type DictRepo struct {
	db *SQLite
}

func NewDictRepo(db *SQLite) *DictRepo {
	return &DictRepo{db: db}
}

func (r *DictRepo) UpsertGroups(ctx context.Context, groups []models.Group) error {
	tx, err := r.db.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO dict_groups (id, name, real_group_id, updated_at)
		VALUES (?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			real_group_id = excluded.real_group_id,
			updated_at = excluded.updated_at
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, g := range groups {
		if _, err := stmt.ExecContext(ctx, g.ID, g.Name, g.RealGroupID); err != nil {
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

	var groups []models.Group
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
	tx, err := r.db.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO dict_auditories (id, name, building, updated_at)
		VALUES (?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			building = excluded.building,
			updated_at = excluded.updated_at
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, a := range auds {
		if _, err := stmt.ExecContext(ctx, a.ID, a.Name, a.Building); err != nil {
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

	var auds []models.Auditory
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
	tx, err := r.db.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO dict_tutors (id, name, updated_at)
		VALUES (?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			updated_at = excluded.updated_at
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, t := range tutors {
		if _, err := stmt.ExecContext(ctx, t.ID, t.Name); err != nil {
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

	var tutors []models.Tutor
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
