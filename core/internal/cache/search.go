package cache

import (
	"omsu_mirror/internal/models"
	"sort"
	"strings"
	"sync"
	"unicode"
)

type SearchType string

const (
	TypeGroup    SearchType = "group"
	TypeTutor    SearchType = "tutor"
	TypeAuditory SearchType = "auditory"
)

type SearchResult struct {
	ID       int        `json:"id"`
	Name     string     `json:"name"`
	Type     SearchType `json:"type"`
	RealID   int        `json:"real_group_id,omitempty"` // For groups
	Building string     `json:"building,omitempty"`      // For auditories
}

type entry struct {
	result   SearchResult
	full     string
	tokens   []string
	building string
	room     string
}

type scored struct {
	entry entry
	score int
}

type parsedQuery struct {
	norm         string
	tokens       []string
	building     string
	room         string
	auditoryOnly bool
}

type SearchIndex struct {
	entries   []entry
	buildings map[string]struct{}
	mu        sync.RWMutex
}

// Words that signal the user is looking for a room, not a group or a tutor.
var auditoryWords = map[string]struct{}{
	"ауд": {}, "аудитория": {}, "аудитории": {}, "аудиторию": {}, "аудиторией": {},
	"каб": {}, "кабинет": {}, "кабинете": {}, "кабинеты": {},
	"комната": {}, "комнаты": {}, "комнате": {},
	"корпус": {}, "корпуса": {}, "корпусу": {}, "корпусом": {}, "корпусе": {},
	"корт": {},
}

// Auditory names often use "4-112", "(4-112) ...", "Г-715" or "409*".
// Split the leading building/room pair, but keep the full name for text search.
func parseAuditory(a models.Auditory) (building, room string) {
	head := strings.TrimSpace(a.Name)
	head = strings.TrimPrefix(head, "(")
	if i := strings.IndexAny(head, ") "); i >= 0 {
		head = head[:i]
	}
	if i := strings.Index(head, "-"); i > 0 && i < len(head)-1 {
		b := normalize(head[:i])
		r := normalizeRoom(head[i+1:])
		if b != "" && r != "" {
			building, room = b, r
		}
	}
	if room == "" {
		if toks := tokenize(head); len(toks) > 0 && hasDigit(toks[0]) {
			room = normalizeRoom(toks[0])
		}
	}
	if building == "" {
		if b := normalize(a.Building); b != "" && b != "0" {
			building = b
		}
	}
	return building, room
}

func NewSearchIndex() *SearchIndex {
	return &SearchIndex{buildings: make(map[string]struct{})}
}

func normalizeRoom(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range strings.ToLower(s) {
		if r == 'ё' {
			r = 'е'
		}
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '/' {
			b.WriteRune(r)
		}
	}
	return strings.Trim(b.String(), "/")
}

