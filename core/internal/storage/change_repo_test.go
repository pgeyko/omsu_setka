package storage

import (
	"context"
	"testing"
	"time"

	"omsu_mirror/internal/diff"
)

func TestChangeRepo_FilterAndRetention(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	repo := NewChangeRepo(db)
	ctx := context.Background()

	base := time.Now().Add(-2 * time.Hour)
	log := func(entityID, lessonID int, day string, pair int, subgroup string, changes []diff.Change) {
		t.Helper()
		if err := repo.LogChange(ctx, ScheduleChange{
			EntityType: "group",
			EntityID:   entityID,
			ChangeType: "modified",
			LessonID:   lessonID,
			Day:        day,
			Pair:       pair,
			Subgroup:   subgroup,
			Subject:    "Базы данных",
			Diff:       changes,
			OldData:    `{"id":1}`,
			NewData:    `{"id":1}`,
		}); err != nil {
			t.Fatalf("LogChange: %v", err)
		}
	}

	log(1, 10, "2026-11-18", 4, "1", []diff.Change{{Field: "auditCorps", Label: "аудитория", Old: "4-312", New: "4-308"}})
	log(1, 11, "2026-11-18", 2, "", []diff.Change{{Field: "teacher", Label: "преподаватель", Old: "A", New: "B"}})
	log(2, 12, "2026-11-19", 3, "2", nil)

	// Oldest row is outside the retention window.
	if _, err := db.DB.ExecContext(ctx, "UPDATE schedule_changes SET created_at = ? WHERE id = 1", base.Format("2006-01-02 15:04:05")); err != nil {
		t.Fatal(err)
	}

	all, err := repo.GetChangesFiltered(ctx, ChangeFilter{EntityType: "group", EntityID: 1, Limit: 20})
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 2 {
		t.Fatalf("expected 2 changes for group 1, got %d", len(all))
	}
	if all[0].Day != "2026-11-18" || all[0].Pair != 2 || all[0].Subject != "Базы данных" {
		t.Errorf("unexpected normalized fields: %#v", all[0])
	}

	subgroup, err := repo.GetChangesFiltered(ctx, ChangeFilter{EntityType: "group", EntityID: 1, Subgroup: "1", Limit: 20})
	if err != nil {
		t.Fatal(err)
	}
	if len(subgroup) != 2 {
		t.Fatalf("subgroup filter must include common changes, got %d", len(subgroup))
	}
	hasCommon, hasOne := false, false
	for _, change := range subgroup {
		if change.Subgroup == "" {
			hasCommon = true
		}
		if change.Subgroup == "1" {
			hasOne = true
		}
	}
	if !hasCommon || !hasOne {
		t.Errorf("subgroup filter must include common and subgroup 1: %#v", subgroup)
	}

	limited, err := repo.GetChangesFiltered(ctx, ChangeFilter{EntityType: "group", EntityID: 1, Limit: 1})
	if err != nil {
		t.Fatal(err)
	}
	if len(limited) != 1 || limited[0].ID != all[0].ID {
		t.Errorf("limit/order mismatch: %#v", limited)
	}

	scopeAll, err := repo.GetChangesFiltered(ctx, ChangeFilter{Limit: 20})
	if err != nil {
		t.Fatal(err)
	}
	if len(scopeAll) != 3 {
		t.Fatalf("all entities should return 3 changes, got %d", len(scopeAll))
	}

	cut, err := repo.CleanOld(ctx, time.Now().Add(-time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	if cut != 1 {
		t.Errorf("CleanOld removed %d rows, want 1", cut)
	}
}
