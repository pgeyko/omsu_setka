package scheduleutil

import (
	"regexp"
	"strings"
	"time"

	"omsu_mirror/internal/diff"
	"omsu_mirror/internal/models"
)

var roomPattern = regexp.MustCompile(`^(\(?)(\d+)-([^\s)]+)`)

func toISODate(day string) string {
	parsed, err := time.Parse("02.01.2006", strings.TrimSpace(day))
	if err != nil {
		return ""
	}
	return parsed.Format("2006-01-02")
}

func parseRoom(value string) (building, room string) {
	match := roomPattern.FindStringSubmatch(strings.TrimSpace(value))
	if len(match) != 4 {
		return "", ""
	}
	return match[2], strings.TrimSuffix(match[3], "*")
}

// Normalize fills derived fields the frontend needs: ISO date, subgroup
// number and parsed building/room. It is called after every upstream fetch.
func Normalize(days []models.Day) {
	for i := range days {
		days[i].Date = toISODate(days[i].Day)
		for j := range days[i].Lessons {
			lesson := &days[i].Lessons[j]
			lesson.SubgroupNumber = diff.NormalizeSubgroup(lesson.SubgroupName)
			lesson.Building, lesson.Room = parseRoom(lesson.AuditCorps)
		}
	}
}
