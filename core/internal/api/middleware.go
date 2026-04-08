package api

import (
	"omsu_mirror/internal/config"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog/log"
)

func LoggerMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Now()
		err := c.Next()
		stop := time.Now()

		log.Info().
			Str("method", c.Method()).
			Str("path", c.Path()).
			Int("status", c.Response().StatusCode()).
			Dur("latency", stop.Sub(start)).
			Str("ip", c.IP()).
			Msg("HTTP Request")

		return err
	}
}

func AdminAuth(cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		key := c.Get("X-Admin-Key")
		if key == "" || key != cfg.AdminKey {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "unauthorized: invalid admin key",
			})
		}
		return c.Next()
	}
}
