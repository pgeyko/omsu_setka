package webhook

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"omsu_mirror/internal/config"
	"omsu_mirror/internal/storage"
)

func setupTestDB(t *testing.T) *storage.SQLite {
	t.Helper()
	cfg := &config.Config{
		SQLitePath:        ":memory:",
		SQLiteWALMode:     false,
		SQLiteBusyTimeout: 1000,
	}
	db, err := storage.NewSQLite(cfg)
	if err != nil {
		t.Fatalf("Failed to create in-memory SQLite: %v", err)
	}
	return db
}

func TestComputeHMAC(t *testing.T) {
	data := []byte("test-data")
	secret := "secret-key"

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(data)
	expected := hex.EncodeToString(mac.Sum(nil))

	result := computeHMAC(data, secret)
	if result != expected {
		t.Errorf("computeHMAC() = %s, want %s", result, expected)
	}
}

func TestPayloadGroupID(t *testing.T) {
	tests := []struct {
		name       string
		entityType string
		entityID   int
		wantGroup  int
	}{
		{"group entity", "group", 42, 42},
		{"tutor entity", "tutor", 42, 0},
		{"auditory entity", "auditory", 99, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var groupID int
			if tt.entityType == "group" {
				groupID = tt.entityID
			}
			p := Payload{
				Type:       "change",
				GroupID:    groupID,
				EntityType: tt.entityType,
				EntityID:   tt.entityID,
				Changes:    []Change{{Date: "2024-01-01", Pair: 1, Field: "subject", Old: "Old", New: "New", Subject: "Test"}},
			}
			data, err := json.Marshal(p)
			if err != nil {
				t.Fatal(err)
			}
			var result map[string]interface{}
			if err := json.Unmarshal(data, &result); err != nil {
				t.Fatal(err)
			}
			gid, ok := result["group_id"].(float64)
			if !ok {
				t.Fatal("group_id field missing or not a number")
			}
			if int(gid) != tt.wantGroup {
				t.Errorf("group_id = %d, want %d", int(gid), tt.wantGroup)
			}
		})
	}
}

func TestWebhookDelivery(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	repo := storage.NewWebhookRepo(db)
	ctx := context.Background()

	var (
		mu        sync.Mutex
		captured  bool
		signature string
		timestamp string
		eventID   string
		bodyBytes []byte
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		signature = r.Header.Get("X-Webhook-Signature")
		timestamp = r.Header.Get("X-Webhook-Timestamp")
		eventID = r.Header.Get("X-Webhook-Event-ID")
		var err error
		bodyBytes, err = io.ReadAll(r.Body)
		r.Body.Close()
		if err != nil {
			t.Errorf("Failed to read body: %v", err)
		}
		captured = true
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	_, err := repo.Create(ctx, storage.WebhookSubscriber{
		URL:      server.URL,
		Secret:   "test-secret",
		GroupIDs: []int{},
		Enabled:  true,
	})
	if err != nil {
		t.Fatalf("Failed to create subscriber: %v", err)
	}

	notifier := NewNotifier(repo, 5*time.Second, 3, 100*time.Millisecond)
	changes := []Change{
		{Date: "2024-01-01", Pair: 1, Field: "subject", Old: "Math", New: "Physics", Subject: "GroupA"},
	}
	notifier.Notify(ctx, "group", 123, changes)

	mu.Lock()
	defer mu.Unlock()
	if !captured {
		t.Fatal("Request was not captured by test server")
	}

	if signature == "" {
		t.Error("Missing X-Webhook-Signature header")
	}
	if timestamp == "" {
		t.Error("Missing X-Webhook-Timestamp header")
	}
	if eventID == "" {
		t.Error("Missing X-Webhook-Event-ID header")
	}

	var payload Payload
	if err := json.Unmarshal(bodyBytes, &payload); err != nil {
		t.Fatalf("Failed to unmarshal payload: %v", err)
	}
	if payload.Type != "change" {
		t.Errorf("payload.Type = %q, want %q", payload.Type, "change")
	}
	if payload.GroupID != 123 {
		t.Errorf("payload.GroupID = %d, want %d", payload.GroupID, 123)
	}
	if payload.EntityType != "group" {
		t.Errorf("payload.EntityType = %q, want %q", payload.EntityType, "group")
	}
	if payload.EntityID != 123 {
		t.Errorf("payload.EntityID = %d, want %d", payload.EntityID, 123)
	}
	if len(payload.Changes) != 1 {
		t.Errorf("len(payload.Changes) = %d, want %d", len(payload.Changes), 1)
	}
	if payload.OccurredAt == "" {
		t.Error("payload.OccurredAt is empty")
	}
	if payload.EventID == "" {
		t.Error("payload.EventID is empty")
	}

	expectedSig := computeHMAC([]byte(timestamp+"."+string(bodyBytes)), "test-secret")
	if signature != expectedSig {
		t.Errorf("signature mismatch:\ngot:  %s\nwant: %s", signature, expectedSig)
	}
}

func TestWebhookRetry(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	repo := storage.NewWebhookRepo(db)
	ctx := context.Background()

	var (
		mu           sync.Mutex
		attemptCount int
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		attemptCount++
		current := attemptCount
		mu.Unlock()
		if current < 3 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	_, err := repo.Create(ctx, storage.WebhookSubscriber{
		URL:      server.URL,
		Secret:   "test-secret",
		GroupIDs: []int{},
		Enabled:  true,
	})
	if err != nil {
		t.Fatalf("Failed to create subscriber: %v", err)
	}

	notifier := NewNotifier(repo, 5*time.Second, 3, 50*time.Millisecond)
	changes := []Change{
		{Date: "2024-01-01", Pair: 1, Field: "subject", Old: "Math", New: "Physics", Subject: "GroupA"},
	}
	notifier.Notify(ctx, "group", 123, changes)

	mu.Lock()
	defer mu.Unlock()
	if attemptCount != 3 {
		t.Errorf("Expected 3 HTTP attempts, got %d", attemptCount)
	}
}
