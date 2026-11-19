package sync

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"omsu_mirror/internal/config"
	"omsu_mirror/internal/models"
	"omsu_mirror/internal/storage"
)

func TestGetScheduleForDay_SubgroupFormats(t *testing.T) {
	db := setupSyncTestDB(t)
	defer db.Close()
	repo := storage.NewScheduleRepo(db, make(chan struct{}))
	cfg := &config.Config{CacheScheduleTTL: time.Hour}
	s := &Syncer{cfg: cfg, scheduleRepo: repo}

	schedule := []models.Day{
		{
			Day: "18.11.2026",
			Lessons: []models.Lesson{
				{ID: 1, Time: 2, Lesson: "Общая", TypeWork: "Лек"},
				{ID: 2, Time: 2, Lesson: "Первая", TypeWork: "Лаб", SubgroupName: "ЮСС-003-О-02/1"},
				{ID: 3, Time: 2, Lesson: "Вторая", TypeWork: "Лаб", SubgroupName: "Подгруппа 2"},
			},
		},
	}
	data, err := json.Marshal(models.BFFResponse{Success: true, Data: schedule, CachedAt: time.Now(), Source: "cache"})
	if err != nil {
		t.Fatal(err)
	}
	if err := repo.PutSchedule(context.Background(), "group:1", "group", 1, data, "", time.Hour); err != nil {
		t.Fatal(err)
	}

	date := time.Date(2026, 11, 18, 0, 0, 0, 0, time.UTC)
	lessons, err := s.getScheduleForDay(context.Background(), "group", 1, date, "1")
	if err != nil {
		t.Fatal(err)
	}
	if len(lessons) != 2 {
		t.Fatalf("expected common + subgroup 1, got %d", len(lessons))
	}
	for _, lesson := range lessons {
		if lesson.ID == 3 {
			t.Fatalf("subgroup 2 lesson leaked into subgroup 1")
		}
	}

	lessons, err = s.getScheduleForDay(context.Background(), "group", 1, date, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(lessons) != 3 {
		t.Fatalf("expected all lessons without subgroup filter, got %d", len(lessons))
	}
}

func TestLocationFor(t *testing.T) {
	if loc := locationFor("Europe/Moscow"); loc.String() != "Europe/Moscow" {
		t.Errorf("unexpected location: %s", loc.String())
	}
	if _, offset := time.Now().In(locationFor("Europe/Moscow")).Zone(); offset != 3*3600 {
		t.Errorf("unexpected Moscow offset: %d", offset)
	}
	if loc := locationFor("not/a-zone"); loc == nil {
		t.Fatal("expected fallback location")
	}
}

func setupSyncTestDB(t *testing.T) *storage.SQLite {
	t.Helper()
	cfg := &config.Config{
		SQLitePath:        ":memory:",
		SQLiteWALMode:     false,
		SQLiteBusyTimeout: 1000,
	}
	db, err := storage.NewSQLite(cfg)
	if err != nil {
		t.Fatal(err)
	}
	db.DB.SetMaxOpenConns(1)
	return db
}
