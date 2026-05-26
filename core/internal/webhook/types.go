package webhook

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
