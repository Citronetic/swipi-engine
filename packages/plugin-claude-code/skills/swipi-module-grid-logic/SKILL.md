---
name: swipi-module-grid-logic
description: Design rules, template API, and implementation guide for grid_logic-archetype games (discrete grid + turn-based or step-based motion — Sokoban, Fire Emblem, Match-3, Pikachu-grid puzzles). Invoke during Phase 2 for GDD drafting and Phase 5 as the reading-list index.
---

# Grid-logic module

**Authoritative sources:**

- `${CLAUDE_PLUGIN_ROOT}/docs/modules/grid_logic/design_rules.md`
- `${CLAUDE_PLUGIN_ROOT}/docs/modules/grid_logic/template_api.md`
- `${CLAUDE_PLUGIN_ROOT}/docs/modules/grid_logic/grid_logic.md`

## When to use

Positions snap to cells. Movement is discrete — either turn-based (Fire Emblem) or step-based (Sokoban, Pikachu match puzzle). No continuous physics.

## Reading order

Phase 2: `design_rules.md` + `template_api.md`.
Phase 5: `template_api.md` → targeted `_Template*` / `Base*` sources → `grid_logic.md`.

## Template shape

- `entities/` — grid-aware entities with discrete positions
- `systems/` — `BoardManager`, turn systems, match resolvers
- `scenes/` — `BaseGameScene`, `_TemplateBoardScene`
- `utils.ts` — grid/cell coordinate conversions

## Common pitfalls

- **Pixel vs. cell coordinates** — never mix them. Use `BoardManager.cellToPixel()` / `pixelToCell()` at every conversion point.
- **Move validation** happens in `BoardManager.canMove()` — call it before mutating entity position, not after.
- **Match detection** for match-3 style games uses `BoardManager.findMatches()` recursively — call after every swap and before re-enabling input.
- **Animation timing** — entity tweens must complete before the next turn is enabled. Use `BoardManager.waitForTweens()`.
