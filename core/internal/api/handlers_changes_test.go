package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"omsu_mirror/internal/diff"
	"omsu_mirror/internal/models"
	"omsu_mirror/internal/storage"
)

func TestChangesFeed(t *testing.T) {
	s := setupTestServer()
	ctx := context.Background()

	if err := s.ChangeRepo.LogChange(ctx, storage.ScheduleChange{
		EntityType: "group", EntityID: 1, ChangeType: "modified", LessonID: 10,
		Day: "2026-11-18", Pair: 4, Subgroup: "1", Subject: "Базы данных",
		Diff: []diff.Change{{Field: "auditCorps", Label: "аудитория", Old: "4-312", New: "4-308"}},
	}); err != nil {
		t.Fatal(err)
	}
	if err := s.ChangeRepo.LogChange(ctx, storage.ScheduleChange{
		EntityType: "group", EntityID: 1, ChangeType: "added", LessonID: 11,
		Day: "2026-11-19", Pair: 2, Subject: "Физика",
	}); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/changes?entity_type=group&entity_id=1&limit=1&subgroup=1", nil)
	resp, err := s.App.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	defer resp.Body.Close()

	var body struct {
		Data struct {
			Items        []storage.ScheduleChange `json:"items"`
			NextBeforeID int                      `json:"next_before_id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Data.Items) != 1 {
		t.Fatalf("expected one item, got %d", len(body.Data.Items))
	}
	item := body.Data.Items[0]
	if item.Day != "2026-11-19" || item.Pair != 2 || item.Subject != "Физика" {
		t.Errorf("unexpected item: %#v", item)
	}
	if body.Data.NextBeforeID == 0 {
		t.Errorf("expected next_before_id for a full page")
	}

	allReq := httptest.NewRequest(http.MethodGet, "/api/v1/changes?scope=all&limit=10", nil)
	allResp, err := s.App.Test(allReq)
	if err != nil {
		t.Fatal(err)
	}
	if allResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for all changes, got %d", allResp.StatusCode)
	}

	oldReq := httptest.NewRequest(http.MethodGet, "/api/v1/changes/group/1", nil)
	oldResp, err := s.App.Test(oldReq)
	if err != nil {
		t.Fatal(err)
	}
	if oldResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for old changes route, got %d", oldResp.StatusCode)
	}
}

func TestNotificationSettingsPatchPreservesOmittedFields(t *testing.T) {
	s := setupTestServer()
	ctx := context.Background()

	if err := s.SubscriptionRepo.Subscribe(ctx, storage.Subscription{
		FCMToken: "token", EntityType: "group", EntityID: 1,
		NotifyOnChange: true, NotifyDailyDigest: true,
		DigestTime: "19:00", Subgroup: "1", Timezone: "Asia/Omsk",
		BeforeMinutes: 30,
	}); err != nil {
		t.Fatal(err)
	}

	body := `{"fcm_token":"token","entity_type":"group","entity_id":1,"notify_daily_digest":false}`
	req := httptest.NewRequest(http.MethodPatch, "/api/v1/notifications/settings", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.App.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	saved, err := s.SubscriptionRepo.GetAllSubscriptionsByToken(ctx, "token")
	if err != nil {
		t.Fatal(err)
	}
	if len(saved) != 1 {
		t.Fatalf("expected one subscription, got %d", len(saved))
	}
	sub := saved[0]
	if sub.NotifyDailyDigest {
		t.Error("notify_daily_digest must be false")
	}
	if !sub.NotifyOnChange {
		t.Error("notify_on_change must be preserved")
	}
	if sub.DigestTime != "19:00" || sub.Subgroup != "1" || sub.BeforeMinutes != 30 {
		t.Errorf("omitted fields were reset: %#v", sub)
	}
}

func TestChangesFeedSince(t *testing.T) {
	s := setupTestServer()
	ctx := context.Background()
	if err := s.ChangeRepo.LogChange(ctx, storage.ScheduleChange{
		EntityType: "group", EntityID: 1, ChangeType: "added", LessonID: 1, Day: "2026-11-18",
	}); err != nil {
		t.Fatal(err)
	}
	since := time.Now().Add(-time.Minute).UTC().Format(time.RFC3339)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/changes?entity_type=group&entity_id=1&since="+since, nil)
	resp, err := s.App.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestSubscribeRespectsNotifyOnChangeAndEntity(t *testing.T) {
	s := setupTestServer()
	ctx := context.Background()
	realID := 42
	if err := s.DictRepo.UpsertGroups(ctx, []models.Group{{ID: 7, Name: "ЮСС-003-О-02", RealGroupID: &realID}}); err != nil {
		t.Fatal(err)
	}

	body := `{"fcm_token":"token","entity_type":"group","entity_id":42,"notify_on_change":false}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/subscribe", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.App.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	subs, err := s.SubscriptionRepo.GetAllSubscriptionsByToken(ctx, "token")
	if err != nil {
		t.Fatal(err)
	}
	if len(subs) != 1 || subs[0].NotifyOnChange {
		t.Fatalf("notify_on_change=false must be respected: %#v", subs)
	}

	missing := `{"fcm_token":"token2","entity_type":"group","entity_id":999,"notify_on_change":true}`
	missingReq := httptest.NewRequest(http.MethodPost, "/api/v1/subscribe", strings.NewReader(missing))
	missingReq.Header.Set("Content-Type", "application/json")
	missingResp, err := s.App.Test(missingReq)
	if err != nil {
		t.Fatal(err)
	}
	if missingResp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 for missing entity, got %d", missingResp.StatusCode)
	}
}
