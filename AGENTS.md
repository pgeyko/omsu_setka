# Agent Instructions: omsu_setka

Canonical project instructions for coding agents working in this repository.
If a tool-specific instruction conflicts with this file, this file wins for
project conventions; system and user instructions always come first.

## Project Overview

`omsu_setka` («сетка») is a high-performance BFF that mirrors the Omsu
University schedule. It keeps a multi-level cache (pre-rendered JSON in memory,
SQLite, upstream), syncs only hot schedules in the background, and serves a
React PWA with a week grid, changes feed, push notifications and iCal export.
Public instance: <https://s.pgeyko.ru>.

## Layout

- `core/` — Go 1.23 backend: `cmd/server`, `internal/{api,cache,storage,sync,
  upstream,notifications,webhook,diff,models,config}`.
- `web/` — React 19 + TypeScript + Vite 8 PWA; vanilla CSS, no Tailwind.
- `docs/` — architecture, component guides, admin/deploy docs, screenshots.
- `.github/workflows/ci.yml` — tests, image build, deploy to server.
- `admin.sh`, `run.sh`, `tools/` — operations and local helpers.

Read `docs/ARCHITECTURE.md` before changing caching, sync, diff or webhooks.
Component guides: `docs/core/DEVELOPMENT.md`, `docs/web/DEVELOPMENT.md`.
Frontend details: `web/README.md`.

## Development Commands

```bash
# backend
cd core
go vet ./...
go test ./...

# frontend
cd web
npm test
npm run build
npm run test:build     # dist/PWA artifact check
npm run test:e2e       # Playwright + mock API

# everything (tests, build, run server on :8080)
./run.sh
```

Run the narrowest relevant check after every change. If a command cannot run,
report the exact blocker instead of skipping silently.

## Ecosystem Integration

`omsu_setka` integrates with **omsu_bot** (Telegram GroupBot) through HTTP
webhooks.

- `omsu_setka → omsu_bot`: `POST` to a subscriber URL with an HMAC-signed
  payload when the schedule changes.
- `omsu_bot → omsu_setka`: `POST /api/v1/admin/webhooks` (or
  `PUT /api/v1/admin/webhooks/by-url`) to register a subscription.

Contract:

| Aspect | Detail |
|---|---|
| Method | `POST`, `application/json` |
| Signature | HMAC-SHA256, `X-Webhook-Signature` over `timestamp.body` |
| Replay protection | `X-Webhook-Timestamp` + `X-Webhook-Event-ID` |
| Retries | 3 attempts, 5s delay (configurable) |
| Payload | `{"type":"change","group_id":…,"entity_type":"group","entity_id":…,"event_id":"…","occurred_at":"…","changes":[…]}` |

When changing the contract, update both sides:
`core/internal/webhook/notifier.go` ↔ `omsu_bot/internal/handler/handler_webhook.go`.

## Backend Conventions

- Keep hot paths allocation-conscious: cached GETs must not re-serialize.
- Prefer pre-rendered JSON blobs and gzip for cached schedule responses.
- Use `zerolog` structured logging; never log FCM tokens, `ADMIN_KEY` or
  service-account contents.
- All upstream calls go through `internal/upstream` (timeouts, rate limit,
  incident logging).
- Preserve diff semantics and `schedule_changes` history: notifications, the
  changes feed and webhooks depend on it.
- Webhook subscribers are idempotent by URL.
- Use parameterized SQL. Migrations are idempotent and run at startup; add new
  columns through `newColumnsList`.
- New endpoints need Swagger annotations and a test in `internal/api`.

## Frontend Conventions

- React + TypeScript + Vite. Vanilla CSS with CSS variables; do not introduce
  Tailwind or CSS-in-JS.
- The design is a printed timetable board: paper surfaces, 1px rules, small
  radii, signal red for state only. Keep it; avoid cards/glassmorphism.
- Zustand for local persisted state, TanStack Query for server data,
  `lucide-react` for icons.
- Keep PWA and Firebase service worker integration intact; Firebase secrets
  arrive through build args, never commit them.
- Page transitions use native View Transitions (`src/lib/viewTransition.ts`,
  `AppLink`), in-page motion uses CSS. Do not add a heavy animation library
  without a concrete need.
- Preserve `prefers-reduced-motion` support and the mobile-first layout
  (desktop breakpoint 980px).

## Product Behavior To Preserve

- Smart Today: without an explicit `?day`, show the next school day when all
  lessons have ended or it is past 18:00; Sundays go to Monday. An explicit
  `?day` always wins.
- `/g/:id` redirects mobile to `today` and desktop to `week`, with OG metadata
  for link previews in production (nginx → backend share handler).
- Short, cached responses are the point of the project; avoid per-request
  upstream calls on read paths.
- Schedule changes are detected as added/removed/modified with field-level diff.
- Lesson type labels keep their colors; subgroups and windows are first-class.
- Desktop content width stays around 1100px.

## Security and Secrets

- Production refuses to start without `ADMIN_KEY` and explicit
  `CORS_ALLOWED_ORIGINS` (no `*`).
- Admin endpoints require `X-Admin-Key`.
- Do not commit `.env`, Firebase config, service accounts, tokens or database
  files. CI runs gitleaks.
- Keep rate limits enabled for API and search.

## Key Files

- `docs/ARCHITECTURE.md` — system design, cache, DB, API, notifications.
- `docs/UPSTREAM_API.md` — upstream Omsu API contract.
- `core/internal/api/router.go` — all routes and middleware.
- `core/internal/storage/migrations/migrate.go` — schema.
- `core/internal/sync/` — background sync and diff.
- `core/internal/webhook/notifier.go` — webhook delivery.
- `web/src/pages/` — Today, Week, Changes, Settings, Search, Entity.
- `web/src/styles/app.css` — design tokens and layout.
- `.github/workflows/ci.yml` — validation and deploy pipeline.
