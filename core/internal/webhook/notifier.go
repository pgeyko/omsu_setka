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

type Change struct {
	Date    string `json:"date"`
	Pair    int    `json:"pair"`
	Field   string `json:"field"`
	Old     string `json:"old"`
	New     string `json:"new"`
	Subject string `json:"subject"`
}

type Payload struct {
	Type       string   `json:"type"`
	GroupID    int      `json:"group_id"`
	EntityType string   `json:"entity_type,omitempty"`
	EntityID   int      `json:"entity_id,omitempty"`
	EventID    string   `json:"event_id,omitempty"`
	OccurredAt string   `json:"occurred_at,omitempty"`
	Changes    []Change `json:"changes"`
}

type Notifier struct {
	repo   *storage.WebhookRepo
	client *fasthttp.Client
	retry  int
	delay  time.Duration
}

func NewNotifier(repo *storage.WebhookRepo, timeout time.Duration, retry int, delay time.Duration) *Notifier {
	return &Notifier{
		repo: repo,
		client: &fasthttp.Client{
			WriteTimeout: timeout,
			ReadTimeout:  timeout,
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

	payload := Payload{
		Type:       "change",
		GroupID:    entityID,
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

		n.sendWithRetry(ctx, sub, eventIDStr, occurredAt, body)
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

func (n *Notifier) sendWithRetry(ctx context.Context, sub storage.WebhookSubscriber, eventID, timestamp string, body []byte) {
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
}

func computeHMAC(data []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(data)
	return hex.EncodeToString(mac.Sum(nil))
}
