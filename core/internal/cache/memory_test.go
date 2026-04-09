package cache

import (
	"testing"
)

func TestMemoryCache_SetAndGet(t *testing.T) {
	cache := NewMemoryCache()
	key := "test_key"
	data := []byte("test_data")

	cache.Set(key, data)

	val, ok := cache.Get(key)
	if !ok {
		t.Fatal("Expected key to exist in cache")
	}
	if string(val) != "test_data" {
		t.Fatalf("Expected %s, got %s", "test_data", string(val))
	}

	stats := cache.Stats()
	if stats.Hits != 1 {
		t.Errorf("Expected 1 hit, got %d", stats.Hits)
	}
	if stats.ItemCount != 1 {
		t.Errorf("Expected 1 item, got %d", stats.ItemCount)
	}
}

func TestMemoryCache_Gzip(t *testing.T) {
	cache := NewMemoryCache()
	key := "test_gzip_key"
	data := []byte("gzip_data")

	cache.SetGzip(key, data)

	val, ok := cache.GetGzip(key)
	if !ok {
		t.Fatal("Expected key to exist in gzip cache")
	}
	if string(val) != "gzip_data" {
		t.Fatalf("Expected %s, got %s", "gzip_data", string(val))
	}
}

func TestMemoryCache_InvalidateAndClear(t *testing.T) {
	cache := NewMemoryCache()
	cache.Set("k1", []byte("v1"))
	cache.Set("k2", []byte("v2"))
	
	cache.Invalidate("k1")
	if _, ok := cache.Get("k1"); ok {
		t.Error("Expected k1 to be invalidated")
	}
	
	cache.Clear()
	if _, ok := cache.Get("k2"); ok {
		t.Error("Expected k2 to be cleared")
	}
	if cache.Stats().ItemCount != 0 {
		t.Error("Expected item count to be 0 after clear")
	}
}
