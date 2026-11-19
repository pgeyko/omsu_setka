package notifications

import "testing"

func TestClickURL(t *testing.T) {
	c := &FCMClient{baseURL: "https://s.pgeyko.ru"}
	cases := []struct {
		entityType, entityID, kind, want string
	}{
		{"group", "42", "change", "https://s.pgeyko.ru/g/42/changes"},
		{"group", "42", "digest", "https://s.pgeyko.ru/g/42/today"},
		{"tutor", "15", "change", "https://s.pgeyko.ru/tutor/15"},
		{"auditory", "4-308", "change", "https://s.pgeyko.ru/auditory/4-308"},
	}
	for _, tc := range cases {
		if got := c.clickURL(tc.entityType, tc.entityID, tc.kind); got != tc.want {
			t.Errorf("clickURL(%q,%q,%q) = %q, want %q", tc.entityType, tc.entityID, tc.kind, got, tc.want)
		}
	}
}
