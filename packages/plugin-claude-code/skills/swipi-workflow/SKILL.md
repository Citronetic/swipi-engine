---
name: swipi-workflow
description: Authoritative 6-phase workflow for building a playable Phaser web game from a user prompt. Use whenever the user asks Claude to "build a game", "make a game", "scaffold a game", or triggers the /swipi-new slash command. Orchestrates classification, scaffolding, GDD generation, asset generation, config wiring, code implementation, and verification.
---

# swipi 6-phase game-building workflow

You are building a playable 2D web game from a user prompt. Work autonomously through these six phases in order. **Do not skip phases or reorder them.** Context discipline is load-bearing: do not read heavy template source files before Phase 5.

Plugin root (use these absolute paths for every file operation):

- Templates: `${CLAUDE_PLUGIN_ROOT}/templates/`
- Docs: `${CLAUDE_PLUGIN_ROOT}/docs/`

Create a todo list with TodoWrite at the very start covering all six phases, then expand Phase 5 into per-file todos once the GDD exists.

---

## Phase 1 — Classify + Scaffold

1. Invoke the `swipi-classify-game` skill to pick one of five archetypes: `platformer`, `top_down`, `grid_logic`, `tower_defense`, `ui_heavy`. The classifier uses **physics-first logic** — do not classify by genre name.
2. Scaffold the project into the current working directory by copying these four sources in order:

   ```bash
   cp -r "${CLAUDE_PLUGIN_ROOT}/templates/core/." ./
   cp -r "${CLAUDE_PLUGIN_ROOT}/templates/modules/<archetype>/src/." ./src/
   mkdir -p docs/gdd docs/modules/<archetype>
   cp "${CLAUDE_PLUGIN_ROOT}/docs/gdd/core.md" docs/gdd/
   cp "${CLAUDE_PLUGIN_ROOT}/docs/asset_protocol.md" "${CLAUDE_PLUGIN_ROOT}/docs/debug_protocol.md" docs/
   cp -r "${CLAUDE_PLUGIN_ROOT}/docs/modules/<archetype>/." docs/modules/<archetype>/
   ```

3. **Proceed directly to Phase 2. Do not read any source files yet** — that happens in Phase 5.

## Phase 2 — Generate the GDD

1. Invoke the `swipi-gdd-schema` skill for the universal 6-section GDD format.
2. Invoke `swipi-module-<archetype>` to load archetype-specific design rules and the template API summary.
3. Draft the GDD in memory, then write `GAME_DESIGN.md` at the project root.
4. Expand the todo list with per-file todos derived from GDD Section 5 (Roadmap).

## Phase 3 — Assets

1. Invoke the `swipi-asset-protocol` skill for the asset-generation contract.
2. Produce every texture/audio asset listed in GDD Section 1 and every tilemap listed in GDD Section 4. Tilemaps do **not** apply to `ui_heavy`.
3. Read the generated `public/assets/asset-pack.json` so you know the exact keys for Phase 5.

## Phase 4 — Config + Registration

All three files below are **read-then-update**:

1. **`src/gameConfig.json`** — MERGE, do not overwrite. Preserve the existing `screenSize`, `debugConfig`, `renderConfig` fields. Add game-specific fields from GDD Section 2. Every value uses the `{ "value": X, "type": "...", "description": "..." }` wrapper. If the final JSON is missing `screenSize`, you replaced instead of merged — redo.
2. **`src/LevelManager.ts`** — set `LEVEL_ORDER` from GDD Section 0.
3. **`src/main.ts`** — import and `game.scene.add()` every game scene from GDD Section 0. Keep the existing UI scene registrations.
4. **`src/scenes/TitleScreen.ts`** — replace the placeholder title with the game's actual name.

## Phase 5 — Code implementation

Use a 3-layer reading strategy. Do not invert this order.

- **Layer 1 (API summary):** `Read` `docs/modules/<archetype>/template_api.md`.
- **Layer 2 (targeted source):** `Read` every `_Template*.ts` you will copy and every `Base*.ts` you will extend, as identified from GDD Section 5.
- **Layer 3 (implementation guide):** `Read` `docs/modules/<archetype>/<archetype>.md` last, so it stays freshest in context.

Hard constraints:

- **Never invent** type names, hook names, or function signatures. If it is not in a source file or in `template_api.md`, it does not exist.
- **Never modify KEEP files** (`Base*.ts`, `behaviors/*`, `systems/*`, `ui/*`, `utils.ts`). Create new files instead.
- Always base new scenes on `_Template*.ts` (COPY) or `Base*.ts` (EXTEND).
- Always call `super.create()` / `super.update()` when overriding.
- Override visibility must match the base class — use `protected override` when the base is protected.

Before writing any code, emit a **pre-implementation plan** listing every file you will MODIFY and every file you will CREATE, with the hook/class each one uses. Re-check the plan against GDD Section 5.

## Phase 6 — Verify

1. Invoke the `swipi-debug-protocol` skill and run every applicable checklist item.
2. `npm install` if needed, then `npm run build` — fix every TypeScript error before proceeding.
3. `npm run test` for headless tests.
4. `npm run dev` and verify the game renders.

If build fails, read the full error, open the exact file at the exact line, fix the root cause. Never guess.

---

## TypeScript rules (recurring causes of bugs)

**Import rule** — classes are value imports, interfaces/types must use `type`:

```typescript
// correct
import { BasePlayer, type PlayerConfig } from './BasePlayer';
// wrong — build error
import { BasePlayer, PlayerConfig } from './BasePlayer';
```

**Config access rule** — every `gameConfig` value is `{ value: X }`; access via `.value`:

```typescript
const hp = config.battleConfig.playerMaxHP.value;
```

## Final consistency checklist (run before declaring done)

1. **Asset-code consistency**: every texture/audio key used in code exists in `asset-pack.json` with exact spelling.
2. **Scene registration**: every `scene.start()` / `scene.launch()` target is registered in `main.ts` and in `LEVEL_ORDER` where applicable.
3. **Config wrappers**: every `gameConfig.json` field uses `{ value, type, description }` and every access uses `.value`.
4. **Title screen**: `TitleScreen.ts` displays the game's real name, not a placeholder.
