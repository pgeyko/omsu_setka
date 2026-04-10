package api

import (
	"net/http"
	"net/http/httptest"
	"omsu_mirror/internal/cache"
	"omsu_mirror/internal/config"
	"omsu_mirror/internal/notifications"
	"omsu_mirror/internal/storage"
	"omsu_mirror/internal/sync"
	"omsu_mirror/internal/upstream"
	"testing"
	"time"
)

func setupTestServer() *Server {
	cfg := &config.Config{
		SQLitePath:         ":memory:",
		SQLiteWALMode:      false,
		SQLiteBusyTimeout:  500,
		ServerPort:         "8080",
		RateLimitGeneral:   10,
		RateLimitSearch:    5,
		RateLimitWindow:    time.Minute,
		CORSAllowedOrigins: "*",
		UpstreamRateLimit:  2,
	}

	db, _ := storage.NewSQLite(cfg)
	dictRepo := storage.NewDictRepo(db)
	scheduleRepo := storage.NewScheduleRepo(db)
	incidentRepo := storage.NewIncidentRepo(db)
	changeRepo := storage.NewChangeRepo(db)
	subscriptionRepo := storage.NewSubscriptionRepo(db)
	fcm := notifications.NewFCMClient()

	client := upstream.NewClient(cfg)
	memoryCache := cache.NewMemoryCache()
	searchIndex := cache.NewSearchIndex()
	syncer := sync.NewSyncer(cfg, client, dictRepo, scheduleRepo, memoryCache, searchIndex, incidentRepo, changeRepo, subscriptionRepo, fcm)

	return NewServer(cfg, client, dictRepo, scheduleRepo, memoryCache, searchIndex, syncer, incidentRepo, changeRepo, subscriptionRepo, fcm)
}

func TestSecurityHeaders(t *testing.T) {
	s := setupTestServer()
	req := httptest.NewRequest("GET", "/api/v1/health", nil)
	resp, _ := s.App.Test(req)

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	headers := []string{"X-Content-Type-Options", "X-Frame-Options", "X-XSS-Protection", "Referrer-Policy"}
	for _, h := range headers {
		if resp.Header.Get(h) == "" {
			t.Errorf("Expected header %s to be present", h)
		}
	}
}

func TestRateLimiter(t *testing.T) {
	s := setupTestServer()
	
	// Exhaust rate limit (limit is 10 for general)
	for i := 0; i < 10; i++ {
		req := httptest.NewRequest("GET", "/api/v1/health", nil)
		resp, _ := s.App.Test(req, 10)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("Expected status 200 at request %d, got %d", i+1, resp.StatusCode)
		}
	}

	// 11th request should fail
	req := httptest.NewRequest("GET", "/api/v1/health", nil)
	resp, _ := s.App.Test(req, 10)
	if resp.StatusCode != http.StatusTooManyRequests {
		t.Errorf("Expected status 429, got %d", resp.StatusCode)
	}
}

func TestETag(t *testing.T) {
	s := setupTestServer()
	req := httptest.NewRequest("GET", "/api/v1/sync/status", nil)
	resp, _ := s.App.Test(req)

	etag := resp.Header.Get("ETag")
	if etag == "" {
		t.Fatal("Expected ETag header to be present")
	}

	// Test If-None-Match
	req2 := httptest.NewRequest("GET", "/api/v1/sync/status", nil)
	req2.Header.Set("If-None-Match", etag)
	resp2, _ := s.App.Test(req2)

	if resp2.StatusCode != http.StatusNotModified {
		t.Errorf("Expected status 304, got %d", resp2.StatusCode)
	}
}
