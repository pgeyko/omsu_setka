package cache

import (
	"omsu_mirror/internal/models"
	"strings"
	"sync"
)

type SearchType string

const (
	TypeGroup    SearchType = "group"
	TypeTutor    SearchType = "tutor"
	TypeAuditory SearchType = "auditory"
)

type SearchResult struct {
	ID          int        `json:"id"`
	Name        string     `json:"name"`
	Type        SearchType `json:"type"`
	RealID      int        `json:"real_group_id,omitempty"` // For groups
	Building    string     `json:"building,omitempty"`      // For auditories
}

type node struct {
	children map[rune]*node
	results  []SearchResult
}

type SearchIndex struct {
	root *node
	mu   sync.RWMutex
}

func NewSearchIndex() *SearchIndex {
	return &SearchIndex{root: &node{children: make(map[rune]*node)}}
}

func normalize(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.ReplaceAll(s, "ё", "е")
	return s
}

func (idx *SearchIndex) Build(groups []models.Group, tutors []models.Tutor, auditories []models.Auditory) {
	newRoot := &node{children: make(map[rune]*node)}

	// Add groups
	for _, g := range groups {
		res := SearchResult{ID: g.ID, Name: g.Name, Type: TypeGroup}
		if g.RealGroupID != nil {
			res.RealID = *g.RealGroupID
		}
		idx.insert(newRoot, normalize(g.Name), res)
	}

	// Add tutors
	for _, t := range tutors {
		res := SearchResult{ID: t.ID, Name: t.Name, Type: TypeTutor}
		idx.insert(newRoot, normalize(t.Name), res)
	}

	// Add auditories
	for _, a := range auditories {
		res := SearchResult{ID: a.ID, Name: a.Name, Type: TypeAuditory, Building: a.Building}
		idx.insert(newRoot, normalize(a.Name), res)
	}

	idx.mu.Lock()
	idx.root = newRoot
	idx.mu.Unlock()
}

func (idx *SearchIndex) insert(root *node, key string, res SearchResult) {
	curr := root
	for _, r := range key {
		if _, ok := curr.children[r]; !ok {
			curr.children[r] = &node{children: make(map[rune]*node)}
		}
		curr = curr.children[r]
		// Limit results at each node to keep memory low and search fast
		if len(curr.results) < 50 {
			curr.results = append(curr.results, res)
		}
	}
}

func (idx *SearchIndex) Search(query string, filterType string, limit int) []SearchResult {
	query = normalize(query)
	if len([]rune(query)) < 2 {
		return nil
	}

	idx.mu.RLock()
	defer idx.mu.RUnlock()

	curr := idx.root
	for _, r := range query {
		if next, ok := curr.children[r]; ok {
			curr = next
		} else {
			return nil
		}
	}

	results := make([]SearchResult, 0)
	seen := make(map[string]bool)

	for _, res := range curr.results {
		if filterType != "all" && string(res.Type) != filterType {
			continue
		}
		
		key := string(res.Type) + ":" + res.Name
		if seen[key] {
			continue
		}
		
		results = append(results, res)
		seen[key] = true
		
		if len(results) >= limit {
			break
		}
	}

	return results
}
