package main

import (
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"time"
)

func main() {
	url := "http://localhost:8080/api/v1/health"
	concurrency := 50
	duration := 10 * time.Second

	fmt.Printf("Starting load test: %d workers for %s\n", concurrency, duration)

	var totalRequests int64
	var totalLatency int64
	var successCount int64
	var failCount int64

	start := time.Now()
	var wg sync.WaitGroup

	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for time.Since(start) < duration {
				reqStart := time.Now()
				resp, err := http.Get(url)
				latency := time.Since(reqStart)

				atomic.AddInt64(&totalRequests, 1)
				atomic.AddInt64(&totalLatency, int64(latency))

				if err == nil && resp.StatusCode == http.StatusOK {
					atomic.AddInt64(&successCount, 1)
					resp.Body.Close()
				} else {
					atomic.AddInt64(&failCount, 1)
					if resp != nil {
						resp.Body.Close()
					}
				}
			}
		}()
	}

	wg.Wait()
	actualDuration := time.Since(start)

	avgLatency := time.Duration(totalLatency / totalRequests)
	rps := float64(totalRequests) / actualDuration.Seconds()

	fmt.Println("\n--- Load Test Results ---")
	fmt.Printf("Duration:      %v\n", actualDuration)
	fmt.Printf("Requests:      %d\n", totalRequests)
	fmt.Printf("RPS:           %.2f\n", rps)
	fmt.Printf("Avg Latency:   %v\n", avgLatency)
	fmt.Printf("Success:       %d\n", successCount)
	fmt.Printf("Fail:          %d (Note: Rate limiting may trigger 429)\n", failCount)
}
