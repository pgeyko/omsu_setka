package storage

import (
	"context"
	"testing"

	"omsu_mirror/internal/config"
	"omsu_mirror/internal/models"
)

func setupTestDB(t *testing.T) *SQLite {
	cfg := &config.Config{
		SQLitePath:        ":memory:",
		SQLiteWALMode:     false,
		SQLiteBusyTimeout: 1000,
	}
	db, err := NewSQLite(cfg)
	if err != nil {
		t.Fatalf("Failed to setup in-memory db: %v", err)
	}
	db.DB.SetMaxOpenConns(1)
	return db
}

func intPtr(i int) *int {
	return &i
}

func TestDictRepo_Groups(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	repo := NewDictRepo(db)
	ctx := context.Background()

	groups := []models.Group{
		{ID: 1, Name: "Группа 1", RealGroupID: intPtr(101)},
		{ID: 2, Name: "Группа 2", RealGroupID: intPtr(102)},
	}

	if err := repo.UpsertGroups(ctx, groups); err != nil {
		t.Fatalf("UpsertGroups failed: %v", err)
	}

	// Test GetAll
	all, err := repo.GetAllGroups(ctx)
	if err != nil {
		t.Fatalf("GetAllGroups failed: %v", err)
	}
	if len(all) != 2 {
		t.Errorf("Expected 2 groups, got %d", len(all))
	}

	// Test GetByID
	g, err := repo.GetGroupByID(ctx, 1)
	if err != nil {
		t.Fatalf("GetGroupByID failed: %v", err)
	}
	if g == nil || g.Name != "Группа 1" || g.RealGroupID == nil || *g.RealGroupID != 101 {
		t.Errorf("Unexpected group data: %+v", g)
	}

	// Test GetByID not found
	missing, err := repo.GetGroupByID(ctx, 999)
	if err != nil {
		t.Fatalf("GetGroupByID (missing) failed: %v", err)
	}
	if missing != nil {
		t.Errorf("Expected missing group to be nil, got %+v", missing)
	}
}

func TestDictRepo_TutorsAndAuditories(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	repo := NewDictRepo(db)
	ctx := context.Background()

	// Tutors
	tutors := []models.Tutor{{ID: 1, Name: "Иванов И.И."}}
	if err := repo.UpsertTutors(ctx, tutors); err != nil {
		t.Fatalf("UpsertTutors failed: %v", err)
	}
	tut, _ := repo.GetTutorByID(ctx, 1)
	if tut == nil || tut.Name != "Иванов И.И." {
		t.Errorf("Unexpected tutor data")
	}

	// Auditories
	auds := []models.Auditory{{ID: 1, Name: "101", Building: "1"}}
	if err := repo.UpsertAuditories(ctx, auds); err != nil {
		t.Fatalf("UpsertAuditories failed: %v", err)
	}
	aud, _ := repo.GetAuditoryByID(ctx, 1)
	if aud == nil || aud.Name != "101" {
		t.Errorf("Unexpected auditory data")
	}
}

func TestDictRepo_Exists(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	repo := NewDictRepo(db)
	ctx := context.Background()
	realID := 42
	if err := repo.UpsertGroups(ctx, []models.Group{{ID: 7, Name: "ЮСС-003-О-02", RealGroupID: &realID}}); err != nil {
		t.Fatal(err)
	}
	if err := repo.UpsertTutors(ctx, []models.Tutor{{ID: 15, Name: "Иванов Иван Иванович"}}); err != nil {
		t.Fatal(err)
	}

	if ok, err := repo.Exists(ctx, "group", 7); err != nil || !ok {
		t.Errorf("group should exist by dictionary id: ok=%v err=%v", ok, err)
	}
	if ok, _ := repo.Exists(ctx, "group", 42); ok {
		t.Error("real_group_id must not be used as a schedule key")
	}
	if ok, _ := repo.Exists(ctx, "tutor", 15); !ok {
		t.Error("tutor should exist")
	}
	if ok, _ := repo.Exists(ctx, "auditory", 1); ok {
		t.Error("auditory should not exist")
	}
}