func normalize(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range strings.ToLower(s) {
		if r == 'ё' {
			r = 'е'
		}
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func tokenize(s string) []string {
	var out []string
	var b strings.Builder
	flush := func() {
		if b.Len() > 0 {
			out = append(out, b.String())
			b.Reset()
		}
	}
	for _, r := range strings.ToLower(s) {
		if r == 'ё' {
			r = 'е'
		}
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		} else {
			flush()
		}
	}
	flush()
	return out
}

func hasDigit(s string) bool {
	for _, r := range s {
		if unicode.IsDigit(r) {
			return true
		}
	}
	return false
}

func hasExactToken(tokens []string, want string) bool {
	for _, token := range tokens {
		if token == want {
			return true
		}
	}
	return false
}

func hasTokenPrefix(tokens []string, want string) bool {
	for _, token := range tokens {
		if strings.HasPrefix(token, want) {
			return true
		}
	}
	return false
}

func (idx *SearchIndex) Build(groups []models.Group, tutors []models.Tutor, auditories []models.Auditory) {
	entries := make([]entry, 0, len(groups)+len(tutors)+len(auditories))
	buildings := make(map[string]struct{})

	for _, g := range groups {
		res := SearchResult{ID: g.ID, Name: g.Name, Type: TypeGroup}
		if g.RealGroupID != nil {
			res.RealID = *g.RealGroupID
		}
		entries = append(entries, entry{
			result: res,
			full:   normalize(g.Name),
			tokens: tokenize(g.Name),
		})
	}

	for _, t := range tutors {
		entries = append(entries, entry{
			result: SearchResult{ID: t.ID, Name: t.Name, Type: TypeTutor},
			full:   normalize(t.Name),
			tokens: tokenize(t.Name),
		})
	}

	for _, a := range auditories {
		building, room := parseAuditory(a)
		if building != "" {
			buildings[building] = struct{}{}
		}
		tokens := tokenize(a.Name)
		if building != "" {
			tokens = append(tokens, building)
		}
		if room != "" {
			tokens = append(tokens, room)
		}
		entries = append(entries, entry{
			result:   SearchResult{ID: a.ID, Name: a.Name, Type: TypeAuditory, Building: building},
			full:     normalize(a.Name + " " + building + " " + room),
			tokens:   tokens,
			building: building,
			room:     room,
		})
	}

	idx.mu.Lock()
	idx.entries = entries
	idx.buildings = buildings
	idx.mu.Unlock()
}

func (idx *SearchIndex) isBuilding(token string) bool {
	_, ok := idx.buildings[token]
	return ok
}

func stripStopWords(raw string, stop map[string]struct{}) string {
	parts := strings.Fields(raw)
	kept := parts[:0]
	for _, part := range parts {
		if _, skip := stop[strings.ToLower(strings.Trim(part, ".,;:()"))]; !skip {
			kept = append(kept, part)
		}
	}
	return strings.Join(kept, "")
}

func (idx *SearchIndex) parseQuery(raw string) (parsedQuery, bool) {
	rawTokens := tokenize(raw)
	if len(rawTokens) == 0 {
		return parsedQuery{}, false
	}

	tokens := make([]string, 0, len(rawTokens))
	for _, token := range rawTokens {
		if _, stop := auditoryWords[token]; stop {
			continue
		}
		tokens = append(tokens, token)
	}
	if len(tokens) == 0 {
		return parsedQuery{}, false
	}

	q := parsedQuery{norm: strings.Join(tokens, ""), tokens: tokens}
	rawLower := strings.ToLower(strings.TrimSpace(raw))
	hasSlash := strings.Contains(rawLower, "/")
	explicitAuditory := false
	for _, token := range rawTokens {
		if _, ok := auditoryWords[token]; ok {
			explicitAuditory = true
			break
		}
	}

	if hasSlash {
		// "1/12" is one room label, not building 1 + room 12.
		roomText := normalizeRoom(stripStopWords(raw, auditoryWords))
		if len(rawTokens) > 0 {
			first := rawTokens[0]
			if idx.isBuilding(first) {
				prefix := first + "-"
				spacePrefix := first + " "
				if strings.HasPrefix(rawLower, prefix) || strings.HasPrefix(rawLower, spacePrefix) {
					q.building = first
					roomText = strings.TrimPrefix(roomText, first)
				}
			}
		}
		q.room = strings.Trim(roomText, "/")
		q.auditoryOnly = true
		return q, true
	}

	// "корпус 4", "4 корпус", "ауд. 112"
	for i, token := range rawTokens {
		if _, ok := auditoryWords[token]; !ok {
			continue
		}
		if i+1 < len(rawTokens) && idx.isBuilding(rawTokens[i+1]) {
			q.building = rawTokens[i+1]
			break
		}
		if i > 0 && idx.isBuilding(rawTokens[i-1]) {
			q.building = rawTokens[i-1]
			break
		}
	}

	roomLike := func(token string) bool { return hasDigit(token) }

	if q.building == "" && len(tokens) >= 2 {
		if idx.isBuilding(tokens[0]) && roomLike(tokens[1]) {
			q.building, q.room = tokens[0], normalizeRoom(tokens[1])
		} else if idx.isBuilding(tokens[len(tokens)-1]) && roomLike(tokens[0]) {
			q.building, q.room = tokens[len(tokens)-1], normalizeRoom(tokens[0])
		}
	}

	if q.room == "" && q.building != "" {
		for _, token := range tokens {
			if token != q.building && roomLike(token) {
				q.room = normalizeRoom(token)
				break
			}
		}
	}

	// A single glued number such as "4112" means building 4, room 112.
	if q.building == "" && q.room == "" && len(tokens) == 1 && isAllDigits(tokens[0]) && len(tokens[0]) >= 4 {
		token := tokens[0]
		high := 2
		if len(token) < 4 {
			high = 1
		}
		for i := high; i >= 1; i-- {
			if idx.isBuilding(token[:i]) && i < len(token) {
				q.building, q.room = token[:i], normalizeRoom(token[i:])
				break
			}
		}
	}

	if q.room == "" && q.building == "" && len(tokens) == 1 && roomLike(tokens[0]) {
		q.room = normalizeRoom(tokens[0])
	}

	q.auditoryOnly = explicitAuditory || (q.building != "" && q.room != "")
	return q, true
}

func isAllDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if !unicode.IsDigit(r) {
			return false
		}
	}
	return true
}

