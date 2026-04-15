#!/usr/bin/env python3
"""
Read-only API load test driven by the generated Swagger spec.

Example:
  python3 tools/api_loadtest.py \
    --base-url https://setka.example.ru \
    --spec core/docs/swagger.json \
    --groups 100 \
    --users 1000 \
    --duration 60
"""

from __future__ import annotations

import argparse
import asyncio
import json
import random
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


REQUIRED_PATHS = (
    "/groups",
    "/schedule/group/{id}",
    "/changes/{type}/{id}",
    "/search",
    "/health",
)

LATENCY_BUCKETS_MS = (1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000)


@dataclass(frozen=True)
class GroupTarget:
    id: int
    name: str


@dataclass
class Stats:
    started_at: float = field(default_factory=time.perf_counter)
    requests: int = 0
    ok: int = 0
    failed: int = 0
    latency_total_ms: float = 0
    max_latency_ms: float = 0
    status_counts: dict[int, int] = field(default_factory=dict)
    error_counts: dict[str, int] = field(default_factory=dict)
    buckets: list[int] = field(default_factory=lambda: [0] * (len(LATENCY_BUCKETS_MS) + 1))

    def record(self, status: int | None, latency_ms: float, error: str | None, allow_429: bool) -> None:
        self.requests += 1
        self.latency_total_ms += latency_ms
        self.max_latency_ms = max(self.max_latency_ms, latency_ms)

        bucket_index = len(LATENCY_BUCKETS_MS)
        for i, bucket_ms in enumerate(LATENCY_BUCKETS_MS):
            if latency_ms <= bucket_ms:
                bucket_index = i
                break
        self.buckets[bucket_index] += 1

        if status is not None:
            self.status_counts[status] = self.status_counts.get(status, 0) + 1

        if error is not None:
            self.failed += 1
            self.error_counts[error] = self.error_counts.get(error, 0) + 1
            return

        if status is not None and (200 <= status < 400 or (allow_429 and status == 429)):
            self.ok += 1
        else:
            self.failed += 1

    def percentile_ms(self, percentile: float) -> float:
        if self.requests == 0:
            return 0
        target = max(1, int(self.requests * percentile))
        seen = 0
        for i, count in enumerate(self.buckets):
            seen += count
            if seen >= target:
                if i < len(LATENCY_BUCKETS_MS):
                    return float(LATENCY_BUCKETS_MS[i])
                return float("inf")
        return float("inf")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Load test Omsu Setka API from Swagger spec.")
    parser.add_argument("--base-url", required=True, help="Real project URL, e.g. https://setka.example.ru")
    parser.add_argument("--spec", default="core/docs/swagger.json", help="Path to generated swagger.json")
    parser.add_argument("--groups", type=int, default=100, help="How many groups to use as schedule targets")
    parser.add_argument("--users", type=int, default=1000, help="Concurrent virtual users")
    parser.add_argument("--duration", type=float, default=60, help="Main test duration in seconds")
    parser.add_argument("--warmup-concurrency", type=int, default=50, help="Concurrent schedule warmup requests")
    parser.add_argument("--timeout", type=float, default=5, help="Per-request timeout in seconds")
    parser.add_argument("--think-time-ms", type=float, default=100, help="Delay between requests per user")
    parser.add_argument("--allow-429", action="store_true", help="Count HTTP 429 as expected instead of failed")
    parser.add_argument("--max-error-rate", type=float, default=0.01, help="Exit non-zero if failed/total is above this")
    parser.add_argument("--max-p95-ms", type=float, default=1000, help="Exit non-zero if approximate p95 exceeds this")
    return parser.parse_args()


def load_swagger(spec_path: Path) -> dict[str, Any]:
    with spec_path.open("r", encoding="utf-8") as file:
        spec = json.load(file)

    paths = spec.get("paths")
    if not isinstance(paths, dict):
        raise ValueError(f"{spec_path} does not contain Swagger paths")

    missing = [path for path in REQUIRED_PATHS if path not in paths]
    if missing:
        raise ValueError(f"Swagger spec is missing required paths: {', '.join(missing)}")

    return spec


def api_root(base_url: str, spec: dict[str, Any]) -> str:
    parsed = urllib.parse.urlsplit(base_url.rstrip("/"))
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("--base-url must include http:// or https:// and host")

    base_path = parsed.path.rstrip("/") or str(spec.get("basePath", "")).rstrip("/")
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, base_path, "", "")).rstrip("/")


def build_url(root: str, path: str, query: dict[str, str] | None = None) -> str:
    url = root + path
    if query:
        return url + "?" + urllib.parse.urlencode(query)
    return url


def fetch_json(url: str, timeout: float) -> Any:
    request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "omsu-setka-loadtest/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read()
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"GET {url} returned HTTP {exc.code}: {body[:300]}") from exc

    return json.loads(body)


def load_group_targets(root: str, wanted: int, timeout: float) -> list[GroupTarget]:
    payload = fetch_json(build_url(root, "/groups"), timeout)
    groups = payload.get("data") if isinstance(payload, dict) else payload
    if not isinstance(groups, list):
        raise ValueError("GET /groups returned unexpected payload shape")

    targets: list[GroupTarget] = []
    for group in groups:
        if not isinstance(group, dict):
            continue
        group_id = group.get("real_group_id") or group.get("id")
        name = str(group.get("name") or group_id)
        if isinstance(group_id, int) and group_id > 0:
            targets.append(GroupTarget(group_id, name))

    unique: dict[int, GroupTarget] = {}
    for target in targets:
        unique.setdefault(target.id, target)

    result = list(unique.values())[:wanted]
    if len(result) < wanted:
        raise ValueError(f"GET /groups returned only {len(result)} usable group ids, need {wanted}")
    return result


