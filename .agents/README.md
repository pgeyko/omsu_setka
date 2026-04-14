# Shared Agent Registry

`.agents/` is the model-neutral home for reusable project skills. Codex,
Gemini, Claude, and other coding agents should use the same files instead of
maintaining separate copies.

## Entry Points

- Codex: read `AGENTS.md`.
- Claude: read `CLAUDE.md`, then `AGENTS.md`.
- Gemini: read `GEMINI.md`, then `AGENTS.md`.
- Other agents: read `AGENTS.md`, then this file.

## Directory Layout

```text
.agents/
  README.md
  manifest.json
  skills/
    *.md
```

`manifest.json` is the machine-readable registry. `skills/*.md` contains the
actual workflow guidance.

## Skill Loading Rules

1. Load only skills relevant to the current task.
2. Always load `lint-and-validate` before editing code.
3. Load `commit` before creating any git commit.
4. Load `writing-plans` for multi-step implementation plans.
5. Load `blueprint` only for work that spans multiple sessions or PRs.
6. If a skill conflicts with `AGENTS.md`, `AGENTS.md` wins.

## Skill Groups

Backend:

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

- `firebase-basics`
- `docker-expert`
- `bash-pro`

Standards:

- `lint-and-validate`
- `writing-plans`
- `blueprint`
- `commit`

## Maintenance Rules

- Add new shared skills under `.agents/skills/`.
- Update `.agents/manifest.json` whenever skills are added, renamed, removed,
  or regrouped.
- Keep `CLAUDE.md` and `GEMINI.md` as adapters, not full copies.
- Avoid model-specific skill directories unless a tool absolutely requires
  them. Prefer symlinks or thin wrappers over duplicated content.
