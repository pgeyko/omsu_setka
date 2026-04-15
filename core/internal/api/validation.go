package api

func isValidEntityType(entityType string) bool {
	switch entityType {
	case "group", "tutor", "auditory":
		return true
	default:
		return false
	}
}
