package sync

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"omsu_mirror/internal/config"
	"omsu_mirror/internal/models"
	"omsu_mirror/internal/storage"
	"omsu_mirror/internal/upstream"
)

func TestRoomFloor(t *testing.T) {
	t.Parallel()
	cases := map[string]int{
		"4-313":          3,
		"(2-46) Зал":     4,
		"Г-715":          7,
		"4-0":            0,
		"409*":           0,
		"Д-1/12":         1,
		"11-Актовый зал": 0,
	}
	for name, want := range cases {
		if got := roomFloor(name); got != want {
			t.Errorf("roomFloor(%q) = %d, want %d", name, got, want)
		}
	}
}

func TestSyncAuditoryMaps(t *testing.T) {
	location, _ := time.LoadLocation("Asia/Omsk")
	today := time.Now().In(location)
	upstreamDay := today.Format("02.01.2006")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		building := r.URL.Path[len("/schedule/map/"):]
		resp := models.UpstreamResponse{
			Success: true,
			Data:    json.RawMessage(`[{"day":"` + upstreamDay + `","entries":[{"day":"` + upstreamDay + `","times":[1,2],"building":"` + building + `","auditory_id":7001,"auditory_name":"` + building + `-715","publishDate":"` + upstreamDay + `"}]}]`),
		}
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	cfg := &config.Config{
		SQLitePath:         filepath.Join(t.TempDir(), "map.db"),
		SQLiteWALMode:      false,
		UpstreamBaseURL:    server.URL,
		UpstreamTimeout:    5 * time.Second,
		UpstreamMapTimeout: 5 * time.Second,
		UpstreamRateLimit:  100,
		UpstreamMaxConns:   10,
		UpstreamUserAgent:  "test/1.0",
		SyncMapInterval:    time.Hour,
		MapRetentionDays:   14,
	}
	db, err := storage.NewSQLite(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	repo := storage.NewRoomOccupancyRepo(db)
	client := upstream.NewClient(cfg)
	syncer := NewSyncer(cfg, &Deps{Client: client, RoomOccupancyRepo: repo})

	if err := syncer.SyncAuditoryMaps(context.Background()); err != nil {
		t.Fatalf("SyncAuditoryMaps: %v", err)
	}
	rows, err := repo.GetBuildingDay(context.Background(), "4", today.Format("2006-01-02"))
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].RoomName != "4-715" || rows[0].Floor != 7 {
		t.Fatalf("unexpected rows: %+v", rows)
	}
	updated, err := repo.GetBuildingUpdate(context.Background(), "4")
	if err != nil || updated.IsZero() {
		t.Fatalf("expected building update, got %v, %v", updated, err)
	}
}
