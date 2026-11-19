package notifications

import (
	"context"
	"fmt"
	"omsu_mirror/internal/config"
	"os"
	"strings"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/messaging"
	"github.com/rs/zerolog/log"
	"google.golang.org/api/option"
)

type FCMClient struct {
	app       *firebase.App
	messaging *messaging.Client
	baseURL   string
}

func NewFCMClient(cfg *config.Config) *FCMClient {
	ctx := context.Background()
	var app *firebase.App
	var err error

	// Try to load from env variable (JSON string)
	saJSON := os.Getenv("FIREBASE_SERVICE_ACCOUNT")
	if saJSON != "" {
		app, err = firebase.NewApp(ctx, nil, option.WithCredentialsJSON([]byte(saJSON)))
	} else {
		// Fallback to default credentials (e.g. if file is pointed by GOOGLE_APPLICATION_CREDENTIALS)
		app, err = firebase.NewApp(ctx, nil)
	}

	if err != nil {
		log.Warn().Err(err).Msg("Failed to initialize Firebase App (push notifications will be disabled)")
		return &FCMClient{baseURL: cfg.AppBaseURL}
	}

	client, err := app.Messaging(ctx)
	if err != nil {
		log.Warn().Err(err).Msg("Failed to initialize Firebase Messaging")
		return &FCMClient{baseURL: cfg.AppBaseURL}
	}

	return &FCMClient{
		app:       app,
		messaging: client,
		baseURL:   cfg.AppBaseURL,
	}
}

func (c *FCMClient) SendToTokens(ctx context.Context, tokens []string, title, body string, data map[string]string) []string {
	if c.messaging == nil || len(tokens) == 0 {
		return nil
	}

	// FCM v1 allows sending to multiple tokens via Multicast
	// We move everything to Data map to let the Service Worker
	// handle the notification display. This prevents duplication
	// between the browser's automatic display and the SW manual display.
	if data == nil {
		data = make(map[string]string)
	}
	data["title"] = title
	data["body"] = body
	data["click_url"] = c.clickURL(data["type"], data["id"], data["kind"])
	data["tag"] = "schedule_alert"

	message := &messaging.MulticastMessage{
		Tokens: tokens,
		Data:   data,
		Webpush: &messaging.WebpushConfig{
			FCMOptions: &messaging.WebpushFCMOptions{
				Link: data["click_url"],
			},
		},
	}

	br, err := c.messaging.SendEachForMulticast(ctx, message)
	if err != nil {
		log.Error().Err(err).Msg("Failed to send FCM multicast message")
		return nil
	}

	var invalidTokens []string
	if br.FailureCount > 0 {
		log.Warn().Msgf("FCM: %d messages failed to deliver", br.FailureCount)
		for i, resp := range br.Responses {
			if resp.Error != nil && messaging.IsUnregistered(resp.Error) {
				invalidTokens = append(invalidTokens, tokens[i])
			}
		}
	}

	log.Info().Msgf("FCM: Successfully sent notifications to %d devices", br.SuccessCount)
	return invalidTokens
}

func ensureHTTPS(url string) string {
	if strings.HasPrefix(url, "http://") {
		return "https://" + strings.TrimPrefix(url, "http://")
	}
	return url
}

func (c *FCMClient) clickURL(entityType, entityID, kind string) string {
	base := strings.TrimRight(c.baseURL, "/")
	switch entityType {
	case "group":
		if kind == "change" {
			return ensureHTTPS(base + "/g/" + entityID + "/changes")
		}
		return ensureHTTPS(base + "/g/" + entityID + "/today")
	case "tutor":
		return ensureHTTPS(base + "/tutor/" + entityID)
	case "auditory":
		return ensureHTTPS(base + "/auditory/" + entityID)
	default:
		return ensureHTTPS(base + "/")
	}
}

// TokenResult classifies a single FCM delivery for the notification outbox.
type TokenResult struct {
	Success   bool
	Invalid   bool
	Retryable bool
	Err       error
}

// SendToToken sends one message and returns a classification suitable for
// retries. It is used by the outbox worker; SendToTokens remains for multicast.
func (c *FCMClient) SendToToken(ctx context.Context, token, title, body string, data map[string]string) TokenResult {
	if c.messaging == nil || token == "" {
		return TokenResult{Err: fmt.Errorf("fcm is not configured")}
	}
	if data == nil {
		data = make(map[string]string)
	}
	data["title"] = title
	data["body"] = body
	data["click_url"] = c.clickURL(data["type"], data["id"], data["kind"])
	data["tag"] = "schedule_alert"

	message := &messaging.Message{
		Token: token,
		Data:  data,
		Webpush: &messaging.WebpushConfig{
			FCMOptions: &messaging.WebpushFCMOptions{Link: data["click_url"]},
		},
	}
	_, err := c.messaging.Send(ctx, message)
	if err == nil {
		return TokenResult{Success: true}
	}
	if messaging.IsUnregistered(err) || messaging.IsInvalidArgument(err) ||
		messaging.IsMismatchedCredential(err) || messaging.IsSenderIDMismatch(err) {
		return TokenResult{Invalid: true, Err: err}
	}
	return TokenResult{Retryable: true, Err: err}
}
