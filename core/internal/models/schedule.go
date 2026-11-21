package models

type Lesson struct {
	ID             int    `json:"id"`
	LessonID       int    `json:"lesson_id,omitempty"`
	Time           int    `json:"time"`
	Faculty        string `json:"faculty"`
	Lesson         string `json:"lesson"`
	TypeWork       string `json:"type_work"`
	Teacher        string `json:"teacher"`
	TeacherID      int    `json:"teacher_id,omitempty"`
	Group          string `json:"group"`
	GroupID        int    `json:"group_id,omitempty"`
	AuditCorps     string `json:"auditCorps"`
	AuditoryID     int    `json:"auditory_id,omitempty"`
	SubgroupName   string `json:"subgroupName,omitempty"`
	SubgroupNumber string `json:"subgroup_number,omitempty"`
	Building       string `json:"building,omitempty"`
	Room           string `json:"room,omitempty"`
	PublishDate    string `json:"publishDate"`
}

type Day struct {
	Day     string   `json:"day"`
	Date    string   `json:"date,omitempty"`
	Lessons []Lesson `json:"lessons"`
}
