package models

type Lesson struct {
	ID           int    `json:"id"`
	Time         int    `json:"time"`
	Faculty      string `json:"faculty"`
	Lesson       string `json:"lesson"`
	TypeWork     string `json:"type_work"`
	Teacher      string `json:"teacher"`
	Group        string `json:"group"`
	AuditCorps   string `json:"auditCorps"`
	SubgroupName string `json:"subgroupName,omitempty"`
	PublishDate  string `json:"publishDate"`
}

type Day struct {
	Day     string   `json:"day"`
	Lessons []Lesson `json:"lessons"`
}
