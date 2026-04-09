package storage

import (
	"context"
	"testing"
	"time"
)

func TestScheduleRepo_PutAndGet(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	repo := NewScheduleRepo(db)
	ctx := context.Background()

	err := repo.PutSchedule(ctx, "group:1", "group", 1, []byte("schedule_data"), "etag1", 5*time.Minute)
	if err != nil {
		t.Fatalf("PutSchedule failed: %v", err)
	}

	data, meta, err := repo.GetSchedule(ctx, "group:1")
	if err != nil {
		t.Fatalf("GetSchedule failed: %v", err)
	}
	if data == nil {
		t.Fatal("Expected schedule data, got nil")
	}
	if string(data) != "schedule_data" {
		t.Errorf("Expected schedule_data, got %s", string(data))
	}
	if meta.ETag != "etag1" {
		t.Errorf("Expected etag1, got %s", meta.ETag)
	}

	schedules, err := repo.GetSchedulesByType(ctx, "group")
	if err != nil {
		t.Fatalf("GetSchedulesByType failed: %v", err)
	}
	if len(schedules) != 1 {
		t.Errorf("Expected 1 schedule, got %d", len(schedules))
	}

	// Give async hit processing a moment
	time.Sleep(10 * time.Millisecond)

	err = repo.PutSyncMeta(ctx, "last_sync", "2026")
	if err != nil {
		t.Fatalf("PutSyncMeta failed: %v", err)
	}

	val, err := repo.GetSyncMeta(ctx, "last_sync")
	if err != nil {
		t.Fatalf("GetSyncMeta failed: %v", err)
	}
	if val != "2026" {
		t.Errorf("Expected 2026, got %s", val)
	}
	
	// Test expired cleaning
	repo.PutSchedule(ctx, "group:old", "group", 2, []byte("old"), "", -time.Minute)
	deleted, err := repo.CleanExpired(ctx)
	if err != nil {
		t.Fatalf("CleanExpired failed: %v", err)
	}
	if deleted != 1 {
		t.Errorf("Expected 1 deleted, got %d", deleted)
	}
}
