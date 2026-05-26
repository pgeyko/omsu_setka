package config

import (
	"time"

	"github.com/caarlos0/env/v11"
	"github.com/rs/zerolog/log"
)

type Config struct {
	// Server
	AppEnv             string        `env:"APP_ENV" envDefault:"development"`
	AppBaseURL         string        `env:"APP_BASE_URL" envDefault:"http://localhost"`
	ServerPort         string        `env:"SERVER_PORT" envDefault:"8080"`
	ServerReadTimeout  time.Duration `env:"SERVER_READ_TIMEOUT" envDefault:"5s"`
	ServerWriteTimeout time.Duration `env:"SERVER_WRITE_TIMEOUT" envDefault:"5s"`
	ServerPrefork      bool          `env:"SERVER_PREFORK" envDefault:"false"`

	// Upstream
	UpstreamBaseURL    string        `env:"UPSTREAM_BASE_URL" envDefault:"https://eservice.omsu.ru/schedule/backend"`
	UpstreamTimeout    time.Duration `env:"UPSTREAM_TIMEOUT" envDefault:"10s"`
	UpstreamRateLimit  int           `env:"UPSTREAM_RATE_LIMIT" envDefault:"2"`
	UpstreamUserAgent  string        `env:"UPSTREAM_USER_AGENT" envDefault:"omsu_setka/1.0"`
	UpstreamMaxConns   int           `env:"UPSTREAM_MAX_CONNS" envDefault:"10"`

	// Synchronization
	SyncDictInterval     time.Duration `env:"SYNC_DICT_INTERVAL" envDefault:"12h"`
	SyncScheduleInterval time.Duration `env:"SYNC_SCHEDULE_INTERVAL" envDefault:"15m"`
	SyncAuditInterval    time.Duration `env:"SYNC_AUDIT_INTERVAL" envDefault:"24h"`
	SyncOnStartup        bool          `env:"SYNC_ON_STARTUP" envDefault:"true"`

	// Cache
	CacheScheduleTTL     time.Duration `env:"CACHE_SCHEDULE_TTL" envDefault:"15m"`
	CacheDictTTL         time.Duration `env:"CACHE_DICT_TTL" envDefault:"12h"`
	CacheActiveThreshold time.Duration `env:"CACHE_ACTIVE_THRESHOLD" envDefault:"24h"`

	// SQLite
	SQLitePath        string `env:"SQLITE_PATH" envDefault:"./data/mirror.db"`
	SQLiteWALMode     bool   `env:"SQLITE_WAL_MODE" envDefault:"true"`
	SQLiteBusyTimeout int    `env:"SQLITE_BUSY_TIMEOUT" envDefault:"5000"`

	// Logging
	LogLevel  string `env:"LOG_LEVEL" envDefault:"info"`
	LogFormat string `env:"LOG_FORMAT" envDefault:"json"`

	// Security
	AdminKey           string `env:"ADMIN_KEY" envDefault:""`
	CORSAllowedOrigins string `env:"CORS_ALLOWED_ORIGINS" envDefault:""`
	ICalAccessToken    string `env:"ICAL_ACCESS_TOKEN" envDefault:""`
	SwaggerEnabled     bool   `env:"SWAGGER_ENABLED" envDefault:"false"`

	// Rate Limiting
	RateLimitGeneral int           `env:"RATE_LIMIT_GENERAL" envDefault:"120"`
	RateLimitSearch  int           `env:"RATE_LIMIT_SEARCH" envDefault:"30"`
	RateLimitWindow  time.Duration `env:"RATE_LIMIT_WINDOW" envDefault:"1m"`

	// Webhook Notifier
	WebhookRetryAttempts int           `env:"WEBHOOK_RETRY_ATTEMPTS" envDefault:"3"`
	WebhookRetryDelay    time.Duration `env:"WEBHOOK_RETRY_DELAY"    envDefault:"5s"`
	WebhookTimeout       time.Duration `env:"WEBHOOK_TIMEOUT"        envDefault:"10s"`
}

func Load() *Config {
	cfg := Config{}
	if err := env.Parse(&cfg); err != nil {
		log.Fatal().Err(err).Msg("Failed to parse config")
	}
	return &cfg
}
