package storage

import (
	"context"
	"testing"
)

func TestIncidentRepo_LogAndGet(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	repo := NewIncidentRepo(db)
	ctx := context.Background()

	err := repo.LogIncident(ctx, "down", "Upstream is down", "Timeout")
	if err != nil {
		t.Fatalf("LogIncident failed: %v", err)
	}

	incidents, err := repo.GetIncidents(ctx, 10, 0)
	if err != nil {
		t.Fatalf("GetIncidents failed: %v", err)
	}
	if len(incidents) != 1 {
		t.Fatalf("Expected 1 incident, got %d", len(incidents))
	}
	if incidents[0].EventType != "down" {
		t.Errorf("Expected event_type 'down', got '%s'", incidents[0].EventType)
	}

	// Test CleanOld
	repo.LogIncident(ctx, "up", "Upstream is up", "")
	affected, err := repo.CleanOld(ctx, 1)
	if err != nil {
		t.Fatalf("CleanOld failed: %v", err)
	}
	if affected != 1 {
		t.Errorf("Expected 1 row affected, got %d", affected)
	}
}
