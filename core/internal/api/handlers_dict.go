package api

import (
	"encoding/json"
	"omsu_mirror/internal/models"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

// @Summary Get all groups
// @Description Returns a list of all study groups.
// @Tags Dictionaries
// @Produce json
// @Success 200 {object} models.BFFResponse{data=[]models.Group}
// @Router /groups [get]
func (s *Server) handleGetGroups(c *fiber.Ctx) error {
	return s.serveCollection(c, "groups", func() (interface{}, error) {
		return s.DictRepo.GetAllGroups(c.Context())
	})
}

// @Summary Get all auditories
// @Description Returns a list of all auditories and buildings.
// @Tags Dictionaries
// @Produce json
// @Success 200 {object} models.BFFResponse{data=[]models.Auditory}
// @Router /auditories [get]
func (s *Server) handleGetAuditories(c *fiber.Ctx) error {
	return s.serveCollection(c, "auditories", func() (interface{}, error) {
		return s.DictRepo.GetAllAuditories(c.Context())
	})
}

// @Summary Get all tutors
// @Description Returns a list of all teachers.
// @Tags Dictionaries
// @Produce json
// @Success 200 {object} models.BFFResponse{data=[]models.Tutor}
// @Router /tutors [get]
func (s *Server) handleGetTutors(c *fiber.Ctx) error {
	return s.serveCollection(c, "tutors", func() (interface{}, error) {
		return s.DictRepo.GetAllTutors(c.Context())
	})
}

func (s *Server) serveCollection(c *fiber.Ctx, key string, fetcher func() (interface{}, error)) error {
	// 1. Try L1 Cache (pre-rendered JSON or GZIP)
	wantsGzip := strings.Contains(c.Get("Accept-Encoding"), "gzip")
	
	if wantsGzip {
		if gzData, ok := s.MemoryCache.GetGzip(key); ok {
			c.Set("X-Cache-Status", "HIT-GZIP")
			c.Set("Content-Type", "application/json")
			c.Set("Content-Encoding", "gzip")
			return c.Send(gzData)
		}
	}

	if data, ok := s.MemoryCache.Get(key); ok {
		c.Set("X-Cache-Status", "HIT")
		c.Set("Content-Type", "application/json")
		return c.Send(data)
	}

	// 2. Fetch from DB
	data, err := fetcher()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// 3. Wrap and Cache
	resp := models.BFFResponse{
		Success:  true,
		Data:     data,
		CachedAt: time.Now(),
		Source:   "cache",
	}
	
	jsonData, _ := json.Marshal(resp)
	s.MemoryCache.Set(key, jsonData)

	c.Set("X-Cache-Status", "MISS")
	return c.JSON(resp)
}

// @Summary Get group by ID
// @Description Returns a single group by its ID.
// @Tags Dictionaries
// @Produce json
// @Param id path int true "Group ID"
// @Success 200 {object} models.BFFResponse{data=models.Group}
// @Failure 404 {object} map[string]string
// @Router /groups/{id} [get]
func (s *Server) handleGetGroupByID(c *fiber.Ctx) error {
	id, _ := strconv.Atoi(c.Params("id"))
	group, err := s.DictRepo.GetGroupByID(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if group == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "group not found"})
	}
	return c.JSON(models.BFFResponse{Success: true, Data: group})
}

// @Summary Get auditory by ID
// @Description Returns a single auditory by its ID.
// @Tags Dictionaries
// @Produce json
// @Param id path int true "Auditory ID"
// @Success 200 {object} models.BFFResponse{data=models.Auditory}
// @Failure 404 {object} map[string]string
// @Router /auditories/{id} [get]
func (s *Server) handleGetAuditoryByID(c *fiber.Ctx) error {
	id, _ := strconv.Atoi(c.Params("id"))
	aud, err := s.DictRepo.GetAuditoryByID(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if aud == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "auditory not found"})
	}
	return c.JSON(models.BFFResponse{Success: true, Data: aud})
}

// @Summary Get tutor by ID
// @Description Returns a single teacher by their ID.
// @Tags Dictionaries
// @Produce json
// @Param id path int true "Tutor ID"
// @Success 200 {object} models.BFFResponse{data=models.Tutor}
// @Failure 404 {object} map[string]string
// @Router /tutors/{id} [get]
func (s *Server) handleGetTutorByID(c *fiber.Ctx) error {
	id, _ := strconv.Atoi(c.Params("id"))
	tutor, err := s.DictRepo.GetTutorByID(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if tutor == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "tutor not found"})
	}
	return c.JSON(models.BFFResponse{Success: true, Data: tutor})
}
