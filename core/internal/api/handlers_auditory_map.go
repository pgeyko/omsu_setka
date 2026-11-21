package api

import (
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"

	"omsu_mirror/internal/models"

	"github.com/gofiber/fiber/v2"
)

type mapRoom struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Floor int    `json:"floor"`
	Busy  []int  `json:"busy"`
	Free  bool   `json:"free"`
}

type mapResponse struct {
	Building  string    `json:"building"`
	Date      string    `json:"date"`
	UpdatedAt string    `json:"updated_at,omitempty"`
	Ready     bool      `json:"ready"`
	Stale     bool      `json:"stale"`
	Rooms     []mapRoom `json:"rooms"`
}

func auditoryFloor(name string) int {
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

func buildingForAuditory(a models.Auditory) string {
	building := strings.TrimSpace(a.Building)
	if building != "" && building != "0" {
		return building
	}
	name := strings.TrimPrefix(strings.TrimSpace(a.Name), "(")
	if i := strings.Index(name, "-"); i > 0 {
		return name[:i]
	}
	return building
}

func parseISODate(value string) (string, error) {
	day, err := time.Parse("2006-01-02", value)
	if err != nil {
		return "", err
	}
	return day.Format("2006-01-02"), nil
}

func todayOmsk() string {
	location, err := time.LoadLocation("Asia/Omsk")
	if err != nil {
		location = time.FixedZone("OMSK", 6*3600)
	}
	return time.Now().In(location).Format("2006-01-02")
}

func (s *Server) mapForBuildingDay(c *fiber.Ctx, building, date string) (mapResponse, error) {
	day, _ := time.Parse("2006-01-02", date)
	today, _ := time.Parse("2006-01-02", todayOmsk())
	minDay := today.AddDate(0, 0, -1)
	maxDay := today.AddDate(0, 0, s.Cfg.MapRetentionDays)
	if !day.IsZero() && (day.Before(minDay) || day.After(maxDay)) {
		return mapResponse{Building: building, Date: date, Ready: false, Rooms: []mapRoom{}}, nil
	}

	auditories, err := s.DictRepo.GetAllAuditories(c.Context())
	if err != nil {
		return mapResponse{}, err
	}
	occupancy, err := s.RoomOccupancyRepo.GetBuildingDay(c.Context(), building, date)
	if err != nil {
		return mapResponse{}, err
	}
	lastUpdate, err := s.RoomOccupancyRepo.GetBuildingUpdate(c.Context(), building)
	if err != nil {
		return mapResponse{}, err
	}

	busyByID := make(map[int][]int, len(occupancy))
	knownNames := make(map[int]string, len(auditories))
	for _, room := range auditories {
		if buildingForAuditory(room) == building {
			knownNames[room.ID] = room.Name
		}
	}
	for _, room := range occupancy {
		busyByID[room.RoomID] = room.BusyTimes
		if room.RoomName != "" {
			knownNames[room.RoomID] = room.RoomName
		}
	}

	rooms := make([]mapRoom, 0, len(knownNames))
	for id, name := range knownNames {
		busy := busyByID[id]
		if busy == nil {
			busy = []int{}
		}
		rooms = append(rooms, mapRoom{
			ID:    id,
			Name:  name,
			Floor: auditoryFloor(name),
			Busy:  busy,
			Free:  len(busy) == 0,
		})
	}
	sortMapRooms(rooms)

	resp := mapResponse{
		Building: building,
		Date:     date,
		Ready:    !lastUpdate.IsZero(),
		Stale:    !lastUpdate.IsZero() && time.Since(lastUpdate) > 2*s.Cfg.SyncMapInterval,
		Rooms:    rooms,
	}
	if !lastUpdate.IsZero() {
		resp.UpdatedAt = lastUpdate.Format(time.RFC3339)
	}
	return resp, nil
}

func sortMapRooms(rooms []mapRoom) {
	sort.Slice(rooms, func(i, j int) bool {
		if rooms[i].Floor != rooms[j].Floor {
			return rooms[i].Floor < rooms[j].Floor
		}
		return rooms[i].Name < rooms[j].Name
	})
}

func validBuilding(value string) bool {
	if value == "" || len([]rune(value)) > 3 {
		return false
	}
	for _, r := range value {
		if !unicode.IsLetter(r) && !unicode.IsDigit(r) {
			return false
		}
	}
	return true
}

// @Summary List buildings that have an auditory map
// @Description Returns buildings and the number of known rooms.
// @Tags Auditories
// @Produce json
// @Success 200 {object} models.BFFResponse
// @Router /auditories/buildings [get]
func (s *Server) handleAuditoryBuildings(c *fiber.Ctx) error {
	auditories, err := s.DictRepo.GetAllAuditories(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load auditories"})
	}
	counts := make(map[string]int)
	for _, room := range auditories {
		building := buildingForAuditory(room)
		if building != "" && building != "0" {
			counts[building]++
		}
	}
	buildings := make([]fiber.Map, 0, len(counts))
	for building, count := range counts {
		buildings = append(buildings, fiber.Map{"building": building, "rooms": count})
	}
	return c.JSON(models.BFFResponse{Success: true, Data: fiber.Map{"buildings": buildings}})
}

// @Summary Get room occupancy for a building and day
// @Description Returns all known rooms with occupied pairs. Data is a cached snapshot, not live.
// @Tags Auditories
// @Produce json
// @Param building query string true "Building (1, 2, 4, 6, ... or Г)"
// @Param date query string false "Date in YYYY-MM-DD (default today)"
// @Success 200 {object} models.BFFResponse
// @Failure 400 {object} map[string]string
// @Router /auditories/map [get]
func (s *Server) handleAuditoryMap(c *fiber.Ctx) error {
	building := strings.TrimSpace(c.Query("building"))
	if !validBuilding(building) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid building"})
	}
	date := c.Query("date")
	if date == "" {
		date = todayOmsk()
	}
	normalized, err := parseISODate(date)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid date, expected YYYY-MM-DD"})
	}
	resp, err := s.mapForBuildingDay(c, building, normalized)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load room map"})
	}
	return c.JSON(models.BFFResponse{Success: true, Data: resp})
}

