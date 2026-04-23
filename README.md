# swipi-engine

Agentic framework for end-to-end web-game creation from a single prompt. A reimagining of [OpenGame](https://github.com/leigest519/OpenGame) on top of commercial LLMs (Claude) and common agent tooling, with three delivery modes:

1. **Claude Code plugin** — install into Claude Code, drive game generation with slash commands and skills. (**Phase 1 — delivered.**)
2. **Core library** — framework-agnostic TypeScript package reused by the plugin, API, and any future client. (**Phase 2 — delivered.**)
3. **REST API** — programmatic `/generate` endpoint with streaming progress and artifact download. (**Phase 3 — planned.**)

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
│   └── api/                         REST service (Claude + AI SDK)  (stub — Phase 3)
```

## Install the Claude Code plugin

```bash
# 1. Clone this repo
git clone <repo> && cd swipi-engine

# 2. Install the plugin into Claude Code (local path install)
claude /plugin install ./packages/plugin-claude-code

# 3. Launch Claude Code inside an empty game directory and run
/swipi-new "Build a Snake clone with WASD controls and a dark theme"
```

See [`packages/plugin-claude-code/README.md`](packages/plugin-claude-code/README.md) for slash commands, skills, and the underlying 6-phase workflow.

## Phase roadmap

See [`docs/MIGRATION_PLAN.md`](docs/MIGRATION_PLAN.md) for the full plan and rationale.

| Phase | Deliverable | Status |
|-------|-------------|--------|
| 1 | Claude Code plugin (POC) | ✅ |
| 2 | `@swipi/core` — extract game tools + skill pipelines as a framework-agnostic library | ✅ this commit |
| 3 | `@swipi/api` — REST service with Vercel AI SDK + Claude + durable workflows | 🚧 stub |
| 4 | Integration tests + OpenGame-Bench-style eval harness | ⏳ planned |

## License

Apache-2.0 (inherited from upstream OpenGame assets — see `packages/shared/` license headers).
