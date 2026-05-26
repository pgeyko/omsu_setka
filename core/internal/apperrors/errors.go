package apperrors

import "errors"

var (
	ErrInvalidID           = errors.New("invalid ID: must be between 1 and 999999")
	ErrNotFound            = errors.New("resource not found")
	ErrInvalidEntityType   = errors.New("invalid entity type")
	ErrUpstreamUnavailable = errors.New("upstream unavailable and no cache found")
)
