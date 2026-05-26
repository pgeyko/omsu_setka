package upstream

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"omsu_mirror/internal/config"
	"omsu_mirror/internal/models"
)

func TestFetchGroups_Success(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		resp := models.UpstreamResponse{
			Success: true,
			Data:    json.RawMessage(`[{"id": 1, "name": "МБС-501", "real_group_id": 123}]`),
		}
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer ts.Close()

	cfg := &config.Config{
		UpstreamBaseURL:   ts.URL,
		UpstreamTimeout:   5 * time.Second,
		UpstreamRateLimit: 100,
		UpstreamMaxConns:  10,
		UpstreamUserAgent: "test/1.0",
	}
	client := NewClient(cfg)

	groups, err := client.FetchGroups(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(groups) != 1 {
		t.Fatalf("expected 1 group, got %d", len(groups))
	}
	if groups[0].Name != "МБС-501" {
		t.Errorf("expected group name 'МБС-501', got '%s'", groups[0].Name)
	}
	if groups[0].ID != 1 {
		t.Errorf("expected group id 1, got %d", groups[0].ID)
	}
	if groups[0].RealGroupID == nil || *groups[0].RealGroupID != 123 {
		t.Errorf("expected real_group_id 123, got %v", groups[0].RealGroupID)
	}
}

func TestFetchGroups_UpstreamError(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer ts.Close()

	cfg := &config.Config{
		UpstreamBaseURL:   ts.URL,
		UpstreamTimeout:   5 * time.Second,
		UpstreamRateLimit: 100,
		UpstreamMaxConns:  10,
		UpstreamUserAgent: "test/1.0",
	}
	client := NewClient(cfg)

	_, err := client.FetchGroups(context.Background())
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

func TestFetchGroups_APIError(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		resp := models.UpstreamResponse{
			Success: false,
			Message: "error msg",
		}
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer ts.Close()

	cfg := &config.Config{
		UpstreamBaseURL:   ts.URL,
		UpstreamTimeout:   5 * time.Second,
		UpstreamRateLimit: 100,
		UpstreamMaxConns:  10,
		UpstreamUserAgent: "test/1.0",
	}
	client := NewClient(cfg)

	_, err := client.FetchGroups(context.Background())
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if err.Error() != "upstream API error: error msg" {
		t.Errorf("expected error 'upstream API error: error msg', got '%s'", err.Error())
	}
}

func TestRetryOnFailure(t *testing.T) {
	var callCount int32

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count := atomic.AddInt32(&callCount, 1)
		if count == 1 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		resp := models.UpstreamResponse{
			Success: true,
			Data:    json.RawMessage(`[{"id": 1, "name": "test", "real_group_id": 123}]`),
		}
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer ts.Close()

	cfg := &config.Config{
		UpstreamBaseURL:   ts.URL,
		UpstreamTimeout:   5 * time.Second,
		UpstreamRateLimit: 100,
		UpstreamMaxConns:  10,
		UpstreamUserAgent: "test/1.0",
	}
	client := NewClient(cfg)

	groups, err := client.FetchGroups(context.Background())
	if err != nil {
		t.Fatalf("expected success after retry, got: %v", err)
	}
	if len(groups) != 1 {
		t.Fatalf("expected 1 group, got %d", len(groups))
	}
	if atomic.LoadInt32(&callCount) != 2 {
		t.Errorf("expected 2 requests (1 fail + 1 success), got %d", callCount)
	}
}
