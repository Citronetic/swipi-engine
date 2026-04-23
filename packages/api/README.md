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

All six phases (**classify → scaffold → GDD → assets → config → code → verify**) run end-to-end. Phase 1 (classify) runs deterministically via `@swipi/core`; Phases 2-6 run through a Claude agent loop with structured tools (file I/O scoped to the workspace, shell execution, and the `@swipi/core` game tools exposed as `tool_use` definitions).

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
| `SWIPI_MODE` | `smart` | `smart` (Opus for code implementation, ~$10+ per game) or `cheap` (Sonnet throughout, ~$1-2 per game). |
| `SWIPI_ASSET_PROVIDER` | `placeholder` | `placeholder` (1×1 PNG + silent WAV stubs, free) or `openai-images` (real assets via OpenAI, requires `OPENAI_API_KEY`). |
| `ANTHROPIC_API_KEY` | (required) | Claude credentials. |
| `OPENAI_API_KEY` | — | Required when `SWIPI_ASSET_PROVIDER=openai-images`. |

Per-request overrides: `POST /generate` accepts `{ prompt, archetype?, mode? }` — set `mode: "cheap"` to force Sonnet for that specific run.

## Architecture

```
POST /generate
      │
      ▼
  RunManager.start()              ─── persist state.json, return runId
      │
      ▼  (fire-and-forget)
  runOrchestration()
      │
      ├─ Phase 1: classify        ─── @swipi/core classifyGame() — deterministic pre-step
      │
      └─ Phases 2-6: agent loop
             │
             ▼
         runAgent() loop
             │  messages.create(model, tools, system) → Claude
             │  tool_use blocks → execute handler → tool_result
             │  (loop until stop_reason=end_turn)
             │
             ├── game tools:  classify_game, generate_gdd,
             │                generate_assets, generate_tilemap
             │                (wrap @swipi/core; call AssetProvider)
             ├── file tools:  read_file, write_file, edit_file, list_files
             │                (scoped to workspaceDir — can't escape)
             └── shell tool:  run_shell (cwd=workspace, 2-min timeout)
      │
      ▼
  RunStorage.appendEvent()        ─── NDJSON line per event
      │
      ▼
  EventEmitter fan-out             ─── SSE subscribers get live events
      │
      ▼
  client:  GET /runs/:id/events       replays events.ndjson, then tails live
  client:  GET /runs/:id/artifact.zip lazily runs archiver on workspace/
```

- **Storage:** `RunStorage` persists everything to `<runsRoot>/<runId>/` (`state.json`, `events.ndjson`, `workspace/`, `artifact.zip`). Simple JSON files, no DB. Swap `RunStorage` for a Blob/Neon-backed implementation if you target Vercel Functions or Cloudflare Workers.
- **Durability:** SSE subscribers that disconnect can reconnect and replay from the beginning (events are serialised to disk). A crashed server loses in-flight runs mid-phase — durable workflow integration (Inngest / Vercel Workflow / Temporal) is the clean extension point.
- **Assets:** ships `PlaceholderAssetProvider` (1×1 PNG + silent WAV stubs, free) and `OpenAIImageAssetProvider` (real images, pay-per-generation). Supply any other `AssetProvider` implementation for Stability, fal.ai, Replicate, DashScope, etc.
- **Tool safety:** the file tools reject any path that resolves outside `workspaceDir` — a prompt-injected `../../etc/passwd` request fails cleanly.
- **Cost controls:** `runAgent` enforces `maxIterations=60` and `maxOutputTokens=300_000` per run. Breach either limit and the run fails with a clear error rather than spinning indefinitely.

## Smoke test

Runs end-to-end without any API keys, using a stubbed Anthropic client that returns `end_turn` immediately:

```bash
npm run build --workspace=@swipi/api
node packages/api/scripts/smoke-test.mjs
# 18/18 checks pass — boots server, POST /generate, tails SSE,
# validates agent-loop hand-off, artifact download, 404 on unknown ids.
```

For a real end-to-end run against live Claude + OpenAI Images:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
SWIPI_ASSET_PROVIDER=openai-images SWIPI_MODE=cheap npm run start --workspace=@swipi/api
# then curl POST /generate in another shell
```

Expect ~3-8 minutes per run, 20-60 agent iterations, 10-30 tool calls.

## Known gaps (next steps)

- `POST /skills/template/evolve` and `POST /skills/debug/debug-loop` endpoints — the pipelines are in `@swipi/core`, just need HTTP plumbing.
- Durable workflow layer. Today a crash between agent iterations loses the in-flight run. A future `DurableRunManager` can checkpoint after each tool call.
- Authentication / rate limiting. The service is unauthenticated — put it behind a reverse proxy or API gateway for non-local deployment.
- Hosted storage. Current `RunStorage` assumes a persistent filesystem — fine for Docker/VPS/bare metal, not stateless serverless. The `RunStorage` class is the swap point.
- Streaming tool results. Agent-loop progress is published per tool call; intermediate text deltas inside a single message are not yet streamed (use the `onAssistantText` hook if embedding directly).
