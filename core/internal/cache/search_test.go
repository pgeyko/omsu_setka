package cache

import (
	"omsu_mirror/internal/models"
	"testing"
)

func newTestIndex() *SearchIndex {
	idx := NewSearchIndex()
	groups := []models.Group{
		{ID: 1, Name: "МБС-501"},
		{ID: 2, Name: "МБС-502"},
		{ID: 3, Name: "ИВТ-112"},
	}
	tutors := []models.Tutor{
		{ID: 1, Name: "Бесценный Игорь Павлович"},
		{ID: 2, Name: "Королёв Александр Петрович"},
	}
	auditories := []models.Auditory{
		{ID: 10, Name: "4-112", Building: "4"},
		{ID: 11, Name: "7-112", Building: "7"},
		{ID: 12, Name: "4-308", Building: "4"},
		{ID: 13, Name: "1-120А", Building: "1"},
		{ID: 14, Name: "(2-46) Спортивный зал", Building: "2"},
		{ID: 15, Name: "Г-715", Building: "Г"},
	}
	idx.Build(groups, tutors, auditories)
	return idx
}

func names(results []SearchResult) []string {
	out := make([]string, len(results))
	for i, result := range results {
		out[i] = result.Name
	}
	return out
}

func TestSearchIndex(t *testing.T) {
	t.Parallel()
	idx := newTestIndex()

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
		{"Room number finds all buildings", "112", "all", 10, 3, "ИВТ-112"},
		{"Room with building", "4-112", "all", 10, 1, "4-112"},
		{"Room glued", "4112", "all", 10, 1, "4-112"},
		{"Room with space", "4 112", "all", 10, 1, "4-112"},
		{"Room with корпус", "4 корпус 112", "all", 10, 1, "4-112"},
		{"Room with reverse корпус", "112 корпус 4", "all", 10, 1, "4-112"},
		{"Room with ауд", "ауд 112", "all", 10, 2, "4-112"},
		{"Letter building", "г-715", "all", 10, 1, "Г-715"},
		{"Group number inside name", "501", "all", 10, 1, "МБС-501"},
		{"Room name by text", "спорт", "all", 10, 1, "(2-46) Спортивный зал"},
		{"Auditory filter", "112", "auditory", 10, 2, "4-112"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			results := idx.Search(tt.query, tt.filterType, tt.limit)
			if len(results) != tt.expected {
				t.Errorf("%s: Expected %d results, got %d: %v", tt.name, tt.expected, len(results), names(results))
			}
			if tt.expected > 0 && (len(results) == 0 || results[0].Name != tt.firstMatch) {
				got := "none"
				if len(results) > 0 {
					got = results[0].Name
				}
				t.Errorf("%s: Expected first match %s, got %s", tt.name, tt.firstMatch, got)
			}
		})
	}
}

func TestSearchReturnsBuildingForAuditory(t *testing.T) {
	t.Parallel()
	idx := newTestIndex()
	results := idx.Search("7-112", "auditory", 10)
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %v", names(results))
	}
	if results[0].Building != "7" {
		t.Errorf("expected building 7, got %q", results[0].Building)
	}
}

func TestSearchBuildingOnly(t *testing.T) {
	t.Parallel()
	idx := newTestIndex()
	results := idx.Search("корпус 4", "auditory", 10)
	if len(results) != 2 {
		t.Fatalf("expected 2 rooms in building 4, got %v", names(results))
	}
	if results[0].Name != "4-112" || results[1].Name != "4-308" {
		t.Errorf("unexpected order: %v", names(results))
	}
}

func TestSearchLimitPerType(t *testing.T) {
	t.Parallel()
	idx := newTestIndex()
	groups := idx.Search("мбс", "group", 1)
	if len(groups) != 1 {
		t.Fatalf("expected one group, got %v", names(groups))
	}
}

func TestNormalize(t *testing.T) {
	t.Parallel()
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
		{"(4-112)", "4112"},
	}

	for _, c := range cases {
		if got := normalize(c.input); got != c.expected {
			t.Errorf("normalize(%q) = %q; want %q", c.input, got, c.expected)
		}
	}
}

func TestParseAuditory(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in       models.Auditory
		building string
		room     string
	}{
		{models.Auditory{Name: "4-112", Building: "4"}, "4", "112"},
		{models.Auditory{Name: "(2-46) Спортивный зал", Building: "2"}, "2", "46"},
		{models.Auditory{Name: "Г-715", Building: "Г"}, "г", "715"},
		{models.Auditory{Name: "409*", Building: "0"}, "", "409"},
		{models.Auditory{Name: "7-119", Building: "0"}, "7", "119"},
		{models.Auditory{Name: "11-Актовый", Building: "11"}, "11", "актовый"},
	}
	for _, c := range cases {
		building, room := parseAuditory(c.in)
		if building != c.building || room != c.room {
			t.Errorf("parseAuditory(%q, %q) = (%q, %q); want (%q, %q)", c.in.Name, c.in.Building, building, room, c.building, c.room)
		}
	}
}
