package cache

import (
	"sync/atomic"
	"time"

	lru "github.com/hashicorp/golang-lru/v2"
)

type cacheItem struct {
	data      []byte
	expiresAt time.Time
}

type MemoryCache struct {
	data      *lru.Cache[string, cacheItem]
	gzipData  *lru.Cache[string, cacheItem]
	hits      uint64
	misses    uint64
}

func NewMemoryCache() *MemoryCache {
	// Upper capacity set to 10000 items, which seems more than sufficient to bound memory usage
	cache, _ := lru.New[string, cacheItem](10000)
	gzipCache, _ := lru.New[string, cacheItem](10000)

	return &MemoryCache{
		data:     cache,
		gzipData: gzipCache,
	}
}

func (c *MemoryCache) Set(key string, data []byte) {
	expiresAt := time.Now().Add(5 * time.Minute)
	item := cacheItem{data: data, expiresAt: expiresAt}
	c.data.Add(key, item)
}

func (c *MemoryCache) Get(key string) ([]byte, bool) {
	if val, ok := c.data.Get(key); ok {
		if time.Now().After(val.expiresAt) {
			c.Invalidate(key)
			atomic.AddUint64(&c.misses, 1)
			return nil, false
		}
		atomic.AddUint64(&c.hits, 1)
		return val.data, true
	}
	atomic.AddUint64(&c.misses, 1)
	return nil, false
}

func (c *MemoryCache) SetGzip(key string, data []byte) {
	expiresAt := time.Now().Add(5 * time.Minute)
	item := cacheItem{data: data, expiresAt: expiresAt}
	c.gzipData.Add(key, item)
}

func (c *MemoryCache) GetGzip(key string) ([]byte, bool) {
	if val, ok := c.gzipData.Get(key); ok {
		if time.Now().After(val.expiresAt) {
			c.gzipData.Remove(key)
			return nil, false
		}
		return val.data, true
	}
	return nil, false
}

func (c *MemoryCache) Invalidate(key string) {
	c.data.Remove(key)
	c.gzipData.Remove(key)
}

// Clear removes all entries from the cache
func (c *MemoryCache) Clear() {
	c.data.Purge()
	c.gzipData.Purge()
}

type CacheStats struct {
	Hits      uint64 `json:"hits"`
	Misses    uint64 `json:"misses"`
	ItemCount int64  `json:"item_count"`
}

func (c *MemoryCache) Stats() CacheStats {
	return CacheStats{
		Hits:      atomic.LoadUint64(&c.hits),
		Misses:    atomic.LoadUint64(&c.misses),
		ItemCount: int64(c.data.Len()),
	}
}
