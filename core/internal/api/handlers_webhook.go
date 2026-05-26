package api

import (
	"fmt"
	"net"
	"net/url"
	"omsu_mirror/internal/storage"

	"github.com/gofiber/fiber/v2"
)

func validateWebhookURL(rawURL string, appEnv string) error {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}
	if parsed.Scheme == "" {
		return fmt.Errorf("URL must have a scheme")
	}
	if appEnv == "production" && parsed.Scheme != "https" {
		return fmt.Errorf("only https scheme is allowed in production mode")
	}
	if parsed.Scheme != "https" && parsed.Scheme != "http" {
		return fmt.Errorf("unsupported URL scheme: %s", parsed.Scheme)
	}
	host := parsed.Hostname()
	if host == "" {
		return fmt.Errorf("URL must have a host")
	}
	ip := net.ParseIP(host)
	if ip != nil && (ip.IsPrivate() || ip.IsLoopback()) {
		return fmt.Errorf("private and loopback IP addresses are not allowed for webhook URLs")
	}
	return nil
}

type CreateWebhookRequest struct {
	URL      string `json:"url"`
	Secret   string `json:"secret"`
	GroupIDs []int  `json:"group_ids"`
	Enabled  *bool  `json:"enabled,omitempty"`
}

// @Summary Create or update webhook subscriber
// @Description Register a new webhook subscriber or update existing by URL (idempotent)
// @Tags Admin
// @Accept json
// @Produce json
// @Param body body api.CreateWebhookRequest true "Webhook subscriber data"
// @Success 201 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 422 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Security ApiKeyAuth
// @Router /admin/webhooks [post]
func (s *Server) handleCreateWebhook(c *fiber.Ctx) error {
	var req CreateWebhookRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.URL == "" || req.Secret == "" {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": "url and secret are required"})
	}

	if err := validateWebhookURL(req.URL, s.Cfg.AppEnv); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
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

	id, created, err := s.WebhookRepo.UpsertByURL(c.Context(), sub)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to upsert webhook subscriber"})
	}

	status := fiber.StatusOK
	if created {
		status = fiber.StatusCreated
	}
	return c.Status(status).JSON(fiber.Map{"id": id})
}

// @Summary List webhook subscribers
// @Description Get all registered webhook subscribers
// @Tags Admin
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]string
// @Security ApiKeyAuth
// @Router /admin/webhooks [get]
func (s *Server) handleListWebhooks(c *fiber.Ctx) error {
	subs, err := s.WebhookRepo.GetAll(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to list webhook subscribers"})
	}

	return c.JSON(fiber.Map{"subscribers": subs})
}

// @Summary Delete webhook subscriber
// @Description Remove a webhook subscriber by ID
// @Tags Admin
// @Produce json
// @Param id path int true "Webhook subscriber ID"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Security ApiKeyAuth
// @Router /admin/webhooks/{id} [delete]
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

// @Summary Update webhook subscriber
// @Description Update an existing webhook subscriber by ID
// @Tags Admin
// @Accept json
// @Produce json
// @Param id path int true "Webhook subscriber ID"
// @Param body body api.CreateWebhookRequest false "Webhook fields to update"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Security ApiKeyAuth
// @Router /admin/webhooks/{id} [patch]
func (s *Server) handleUpdateWebhook(c *fiber.Ctx) error {
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

	var req CreateWebhookRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	secret := existing.Secret
	if req.Secret != "" {
		secret = req.Secret
	}
	groupIDs := existing.GroupIDs
	if req.GroupIDs != nil {
		groupIDs = req.GroupIDs
	}
	enabled := existing.Enabled
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	if err := s.WebhookRepo.Update(c.Context(), id, secret, groupIDs, enabled); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update webhook subscriber"})
	}

	return c.JSON(fiber.Map{"success": true})
}

// handleUpsertWebhook creates or updates a webhook subscriber by URL (idempotent).
// This prevents duplicate subscribers on restarts and re-registrations (P0#3).
//
// @Summary Upsert webhook subscriber by URL
// @Description Create or update a webhook subscriber by URL (idempotent)
// @Tags Admin
// @Accept json
// @Produce json
// @Param body body api.CreateWebhookRequest true "Webhook subscriber data"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 422 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Security ApiKeyAuth
// @Router /admin/webhooks/by-url [put]
func (s *Server) handleUpsertWebhook(c *fiber.Ctx) error {
	var req CreateWebhookRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.URL == "" || req.Secret == "" {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": "url and secret are required"})
	}

	if err := validateWebhookURL(req.URL, s.Cfg.AppEnv); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
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

	id, created, err := s.WebhookRepo.UpsertByURL(c.Context(), sub)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to upsert webhook subscriber"})
	}

	status := "updated"
	if created {
		status = "created"
	}
	return c.JSON(fiber.Map{"id": id, "status": status})
}

// @Summary List failed webhook deliveries
// @Description Get all failed webhook deliveries (dead-letter queue)
// @Tags Admin
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]string
// @Security ApiKeyAuth
// @Router /admin/webhooks/failed [get]
func (s *Server) handleListFailedDeliveries(c *fiber.Ctx) error {
	deliveries, err := s.FailedDeliveryRepo.List(c.Context(), 0, 100)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to list failed deliveries"})
	}
	return c.JSON(fiber.Map{"deliveries": deliveries})
}
