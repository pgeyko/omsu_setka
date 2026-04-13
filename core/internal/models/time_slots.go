package models

type TimeSlot struct {
	Start string
	End   string
}

var TimeSlots = map[int]TimeSlot{
	1: {Start: "08:45", End: "10:20"},
	2: {Start: "10:30", End: "12:05"},
	3: {Start: "12:45", End: "14:20"},
	4: {Start: "14:30", End: "16:05"},
	5: {Start: "16:15", End: "17:50"},
	6: {Start: "18:00", End: "19:35"},
	7: {Start: "19:45", End: "21:20"},
	8: {Start: "21:30", End: "23:05"},
}
