package api

import (
	"omsu_mirror/internal/cache"
	"omsu_mirror/internal/models"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
)

// @Summary Search groups, tutors, or auditories
// @Description Token and substring search across groups, tutors and rooms. Understands "4-112", "112", "4 корпус 112" and "корпус 4".
// @Tags Search
// @Produce json
// @Param q query string true "Query string (min 2 chars)"
// @Param type query string false "Filter type: group, tutor, auditory, all" default(all)
// @Param limit query int false "Limit results per type" default(20)
// @Success 200 {object} models.BFFResponse
// @Router /search [get]
func (s *Server) handleSearch(c *fiber.Ctx) error {
	query := c.Query("q")
	if len(query) < 2 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "query too short (min 2 characters)"})
	}
	if len(query) > 100 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "query too long (max 100 characters)"})
	}

	filterType := c.Query("type", "all")
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	results := s.SearchIndex.Search(query, filterType, limit)

	// Format results into grouped response if requested or all
	if filterType == "all" {
		grouped := map[string][]cache.SearchResult{
			"groups":     {},
			"tutors":     {},
			"auditories": {},
		}
		for _, res := range results {
			switch res.Type {
			case cache.TypeGroup:
				grouped["groups"] = append(grouped["groups"], res)
			case cache.TypeTutor:
				grouped["tutors"] = append(grouped["tutors"], res)
			case cache.TypeAuditory:
				grouped["auditories"] = append(grouped["auditories"], res)
			}
		}
		return c.JSON(models.BFFResponse{Success: true, Data: grouped, CachedAt: time.Now(), Source: "cache"})
	}

	return c.JSON(models.BFFResponse{Success: true, Data: results, CachedAt: time.Now(), Source: "cache"})
}
