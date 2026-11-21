package sync

import (
	"context"
	"strings"
	"time"
	"unicode"

	"omsu_mirror/internal/storage"

	"github.com/rs/zerolog/log"
)

var mapBuildings = []string{"1", "2", "4", "5", "6", "7", "11", "Г"}

func parseMapDay(value string) (time.Time, bool) {
	day, err := time.Parse("02.01.2006", value)
	if err != nil {
		return time.Time{}, false
	}
	return day, true
}

// roomFloor mirrors the upstream site: the first digit of the room part
// (e.g. 4-313 -> 3, Г-715 -> 7, 4-0 -> 0).
func roomFloor(name string) int {
	head := strings.TrimPrefix(strings.TrimSpace(name), "(")
	if i := strings.Index(head, "-"); i >= 0 && i+1 < len(head) {
		for _, r := range head[i+1:] {
			if unicode.IsDigit(r) {
				return int(r - '0')
			}
			if unicode.IsLetter(r) {
				break
			}
		}
	}
	return 0
}

// SyncAuditoryMaps downloads the per-building occupancy map and stores a
// compact window around today. The upstream response contains years of
// history and is several megabytes, so it must never be requested per user.
func (s *Syncer) SyncAuditoryMaps(ctx context.Context) error {
	if s.roomOccupancyRepo == nil {
		return nil
	}
	start := time.Now()
	location, err := time.LoadLocation("Asia/Omsk")
	if err != nil {
		location = time.FixedZone("OMSK", 6*3600)
	}
	now := time.Now().In(location)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, location)
	minDay := today.AddDate(0, 0, -1)
	maxDay := today.AddDate(0, 0, s.cfg.MapRetentionDays)
	totalRows := 0

	for _, building := range mapBuildings {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		buildingStart := time.Now()
		days, err := s.client.FetchAuditoryMap(ctx, building)
		if err != nil {
			log.Warn().Err(err).Str("building", building).Msg("Auditory map sync failed")
			continue
		}

		rows := make([]storage.RoomOccupancy, 0, len(days)*20)
		seen := make(map[string]struct{})
		for _, day := range days {
			parsed, ok := parseMapDay(day.Day)
			if !ok || parsed.Before(minDay) || parsed.After(maxDay) {
				continue
			}
			iso := parsed.Format("2006-01-02")
			for _, entry := range day.Entries {
				if entry.AuditoryID <= 0 || entry.AuditoryName == "" {
					continue
				}
				key := iso + ":" + entry.AuditoryName
				if _, dup := seen[key]; dup {
					continue
				}
				seen[key] = struct{}{}
				rows = append(rows, storage.RoomOccupancy{
					Building:  building,
					Day:       iso,
					RoomID:    entry.AuditoryID,
					RoomName:  entry.AuditoryName,
					Floor:     roomFloor(entry.AuditoryName),
					BusyTimes: entry.Times,
				})
			}
		}

		if err := s.roomOccupancyRepo.ReplaceBuildingDays(ctx, building, rows); err != nil {
			log.Error().Err(err).Str("building", building).Msg("Failed to store auditory map")
			continue
		}
		totalRows += len(rows)
		log.Info().
			Str("building", building).
			Int("rows", len(rows)).
			Dur("took", time.Since(buildingStart)).
			Msg("Auditory map updated")
	}

	if s.roomOccupancyRepo != nil {
		_ = s.roomOccupancyRepo.DeleteOlderThan(ctx, today.AddDate(0, 0, -1).Format("2006-01-02"))
	}
	log.Info().Int("rows", totalRows).Dur("took", time.Since(start)).Msg("Auditory maps sync finished")
	return nil
}

// EnsureAuditoryMaps runs the first map sync in the background when the table
// is still empty, so the first deploy does not need a manual trigger.
func (s *Syncer) EnsureAuditoryMaps(ctx context.Context) {
	if s.roomOccupancyRepo == nil {
		return
	}
	count, err := s.roomOccupancyRepo.Count(ctx)
	if err != nil || count > 0 {
		return
	}
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		select {
		case <-ctx.Done():
			return
		case s.mapSema <- struct{}{}:
			defer func() { <-s.mapSema }()
		default:
			return
		}
		if err := s.SyncAuditoryMaps(ctx); err != nil {
			log.Error().Err(err).Msg("Initial auditory map sync failed")
		}
	}()
}
