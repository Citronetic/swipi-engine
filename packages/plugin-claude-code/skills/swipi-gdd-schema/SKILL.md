---
name: swipi-gdd-schema
description: Universal 6-section Game Design Document schema used by every swipi archetype. Invoke during Phase 2 of the swipi-workflow before writing GAME_DESIGN.md, or any time the user asks for the structure of a swipi GDD.
---

# GDD schema

**Authoritative source:** `${CLAUDE_PLUGIN_ROOT}/docs/gdd/core.md`

Read the full schema before drafting a GDD. The sections below are the contract between Phase 2 (design) and Phases 3–5 (generation + implementation).

## Section map (what each section feeds)

| Section | Title                | Downstream consumer                                     |
|---------|----------------------|---------------------------------------------------------|
| 0       | Architecture         | Phase 4 — `main.ts` registration, `LevelManager.LEVEL_ORDER` |
| 1       | Assets               | Phase 3 — asset generation, `asset-pack.json`           |
| 2       | Config               | Phase 4 — `gameConfig.json` merge                        |
| 3       | Entities / Scenes    | Phase 5 — per-file implementation                        |
| 4       | Levels / Content     | Phase 3 — tilemap generation & Phase 5 content loops     |
| 5       | Roadmap              | Phase 5 — todo-list expansion, file-by-file checklist    |

## Rules that have caused bugs in the past

- Section 0 scene keys **must** match the strings used in `scene.start()` / `scene.launch()` calls later. Pick them once here and never retype them.
- Section 1 asset keys **must** be lower_snake_case and must match the `asset-pack.json` keys character-for-character.
- Section 2 lists only **game-specific** config fields. The scaffold's existing `screenSize`, `debugConfig`, `renderConfig` are not in Section 2 — they survive untouched through a merge.
- Section 4 ASCII maps for `platformer` / `top_down` / `grid_logic` **must** reference tile glyphs from the archetype's `design_rules.md` tile legend. Invented glyphs break tilemap generation.
- Section 5 Roadmap lists every file to CREATE, MODIFY, or MERGE. When Phase 5 begins, the agent's todo list mirrors this section 1:1.

## Archetype-specific design rules

After loading this schema, invoke the matching `swipi-module-<archetype>` skill for design rules that are specific to the chosen physics regime (entity types, scene flow, level progression, etc.).
