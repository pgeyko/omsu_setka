package diff

import (
	"testing"

	"omsu_mirror/internal/models"
)

func TestNormalizeSubgroup(t *testing.T) {
	tests := map[string]string{
		"":                     "",
		"1":                    "1",
		"Подгруппа 1":          "1",
		"1 подгруппа":          "1",
		"МБС-501-О-01/2":       "2",
		"МБС-501-О-01/1":       "1",
		"  Подгруппа 2  ":      "2",
		"группа без подгруппы": "",
		"ЮСС-003-О-02":         "",
	}
	for input, want := range tests {
		if got := NormalizeSubgroup(input); got != want {
			t.Errorf("NormalizeSubgroup(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestLessons(t *testing.T) {
	oldL := models.Lesson{
		ID: 1, Time: 4, Lesson: "Базы данных", TypeWork: "Лаб",
		Teacher: "Кузнецов Д. С.", Group: "ЮСС-003-О-02",
		AuditCorps: "4-312", SubgroupName: "ЮСС-003-О-02/1",
	}
	newL := oldL
	newL.AuditCorps = "4-308"
	newL.TypeWork = "Прак"
	newL.Teacher = "Иванов И. И."

	changes := Lessons(oldL, newL, "2026-11-18", "2026-11-18")
	if len(changes) != 3 {
		t.Fatalf("expected 3 changes, got %d: %#v", len(changes), changes)
	}
	got := map[string]Change{}
	for _, c := range changes {
		got[c.Field] = c
	}
	if got["auditCorps"].Old != "4-312" || got["auditCorps"].New != "4-308" {
		t.Errorf("unexpected room change: %#v", got["auditCorps"])
	}
	if got["type_work"].Old != "Лаб" || got["type_work"].New != "Прак" {
		t.Errorf("unexpected type change: %#v", got["type_work"])
	}
	if got["teacher"].New != "Иванов И. И." {
		t.Errorf("unexpected teacher change: %#v", got["teacher"])
	}
}

func TestEqualIncludesTypeAndGroup(t *testing.T) {
	a := models.Lesson{ID: 1, Time: 2, Lesson: "Физика", TypeWork: "Лек", Group: "A"}
	b := a
	if !Equal(a, b) {
		t.Fatal("identical lessons must be equal")
	}
	b.TypeWork = "Прак"
	if Equal(a, b) {
		t.Fatal("type change must be detected")
	}
	b = a
	b.Group = "B"
	if Equal(a, b) {
		t.Fatal("group change must be detected")
	}
}