async def http_get(url: str, timeout: float) -> tuple[int | None, float, str | None]:
    started = time.perf_counter()
    parsed = urllib.parse.urlsplit(url)
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    host = parsed.hostname
    if host is None:
        return None, 0, "invalid-url"

    path = urllib.parse.urlunsplit(("", "", parsed.path or "/", parsed.query, ""))
    ssl_context = ssl.create_default_context() if parsed.scheme == "https" else None

    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port, ssl=ssl_context, server_hostname=host if ssl_context else None),
            timeout=timeout,
        )
        request = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {parsed.netloc}\r\n"
            "Accept: application/json\r\n"
            "User-Agent: omsu-setka-loadtest/1.0\r\n"
            "Connection: close\r\n"
            "\r\n"
        )
        writer.write(request.encode("ascii"))
        await asyncio.wait_for(writer.drain(), timeout=timeout)
        status_line = await asyncio.wait_for(reader.readline(), timeout=timeout)
        parts = status_line.decode("iso-8859-1", errors="replace").split()
        status = int(parts[1]) if len(parts) >= 2 and parts[1].isdigit() else None
        await asyncio.wait_for(reader.read(), timeout=timeout)
        writer.close()
        await writer.wait_closed()
        return status, (time.perf_counter() - started) * 1000, None
    except (asyncio.TimeoutError, OSError, ssl.SSLError) as exc:
        return None, (time.perf_counter() - started) * 1000, exc.__class__.__name__


def pick_url(root: str, groups: list[GroupTarget]) -> str:
    target = random.choice(groups)
    roll = random.random()
    if roll < 0.82:
        return build_url(root, f"/schedule/group/{target.id}")
    if roll < 0.92:
        return build_url(root, f"/changes/group/{target.id}")
    if roll < 0.98:
        query = target.name[: max(2, min(5, len(target.name)))]
        return build_url(root, "/search", {"q": query, "type": "group", "limit": "5"})
    return build_url(root, "/health")


async def warmup(root: str, groups: list[GroupTarget], concurrency: int, timeout: float, allow_429: bool) -> Stats:
    stats = Stats()
    semaphore = asyncio.Semaphore(concurrency)

    async def run_one(group: GroupTarget) -> None:
        async with semaphore:
            status, latency_ms, error = await http_get(build_url(root, f"/schedule/group/{group.id}"), timeout)
            stats.record(status, latency_ms, error, allow_429)

    await asyncio.gather(*(run_one(group) for group in groups))
    return stats


async def run_load(root: str, groups: list[GroupTarget], args: argparse.Namespace) -> Stats:
    stats = Stats()
    stop_at = time.perf_counter() + args.duration
    think_time = max(0, args.think_time_ms) / 1000

    async def user_loop(_: int) -> None:
        while time.perf_counter() < stop_at:
            status, latency_ms, error = await http_get(pick_url(root, groups), args.timeout)
            stats.record(status, latency_ms, error, args.allow_429)
            if think_time > 0:
                await asyncio.sleep(think_time)

    await asyncio.gather(*(user_loop(i) for i in range(args.users)))
    return stats


def print_stats(title: str, stats: Stats) -> None:
    elapsed = max(0.001, time.perf_counter() - stats.started_at)
    avg_ms = stats.latency_total_ms / stats.requests if stats.requests else 0
    error_rate = stats.failed / stats.requests if stats.requests else 0

    print(f"\n--- {title} ---")
    print(f"Requests:      {stats.requests}")
    print(f"RPS:           {stats.requests / elapsed:.2f}")
    print(f"OK:            {stats.ok}")
    print(f"Failed:        {stats.failed} ({error_rate:.2%})")
    print(f"Avg latency:   {avg_ms:.1f} ms")
    print(f"P50 latency:   {stats.percentile_ms(0.50):.0f} ms")
    print(f"P95 latency:   {stats.percentile_ms(0.95):.0f} ms")
    print(f"P99 latency:   {stats.percentile_ms(0.99):.0f} ms")
    print(f"Max latency:   {stats.max_latency_ms:.1f} ms")
    print(f"Statuses:      {dict(sorted(stats.status_counts.items()))}")
    if stats.error_counts:
        print(f"Errors:        {dict(sorted(stats.error_counts.items()))}")


async def async_main() -> int:
    args = parse_args()
    spec = load_swagger(Path(args.spec))
    root = api_root(args.base_url, spec)

    print(f"API root:       {root}")
    print(f"Swagger spec:   {args.spec}")
    print(f"Groups:         {args.groups}")
    print(f"Users:          {args.users}")
    print(f"Duration:       {args.duration:.0f}s")

    groups = load_group_targets(root, args.groups, args.timeout)
    print(f"Selected groups: {', '.join(str(group.id) for group in groups[:10])}{'...' if len(groups) > 10 else ''}")

    warmup_stats = await warmup(root, groups, args.warmup_concurrency, args.timeout, args.allow_429)
    print_stats("Warmup", warmup_stats)

    load_stats = await run_load(root, groups, args)
    print_stats("Load Test", load_stats)

    p95 = load_stats.percentile_ms(0.95)
    error_rate = load_stats.failed / load_stats.requests if load_stats.requests else 1
    if error_rate > args.max_error_rate or p95 > args.max_p95_ms:
        print(
            f"\nThreshold failed: error_rate={error_rate:.2%} "
            f"(max {args.max_error_rate:.2%}), p95={p95:.0f}ms (max {args.max_p95_ms:.0f}ms)"
        )
        return 2

    print("\nThresholds passed.")
    return 0


def main() -> None:
    try:
        raise SystemExit(asyncio.run(async_main()))
    except KeyboardInterrupt:
        raise SystemExit(130)
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
