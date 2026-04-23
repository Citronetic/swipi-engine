---
name: swipi-module-tower-defense
description: Design rules, template API, and implementation guide for tower_defense-archetype games (fixed enemy paths + waves + placeable towers — Kingdom Rush, Bloons TD, Hajimi Defense). Invoke during Phase 2 for GDD drafting and Phase 5 as the reading-list index.
---

# Tower-defense module

**Authoritative sources:**

- `${CLAUDE_PLUGIN_ROOT}/docs/modules/tower_defense/design_rules.md`
- `${CLAUDE_PLUGIN_ROOT}/docs/modules/tower_defense/template_api.md`
- `${CLAUDE_PLUGIN_ROOT}/docs/modules/tower_defense/tower_defense.md`

## When to use

Enemies follow pre-determined paths. Player places towers on allowed tiles. Gameplay is organised into waves.

## Reading order

Phase 2: `design_rules.md` + `template_api.md`.
Phase 5: `template_api.md` → targeted `_Template*` / `Base*` sources → `tower_defense.md`.

## Template shape

- `towers/` — `BaseTower`, `_TemplateTower`, per-tower behavior files
- `enemies/` — `BaseEnemy`, `_TemplateEnemy` — each follows a Path
- `entities/` — shared entity primitives (projectiles, pickups)
- `systems/` — `WaveManager`, `PathManager`, `EconomyManager`
- `scenes/` — `BaseGameScene`, `_TemplateLevel`

## Common pitfalls

- **Path definition** — paths are authored as waypoint arrays in `levelData.json` and consumed by `PathManager`. Do **not** hard-code waypoints in enemy subclasses.
- **Wave config** lives in `gameConfig.json` under `waveConfig`. Hard-coded waves in code break the wave editor workflow.
- **Tower placement rules** — `canPlaceTowerAt(cell)` in `BoardManager` must be called before committing a placement. It checks path overlap, existing towers, and the allowed-tiles mask.
- **AOE damage** — use `BaseTower.applyAOE()`; writing custom overlap logic bypasses the damage-reduction pipeline and breaks balance.
