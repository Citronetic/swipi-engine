# swipi-engine

Turn a one-line prompt into a playable Phaser web game. An agentic framework on top of Claude that handles the full pipeline: classify the game → scaffold a project → write a Game Design Document → generate assets → wire config → implement code → verify it builds and runs.

Three ways to use it. Pick whichever fits your workflow.

---

## 1. Use it inside Claude Code (plugin)

Install once from inside Claude Code:

```text
/plugin marketplace add Citronetic/swipi-engine
/plugin install swipi-engine@swipi-engine
```

Then, in an empty directory, drive game generation with slash commands:

| Command | What it does |
|---|---|
| `/swipi-engine:swipi-new "<game idea>"` | End-to-end: classify → scaffold → GDD → assets → config → code → verify. Drops a playable Phaser project into the current directory. |
| `/swipi-engine:swipi-classify "<game idea>"` | Just returns the archetype (platformer, top_down, grid_logic, tower_defense, ui_heavy) and physics profile. No filesystem changes. |
| `/swipi-engine:swipi-scaffold <archetype>` | Copy the template for a specific archetype into the current directory. No GDD, no asset generation. |
| `/swipi-engine:swipi-verify [--dev]` | Run the pre-build consistency checks and the verify→diagnose→repair loop. Launches `npm run dev` if `--dev` is passed. |

Example:

```text
/swipi-engine:swipi-new "Build a Snake clone with WASD controls and a dark theme"
```

When it finishes:

```bash
npm install
npm run dev        # opens at http://localhost:5173
```

The plugin also exposes a proactive `swipi-debugger` subagent that Claude delegates to automatically when a build or runtime error shows up during a session.

Full plugin reference: [`packages/plugin-claude-code/README.md`](packages/plugin-claude-code/README.md).

---

## 2. Use it as a TypeScript library (`@swipi/core`)

Call the game-generation engine directly from your own code — no Claude Code, no agent runtime required.

```bash
npm install @swipi/core @anthropic-ai/sdk
```

```typescript
import path from 'node:path';
import { AnthropicLLMClient, runClassifyScaffoldGDD } from '@swipi/core';

const result = await runClassifyScaffoldGDD(
  "Build a Snake clone with WASD controls and a dark theme",
  {
    llm: new AnthropicLLMClient({ apiKey: process.env.ANTHROPIC_API_KEY }),
    sharedDir: path.resolve('./swipi-shared'),   // templates/ + docs/
    workspaceDir: path.resolve('./games/my-snake'),
    onPhaseStart: (p) => console.log(`[${p}] start`),
    onPhaseComplete: (p) => console.log(`[${p}] done`),
  },
);

console.log(result.classification.archetype);   // "grid_logic"
console.log(result.gddPath);                     // "./games/my-snake/GAME_DESIGN.md"
```

Individual tools are also exposed directly for finer-grained control: `classifyGame`, `generateGDD`, `generateAssets`, `generateTilemap`, plus the Template Skill and Debug Skill evolution pipelines.

The library is provider-agnostic — ship a Claude adapter out of the box, but any `LLMClient` implementation works (OpenRouter, DashScope, local models via the included `OpenAICompatClient`, or your own).

Full library reference: [`packages/core/README.md`](packages/core/README.md).

---

## 3. Use it as a REST service (`@swipi/api`)

Expose the same engine over HTTP — useful for CI pipelines, web UIs, or integrating with other agent platforms.

```bash
git clone https://github.com/Citronetic/swipi-engine.git
cd swipi-engine
npm install
npm run build --workspaces
export ANTHROPIC_API_KEY=sk-ant-...
npm run start --workspace=@swipi/api
# swipi-api listening on http://0.0.0.0:3000
```

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/healthz` | Liveness probe. |
| `POST` | `/generate` | Start a run. Body: `{ prompt, archetype? }`. Returns `202 { runId, links }`. |
| `GET` | `/runs/:id` | Current run state (JSON). |
| `GET` | `/runs/:id/events` | Server-Sent Events stream: phase-start → phase-complete → done. |
| `GET` | `/runs/:id/artifact.zip` | Download the generated project as a zip. |

### Example

```bash
# Kick off a run
curl -s -X POST http://localhost:3000/generate \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"A Snake clone with WASD controls and a dark theme"}'
# → { "runId": "...", "status": "queued", "links": { ... } }

# Tail progress (Ctrl-C after you see kind:"done")
curl -N http://localhost:3000/runs/<runId>/events

# Download the generated project
curl -o game.zip http://localhost:3000/runs/<runId>/artifact.zip
unzip game.zip -d game && cd game && npm install && npm run dev
```

Full API reference: [`packages/api/README.md`](packages/api/README.md).

---

## Repository layout

```
swipi-engine/
├── .claude-plugin/marketplace.json     Claude Code marketplace manifest
├── packages/
│   ├── shared/                         Templates and design docs
│   │   ├── templates/                    Phaser scaffolds — core + 5 archetypes
│   │   └── docs/                         GDD schema, asset/debug protocols, module manuals
│   ├── plugin-claude-code/             Claude Code plugin (skills, commands, agent)
│   ├── core/                           @swipi/core — TypeScript library
│   └── api/                            @swipi/api — Hono REST service
```

## License

Apache-2.0. Derived from [OpenGame](https://github.com/leigest519/OpenGame) (see [`NOTICE`](NOTICE) for upstream attribution).
