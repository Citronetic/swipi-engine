# swipi-engine

Agentic framework for end-to-end web-game creation from a single prompt. A reimagining of [OpenGame](https://github.com/leigest519/OpenGame) on top of commercial LLMs (Claude) and common agent tooling, with three delivery modes:

1. **Claude Code plugin** — install into Claude Code, drive game generation with slash commands and skills. (**Phase 1 — delivered.**)
2. **Core library** — framework-agnostic TypeScript package reused by the plugin, API, and any future client. (**Phase 2 — delivered.**)
3. **REST API** — programmatic `/generate` endpoint with streaming progress and artifact download. (**Phase 3a — delivered.** Phases 4–6 of the generation flow scoped to 3b.)

## Monorepo layout

```
swipi-engine/
├── docs/
│   └── MIGRATION_PLAN.md            Phase 1 → Phase 3 roadmap
├── packages/
│   ├── shared/                      Templates & design docs (source of truth)
│   │   ├── templates/               Phaser scaffolds (core + 5 archetypes)
│   │   └── docs/                    GDD schema, asset/debug protocols, module manuals
│   ├── plugin-claude-code/          Claude Code plugin — **Phase 1 POC**
│   │   ├── .claude-plugin/plugin.json
│   │   ├── skills/                  SKILL.md files exposed to Claude
│   │   ├── commands/                Slash commands (/swipi-new, /swipi-verify, ...)
│   │   ├── agents/                  Subagents (debugger)
│   │   ├── templates/ -> shared     symlink
│   │   └── docs/ -> shared          symlink
│   ├── core/                        Framework-agnostic engine — **Phase 2 delivered**
│   │   ├── src/llm/                    AnthropicLLMClient, OpenAICompatClient, NoopLLMClient
│   │   ├── src/tools/                  classifyGame, generateGDD, generateAssets, generateTilemap
│   │   ├── src/skills/template-skill/  library-evolution pipeline (ported)
│   │   ├── src/skills/debug-skill/     debug-protocol pipeline (ported)
│   │   └── src/workflow/               programmatic 6-phase orchestrator
│   └── api/                         Hono REST service — **Phase 3a delivered**
│       ├── src/server.ts                createApp() — Hono app factory
│       ├── src/cli.ts                   swipi-api binary (Node, @hono/node-server)
│       ├── src/routes/                  /healthz, /generate, /runs/*
│       ├── src/runs/                    RunManager, RunStorage, pipeline
│       └── src/providers/               PlaceholderAssetProvider (swap for real)
```

## Install the Claude Code plugin

Inside Claude Code, add the marketplace and install the plugin:

```text
/plugin marketplace add Citronetic/swipi-engine
/plugin install swipi-engine@swipi-engine
```

Then inside an empty game directory:

```text
/swipi-new "Build a Snake clone with WASD controls and a dark theme"
```

Alternative — local-path install (for plugin development against a clone):

```bash
git clone git@github.com:Citronetic/swipi-engine.git && cd swipi-engine
# then in Claude Code:
/plugin install ./packages/plugin-claude-code
```

See [`packages/plugin-claude-code/README.md`](packages/plugin-claude-code/README.md) for slash commands, skills, and the underlying 6-phase workflow.

## Phase roadmap

See [`docs/MIGRATION_PLAN.md`](docs/MIGRATION_PLAN.md) for the full plan and rationale.

| Phase | Deliverable | Status |
|-------|-------------|--------|
| 1 | Claude Code plugin (POC) | ✅ |
| 2 | `@swipi/core` — extract game tools + skill pipelines as a framework-agnostic library | ✅ |
| 3a | `@swipi/api` — Hono REST service: `POST /generate`, SSE, zip artifacts; phases 1–3 of the workflow | ✅ this commit |
| 3b | Phases 4–6 (assets / config / code / verify) + durable workflow layer + skills endpoints | ⏳ planned |
| 4 | Integration tests + OpenGame-Bench-style eval harness | ⏳ planned |

## License

Apache-2.0 (inherited from upstream OpenGame assets — see `packages/shared/` license headers).
