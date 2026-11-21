package storage

import (
	"context"
	"database/sql"
	"strconv"
	"strings"
	"time"
)

// RoomOccupancy is the compact form of one room's busy pairs on one day.
type RoomOccupancy struct {
	Building  string
	Day       string // YYYY-MM-DD
	RoomID    int
	RoomName  string
	Floor     int
	BusyTimes []int
	UpdatedAt time.Time
}

type RoomOccupancyRepo struct {
	db *SQLite
}

func NewRoomOccupancyRepo(db *SQLite) *RoomOccupancyRepo {
	return &RoomOccupancyRepo{db: db}
}

func encodeBusyTimes(times []int) string {
	parts := make([]string, 0, len(times))
	for _, pair := range times {
		if pair < 1 || pair > 8 {
			continue
		}
		parts = append(parts, strconv.Itoa(pair))
	}
	return strings.Join(parts, ",")
}

func decodeBusyTimes(value string) []int {
	if value == "" {
		return []int{}
	}
	parts := strings.Split(value, ",")
	out := make([]int, 0, len(parts))
	for _, part := range parts {
		pair, err := strconv.Atoi(strings.TrimSpace(part))
		if err == nil && pair >= 1 && pair <= 8 {
			out = append(out, pair)
		}
	}
	return out
}

// ReplaceBuildingDays rewrites the occupancy snapshot for one building. The
// upstream map returns years of history; callers keep only the current window,
// so replacing the whole building is cheap and avoids stale rows.
func (r *RoomOccupancyRepo) ReplaceBuildingDays(ctx context.Context, building string, rows []RoomOccupancy) error {
	tx, err := r.db.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `DELETE FROM room_occupancy WHERE building = ?`, building); err != nil {
		return err
	}

	const batchSize = 300
	for i := 0; i < len(rows); i += batchSize {
		end := i + batchSize
		if end > len(rows) {
			end = len(rows)
		}
		var b strings.Builder
		b.WriteString(`INSERT INTO room_occupancy (building, day, room_id, room_name, floor, busy_times, updated_at) VALUES `)
		args := make([]interface{}, 0, (end-i)*6)
		for j, row := range rows[i:end] {
			if j > 0 {
				b.WriteString(", ")
			}
			b.WriteString("(?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)")
			args = append(args, building, row.Day, row.RoomID, row.RoomName, row.Floor, encodeBusyTimes(row.BusyTimes))
		}
		if _, err := tx.ExecContext(ctx, b.String(), args...); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func parseSQLiteTime(value string) time.Time {
	for _, layout := range []string{"2006-01-02 15:04:05", "2006-01-02T15:04:05Z07:00", time.RFC3339Nano} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed
		}
	}
	return time.Time{}
}

func (r *RoomOccupancyRepo) GetBuildingDay(ctx context.Context, building, day string) ([]RoomOccupancy, error) {
	rows, err := r.db.DB.QueryContext(ctx, `
		SELECT room_id, room_name, floor, busy_times, updated_at
		FROM room_occupancy
		WHERE building = ? AND day = ?
		ORDER BY floor, room_name
	`, building, day)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]RoomOccupancy, 0)
	for rows.Next() {
		var row RoomOccupancy
		var busy string
		var updated string
		if err := rows.Scan(&row.RoomID, &row.RoomName, &row.Floor, &busy, &updated); err != nil {
			return nil, err
		}
		row.UpdatedAt = parseSQLiteTime(updated)
		row.Building = building
		row.Day = day
		row.BusyTimes = decodeBusyTimes(busy)
		out = append(out, row)
	}
	return out, nil
}

func (r *RoomOccupancyRepo) GetBuildingUpdate(ctx context.Context, building string) (time.Time, error) {
	var updated sql.NullString
	if err := r.db.DB.QueryRowContext(ctx, `SELECT MAX(updated_at) FROM room_occupancy WHERE building = ?`, building).Scan(&updated); err != nil {
		return time.Time{}, err
	}
	if !updated.Valid || updated.String == "" {
		return time.Time{}, nil
	}
	return parseSQLiteTime(updated.String), nil
}

func (r *RoomOccupancyRepo) GetLastMapUpdate(ctx context.Context) (time.Time, error) {
	var updated sql.NullString
	if err := r.db.DB.QueryRowContext(ctx, `SELECT MAX(updated_at) FROM room_occupancy`).Scan(&updated); err != nil {
		return time.Time{}, err
	}
	if !updated.Valid || updated.String == "" {
		return time.Time{}, nil
	}
	return parseSQLiteTime(updated.String), nil
}

func (r *RoomOccupancyRepo) Count(ctx context.Context) (int, error) {
	var count int
	if err := r.db.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM room_occupancy`).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

func (r *RoomOccupancyRepo) DeleteOlderThan(ctx context.Context, day string) error {
	_, err := r.db.DB.ExecContext(ctx, `DELETE FROM room_occupancy WHERE day < ?`, day)
	return err
}
