package api

import (
	"context"
	"omsu_mirror/internal/diff"
	"omsu_mirror/internal/models"
	"omsu_mirror/internal/storage"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
)

type notificationSettingsPatch struct {
	FCMToken           string  `json:"fcm_token"`
	EntityType         string  `json:"entity_type"`
	EntityID           int     `json:"entity_id"`
	NotifyOnChange     *bool   `json:"notify_on_change"`
	NotifyDailyDigest  *bool   `json:"notify_daily_digest"`
	DigestTime         *string `json:"digest_time"`
	NotifyBeforeLesson *bool   `json:"notify_before_lesson"`
	BeforeMinutes      *int    `json:"before_minutes"`
	Timezone           *string `json:"timezone"`
	Subgroup           *string `json:"subgroup"`
}

func (s *Server) findSubscription(token, entityType string, entityID int) (*storage.Subscription, error) {
	subs, err := s.SubscriptionRepo.GetAllSubscriptionsByToken(context.Background(), token)
	if err != nil {
		return nil, err
	}
	for i := range subs {
		if subs[i].EntityType == entityType && subs[i].EntityID == entityID {
			return &subs[i], nil
		}
	}
	return nil, nil
}

// @Summary Update notification settings
// @Description Partially updates subscription preferences for an entity. Omitted fields keep their values.
// @Tags Notifications
// @Accept json
// @Produce json
// @Param settings body notificationSettingsPatch true "Notification settings patch"
// @Success 200 {object} map[string]string
// @Failure 400 {object} map[string]string
// @Router /notifications/settings [patch]
func (s *Server) handleUpdateNotificationSettings(c *fiber.Ctx) error {
	var req notificationSettingsPatch
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"status": "error", "message": "Invalid request body"})
	}

	if req.FCMToken == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"status": "error", "message": "FCM token is required"})
	}
	if req.EntityType == "" || req.EntityID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"status": "error", "message": "Entity type and ID are required"})
	}
	if !isValidEntityType(req.EntityType) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"status": "error", "message": "Invalid entity type"})
	}

	sub, err := s.findSubscription(req.FCMToken, req.EntityType, req.EntityID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"status": "error", "message": "Failed to load settings"})
	}
	if sub == nil {
		sub = &storage.Subscription{
			FCMToken:       req.FCMToken,
			EntityType:     req.EntityType,
			EntityID:       req.EntityID,
			NotifyOnChange: true,
			DigestTime:     "19:00",
			BeforeMinutes:  30,
			Timezone:       "Asia/Omsk",
		}
	}

	if req.NotifyOnChange != nil {
		sub.NotifyOnChange = *req.NotifyOnChange
	}
	if req.NotifyDailyDigest != nil {
		sub.NotifyDailyDigest = *req.NotifyDailyDigest
	}
	if req.DigestTime != nil {
		sub.DigestTime = *req.DigestTime
	}
	if req.NotifyBeforeLesson != nil {
		sub.NotifyBeforeLesson = *req.NotifyBeforeLesson
	}
	if req.BeforeMinutes != nil {
		sub.BeforeMinutes = *req.BeforeMinutes
	}
	if req.Timezone != nil {
		sub.Timezone = *req.Timezone
	}
	if req.Subgroup != nil {
		sub.Subgroup = diff.NormalizeSubgroup(*req.Subgroup)
	}
	if sub.DigestTime == "" {
		sub.DigestTime = "19:00"
	}
	if sub.Timezone == "" {
		sub.Timezone = "Asia/Omsk"
	}
	if sub.BeforeMinutes <= 0 {
		sub.BeforeMinutes = 30
	}

	if err := s.SubscriptionRepo.Subscribe(c.Context(), *sub); err != nil {
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
// @Param X-FCM-Token header string true "FCM Token"
// @Success 200 {object} storage.Subscription
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /notifications/settings/{type}/{id} [get]
func (s *Server) handleGetNotificationSettings(c *fiber.Ctx) error {
	token := c.Get("X-FCM-Token")
	entityType := c.Params("type")
	entityIDStr := c.Params("id")

	if token == "" || entityType == "" || entityIDStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"status": "error", "message": "Missing parameters"})
	}
	if !isValidEntityType(entityType) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"status": "error", "message": "Invalid entity type"})
	}

	entityID, err := strconv.Atoi(entityIDStr)
	if err != nil || entityID < 1 || entityID > 999999 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"status": "error", "message": "Invalid entity ID"})
	}

	target, err := s.findSubscription(token, entityType, entityID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"status": "error", "message": "Failed to fetch settings"})
	}
	if target == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"status": "error", "message": "Subscription not found"})
	}

	return c.JSON(target)
}

// @Summary List subscriptions for a device
// @Description Returns all subscriptions belonging to the FCM token from X-FCM-Token.
// @Tags Notifications
// @Produce json
// @Param X-FCM-Token header string true "FCM Token"
// @Success 200 {object} models.BFFResponse
// @Failure 400 {object} map[string]string
// @Router /subscriptions [get]
func (s *Server) handleListSubscriptions(c *fiber.Ctx) error {
	token := c.Get("X-FCM-Token")
	if token == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "missing X-FCM-Token header"})
	}
	subs, err := s.SubscriptionRepo.GetAllSubscriptionsByToken(c.Context(), token)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch subscriptions"})
	}
	return c.JSON(models.BFFResponse{Success: true, Data: subs, CachedAt: time.Now(), Source: "database"})
}
