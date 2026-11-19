package scheduleutil

import (
	"testing"

	"omsu_mirror/internal/models"
)

func TestNormalize(t *testing.T) {
	days := []models.Day{{
		Day: "18.11.2026",
		Lessons: []models.Lesson{
			{ID: 1, AuditCorps: "4-308", SubgroupName: "ЮСС-003-О-02/1"},
			{ID: 2, AuditCorps: "(6-115) Бассейн", SubgroupName: "Подгруппа 2"},
			{ID: 3, AuditCorps: "Дистант"},
		},
	}}
	Normalize(days)
	if days[0].Date != "2026-11-18" {
		t.Errorf("date = %q", days[0].Date)
	}
	if days[0].Lessons[0].SubgroupNumber != "1" || days[0].Lessons[0].Building != "4" || days[0].Lessons[0].Room != "308" {
		t.Errorf("unexpected first lesson: %#v", days[0].Lessons[0])
	}
	if days[0].Lessons[1].SubgroupNumber != "2" || days[0].Lessons[1].Building != "6" || days[0].Lessons[1].Room != "115" {
		t.Errorf("unexpected second lesson: %#v", days[0].Lessons[1])
	}
	if days[0].Lessons[2].Building != "" || days[0].Lessons[2].Room != "" {
		t.Errorf("virtual room must stay empty: %#v", days[0].Lessons[2])
	}
}
