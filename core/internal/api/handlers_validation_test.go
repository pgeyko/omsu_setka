package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestValidation_GetChangesRejectsInvalidEntityType(t *testing.T) {
	s := setupTestServer()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/changes/unknown/123", nil)
	resp, err := s.App.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}
}

func TestValidation_GetChangesRejectsOutOfRangeID(t *testing.T) {
	s := setupTestServer()

	cases := []string{
		"/api/v1/changes/group/0",
		"/api/v1/changes/group/1000000",
	}

	for _, path := range cases {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		resp, err := s.App.Test(req)
		if err != nil {
			t.Fatalf("request failed for %s: %v", path, err)
		}
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400 for %s, got %d", path, resp.StatusCode)
		}
	}
}

func TestValidation_GetICalRejectsOutOfRangeID(t *testing.T) {
	s := setupTestServer()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/schedule/group/1000000/ical", nil)
	resp, err := s.App.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}
}

func TestValidation_UpdateNotificationSettingsRejectsMalformedBody(t *testing.T) {
	s := setupTestServer()

	req := httptest.NewRequest(http.MethodPatch, "/api/v1/notifications/settings", strings.NewReader("{"))
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.App.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}
}

func TestValidation_UpdateNotificationSettingsRejectsInvalidEntityType(t *testing.T) {
	s := setupTestServer()

	body := `{"fcm_token":"token","entity_type":"invalid","entity_id":123}`
	req := httptest.NewRequest(http.MethodPatch, "/api/v1/notifications/settings", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.App.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}
}

func TestValidation_GetNotificationSettingsRequiresHeaderToken(t *testing.T) {
	s := setupTestServer()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/notifications/settings/group/123", nil)
	resp, err := s.App.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}
}

func TestValidation_GetNotificationSettingsRejectsInvalidParams(t *testing.T) {
	s := setupTestServer()

	cases := []struct {
		name string
		path string
	}{
		{name: "invalid type", path: "/api/v1/notifications/settings/invalid/123"},
		{name: "invalid id zero", path: "/api/v1/notifications/settings/group/0"},
		{name: "invalid id too large", path: "/api/v1/notifications/settings/group/1000000"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			req.Header.Set("X-FCM-Token", "test-token")
			resp, err := s.App.Test(req)
			if err != nil {
				t.Fatalf("request failed: %v", err)
			}

			if resp.StatusCode != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d", resp.StatusCode)
			}
		})
	}
}
