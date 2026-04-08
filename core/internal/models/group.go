package models

type Group struct {
	ID          int    `json:"id" db:"id"`
	Name        string `json:"name" db:"name"`
	RealGroupID *int   `json:"real_group_id,omitempty" db:"real_group_id"`
}
