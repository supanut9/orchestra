# @orchestra/skills

SKILL.md parser and system-prompt injector for Orchestra IDE. Provides:

- **Parser** — `parseSkill(filePath)` and `parseSkillContent(raw)` using gray-matter
- **Loader** — `loadSkills(dir)` walks a directory for `SKILL.md` files
- **Injector** — `composeSystemPrompt(base, skills)` concatenates skill instructions, deduped by id
- **Schema** — Zod-validated `Skill` type compatible with Anthropic's SKILL.md format

## Status

**pre-alpha** — Sprint 0 scaffold. All functions implemented and tested.

## SKILL.md format

```markdown
---
id: git-workflow
name: Git Workflow
description: Branching and commit conventions
version: 1.0.0
tags: [git, workflow]
---

Always create a feature branch from `main`.
Use conventional commits: feat/fix/chore.
```

## Usage

```ts
import { loadSkills, composeSystemPrompt } from '@orchestra/skills';

const skills = await loadSkills('.orchestra/skills');
const systemPrompt = composeSystemPrompt('You are a helpful assistant.', skills);
```

## Development

```bash
pnpm build        # tsup ESM bundle + .d.ts
pnpm dev          # watch mode
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run
```
