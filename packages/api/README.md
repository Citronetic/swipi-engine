# @swipi/api

REST service that exposes `@swipi/core` over HTTP. Hono-based, portable across plain Node, Docker, and any host with a persistent filesystem. Streams phase progress via Server-Sent Events; delivers generated projects as a zip.

## What Phase 3 ships

| Endpoint | Purpose |
|---|---|
| `GET /healthz` | Liveness probe. |
| `POST /generate` | Start a run. Body: `{ prompt, archetype? }`. Returns `202` + `{ runId, status, links }`. |
| `GET /runs/:id` | Current run state (status, archetype, completedPhases, timestamps). |
| `GET /runs/:id/events` | Server-Sent Events stream. Replays historical events, then streams live until `kind:"done"`. |
| `GET /runs/:id/artifact.zip` | Lazy-built zip of the generated workspace. Available once the run reaches a terminal status. |

Phases 1-3 of the 6-phase workflow (**classify → scaffold → GDD**) run end-to-end. Phases 4-6 (assets / config merge / code / verify) require an LLM agent loop on top of `@swipi/core` — scoped to Phase 3b. The generated zip contains the full archetype scaffold + `GAME_DESIGN.md`, runnable once assets are filled in.

## Run it

```bash
# From the repo root:
npm install
npm run build --workspaces

# Point at a Claude key and start the server
export ANTHROPIC_API_KEY=sk-ant-...
npm run start --workspace=@swipi/api
# swipi-api listening on http://0.0.0.0:3000
```

Or programmatically:

```typescript
import { serve } from '@hono/node-server';
import { AnthropicLLMClient } from '@swipi/core';
import { createApp, RunManager, PlaceholderAssetProvider } from '@swipi/api';

const manager = new RunManager({
  runsRoot: './.swipi/runs',
  sharedDir: './packages/shared',
  llm: new AnthropicLLMClient(),
  assetProvider: new PlaceholderAssetProvider(),  // swap for real generator
});
serve({ fetch: createApp({ manager }).fetch, port: 3000 });
```

## Try it

```bash
# 1. Kick off a run
curl -s -X POST http://localhost:3000/generate \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"A Snake clone with WASD controls and a dark theme"}' | jq
# → { "runId": "…", "status": "queued", "links": { … } }

# 2. Tail SSE (Ctrl-C when you see kind:"done")
curl -N http://localhost:3000/runs/<runId>/events

# 3. Download the generated project
curl -o game.zip http://localhost:3000/runs/<runId>/artifact.zip
unzip game.zip -d game/ && cd game && npm i && npm run dev
```

## Configuration

All via environment variables:

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port. |
| `HOST` | `0.0.0.0` | Bind address. |
| `SWIPI_RUNS_DIR` | `./.swipi/runs` | Where per-run state + artifacts are persisted. |
| `SWIPI_SHARED_DIR` | `../shared` | Path containing `templates/` and `docs/`. |
| `ANTHROPIC_API_KEY` | (required) | Claude credentials. Omit only when embedding `createApp` with a custom `LLMClient`. |

Claude tier routing (Haiku 4.5 fast → Sonnet 4.6 balanced → Opus 4.7 smart) is inherited from `@swipi/core`'s `AnthropicLLMClient`. Override via the `tierModels` constructor option.

## Architecture

```
POST /generate
      │
      ▼
  RunManager.start()            ─── persists initial state.json, returns runId
      │
      ▼  (fire-and-forget)
  runOrchestration()            ─── classify → scaffold → GDD (from @swipi/core)
      │
      │  each phase emits:
      ▼
  RunStorage.appendEvent()      ─── append NDJSON line to events.ndjson
      │
      ▼
  EventEmitter fan-out           ─── SSE subscribers get live events
      │
      ▼
  client:  GET /runs/:id/events  ── replays events.ndjson, then tails live
  client:  GET /runs/:id/artifact.zip  ── lazily runs archiver on workspace/
```

- **Storage:** `RunStorage` persists everything to `<runsRoot>/<runId>/` (`state.json`, `events.ndjson`, `workspace/`, `artifact.zip`). Simple JSON files, no DB. Swap `RunStorage` for a Blob/Neon-backed implementation if you target Vercel Functions or Cloudflare Workers.
- **Durability:** SSE subscribers that disconnect can reconnect and replay from the beginning (events are serialised to disk). A crashed server recovers in-flight runs on restart if you re-run orchestration — durable workflow integration (Inngest / Vercel Workflow / Temporal) is the Phase 3b seam.
- **Assets:** ships `PlaceholderAssetProvider` (1×1 PNG + silent WAV stubs) so runs are testable without an image API key. Swap in your own `AssetProvider` implementation (OpenAI images, Stability, fal.ai, Replicate, DashScope) for real content.

## Smoke test

Runs end-to-end without any API keys, using `NoopLLMClient` + canned responses:

```bash
npm run build --workspace=@swipi/api
node packages/api/scripts/smoke-test.mjs
# 16/16 checks pass — boots server, POST /generate, tails SSE,
# validates state + artifact, 404 on unknown ids.
```

## Known Phase-3 gaps (scheduled for 3b)

- `POST /skills/template/evolve` and `POST /skills/debug/debug-loop` endpoints (the pipelines are already in `@swipi/core`; just need HTTP plumbing).
- Phases 4-6 of the game-generation workflow. Requires embedding Claude as an agent loop over `@swipi/core`'s tools — the cleanest shape is a Vercel AI SDK `generateText` with tool bindings, but keeping it on the same `LLMClient` interface keeps the library provider-neutral.
- Durable workflow layer. Today a crash between phases loses the in-flight run. A future `DurableRunManager` can checkpoint at each phase.
- Authentication / rate limiting. The MVP is unauthenticated and should sit behind a reverse proxy for anything non-local.
- Hosted storage. Current `RunStorage` assumes a persistent filesystem — fine for Docker/VPS/bare metal, not for stateless serverless. The `RunStorage` interface is the swap point.
