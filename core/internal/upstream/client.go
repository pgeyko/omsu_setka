package upstream

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"omsu_mirror/internal/config"
	"omsu_mirror/internal/models"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/valyala/fasthttp"
)

type Client struct {
	client  *fasthttp.Client
	cfg     *config.Config
	limiter *time.Ticker
}

func NewClient(cfg *config.Config) *Client {
	return &Client{
		client: &fasthttp.Client{
			Name:         cfg.UpstreamUserAgent,
			ReadTimeout:  cfg.UpstreamTimeout,
			WriteTimeout: cfg.UpstreamTimeout,
			MaxConnsPerHost: 10,
		},
		cfg:     cfg,
		limiter: time.NewTicker(time.Second / time.Duration(cfg.UpstreamRateLimit)),
	}
}

func (c *Client) doRequest(ctx context.Context, url string, result interface{}) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-c.limiter.C:
	}

	req := fasthttp.AcquireRequest()
	resp := fasthttp.AcquireResponse()
	defer fasthttp.ReleaseRequest(req)
	defer fasthttp.ReleaseResponse(resp)

	req.SetRequestURI(url)
	req.Header.SetMethod(http.MethodGet)
	req.Header.Set("User-Agent", c.cfg.UpstreamUserAgent)

	var err error
	maxRetries := 3
	for i := 0; i < maxRetries; i++ {
		if err = c.client.DoTimeout(req, resp, c.cfg.UpstreamTimeout); err != nil {
			log.Warn().Err(err).Msgf("Upstream request failed (try %d/%d): %s", i+1, maxRetries, url)
			time.Sleep(time.Duration(i+1) * 500 * time.Millisecond) // Exponential backoff-ish
			continue
		}

		if resp.StatusCode() != http.StatusOK {
			err = fmt.Errorf("upstream returned status %d", resp.StatusCode())
			log.Warn().Err(err).Msgf("Upstream error (try %d/%d): %s", i+1, maxRetries, url)
			time.Sleep(time.Duration(i+1) * 500 * time.Millisecond)
			continue
		}

		break
	}

	if err != nil {
		return fmt.Errorf("failed to fetch from upstream after retries: %w", err)
	}

	body := resp.Body()
	var wrapper models.UpstreamResponse
	if err := json.Unmarshal(body, &wrapper); err != nil {
		log.Error().Str("body", string(body)).Msg("Failed to decode upstream wrapper")
		return fmt.Errorf("failed to decode upstream response wrapper: %w", err)
	}

	if !wrapper.Success {
		return fmt.Errorf("upstream API error: %s", wrapper.Message)
	}

	if err := json.Unmarshal(wrapper.Data, result); err != nil {
		log.Error().Str("data", string(wrapper.Data)).Msg("Failed to decode upstream data field")
		return fmt.Errorf("failed to decode upstream data: %w", err)
	}

	return nil
}

func (c *Client) FetchGroups(ctx context.Context) ([]models.Group, error) {
	var groups []models.Group
	url := fmt.Sprintf("%s/dict/groups", c.cfg.UpstreamBaseURL)
	if err := c.doRequest(ctx, url, &groups); err != nil {
		return nil, err
	}
	return groups, nil
}

func (c *Client) FetchAuditories(ctx context.Context) ([]models.Auditory, error) {
	var auds []models.Auditory
	url := fmt.Sprintf("%s/dict/auditories", c.cfg.UpstreamBaseURL)
	if err := c.doRequest(ctx, url, &auds); err != nil {
		return nil, err
	}
	return auds, nil
}

func (c *Client) FetchTutors(ctx context.Context) ([]models.Tutor, error) {
	var tutors []models.Tutor
	url := fmt.Sprintf("%s/dict/tutors", c.cfg.UpstreamBaseURL)
	if err := c.doRequest(ctx, url, &tutors); err != nil {
		return nil, err
	}
	return tutors, nil
}

func (c *Client) FetchGroupSchedule(ctx context.Context, realGroupID int) ([]models.Day, error) {
	var schedule []models.Day
	url := fmt.Sprintf("%s/schedule/group/%d", c.cfg.UpstreamBaseURL, realGroupID)
	if err := c.doRequest(ctx, url, &schedule); err != nil {
		return nil, err
	}
	return schedule, nil
}

func (c *Client) FetchTutorSchedule(ctx context.Context, tutorID int) ([]models.Day, error) {
	var schedule []models.Day
	url := fmt.Sprintf("%s/schedule/tutor/%d", c.cfg.UpstreamBaseURL, tutorID)
	if err := c.doRequest(ctx, url, &schedule); err != nil {
		return nil, err
	}
	return schedule, nil
}

func (c *Client) FetchAuditorySchedule(ctx context.Context, auditoryID int) ([]models.Day, error) {
	var schedule []models.Day
	url := fmt.Sprintf("%s/schedule/auditory/%d", c.cfg.UpstreamBaseURL, auditoryID)
	if err := c.doRequest(ctx, url, &schedule); err != nil {
		return nil, err
	}
	return schedule, nil
}
