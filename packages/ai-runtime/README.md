# @orchestra/ai-runtime

Model-agnostic AI runtime for Orchestra IDE. Provides:

- **Provider registry** — Anthropic, OpenAI, Google, Ollama, OpenRouter via Vercel AI SDK
- **AgentSession** — per-session conversation loop with `streamText`
- **Coordinator** — LangGraph `StateGraph` that decomposes a goal into parallel `LanePlan[]`
- **Cost estimation** — token-usage to USD-cents calculator

## Status

**pre-alpha** — Sprint 0 scaffold. Types and stubs only; real LLM calls and LangGraph wiring land in Sprint 1.

## Usage (future)

```ts
import { createProvider, AgentSession, Coordinator } from '@orchestra/ai-runtime';

const model = createProvider({ providerId: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY! });
const session = new AgentSession({ provider: model });
const reply = await session.run('Hello!');

const coordinator = new Coordinator();
const lanes = await coordinator.decomposeTask('Refactor auth module');
```

## Development

```bash
pnpm build        # tsup ESM bundle + .d.ts
pnpm dev          # watch mode
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run
```
