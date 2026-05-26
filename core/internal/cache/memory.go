package cache

import (
	"sync"
	"sync/atomic"
	"time"

	"golang.org/x/sync/singleflight"
)

const MaxCacheItems = 5000 // 20.3 Upper bound for MemoryCache items

type cacheItem struct {
	data      []byte
	expiresAt time.Time
}

type typedCacheItem struct {
	data      interface{}
	expiresAt time.Time
}

type MemoryCache struct {
	data          sync.Map
	gzipData      sync.Map
	typedData     sync.Map
	hits          uint64
	misses        uint64
	itemCount     int64
	gzipItemCount int64
	sfGroup       singleflight.Group
}

func NewMemoryCache() *MemoryCache {
	return &MemoryCache{}
}

func (c *MemoryCache) Set(key string, data []byte) {
	c.SetWithTTL(key, data, 5*time.Minute)
}

func (c *MemoryCache) SetWithTTL(key string, data []byte, ttl time.Duration) {
	// 20.3 Prevent cache growth beyond MaxCacheItems
	if atomic.LoadInt64(&c.itemCount) >= MaxCacheItems {
		// Partial eviction to avoid full-cache drop spikes.
		c.evictApprox(MaxCacheItems / 5) // ~20%
	}

	expiresAt := time.Now().Add(ttl)
	item := cacheItem{data: data, expiresAt: expiresAt}

	// 20.6 Fix race in itemCount by checking if item was actually stored
	_, loaded := c.data.LoadOrStore(key, item)
	if !loaded {
		atomic.AddInt64(&c.itemCount, 1)
	} else {
		c.data.Store(key, item)
	}
}

// evictApprox evicts up to n entries using sync.Map iteration order (best-effort).
func (c *MemoryCache) evictApprox(n int) {
	if n <= 0 {
		return
	}

	remaining := int64(n)
	c.data.Range(func(key, value interface{}) bool {
		if remaining <= 0 {
			return false
		}
		if _, loaded := c.data.LoadAndDelete(key); loaded {
			atomic.AddInt64(&c.itemCount, -1)
			remaining--
		}
		return true
	})
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

func (c *MemoryCache) GetOrLoad(key string, fn func() ([]byte, error)) ([]byte, error) {
	if data, ok := c.Get(key); ok {
		return data, nil
	}
	result, err, _ := c.sfGroup.Do(key, func() (interface{}, error) {
		data, err := fn()
		if err != nil {
			return nil, err
		}
		c.Set(key, data)
		return data, nil
	})
	if err != nil {
		return nil, err
	}
	return result.([]byte), nil
}

func (c *MemoryCache) SetGzip(key string, data []byte) {
	if atomic.LoadInt64(&c.gzipItemCount) >= MaxCacheItems {
		c.evictGzipApprox(MaxCacheItems / 5)
	}
	expiresAt := time.Now().Add(5 * time.Minute)
	item := cacheItem{data: data, expiresAt: expiresAt}
	_, loaded := c.gzipData.LoadOrStore(key, item)
	if !loaded {
		atomic.AddInt64(&c.gzipItemCount, 1)
	} else {
		c.gzipData.Store(key, item)
	}
}

func (c *MemoryCache) evictGzipApprox(n int) {
	if n <= 0 {
		return
	}
	remaining := int64(n)
	c.gzipData.Range(func(key, value interface{}) bool {
		if remaining <= 0 {
			return false
		}
		if _, loaded := c.gzipData.LoadAndDelete(key); loaded {
			atomic.AddInt64(&c.gzipItemCount, -1)
			remaining--
		}
		return true
	})
}

func (c *MemoryCache) GetGzip(key string) ([]byte, bool) {
	val, ok := c.gzipData.Load(key)
	if ok {
		item := val.(cacheItem)
		if time.Now().After(item.expiresAt) {
			c.Invalidate(key)
			return nil, false
		}
		return item.data, true
	}
	return nil, false
}

func (c *MemoryCache) SetTyped(key string, data interface{}) {
	if c.countTyped() >= MaxCacheItems {
		c.evictTypedApprox(MaxCacheItems / 5)
	}

	item := typedCacheItem{data: data, expiresAt: time.Now().Add(5 * time.Minute)}
	c.typedData.Store(key, item)
}

func (c *MemoryCache) GetTyped(key string) (interface{}, bool) {
	val, ok := c.typedData.Load(key)
	if !ok {
		return nil, false
	}

	item, ok := val.(typedCacheItem)
	if !ok {
		return nil, false
	}

	if time.Now().After(item.expiresAt) {
		c.typedData.Delete(key)
		return nil, false
	}

	return item.data, true
}

func (c *MemoryCache) countTyped() int {
	var count int
	c.typedData.Range(func(_, _ interface{}) bool {
		count++
		return true
	})
	return count
}

func (c *MemoryCache) evictTypedApprox(n int) {
	if n <= 0 {
		return
	}
	remaining := int64(n)
	c.typedData.Range(func(key, value interface{}) bool {
		if remaining <= 0 {
			return false
		}
		c.typedData.Delete(key)
		remaining--
		return true
	})
}

func (c *MemoryCache) Invalidate(key string) {
	if _, loaded := c.data.LoadAndDelete(key); loaded {
		atomic.AddInt64(&c.itemCount, -1)
	}
	if _, loaded := c.gzipData.LoadAndDelete(key); loaded {
		atomic.AddInt64(&c.gzipItemCount, -1)
	}
	c.typedData.Delete(key)
}

// Clear removes all entries from the cache
func (c *MemoryCache) Clear() {
	c.data = sync.Map{}
	c.gzipData = sync.Map{}
	c.typedData = sync.Map{}
	atomic.StoreInt64(&c.itemCount, 0)
	atomic.StoreInt64(&c.gzipItemCount, 0)
}

func (c *MemoryCache) evictExpired() {
	c.data.Range(func(key, value interface{}) bool {
		item := value.(cacheItem)
		if time.Now().After(item.expiresAt) {
			if _, loaded := c.data.LoadAndDelete(key); loaded {
				atomic.AddInt64(&c.itemCount, -1)
			}
		}
		return true
	})
	c.gzipData.Range(func(key, value interface{}) bool {
		item := value.(cacheItem)
		if time.Now().After(item.expiresAt) {
			if _, loaded := c.gzipData.LoadAndDelete(key); loaded {
				atomic.AddInt64(&c.gzipItemCount, -1)
			}
		}
		return true
	})
}

func (c *MemoryCache) StartEvictionTicker(interval time.Duration, stopCh <-chan struct{}) {
	ticker := time.NewTicker(interval)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				c.evictExpired()
			case <-stopCh:
				return
			}
		}
	}()
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
