package cache

import (
	"sync"
	"sync/atomic"
)

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
	if _, loaded := c.data.LoadOrStore(key, data); !loaded {
		atomic.AddInt64(&c.itemCount, 1)
	} else {
		c.data.Store(key, data)
	}
}

func (c *MemoryCache) Get(key string) ([]byte, bool) {
	val, ok := c.data.Load(key)
	if ok {
		atomic.AddUint64(&c.hits, 1)
		return val.([]byte), true
	}
	atomic.AddUint64(&c.misses, 1)
	return nil, false
}

func (c *MemoryCache) SetGzip(key string, data []byte) {
	c.gzipData.Store(key, data)
}

func (c *MemoryCache) GetGzip(key string) ([]byte, bool) {
	val, ok := c.gzipData.Load(key)
	if ok {
		return val.([]byte), true
	}
	return nil, false
}

func (c *MemoryCache) Invalidate(key string) {
	if _, loaded := c.data.LoadAndDelete(key); loaded {
		atomic.AddInt64(&c.itemCount, -1)
	}
	c.gzipData.Delete(key)
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
