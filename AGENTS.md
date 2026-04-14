# Agent Instructions: omsu_setka

This file is the canonical project instruction entrypoint for coding agents.
Codex reads `AGENTS.md` directly. Claude and Gemini should read their root
entrypoints (`CLAUDE.md` and `GEMINI.md`), which delegate back to this file and
the shared `.agents/` registry.

## Project Overview

`omsu_setka` is a high-performance BFF (Backend-for-Frontend) that mirrors and
caches the Omsu University schedule. The main targets are low resource usage
(RAM below 50 MB, near-idle CPU), sub-millisecond cached responses, and
background synchronization that reduces load on the upstream Omsu server.

## Instruction Precedence

When instructions conflict, use this order:

1. System and tool/runtime instructions from the active agent.
2. Task-specific user instructions.
3. This `AGENTS.md` file.
4. `.agents/README.md` and `.agents/manifest.json`.
5. Relevant files in `.agents/skills/`.

If a skill mentions tooling or style that conflicts with this repository, follow
the repository rule. For example, frontend styling uses Vanilla CSS, not
Tailwind, even if a generic frontend skill mentions Tailwind.

## Shared Agent Structure

- `AGENTS.md` - canonical instructions for Codex and model-neutral behavior.
- `CLAUDE.md` - Claude-compatible entrypoint; delegates to this file.
- `GEMINI.md` - Gemini-compatible entrypoint; delegates to this file.
- `.agents/README.md` - shared registry and usage rules for all agents.
- `.agents/manifest.json` - machine-readable skill registry.
- `.agents/skills/*.md` - reusable skills grouped by backend, frontend,
  infrastructure, and standards.

Do not duplicate skill bodies into model-specific directories. Keep shared
instructions in `.agents/` and make model-specific files thin adapters.

## Mandatory Skills

Before development work, load and follow the relevant skills from
`.agents/skills/`. For broad feature work, load all skills in the applicable
category plus `lint-and-validate`.

Backend and API:

- `golang-pro`
- `sql-pro`
- `api-endpoint-builder`
- `api-documentation`
- `performance-optimizer`

Frontend:

- `senior-frontend`
- `typescript-expert`
- `zustand-store-ts`
- `tanstack-query-expert`
- `ui-ux-pro-max`
- `frontend-design`
- `progressive-web-app`

Infrastructure:

- `firebase-basics` for FCM or Firebase work
- `docker-expert`
- `bash-pro`

Standards:

- `lint-and-validate` after every code change
- `writing-plans` for multi-step implementation plans
- `blueprint` for multi-session or multi-PR work
- `commit` for any git commit

## Architecture

The project follows a tiered architecture:

- Frontend: React, TypeScript, Vite, PWA support, Vanilla CSS.
- Backend: Go with Fiber v2 providing a REST API.
- Storage:
  - L1 memory cache using `sync.Map` and pre-rendered JSON blobs.
  - L2 persistent SQLite in WAL mode using a pure-Go driver.
  - L3 upstream Omsu API accessed through background sync.
- Search: in-memory prefix tree (Trie) for autocomplete of groups, tutors, and
  auditories.
- Notifications: Firebase Cloud Messaging for schedule change alerts.

## Development Commands

Prerequisites:

- Go 1.22 or newer.
- Node.js 24 or newer with npm.
- Docker and Docker Compose for container workflows.

One-step run:

```bash
./run.sh
```

Backend development:

```bash
cd core
go run ./cmd/server/main.go
```

Frontend development:

```bash
cd web
npm install
npm run dev
```

Docker:

```bash
docker-compose up --build
```

## Validation

Run the narrowest relevant validation after every code change.

Backend:

```bash
cd core
go test ./...
```

Frontend:

```bash
cd web
npm run lint
npm run build
```

If a command cannot run because dependencies or tools are unavailable, report
the exact blocker and the command attempted.

## Backend Conventions

- Keep hot paths allocation-conscious.
- Prefer pre-rendered JSON blobs (`[]byte`) for cached schedule responses.
- Store and serve gzipped content directly when the client supports it.
- Use structured `zerolog` logging.
- Use environment variables for configuration.
- Preserve the schedule diff engine and `schedule_changes` history semantics.
- Use parameterized SQL and validate schema/index changes against SQLite.

## Frontend Conventions

- Use React with TypeScript and Vite.
- Use Vanilla CSS with CSS variables. Do not introduce Tailwind or another
  utility-first framework.
- Keep the current glassmorphism direction unless the task explicitly changes
  the design system.
- Use Zustand for lightweight client state such as favorites and recent search.
- Use `@tanstack/react-query` for server data fetching and cache behavior.
- Use `lucide-react` for icons.
- Preserve PWA behavior and Firebase service worker integration.
- Do not leak Firebase secrets into Git; service worker configuration is
  injected by build/deploy tooling.

## Current Product Behavior To Preserve

- Desktop content width is limited to about 1100 px for readability.
- Lesson type labels use distinct colors.
- Smart day switching moves to tomorrow after 18:00 and Monday on Sundays.
- Schedule change tracking detects added, removed, and modified lessons.
- Home and Tutors share centered search behavior and unified recent history
  limited to 5 items.

## Key Files

- `dev/SPEC.md` - detailed technical specification and architecture.
- `dev/TASKS.md` - implementation status and checklist.
- `dev/BACKEND_PLAN.md` - backend plan and roadmap.
- `dev/FRONTEND_PLAN.md` - frontend plan and roadmap.
- `dev/API_DATA.md` - upstream API documentation.
- `core/` - backend source code.
- `web/` - frontend source code.
- `docker-compose.dev.yml` and `docker-compose.prod.yml` - orchestration.
