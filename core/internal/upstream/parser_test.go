package upstream

import (
	"encoding/json"
	"omsu_mirror/internal/models"
	"testing"
)

func TestParseUpstreamSchedule(t *testing.T) {
	jsonData := `{
		"success": true,
		"data": [
			{
				"day": "04.05.2026",
				"lessons": [
					{
						"id": 54578562,
						"time": 1,
						"faculty": "ФМС",
						"lesson": "Алгебра Лек",
						"type_work": "Лек",
						"teacher": "Бесценный Игорь Павлович",
						"group": "МБС-501-О-01",
						"auditCorps": "4-308",
						"publishDate": "06.04.2026 13:26:31"
					},
					{
						"id": 54578469,
						"time": 2,
						"faculty": "ФМС",
						"lesson": "Физра",
						"type_work": "Прак",
						"teacher": "Казарян А.А.",
						"group": "МБС-501-О-01",
						"auditCorps": "7-139",
						"subgroupName": "Подгруппа 1",
						"publishDate": "06.04.2026 13:26:31"
					}
				]
			}
		]
	}`

	var wrapper models.UpstreamResponse
	if err := json.Unmarshal([]byte(jsonData), &wrapper); err != nil {
		t.Fatalf("Failed to unmarshal wrapper: %v", err)
	}

	if !wrapper.Success {
		t.Fatalf("Expected success to be true")
	}

	var days []models.Day
	if err := json.Unmarshal(wrapper.Data, &days); err != nil {
		t.Fatalf("Failed to unmarshal days: %v", err)
	}

	if len(days) != 1 {
		t.Fatalf("Expected 1 day, got %d", len(days))
	}

	day := days[0]
	if day.Day != "04.05.2026" {
		t.Errorf("Expected day 04.05.2026, got %s", day.Day)
	}

	if len(day.Lessons) != 2 {
		t.Fatalf("Expected 2 lessons, got %d", len(day.Lessons))
	}

	l1 := day.Lessons[0]
	if l1.ID != 54578562 || l1.Time != 1 || l1.Lesson != "Алгебра Лек" {
		t.Errorf("Lesson 1 data mismatch: %+v", l1)
	}

	l2 := day.Lessons[1]
	if l2.SubgroupName != "Подгруппа 1" {
		t.Errorf("Expected subgroup 'Подгруппа 1', got '%s'", l2.SubgroupName)
	}
}

func TestParseUpstreamError(t *testing.T) {
	jsonData := `{
		"success": false,
		"message": "Internal Server Error",
		"code": "500"
	}`

	var wrapper models.UpstreamResponse
	if err := json.Unmarshal([]byte(jsonData), &wrapper); err != nil {
		t.Fatalf("Failed to unmarshal wrapper: %v", err)
	}

	if wrapper.Success {
		t.Errorf("Expected success to be false")
	}

	if wrapper.Message != "Internal Server Error" {
		t.Errorf("Expected message 'Internal Server Error', got '%s'", wrapper.Message)
	}
}
