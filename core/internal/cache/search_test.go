package cache

import (
	"omsu_mirror/internal/models"
	"testing"
)

func TestSearchIndex(t *testing.T) {
	idx := NewSearchIndex()

	groups := []models.Group{
		{ID: 1, Name: "МБС-501"},
		{ID: 2, Name: "МБС-502"},
	}
	tutors := []models.Tutor{
		{ID: 1, Name: "Бесценный Игорь Павлович"},
		{ID: 2, Name: "Королёв Александр Петрович"},
	}
	auditories := []models.Auditory{
		{ID: 1, Name: "4-308", Building: "4"},
	}

	idx.Build(groups, tutors, auditories)

	tests := []struct {
		name       string
		query      string
		filterType string
		limit      int
		expected   int
		firstMatch string
	}{
		{"Basic prefix", "мбс", "all", 10, 2, "МБС-501"},
		{"Case insensitive", "БЕСЦЕННЫЙ", "all", 10, 1, "Бесценный Игорь Павлович"},
		{"Normalization ё -> е", "королев", "all", 10, 1, "Королёв Александр Петрович"},
		{"Normalization with ё in query", "королёв", "all", 10, 1, "Королёв Александр Петрович"},
		{"Filter by type", "мбс", "group", 10, 2, "МБС-501"},
		{"Space in query", "мбс 501", "all", 10, 1, "МБС-501"},
		{"No dash in query", "мбс501", "all", 10, 1, "МБС-501"},
		{"Filter by wrong type", "мбс", "tutor", 10, 0, ""},
		{"Limit results", "мбс", "all", 1, 1, "МБС-501"},
		{"Min query length", "м", "all", 10, 0, ""},
		{"No match", "unknown", "all", 10, 0, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			results := idx.Search(tt.query, tt.filterType, tt.limit)
			if len(results) != tt.expected {
				t.Errorf("%s: Expected %d results, got %d", tt.name, tt.expected, len(results))
			}
			if tt.expected > 0 && (len(results) == 0 || results[0].Name != tt.firstMatch) {
				t.Errorf("%s: Expected first match %s, got %s", tt.name, tt.firstMatch, func() string { if len(results) > 0 { return results[0].Name }; return "none" }())
			}
		})
	}
}

func TestNormalize(t *testing.T) {
	cases := []struct {
		input    string
		expected string
	}{
		{"  Test  ", "test"},
		{"ЁЖИК", "ежик"},
		{"Артём", "артем"},
		{"Группа-1", "группа1"},
		{"МБС-501-О-01", "мбс501о01"},
		{"Ivanov I.I.", "ivanovii"},
		{"A - 304", "a304"},
	}

	for _, c := range cases {
		if got := normalize(c.input); got != c.expected {
			t.Errorf("normalize(%q) = %q; want %q", c.input, got, c.expected)
		}
	}
}
