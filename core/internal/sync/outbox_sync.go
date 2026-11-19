package sync

import (
	"context"
	"encoding/json"
	"time"

	"omsu_mirror/internal/storage"

	"github.com/rs/zerolog/log"
)

// enqueuePush stores an FCM message in the outbox. If the outbox is not
// configured (tests or a minimal setup), it falls back to a direct send and
// updates digest/reminder marks only on success.
func (s *Syncer) enqueuePush(
	ctx context.Context,
	token, title, body string,
	data map[string]string,
	kind, subscriptionToken, entityType string,
	entityID int,
	markDate string,
) {
	dataJSON, _ := json.Marshal(data)
	msg := storage.OutboxMessage{
		FCMToken:          token,
		Title:             title,
		Body:              body,
		Data:              string(dataJSON),
		Kind:              kind,
		SubscriptionToken: subscriptionToken,
		EntityType:        entityType,
		EntityID:          entityID,
		MarkDate:          markDate,
	}

	if s.outboxRepo != nil {
		if err := s.outboxRepo.Enqueue(ctx, msg); err != nil {
			log.Error().Err(err).Str("kind", kind).Msg("Failed to enqueue notification")
		}
		return
	}

	// Fallback for setups without an outbox.
	result := s.fcm.SendToToken(ctx, token, title, body, data)
	if result.Success {
		if subscriptionToken != "" && markDate != "" {
			switch kind {
			case "digest":
				_ = s.subscriptionRepo.MarkDigestSent(ctx, subscriptionToken, entityType, entityID, markDate)
			case "reminder":
				_ = s.subscriptionRepo.MarkReminderSent(ctx, subscriptionToken, entityType, entityID, markDate)
			}
		}
		return
	}
	if result.Invalid {
		_ = s.subscriptionRepo.DeleteTokens(ctx, []string{token})
	}
}

// ProcessNotificationOutbox delivers pending notifications, retries transient
// FCM failures with backoff and records digest/reminder marks only after a
// successful send.
func (s *Syncer) ProcessNotificationOutbox(ctx context.Context) error {
	if s.outboxRepo == nil {
		return nil
	}

	messages, err := s.outboxRepo.GetPending(ctx, time.Now(), 50)
	if err != nil {
		return err
	}
	if len(messages) == 0 {
		return nil
	}

	maxAttempts := s.cfg.OutboxMaxAttempts
	if maxAttempts <= 0 {
		maxAttempts = 5
	}

	for _, msg := range messages {
		data := msg.DataMap()
		result := s.fcm.SendToToken(ctx, msg.FCMToken, msg.Title, msg.Body, data)
		if result.Success {
			if err := s.outboxRepo.MarkSent(ctx, msg.ID); err != nil {
				log.Error().Err(err).Int("outbox_id", msg.ID).Msg("Failed to mark notification sent")
			}
			if msg.SubscriptionToken != "" && msg.MarkDate != "" {
				switch msg.Kind {
				case "digest":
					_ = s.subscriptionRepo.MarkDigestSent(ctx, msg.SubscriptionToken, msg.EntityType, msg.EntityID, msg.MarkDate)
				case "reminder":
					_ = s.subscriptionRepo.MarkReminderSent(ctx, msg.SubscriptionToken, msg.EntityType, msg.EntityID, msg.MarkDate)
				}
			}
			continue
		}

		errText := "unknown FCM error"
		if result.Err != nil {
			errText = result.Err.Error()
		}

		if result.Invalid {
			if err := s.outboxRepo.MarkFailed(ctx, msg.ID, errText); err != nil {
				log.Error().Err(err).Int("outbox_id", msg.ID).Msg("Failed to mark invalid token")
			}
			_ = s.subscriptionRepo.DeleteTokens(ctx, []string{msg.FCMToken})
			continue
		}

		attempts := msg.Attempts + 1
		if !result.Retryable || attempts >= maxAttempts {
			if err := s.outboxRepo.MarkFailed(ctx, msg.ID, errText); err != nil {
				log.Error().Err(err).Int("outbox_id", msg.ID).Msg("Failed to mark notification failed")
			}
			continue
		}

		backoff := time.Duration(attempts*attempts) * time.Minute
		next := time.Now().Add(backoff)
		if err := s.outboxRepo.MarkRetry(ctx, msg.ID, attempts, next, errText); err != nil {
			log.Error().Err(err).Int("outbox_id", msg.ID).Msg("Failed to schedule notification retry")
		}
	}

	log.Info().Msgf("Processed %d notification outbox messages", len(messages))
	return nil
}
