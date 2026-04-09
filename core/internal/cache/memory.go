package cache

import (
	"sync"
	"sync/atomic"
	"time"
)

const MaxCacheItems = 5000 // 20.3 Upper bound for MemoryCache items

type cacheItem struct {
	data      []byte
	expiresAt time.Time
}

type MemoryCache struct {
	data      sync.Map
	gzipData  sync.Map
	hits      uint64
	misses    uint64
	itemCount int64
}

func NewMemoryCache() *MemoryCache {
	return &MemoryCache{}
}

func (c *MemoryCache) Set(key string, data []byte) {
	// 20.3 Prevent cache growth beyond MaxCacheItems
	if atomic.LoadInt64(&c.itemCount) >= MaxCacheItems {
		// Simple eviction: clear everything if limit reached (could be improved to LRU)
		c.Clear()
	}

	expiresAt := time.Now().Add(5 * time.Minute)
	item := cacheItem{data: data, expiresAt: expiresAt}
	
	// 20.6 Fix race in itemCount by checking if item was actually stored
	_, loaded := c.data.LoadOrStore(key, item)
	if !loaded {
		atomic.AddInt64(&c.itemCount, 1)
	} else {
		c.data.Store(key, item)
	}
}

func (c *MemoryCache) Get(key string) ([]byte, bool) {
	val, ok := c.data.Load(key)
	if ok {
		item := val.(cacheItem)
		if time.Now().After(item.expiresAt) {
			c.Invalidate(key)
			atomic.AddUint64(&c.misses, 1)
			return nil, false
		}
		atomic.AddUint64(&c.hits, 1)
		return item.data, true
	}
	atomic.AddUint64(&c.misses, 1)
	return nil, false
}

func (c *MemoryCache) SetGzip(key string, data []byte) {
	expiresAt := time.Now().Add(5 * time.Minute)
	item := cacheItem{data: data, expiresAt: expiresAt}
	c.gzipData.Store(key, item)
}

func (c *MemoryCache) GetGzip(key string) ([]byte, bool) {
	val, ok := c.gzipData.Load(key)
	if ok {
		item := val.(cacheItem)
		if time.Now().After(item.expiresAt) {
			c.gzipData.Delete(key)
			return nil, false
		}
		return item.data, true
	}
	return nil, false
}

func (c *MemoryCache) Invalidate(key string) {
	if _, loaded := c.data.LoadAndDelete(key); loaded {
		atomic.AddInt64(&c.itemCount, -1)
	}
	c.gzipData.Delete(key)
}

// Clear removes all entries from the cache
func (c *MemoryCache) Clear() {
	c.data.Range(func(key, value interface{}) bool {
		c.data.Delete(key)
		return true
	})
	c.gzipData.Range(func(key, value interface{}) bool {
		c.gzipData.Delete(key)
		return true
	})
	atomic.StoreInt64(&c.itemCount, 0)
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
		ItemCount: atomic.LoadInt64(&c.itemCount),
	}
}
