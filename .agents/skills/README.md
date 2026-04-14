# Skills

This directory contains reusable markdown skills shared by Codex, Claude,
Gemini, and other coding agents.

Use `.agents/manifest.json` as the authoritative index for skill names, groups,
and paths.

## Rules

- Do not rename a skill file without updating `.agents/manifest.json`.
- Do not copy these files into model-specific directories.
- Keep skills generic and put project-specific overrides in `AGENTS.md`.
- Prefer adding a new skill over expanding an unrelated skill.
