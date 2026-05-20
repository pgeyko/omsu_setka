package api

import (
	"omsu_mirror/internal/storage"

	"github.com/gofiber/fiber/v2"
)

type createWebhookRequest struct {
	URL      string `json:"url"`
	Secret   string `json:"secret"`
	GroupIDs []int  `json:"group_ids"`
	Enabled  *bool  `json:"enabled,omitempty"`
}

func (s *Server) handleCreateWebhook(c *fiber.Ctx) error {
	var req createWebhookRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.URL == "" || req.Secret == "" {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": "url and secret are required"})
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	sub := storage.WebhookSubscriber{
		URL:      req.URL,
		Secret:   req.Secret,
		GroupIDs: req.GroupIDs,
		Enabled:  enabled,
	}

	id, err := s.WebhookRepo.Create(c.Context(), sub)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create webhook subscriber"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"id": id})
}

func (s *Server) handleListWebhooks(c *fiber.Ctx) error {
	subs, err := s.WebhookRepo.GetEnabled(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to list webhook subscribers"})
	}

	return c.JSON(fiber.Map{"subscribers": subs})
}

func (s *Server) handleDeleteWebhook(c *fiber.Ctx) error {
	id, err := c.ParamsInt("id")
	if err != nil || id < 1 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid id"})
	}

	existing, err := s.WebhookRepo.GetByID(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to lookup webhook subscriber"})
	}
	if existing == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "webhook subscriber not found"})
	}

	if err := s.WebhookRepo.Delete(c.Context(), id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete webhook subscriber"})
	}

	return c.JSON(fiber.Map{"success": true})
}
