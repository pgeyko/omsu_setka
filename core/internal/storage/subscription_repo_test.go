package storage

import (
	"context"
	"testing"
)

func TestSubscriptionRepo_GetTokensForChange(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	repo := NewSubscriptionRepo(db)
	ctx := context.Background()

	subs := []Subscription{
		{FCMToken: "all", EntityType: "group", EntityID: 1, NotifyOnChange: true},
		{FCMToken: "one", EntityType: "group", EntityID: 1, NotifyOnChange: true, Subgroup: "1"},
		{FCMToken: "two", EntityType: "group", EntityID: 1, NotifyOnChange: true, Subgroup: "2"},
		{FCMToken: "legacy", EntityType: "group", EntityID: 1, NotifyOnChange: true, Subgroup: "Подгруппа 1"},
		{FCMToken: "off", EntityType: "group", EntityID: 1, NotifyOnChange: false, Subgroup: "1"},
	}
	for _, sub := range subs {
		if err := repo.Subscribe(ctx, sub); err != nil {
			t.Fatal(err)
		}
	}

	tokens, err := repo.GetTokensForChange(ctx, "group", 1, []string{"1"}, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(tokens) != 3 {
		t.Fatalf("expected 3 tokens for subgroup 1, got %d: %v", len(tokens), tokens)
	}
	seen := map[string]bool{}
	for _, token := range tokens {
		seen[token] = true
	}
	for _, want := range []string{"all", "one", "legacy"} {
		if !seen[want] {
			t.Errorf("token %s is missing: %v", want, tokens)
		}
	}
	if seen["two"] || seen["off"] {
		t.Errorf("unexpected tokens: %v", tokens)
	}

	global, err := repo.GetTokensForChange(ctx, "group", 1, nil, true)
	if err != nil {
		t.Fatal(err)
	}
	if len(global) != 4 {
		t.Fatalf("global change should reach all enabled subscriptions, got %d", len(global))
	}

	keys, err := repo.GetScheduleKeys(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(keys) != 1 || keys[0] != "group:1" {
		t.Errorf("unexpected schedule keys: %v", keys)
	}
}
