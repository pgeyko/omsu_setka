package models

// AuditoryMapEntry is one room's occupied pairs for a day, as returned by
// /schedule/map/{building}.
type AuditoryMapEntry struct {
	Day          string `json:"day"`
	Times        []int  `json:"times"`
	Building     string `json:"building"`
	AuditoryID   int    `json:"auditory_id"`
	AuditoryName string `json:"auditory_name"`
	PublishDate  string `json:"publishDate"`
}

// AuditoryMapDay groups the occupancy entries for one date.
type AuditoryMapDay struct {
	Day     string              `json:"day"`
	Entries []AuditoryMapEntry  `json:"entries"`
}
