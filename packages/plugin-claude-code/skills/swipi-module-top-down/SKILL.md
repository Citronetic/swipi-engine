---
name: swipi-module-top-down
description: Design rules, template API, and implementation guide for top_down-archetype games (top-down + free continuous motion — Zelda, Isaac, Vampire Survivors, twin-stick shooters). Invoke during Phase 2 for GDD drafting and Phase 5 as the reading-list index.
---

# Top-down module

**Authoritative sources:**

- `${CLAUDE_PLUGIN_ROOT}/docs/modules/top_down/design_rules.md`
- `${CLAUDE_PLUGIN_ROOT}/docs/modules/top_down/template_api.md`
- `${CLAUDE_PLUGIN_ROOT}/docs/modules/top_down/top_down.md`

## When to use

Top-down perspective with free 2D movement — no gravity, no snap-to-grid. The character can move up without jumping.

Examples: Zelda, The Binding of Isaac, Vampire Survivors, Metal Slug's top-down levels, twin-stick shooters, the Mandalorian demo.

## Reading order

Phase 2: `design_rules.md` + `template_api.md`.
Phase 5: `template_api.md` → targeted `_Template*` / `Base*` sources → `top_down.md`.

## Template shape

- `behaviors/` — chase, patrol, wander, shoot behaviors
- `characters/` — `BasePlayer`, `BaseEnemy`, `_Template*` variants
- `scenes/` — `BaseGameScene`, `_TemplateLevel`
- `utils.ts` — top-down-specific helpers

## Common pitfalls

- **Velocity normalisation** — diagonal movement must be normalised to the base speed, or characters drift faster at 45°. `utils.ts` already ships `normalizeVelocity()` — use it.
- **Camera bounds** — set via `this.cameras.main.setBounds(...)` in `_TemplateLevel`. If bounds are not set, the camera drifts into empty tiles.
- **Collision masks** — top-down collision uses full body overlaps, not just foot boxes. Tile property schema differs from platformer; read `design_rules.md`.
