package api

import (
	"context"
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"omsu_mirror/internal/models"
)

func TestShareGroupPage(t *testing.T) {
	s := setupTestServer()
	ctx := context.Background()
	if err := s.DictRepo.UpsertGroups(ctx, []models.Group{{ID: 7, Name: "МБС-501-О-01"}}); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest("GET", "/api/v1/share/group/7", nil)
	req.Host = "s.pgeyko.ru"
	resp, err := s.App.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	if contentType := resp.Header.Get("Content-Type"); !strings.Contains(contentType, "text/html") {
		t.Fatalf("expected html, got %q", contentType)
	}
	body, _ := io.ReadAll(resp.Body)
	html := string(body)
	for _, expected := range []string{
		"МБС-501-О-01",
		`property="og:title"`,
		`https://s.pgeyko.ru/g/7`,
		`https://s.pgeyko.ru/og.png`,
		`share-redirect.js`,
	} {
		if !strings.Contains(html, expected) {
			t.Errorf("share page is missing %q", expected)
		}
	}
}

func TestShareGroupNotFound(t *testing.T) {
	s := setupTestServer()
	req := httptest.NewRequest("GET", "/api/v1/share/group/999", nil)
	resp, err := s.App.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 404 {
		t.Fatalf("expected 404, got %d", resp.StatusCode)
	}
}
