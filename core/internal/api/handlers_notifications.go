package api

import (
	"omsu_mirror/internal/storage"
	"strconv"

	"github.com/gofiber/fiber/v2"
)

// @Summary Update notification settings
// @Description Updates subscription preferences for a specific entity (group, tutor, auditory).
// @Tags Notifications
// @Accept json
// @Produce json
// @Param settings body storage.Subscription true "Notification Settings"
// @Success 200 {object} map[string]string
// @Failure 400 {object} map[string]string
// @Router /notifications/settings [patch]
func (s *Server) handleUpdateNotificationSettings(c *fiber.Ctx) error {
	var sub storage.Subscription
	if err := c.BodyParser(&sub); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"status": "error", "message": "Invalid request body"})
	}

	// Basic validation
	if sub.FCMToken == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"status": "error", "message": "FCM token is required"})
	}
	if sub.EntityType == "" || sub.EntityID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"status": "error", "message": "Entity type and ID are required"})
	}

	// Use the generic Subscribe method which now handles ON CONFLICT DO UPDATE
	if err := s.SubscriptionRepo.Subscribe(c.Context(), sub); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"status": "error", "message": "Failed to update settings"})
	}

	return c.JSON(fiber.Map{"status": "updated"})
}

// @Summary Get notification settings
// @Description Returns current notification preferences for a specific subscription.
// @Tags Notifications
// @Produce json
// @Param type path string true "Entity type (group, tutor, auditory)"
// @Param id path int true "Entity ID"
// @Param token query string true "FCM Token"
// @Success 200 {object} storage.Subscription
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /notifications/settings/{type}/{id} [get]
func (s *Server) handleGetNotificationSettings(c *fiber.Ctx) error {
	token := c.Query("token")
	entityType := c.Params("type")
	entityIDStr := c.Params("id")

	if token == "" || entityType == "" || entityIDStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"status": "error", "message": "Missing parameters"})
	}

	entityID, _ := strconv.Atoi(entityIDStr)

	subs, err := s.SubscriptionRepo.GetAllSubscriptionsByToken(c.Context(), token)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"status": "error", "message": "Failed to fetch settings"})
	}

	// Find the specific subscription
	var target *storage.Subscription
	for _, sub := range subs {
		if sub.EntityType == entityType && sub.EntityID == entityID {
			target = &sub
			break
		}
	}

	if target == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"status": "error", "message": "Subscription not found"})
	}

	return c.JSON(target)
}
