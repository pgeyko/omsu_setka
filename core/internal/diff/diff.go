package diff

import (
	"regexp"
	"strconv"
	"strings"

	"omsu_mirror/internal/models"
)

// Change is a normalized field-level schedule change. It is used by the
// public changes API and by the webhook notifier.
type Change struct {
	Field string `json:"field"`
	Label string `json:"label"`
	Old   string `json:"old"`
	New   string `json:"new"`
}

var (
	subgroupSuffix = regexp.MustCompile(`/(\d+)\s*$`)
	subgroupAfter  = regexp.MustCompile(`(?i)подгруппа\s*(\d+)`)
	subgroupBefore = regexp.MustCompile(`(?i)(\d+)\s*(?:подгруппа|подгр|п/г)`)
	subgroupNumber = regexp.MustCompile(`^\s*(\d+)\s*$`)
)

// NormalizeSubgroup returns the subgroup number from all formats used by the
// upstream: "GROUP/1", "Подгруппа 1", "1 подгруппа", "1".
func NormalizeSubgroup(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	for _, re := range []*regexp.Regexp{subgroupSuffix, subgroupAfter, subgroupBefore, subgroupNumber} {
		if match := re.FindStringSubmatch(value); len(match) == 2 {
			return match[1]
		}
	}
	return ""
}

// Equal compares the fields that define a lesson's schedule identity. The day
// is compared separately because Lesson does not carry it.
func Equal(a, b models.Lesson) bool {
	return a.Time == b.Time &&
		a.Lesson == b.Lesson &&
		a.TypeWork == b.TypeWork &&
		a.Faculty == b.Faculty &&
		a.Teacher == b.Teacher &&
		a.Group == b.Group &&
		a.AuditCorps == b.AuditCorps &&
		a.SubgroupName == b.SubgroupName
}

// Lessons returns normalized field changes between two versions of a lesson.
// oldDay/newDay are ISO dates (or any stable date strings); pass empty strings
// when the day is not known.
func Lessons(oldL, newL models.Lesson, oldDay, newDay string) []Change {
	changes := make([]Change, 0, 8)

	add := func(field, label, oldValue, newValue string) {
		if oldValue != newValue {
			changes = append(changes, Change{Field: field, Label: label, Old: oldValue, New: newValue})
		}
	}

	add("lesson", "предмет", oldL.Lesson, newL.Lesson)
	add("type_work", "тип занятия", oldL.TypeWork, newL.TypeWork)
	add("faculty", "факультет", oldL.Faculty, newL.Faculty)
	add("teacher", "преподаватель", oldL.Teacher, newL.Teacher)
	add("group", "группа", oldL.Group, newL.Group)
	add("auditCorps", "аудитория", oldL.AuditCorps, newL.AuditCorps)
	add("time", "пара", strconv.Itoa(oldL.Time), strconv.Itoa(newL.Time))
	add("subgroupName", "подгруппа", oldL.SubgroupName, newL.SubgroupName)
	if oldDay != "" || newDay != "" {
		add("day", "день", oldDay, newDay)
	}

	return changes
}
