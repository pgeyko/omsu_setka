package config

import (
	"os"
	"testing"
	"time"
)

func TestLoadConfig(t *testing.T) {
	// Set test environment variables
	os.Setenv("APP_ENV", "testing")
	os.Setenv("SERVER_PORT", "9999")
	os.Setenv("SYNC_DICT_INTERVAL", "1h")
	// Clean up after test
	defer os.Clearenv()

	cfg := Load()

	// Check overridden values
	if cfg.AppEnv != "testing" {
		t.Errorf("Expected AppEnv 'testing', got '%s'", cfg.AppEnv)
	}
	if cfg.ServerPort != "9999" {
		t.Errorf("Expected ServerPort '9999', got '%s'", cfg.ServerPort)
	}
	if cfg.SyncDictInterval != time.Hour {
		t.Errorf("Expected SyncDictInterval 1h, got %v", cfg.SyncDictInterval)
	}

	// Check a default value
	if cfg.SQLitePath != "./data/mirror.db" {
		t.Errorf("Expected default SQLitePath './data/mirror.db', got '%s'", cfg.SQLitePath)
	}
}