// @Summary Get free rooms for a building and pair
// @Description Returns free and busy rooms for one pair based on the cached occupancy snapshot.
// @Tags Auditories
// @Produce json
// @Param building query string true "Building"
// @Param date query string false "Date in YYYY-MM-DD (default today)"
// @Param pair query int true "Pair number 1-8"
// @Success 200 {object} models.BFFResponse
// @Failure 400 {object} map[string]string
// @Router /auditories/free [get]
func (s *Server) handleFreeAuditories(c *fiber.Ctx) error {
	building := strings.TrimSpace(c.Query("building"))
	if !validBuilding(building) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid building"})
	}
	date := c.Query("date")
	if date == "" {
		date = todayOmsk()
	}
	normalized, err := parseISODate(date)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid date, expected YYYY-MM-DD"})
	}
	pair, err := strconv.Atoi(c.Query("pair"))
	if err != nil || pair < 1 || pair > 8 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "pair must be 1-8"})
	}
	resp, err := s.mapForBuildingDay(c, building, normalized)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load room map"})
	}
	free := make([]mapRoom, 0)
	busy := make([]mapRoom, 0)
	for _, room := range resp.Rooms {
		occupied := false
		for _, p := range room.Busy {
			if p == pair {
				occupied = true
				break
			}
		}
		room.Free = !occupied
		if occupied {
			busy = append(busy, room)
		} else {
			free = append(free, room)
		}
	}
	return c.JSON(models.BFFResponse{Success: true, Data: fiber.Map{
		"building":   resp.Building,
		"date":       resp.Date,
		"pair":       pair,
		"updated_at": resp.UpdatedAt,
		"ready":      resp.Ready,
		"stale":      resp.Stale,
		"free":       free,
		"busy":       busy,
	}})
}
