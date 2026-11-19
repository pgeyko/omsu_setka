package api

import (
	"testing"

	"omsu_mirror/internal/models"
	"omsu_mirror/internal/storage"
)

func TestCollectSubgroups(t *testing.T) {
	days := []models.Day{
		{Lessons: []models.Lesson{
			{SubgroupNumber: "2"},
			{SubgroupNumber: "1"},
			{SubgroupName: "МБС-501-О-01/3"},
			{},
		}},
		{Lessons: []models.Lesson{{SubgroupNumber: "2"}}},
	}
	got := collectSubgroups(days)
	want := []string{"1", "2", "3"}
	if len(got) != len(want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("expected %v, got %v", want, got)
		}
	}
	if result := collectSubgroups(nil); len(result) != 0 {
		t.Fatalf("expected no subgroups, got %v", result)
	}
}

func TestEnrichScheduleChangeParsesLegacyRawData(t *testing.T) {
	item := storage.ScheduleChange{
		ChangeType: "added",
		NewData:    `{"id":1,"time":4,"lesson":"Иностранный язык Лаб","subgroupName":"МБС-501-О-01/2"}`,
	}
	enrichScheduleChange(&item)
	if item.Pair != 4 {
		t.Fatalf("expected pair 4, got %d", item.Pair)
	}
	if item.Subject != "Иностранный язык Лаб" {
		t.Fatalf("expected subject from raw data, got %q", item.Subject)
	}
	if item.Subgroup != "2" {
		t.Fatalf("expected subgroup 2, got %q", item.Subgroup)
	}
}

func TestEnrichScheduleChangeKeepsNormalizedFields(t *testing.T) {
	item := storage.ScheduleChange{
		Pair: 2, Subject: "Базы данных", Subgroup: "1",
		NewData: `{"time":4,"lesson":"Другое"}`,
	}
	enrichScheduleChange(&item)
	if item.Pair != 2 || item.Subject != "Базы данных" || item.Subgroup != "1" {
		t.Fatalf("normalized fields must win: %#v", item)
	}
}

func TestScheduleDayMap(t *testing.T) {
	days := []models.Day{
		{Day: "18.11.2026", Date: "2026-11-18", Lessons: []models.Lesson{{ID: 10}}},
		{Day: "19.11.2026", Lessons: []models.Lesson{{ID: 20}}},
	}
	got := scheduleDayMap(days)
	if got[10] != "2026-11-18" || got[20] != "2026-11-19" {
		t.Fatalf("unexpected day map: %#v", got)
	}
}
