package api

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"omsu_mirror/internal/models"
	"omsu_mirror/internal/storage"
)

func mapTestServer(t *testing.T) *Server {
	t.Helper()
	s := setupTestServer()
	ctx := context.Background()
	if err := s.DictRepo.UpsertAuditories(ctx, []models.Auditory{
		{ID: 2635, Name: "4-112", Building: "4"},
		{ID: 1467, Name: "4-313", Building: "4"},
		{ID: 1548, Name: "7-112", Building: "7"},
	}); err != nil {
		t.Fatal(err)
	}
	if err := s.RoomOccupancyRepo.ReplaceBuildingDays(ctx, "4", []storage.RoomOccupancy{
		{Building: "4", Day: "2026-11-21", RoomID: 1467, RoomName: "4-313", Floor: 3, BusyTimes: []int{3}},
	}); err != nil {
		t.Fatal(err)
	}
	return s
}

func TestAuditoryMap(t *testing.T) {
	t.Parallel()
	s := mapTestServer(t)
	req := httptest.NewRequest("GET", "/api/v1/auditories/map?building=4&date=2026-11-21", nil)
	resp, err := s.App.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	var body struct {
		Data mapResponse `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if !body.Data.Ready || len(body.Data.Rooms) != 2 {
		t.Fatalf("unexpected map response: %+v", body.Data)
	}
	if body.Data.Rooms[0].Name != "4-112" || body.Data.Rooms[0].Floor != 1 {
		t.Errorf("unexpected first room: %+v", body.Data.Rooms[0])
	}
	if body.Data.Rooms[1].Name != "4-313" || len(body.Data.Rooms[1].Busy) != 1 || body.Data.Rooms[1].Busy[0] != 3 {
		t.Errorf("unexpected busy room: %+v", body.Data.Rooms[1])
	}
}

func TestFreeAuditories(t *testing.T) {
	t.Parallel()
	s := mapTestServer(t)
	req := httptest.NewRequest("GET", "/api/v1/auditories/free?building=4&date=2026-11-21&pair=3", nil)
	resp, err := s.App.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var body struct {
		Data struct {
			Free []mapRoom `json:"free"`
			Busy []mapRoom `json:"busy"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Data.Free) != 1 || body.Data.Free[0].Name != "4-112" {
		t.Errorf("unexpected free rooms: %+v", body.Data.Free)
	}
	if len(body.Data.Busy) != 1 || body.Data.Busy[0].Name != "4-313" {
		t.Errorf("unexpected busy rooms: %+v", body.Data.Busy)
	}
}

func TestAuditoryMapRejectsInvalidParams(t *testing.T) {
	t.Parallel()
	s := mapTestServer(t)
	cases := []string{
		"/api/v1/auditories/map?building=&date=2026-11-21",
		"/api/v1/auditories/map?building=4&date=21.11.2026",
		"/api/v1/auditories/free?building=4&date=2026-11-21&pair=9",
	}
	for _, path := range cases {
		req := httptest.NewRequest("GET", path, nil)
		resp, err := s.App.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != 400 {
			t.Errorf("%s: expected 400, got %d", path, resp.StatusCode)
		}
	}
}
