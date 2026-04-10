package storage

import (
	"context"
	"strconv"
	"testing"

	"omsu_mirror/internal/config"
	"omsu_mirror/internal/models"
)

func setupBenchmarkDB(b *testing.B) *SQLite {
	cfg := &config.Config{
		SQLitePath:        ":memory:",
		SQLiteWALMode:     false,
		SQLiteBusyTimeout: 1000,
	}
	db, err := NewSQLite(cfg)
	if err != nil {
		b.Fatalf("Failed to setup in-memory db: %v", err)
	}
	return db
}

func BenchmarkUpsertGroups(b *testing.B) {
	db := setupBenchmarkDB(b)
	defer db.Close()
	repo := NewDictRepo(db)
	ctx := context.Background()

	groups := make([]models.Group, 1000)
	for i := 0; i < 1000; i++ {
		groups[i] = models.Group{ID: i, Name: "Group " + strconv.Itoa(i)}
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		repo.UpsertGroups(ctx, groups)
	}
}
