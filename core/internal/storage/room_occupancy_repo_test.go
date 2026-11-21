package storage

import (
	"context"
	"testing"
)

func TestRoomOccupancyRepo(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	repo := NewRoomOccupancyRepo(db)
	ctx := context.Background()

	rows := []RoomOccupancy{
		{Building: "4", Day: "2026-11-21", RoomID: 1, RoomName: "4-112", Floor: 1, BusyTimes: []int{1, 3}},
		{Building: "4", Day: "2026-11-21", RoomID: 2, RoomName: "4-313", Floor: 3, BusyTimes: []int{}},
	}
	if err := repo.ReplaceBuildingDays(ctx, "4", rows); err != nil {
		t.Fatalf("ReplaceBuildingDays: %v", err)
	}

	got, err := repo.GetBuildingDay(ctx, "4", "2026-11-21")
	if err != nil {
		t.Fatalf("GetBuildingDay: %v", err)
	}
	if len(got) != 2 || got[0].RoomName != "4-112" || len(got[0].BusyTimes) != 2 {
		t.Fatalf("unexpected rows: %+v", got)
	}

	updated, err := repo.GetLastMapUpdate(ctx)
	if err != nil {
		t.Fatalf("GetLastMapUpdate: %v", err)
	}
	if updated.IsZero() {
		t.Fatal("expected non-zero update time")
	}

	count, err := repo.Count(ctx)
	if err != nil || count != 2 {
		t.Fatalf("Count = %d, %v", count, err)
	}

	if err := repo.ReplaceBuildingDays(ctx, "4", []RoomOccupancy{{Building: "4", Day: "2026-11-22", RoomID: 1, RoomName: "4-112", Floor: 1, BusyTimes: []int{2}}}); err != nil {
		t.Fatalf("replace again: %v", err)
	}
	old, err := repo.GetBuildingDay(ctx, "4", "2026-11-21")
	if err != nil || len(old) != 0 {
		t.Fatalf("old day should be removed, got %+v, %v", old, err)
	}
}
