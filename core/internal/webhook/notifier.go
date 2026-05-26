package webhook

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"omsu_mirror/internal/storage"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/valyala/fasthttp"
)

type Notifier struct {
	repo              *storage.WebhookRepo
	failedDeliveryRepo *storage.FailedDeliveryRepo
	client            *fasthttp.Client
	retry             int
	delay             time.Duration
}

func NewNotifier(repo *storage.WebhookRepo, failedDeliveryRepo *storage.FailedDeliveryRepo, timeout time.Duration, retry int, delay time.Duration) *Notifier {
	return &Notifier{
		repo:               repo,
		failedDeliveryRepo: failedDeliveryRepo,
		client: &fasthttp.Client{
			WriteTimeout:    timeout,
			ReadTimeout:     timeout,
			MaxConnsPerHost: 10,
		},
		retry: retry,
		delay: delay,
	}
}

func (n *Notifier) Notify(ctx context.Context, entityType string, entityID int, changes []Change) {
	if len(changes) == 0 {
		return
	}

	subscribers, err := n.repo.GetEnabled(ctx)
	if err != nil {
		log.Error().Err(err).Msg("Failed to fetch webhook subscribers")
		return
	}

	if len(subscribers) == 0 {
		return
	}

	// Generate unique event ID for replay protection (P1#11)
	eventID := make([]byte, 16)
	if _, err := rand.Read(eventID); err != nil {
		log.Error().Err(err).Msg("Failed to generate event ID")
		return
	}
	eventIDStr := hex.EncodeToString(eventID)
	occurredAt := time.Now().UTC().Format(time.RFC3339)

	var groupID int
	if entityType == "group" {
		groupID = entityID
	}
	payload := Payload{
		Type:       "change",
		GroupID:    groupID,
		EntityType: entityType,
		EntityID:   entityID,
		EventID:    eventIDStr,
		OccurredAt: occurredAt,
		Changes:    changes,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		log.Error().Err(err).Msg("Failed to marshal webhook payload")
		return
	}

	for _, sub := range subscribers {
		if !n.matchesGroup(sub, entityID) {
			continue
		}

		n.sendWithRetry(ctx, sub, sub.ID, eventIDStr, occurredAt, body)
	}
}

func (n *Notifier) matchesGroup(sub storage.WebhookSubscriber, groupID int) bool {
	if len(sub.GroupIDs) == 0 {
		return true
	}
	for _, gid := range sub.GroupIDs {
		if gid == groupID {
			return true
		}
	}
	return false
}

func (n *Notifier) sendWithRetry(ctx context.Context, sub storage.WebhookSubscriber, subscriberID int, eventID, timestamp string, body []byte) {
	// Sign timestamp + "." + body for replay protection (P1#11)
	signedPayload := timestamp + "." + string(body)
	sig := computeHMAC([]byte(signedPayload), sub.Secret)

	req := fasthttp.AcquireRequest()
	defer fasthttp.ReleaseRequest(req)

	req.SetRequestURI(sub.URL)
	req.Header.SetMethod("POST")
	req.Header.SetContentType("application/json")
	req.Header.Set("X-Webhook-Signature", sig)
	req.Header.Set("X-Webhook-Timestamp", timestamp)
	req.Header.Set("X-Webhook-Event-ID", eventID)
	req.SetBody(body)

	var lastErr error
	for attempt := 0; attempt <= n.retry; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return
			case <-time.After(n.delay):
			}
		}

		resp := fasthttp.AcquireResponse()
		err := n.client.Do(req, resp)
		statusCode := resp.StatusCode()
		fasthttp.ReleaseResponse(resp)

		if err == nil && statusCode >= 200 && statusCode < 300 {
			log.Info().
				Str("url", sub.URL).
				Int("attempt", attempt+1).
				Int("status", statusCode).
				Str("event_id", eventID).
				Msg("Webhook delivered successfully")
			return
		}

		if err != nil {
			lastErr = err
			log.Warn().
				Str("url", sub.URL).
				Int("attempt", attempt+1).
				Err(err).
				Msg("Webhook delivery failed")
		} else {
			lastErr = fmt.Errorf("unexpected status: %d", statusCode)
			log.Warn().
				Str("url", sub.URL).
				Int("attempt", attempt+1).
				Int("status", statusCode).
				Msg("Webhook delivery returned non-2xx")
		}
	}

	log.Error().
		Str("url", sub.URL).
		Int("retries", n.retry).
		Err(lastErr).
		Msg("Webhook delivery failed after all retries")

	if n.failedDeliveryRepo != nil {
		errStr := ""
		if lastErr != nil {
			errStr = lastErr.Error()
		}
		if _, err := n.failedDeliveryRepo.Save(ctx, subscriberID, sub.URL, body, eventID, timestamp, errStr); err != nil {
			log.Error().Err(err).Msg("Failed to save failed delivery to dead-letter queue")
		}
	}
}

// ReplayFailed retries pending failed deliveries from the dead-letter queue.
// It deletes the delivery record on success.
func (n *Notifier) ReplayFailed(ctx context.Context, maxBatch int) {
	deliveries, err := n.failedDeliveryRepo.GetPending(ctx, maxBatch)
	if err != nil {
		log.Error().Err(err).Msg("Failed to get pending failed deliveries for replay")
		return
	}

	for _, d := range deliveries {
		// Delete the failed delivery record before retry to avoid duplicates
		// if sendWithRetry saves it again on failure.
		if err := n.failedDeliveryRepo.Delete(ctx, d.ID); err != nil {
			log.Warn().Err(err).Int("delivery_id", d.ID).Msg("Failed to delete failed delivery before replay")
		}

		sub, err := n.repo.GetByID(ctx, d.SubscriberID)
		if err != nil || sub == nil {
			log.Warn().Int("subscriber_id", d.SubscriberID).Msg("Subscriber not found for replay, skipping")
			continue
		}

		n.sendWithRetry(ctx, *sub, d.SubscriberID, d.EventID, d.Timestamp, d.Payload)
	}
}

func computeHMAC(data []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(data)
	return hex.EncodeToString(mac.Sum(nil))
}