func scoreText(e entry, q parsedQuery) int {
	if q.norm == "" {
		return 0
	}
	if e.full == q.norm {
		return 200
	}
	if len(q.tokens) == 0 {
		return 0
	}

	score := 0
	for _, token := range q.tokens {
		if !strings.Contains(e.full, token) {
			return 0
		}
		switch {
		case hasExactToken(e.tokens, token):
			score += 30
		case hasTokenPrefix(e.tokens, token):
			score += 15
		default:
			score += 5
		}
	}
	if strings.HasPrefix(e.full, q.norm) {
		score += 60
	} else if strings.Contains(e.full, q.norm) {
		score += 30
	}
	return score
}

func scoreAuditory(e entry, q parsedQuery) int {
	if q.building != "" && e.building != q.building {
		return 0
	}
	text := scoreText(e, q)
	bonus := 0
	if q.building != "" {
		bonus = 30
	}

	if q.room != "" {
		roomScore := 0
		switch {
		case e.room == q.room:
			roomScore = 140
		case strings.HasPrefix(e.room, q.room):
			roomScore = 100
		case strings.Contains(e.room, q.room):
			roomScore = 70
		}
		if roomScore == 0 {
			return 0
		}
		if text > 40 {
			text = 40
		}
		return roomScore + bonus + text
	}

	if q.building != "" {
		if text > 60 {
			text = 60
		}
		return bonus + 30 + text
	}
	return text
}

func (idx *SearchIndex) Search(query string, filterType string, limit int) []SearchResult {
	if len([]rune(strings.TrimSpace(query))) < 2 {
		return nil
	}
	if limit <= 0 {
		limit = 20
	}

	idx.mu.RLock()
	defer idx.mu.RUnlock()

	q, ok := idx.parseQuery(query)
	if !ok {
		return nil
	}

	buckets := map[SearchType][]scored{
		TypeGroup:    {},
		TypeTutor:    {},
		TypeAuditory: {},
	}
	seen := make(map[string]struct{})

	for _, e := range idx.entries {
		if filterType != "all" && string(e.result.Type) != filterType {
			continue
		}
		if filterType == "all" && q.auditoryOnly && e.result.Type != TypeAuditory {
			continue
		}

		score := 0
		if e.result.Type == TypeAuditory {
			score = scoreAuditory(e, q)
		} else {
			score = scoreText(e, q)
		}
		if score <= 0 {
			continue
		}
		key := string(e.result.Type) + ":" + e.result.Name
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		buckets[e.result.Type] = append(buckets[e.result.Type], scored{entry: e, score: score})
	}

	results := make([]SearchResult, 0, limit*len(buckets))
	for _, typ := range []SearchType{TypeGroup, TypeTutor, TypeAuditory} {
		bucket := buckets[typ]
		sort.SliceStable(bucket, func(i, j int) bool {
			if bucket[i].score != bucket[j].score {
				return bucket[i].score > bucket[j].score
			}
			if bucket[i].entry.result.Name != bucket[j].entry.result.Name {
				return bucket[i].entry.result.Name < bucket[j].entry.result.Name
			}
			return bucket[i].entry.result.ID < bucket[j].entry.result.ID
		})
		if len(bucket) > limit {
			bucket = bucket[:limit]
		}
		for _, item := range bucket {
			results = append(results, item.entry.result)
		}
	}
	return results
}
