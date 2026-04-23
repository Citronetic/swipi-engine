# swipi-engine migration plan

A phased port of [OpenGame](https://github.com/leigest519/OpenGame) onto commercial LLMs and common agent tooling, delivered in three modes (Claude Code plugin, REST API, core library). Phase 1 is implemented; Phases 2–4 are scoped but not yet built.

---

## Goals (restated)

1. Replace qwen-code's custom agent runtime with a standard framework that can be exposed as a REST service.
2. Replace GameCoder-27B with commercial Claude models (Haiku 4.5, Sonnet 4.6, Opus 4.7) tiered per phase.
3. Ship a Claude Code plugin as a first-class delivery mode alongside the REST API.
4. Preserve every piece of OpenGame IP that isn't specifically coupled to qwen-code — templates, docs, the 6-phase workflow, the game-specific tools, and both evolution pipelines (Template Skill, Debug Skill).

## Non-goals

- No fine-tuned model training. We're not reproducing GameCoder-27B.
- No reimplementation of the qwen-code Ink UI. REST + plugin are the delivery modes.
- No OpenGame-Bench headless VLM evaluator in early phases. Deferred to Phase 4.

---

## Phase 1 — Claude Code plugin (**DONE** in current commit)

**Deliverable:** `packages/plugin-claude-code/` — installable via `claude /plugin install`.

**What carried over from OpenGame, unmodified:**

| OpenGame source | swipi-engine destination |
|-----------------|---------------------------|
| `agent-test/templates/core/` | `packages/shared/templates/core/` |
| `agent-test/templates/modules/{5 archetypes}/` | `packages/shared/templates/modules/` |
| `agent-test/docs/gdd/core.md` | `packages/shared/docs/gdd/core.md` |
| `agent-test/docs/asset_protocol.md` | `packages/shared/docs/asset_protocol.md` |
| `agent-test/docs/debug_protocol.md` | `packages/shared/docs/debug_protocol.md` |
| `agent-test/docs/modules/{archetype}/*.md` | `packages/shared/docs/modules/{archetype}/` |

**What was translated** (same content, new format):

| OpenGame | swipi-engine |
|----------|---------------|
| `agent-test/prompts/custom.md` (21 KB monolithic system prompt) | `skills/swipi-workflow/SKILL.md` + per-archetype + per-protocol skills (split into ~10 smaller skills Claude loads on demand) |
| qwen-code `SkillTool` frontmatter format | Claude Code `SKILL.md` frontmatter format (they're ~identical — `name`, `description`, optional `user-invocable`) |
| qwen-code `ToolNames.TASK` subagent | `agents/swipi-debugger.md` proactive Claude Code subagent |
| qwen-code CLI flags (`--yolo`, `-p`) | Claude Code slash commands (`/swipi-new`, `/swipi-verify`, `/swipi-scaffold`, `/swipi-classify`) |

**What is NOT in Phase 1** (called out explicitly so users don't think they're bugs):

- No MCP server bundled. Asset generation runs via `Bash` + whatever CLI/API the user has configured locally.
- No tiered Claude routing. Every phase uses whatever model the host Claude Code is configured for.
- No Template Skill / Debug Skill evolution. Those are library functions, not session-scoped operations — they belong in Phase 2.

**Phase-1 testing:**

```bash
npm run verify --workspace=@swipi/plugin-claude-code   # structural validation
claude /plugin install ./packages/plugin-claude-code
# inside Claude Code, in an empty dir:
/swipi-new "Build a Snake clone with WASD controls and a dark theme"
```

---

## Phase 2 — `@swipi/core` library (**DONE** in current commit)

**Deliverable:** framework-agnostic TypeScript package containing every non-qwen-specific piece of OpenGame, behind a clean API.

**Status:** built, typechecks clean, smoke test passes (7/7). `npm run build --workspace=@swipi/core` produces a publishable `dist/`.

### What landed

- `src/llm/` — `LLMClient` interface, `AnthropicLLMClient` (Haiku 4.5 / Sonnet 4.6 / Opus 4.7 tiers), `OpenAICompatClient` (OpenRouter / DashScope / OpenAI), `NoopLLMClient` test double.
- `src/tools/classify-game.ts` — clean port (~170 LOC). Same prompt + parser as OpenGame.
- `src/tools/generate-gdd.ts` — verbatim port (~1140 LOC) with all archetype section guidance preserved; qwen wrapper swapped for `generateGDD()` + `validateGenerateGDDParams()`.
- `src/tools/generate-tilemap.ts` + `src/utils/auto-tiler.ts` — verbatim port (deterministic, no LLM).
- `src/tools/generate-assets.ts` + `generate-assets-types.ts` — **redesigned**: the OpenGame DashScope/Doubao `ModelRouter` + 5 service files (~1700 LOC of provider-specific code) are replaced with a pluggable `AssetProvider` interface. Prompt-engineering IP (background vs. character framing, tileset layout hints) is preserved inline.
- `src/skills/template-skill/` — drop-in port (9 files + `meta-template/` data directory). One-line config change (`MODULE_ROOT = __dirname`).
- `src/skills/debug-skill/` — drop-in port (11 files + `seed-protocol/` data directory). Same one-line config adjustment.
- `src/workflow/orchestrator.ts` — programmatic 6-phase wrapper: `classifyPhase`, `scaffoldPhase`, `gddPhase`, `assetsPhase`, `tilemapPhase`, plus `runClassifyScaffoldGDD` for phases 1–3 in one call.
- `scripts/copy-assets.mjs` — copies `meta-template/` and `seed-protocol/` data into `dist/` during build so `MODULE_ROOT` resolution works at runtime.
- `scripts/smoke-test.mjs` — 7 checks covering classify, param validation, and data-file resolution.

### Scope (original plan, for reference)

Port these four game tools from `OpenGame/packages/core/src/tools/`:

| OpenGame tool file | `@swipi/core` function |
|-------------------|------------------------|
| `game-type-classifier.ts` (14 KB) | `classifyGame(prompt, llm): Promise<ClassificationResult>` |
| `generate-gdd.ts` (60 KB) | `generateGDD(input, llm): Promise<GDDDocument>` |
| `generate-assets.ts` (36 KB) | `generateAssets(registry, providers): Promise<AssetManifest>` |
| `generate-tilemap.ts` (17 KB) | `generateTilemap(asciiMap, config, providers): Promise<TilemapJSON>` |

Port the skill pipelines verbatim from `OpenGame/agent-test/`:

| OpenGame module | `@swipi/core` export |
|-----------------|----------------------|
| `template-skill/src/*` (9 files, ~60 KB) | `templateSkill.evolve(project): Promise<EvolveResult>` |
| `debug-skill/src/*` (11 files, ~90 KB) | `debugSkill.debugLoop(project, opts): Promise<DebugResult>` |

Each pipeline already has its own LLM client (they don't import qwen internals) — the port is mostly a move + adapter swap.

### LLM adapter interface

One small interface isolates the library from any specific SDK:

```typescript
// packages/core/src/llm/types.ts
export interface LLMClient {
  complete(opts: CompletionRequest): Promise<CompletionResponse>;
  stream?(opts: CompletionRequest): AsyncIterable<CompletionChunk>;
}
```

Adapters live outside core:
- `@swipi/api` ships a Claude adapter built on Vercel AI SDK.
- Users can supply an OpenAI adapter, a local-model adapter, etc.

### Package layout

```
packages/core/
├── src/
│   ├── tools/
│   │   ├── classify-game.ts
│   │   ├── generate-gdd.ts
│   │   ├── generate-assets.ts
│   │   └── generate-tilemap.ts
│   ├── skills/
│   │   ├── template-skill/              ← ported from agent-test/template-skill/src/
│   │   └── debug-skill/                 ← ported from agent-test/debug-skill/src/
│   ├── llm/
│   │   ├── types.ts                     LLMClient interface
│   │   └── noop.ts                      test double
│   ├── workflow/
│   │   └── orchestrator.ts              optional: wire the 6 phases together programmatically
│   └── index.ts
├── package.json
└── README.md
```

### Phase-2 acceptance criteria

- [ ] All four game tools callable as pure functions, with unit tests against a stub `LLMClient`.
- [ ] Template Skill and Debug Skill pipelines runnable against a sample project directory.
- [ ] Zero imports from `@opengame/*` or `qwen-*` packages.
- [ ] Published as `@swipi/core` (workspace only for now).

### Phase-2 optional

- MCP server wrapping the four game tools, so the Claude Code plugin can call them structurally instead of shelling out. This shortens the gap between plugin and API — both ultimately call the same `@swipi/core` functions.

---

## Phase 3 — `@swipi/api` REST service (**Phase 3a DONE** in current commit)

**Status:** MVP built. Typechecks clean, builds, and passes 16/16 checks in `scripts/smoke-test.mjs` (covers `/healthz`, `POST /generate`, SSE stream, state endpoint, zip artifact download, 404 handling). Phases 1-3 of the game-generation flow (classify → scaffold → GDD) run end-to-end. Phases 4-6 are Phase 3b.

### What landed

- `packages/api/src/server.ts` — Hono app factory (`createApp`) composing health + generate + runs routes.
- `packages/api/src/cli.ts` — `swipi-api` binary that wires `@hono/node-server`, `AnthropicLLMClient`, `PlaceholderAssetProvider`, and boots the server with env-based config.
- `packages/api/src/runs/state.ts` — filesystem-backed `RunStorage` (JSON state + NDJSON events + workspace dir + lazy zip).
- `packages/api/src/runs/manager.ts` — `RunManager` owns lifecycle, EventEmitter-fan-out SSE broadcaster, `subscribe()` that replays historical events then tails live.
- `packages/api/src/runs/pipeline.ts` — orchestrates phases 1-3 via `@swipi/core`, emits progress events.
- `packages/api/src/routes/{health,generate,runs}.ts` — the HTTP surface.
- `packages/api/src/providers/placeholder-assets.ts` — 1×1 PNG + silent WAV stub provider for keyless testing.
- `packages/api/src/utils/zip.ts` — archiver-based workspace zipper.

**Deliverable:** HTTP service that exposes `@swipi/core` and runs the 6-phase workflow end-to-end using Claude.

### Stack decision

- **Framework:** Hono (portable across Node, Cloudflare Workers, Vercel Functions). Alternative considered: Next.js route handlers — more features, but heavier and Next-specific.
- **LLM SDK:** Vercel AI SDK v5 with Anthropic provider. Gives us streaming, tool calls, and MCP integration out of the box.
- **Model tiering** (maps the OpenGame Qwen split to Claude):
  - Haiku 4.5 — Phase 1 classification, consistency checks, debug signature matching.
  - Sonnet 4.6 — Phase 2 GDD drafting, asset prompt authoring, debug root-cause analysis.
  - Opus 4.7 — Phase 5 code implementation, complex refactors.
- **Durability:** an end-to-end run is 10–30 minutes. HTTP alone is not sufficient. Options:
  - **Preferred:** Vercel Workflow DevKit — durable steps, automatic resume, native streaming.
  - **Alternatives:** Inngest, Temporal, or a lightweight job queue (BullMQ + Redis).
  - **Decision point:** pick in Phase 3 based on the hosting target — if Vercel, Workflow DevKit; if self-hosted, Inngest or BullMQ.

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/generate` | Start a new run. Body: `{ prompt, archetype? }`. Returns `{ runId }`. |
| `GET` | `/runs/:id/events` | SSE stream of phase progress + artifact events. |
| `GET` | `/runs/:id/artifacts` | Download generated project as a zip. |
| `GET` | `/runs/:id/artifacts/GAME_DESIGN.md` | Download a specific artifact. |
| `POST` | `/skills/template/evolve` | Feed a finished project into Template Skill. |
| `POST` | `/skills/debug/debug-loop` | Run Debug Skill verify→diagnose→repair on a project. |
| `GET` | `/skills/template/status` | Current template library state. |
| `GET` | `/skills/debug/status` | Current debug protocol state. |

### Package layout

```
packages/api/
├── src/
│   ├── server.ts                        Hono app
│   ├── routes/
│   │   ├── generate.ts
│   │   ├── runs.ts
│   │   └── skills.ts
│   ├── llm/
│   │   └── claude-adapter.ts            LLMClient backed by Vercel AI SDK + Anthropic
│   ├── workflow/
│   │   └── pipeline.ts                  6-phase orchestration on top of @swipi/core
│   ├── storage/
│   │   └── runs.ts                      run state + artifacts (SQLite or S3-style blob store)
│   └── index.ts
├── package.json
└── README.md
```

### Phase-3 acceptance criteria

- [ ] End-to-end `POST /generate` → SSE stream → zip artifact works for at least one prompt.
- [ ] All eight OpenGame test cases (marvel, squidGame, pikachu, harryPotter, kombat, hajimi, starWars, default) run through the API and produce a `npm run build`-passing project.
- [ ] Durable workflow: the API can be restarted mid-run without losing progress.
- [ ] Tiered routing: Haiku/Sonnet/Opus usage visible in logs, total run cost ≤ $5 for a typical game (target for comparison against OpenGame's Qwen baseline).

---

## Phase 4 — Evaluation harness + MCP parity

**Deliverable:**

- Integration test suite that runs the eight OpenGame prompts through the API nightly and reports build health, test pass rate, and cost-per-game.
- MCP server in `packages/mcp-server/` that wraps the `@swipi/core` tools, so third-party MCP clients (including the Claude Code plugin from Phase 1) can call them directly.
- Optional: a trimmed OpenGame-Bench analogue — headless browser execution + a VLM judging loop (Claude 4.7 with vision) for intent alignment.

### Phase-4 acceptance criteria

- [ ] Nightly eval over all 8 prompts; regression alert if build-pass-rate drops below last week's baseline.
- [ ] Phase-1 plugin and Phase-3 API both consume the MCP server — single source of truth for game tools.
- [ ] VLM judge produces scores for Build Health, Visual Usability, Intent Alignment on every generated game.

---

## Dependency order

```
Phase 1 (plugin, shipped)
          │
          ▼
Phase 2 (@swipi/core)
          │
   ┌──────┴──────┐
   ▼             ▼
Phase 3      Phase 4
(@swipi/api)  (eval + MCP)
```

Phase 2 blocks Phase 3 and Phase 4. Phase 3 and Phase 4 can run in parallel once Phase 2 lands.

## What we've deliberately dropped from OpenGame

- **qwen-code CLI** (`packages/cli`, ~40 files): replaced by Claude Code as the host. Not ported.
- **`@opengame/sdk` `query()` streaming SDK**: replaced by the Vercel AI SDK in `@swipi/api`. Not ported.
- **qwen-code `ToolRegistry`, `SubagentManager`, `SkillManager`**: replaced by Claude Code's native plugin system (plugin → skills/commands/agents) and by the Vercel AI SDK's tool primitive in `@swipi/api`. Not ported.
- **Qwen OAuth flow, Gemini content generator, Anthropic content generator**: irrelevant — Claude is the target.
- **GameCoder-27B**: replaced by tiered Claude. Not reproducible without the training pipeline.

Approximate code size dropped: ~70% of `OpenGame/packages/`. Approximate IP preserved: 100% of templates, docs, game tools, skill pipelines, and the 6-phase workflow.
