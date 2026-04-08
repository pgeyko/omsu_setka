package models

import (
    "encoding/json"
    "time"
)

// UpstreamResponse is the common wrapper for eservice.omsu.ru API
type UpstreamResponse struct {
    Success bool            `json:"success"`
    Message string          `json:"message"`
    Data    json.RawMessage `json:"data"`
    Code    string          `json:"code"`
}

// BFFResponse is the mirrored response format for clients
type BFFResponse struct {
    Success  bool        `json:"success"`
    Data     interface{} `json:"data"`
    CachedAt time.Time   `json:"cached_at"`
    Source   string      `json:"source"` // "cache", "upstream", "stale"
}
