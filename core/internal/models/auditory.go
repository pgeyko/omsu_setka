package models

type Auditory struct {
	ID       int    `json:"id" db:"id"`
	Name     string `json:"name" db:"name"`
	Building string `json:"building" db:"building"`
}
