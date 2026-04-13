package notifications

import (
	"context"
	"os"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/messaging"
	"github.com/rs/zerolog/log"
	"google.golang.org/api/option"
)

type FCMClient struct {
	app       *firebase.App
	messaging *messaging.Client
}

func NewFCMClient() *FCMClient {
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
		return &FCMClient{}
	}

	client, err := app.Messaging(ctx)
	if err != nil {
		log.Warn().Err(err).Msg("Failed to initialize Firebase Messaging")
		return &FCMClient{}
	}

	return &FCMClient{
		app:       app,
		messaging: client,
	}
}

func (c *FCMClient) SendToTokens(ctx context.Context, tokens []string, title, body string, data map[string]string) []string {
	if c.messaging == nil || len(tokens) == 0 {
		return nil
	}

	// FCM v1 allows sending to multiple tokens via Multicast
	message := &messaging.MulticastMessage{
		Tokens: tokens,
		Notification: &messaging.Notification{
			Title: title,
			Body:  body,
		},
		Data: data,
		Webpush: &messaging.WebpushConfig{
			Notification: &messaging.WebpushNotification{
				Icon: "/favicon-96x96.png",
			},
			FCMOptions: &messaging.WebpushFCMOptions{
				Link: "/schedule/" + data["type"] + "/" + data["id"],
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
			if resp.Error != nil && messaging.IsRegistrationTokenNotRegistered(resp.Error) {
				invalidTokens = append(invalidTokens, tokens[i])
			}
		}
	}

	log.Info().Msgf("FCM: Successfully sent notifications to %d devices", br.SuccessCount)
	return invalidTokens
}
