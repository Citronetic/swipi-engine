---
name: swipi-module-platformer
description: Design rules, template API, and implementation guide for platformer-archetype games (side view + gravity — Mario, Street Fighter, Metal Slug, Castlevania). Invoke during Phase 2 to inform GDD drafting, and again during Phase 5 as a reading-list index.
---

# Platformer module

**Authoritative sources** (read with the `Read` tool — absolute paths):

- Design rules: `${CLAUDE_PLUGIN_ROOT}/docs/modules/platformer/design_rules.md`
- Template API: `${CLAUDE_PLUGIN_ROOT}/docs/modules/platformer/template_api.md`
- Implementation manual: `${CLAUDE_PLUGIN_ROOT}/docs/modules/platformer/platformer.md`

## When to use

- Anything with gravity and a side view: Mario, Terraria, Street Fighter, Castlevania.
- Fighting games count: knockups mean characters fall under gravity.

## Reading order (respect Phase 5 context discipline)

During **Phase 2 (GDD)**: read `design_rules.md` + `template_api.md` for design knowledge and code capabilities.

During **Phase 5 (code)**: read in this order, last-read stays freshest:
1. `template_api.md` — compressed reference for every template hook, behavior, and utility (Layer 1).
2. Every `_Template*.ts` you will COPY and every `Base*.ts` you will EXTEND, as identified from GDD Section 5 (Layer 2).
3. `platformer.md` — implementation manual (Layer 3 — read last).

## Template shape

Shipped in `templates/modules/platformer/src/`:

- `behaviors/` — reusable AI/physics behaviors (patrol, chase, jump, shoot)
- `characters/` — `BasePlayer`, `BaseEnemy`, `_TemplatePlayer`, `_TemplateEnemy`
- `scenes/` — `BaseGameScene`, `_TemplateLevel`
- `utils.ts` — platformer-specific helpers
- `gameConfig.json` — platformer config defaults

## Common pitfalls

- **Jump velocity in gameConfig** must be **negative** (Phaser Y axis points down).
- **Tile collision** is configured in `levelData.json` per-tile — not in the scene code. Read `design_rules.md` for the tile-property schema.
- **Enemy patrol bounds** come from `behaviors/PatrolBehavior.ts` — do not reimplement patrol in the enemy subclass.
