package storage

import (
	"context"
	"testing"
	"time"
)

func TestOutboxRepo_EnqueueAndDedupe(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	repo := NewOutboxRepo(db)
	ctx := context.Background()

	msg := OutboxMessage{
		FCMToken: "token", Title: "title", Body: "body",
		Data: `{"type":"group","id":"1","kind":"digest"}`,
		Kind: "digest", SubscriptionToken: "token",
		EntityType: "group", EntityID: 1, MarkDate: "2026-11-19",
	}
	if err := repo.Enqueue(ctx, msg); err != nil {
		t.Fatal(err)
	}
	if err := repo.Enqueue(ctx, msg); err != nil {
		t.Fatal(err)
	}

	pending, err := repo.GetPending(ctx, time.Now(), 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(pending) != 1 {
		t.Fatalf("expected deduplicated outbox message, got %d", len(pending))
	}
	if pending[0].DataMap()["type"] != "group" {
		t.Errorf("unexpected data: %v", pending[0].DataMap())
	}

	if err := repo.MarkRetry(ctx, pending[0].ID, 1, time.Now(), "temporary"); err != nil {
		t.Fatal(err)
	}
	pending, err = repo.GetPending(ctx, time.Now().Add(-time.Second), 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(pending) != 0 {
		t.Fatalf("retry should be in the future, got %d", len(pending))
	}

	if err := repo.MarkSent(ctx, 1); err != nil {
		t.Fatal(err)
	}
	if _, err := db.DB.Exec(`UPDATE notification_outbox SET created_at = ? WHERE id = 1`, time.Now().AddDate(0, 0, -40).Format("2006-01-02 15:04:05")); err != nil {
		t.Fatal(err)
	}
	removed, err := repo.CleanOld(ctx, time.Now().AddDate(0, 0, -30))
	if err != nil {
		t.Fatal(err)
	}
	if removed != 1 {
		t.Errorf("expected one cleaned message, got %d", removed)
	}
}
