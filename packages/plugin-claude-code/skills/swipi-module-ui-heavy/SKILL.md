---
name: swipi-module-ui-heavy
description: Design rules, template API, and implementation guide for ui_heavy-archetype games (UI-driven, no physics — card battles, visual novels, quiz games, trivia fighters like K.O.F Celestial Showdown). Invoke during Phase 2 for GDD drafting and Phase 5 as the reading-list index.
---

# UI-heavy module

**Authoritative sources:**

- `${CLAUDE_PLUGIN_ROOT}/docs/modules/ui_heavy/design_rules.md`
- `${CLAUDE_PLUGIN_ROOT}/docs/modules/ui_heavy/template_api.md`
- `${CLAUDE_PLUGIN_ROOT}/docs/modules/ui_heavy/ui_heavy.md`

## When to use

Gameplay is driven by UI widgets and state machines, not spatial collisions. No gravity, no free movement.

Examples: card battles (Harry Potter Arithmancy Academy), visual novels, quiz fighters (K.O.F Celestial Showdown), trivia-driven combat, dialogue-heavy RPGs.

## Reading order

Phase 2: `design_rules.md` + `template_api.md`.
Phase 5: `template_api.md` → targeted `_Template*` / `Base*` sources → `ui_heavy.md`.

## Template shape (note: no `entities/` directory)

- `ui/` — reusable widget components (Button, HealthBar, CardView, DialogueBox)
- `systems/` — `BattleSystem`, `DialogueSystem`, `DeckSystem`, `TriviaSystem`
- `scenes/` — `BaseGameScene`, `_TemplateBattleScene`, `_TemplateDialogueScene`

## Common pitfalls

- **Scene count is higher** than physics-based archetypes — each distinct screen (title, map, battle, dialogue, shop, end) is its own scene. Plan them all in GDD Section 0.
- **Scene transitions carry state** — use `this.scene.start('X', { data })` and destructure in `init(data)`. Do **not** use global singletons.
- **Animations are Tweens, not AnimationFrames** — `ui_heavy` has no spritesheet animation pipeline. Everything is `this.tweens.add({...})`.
- **Tilemaps do not apply** — skip the `generate-tilemap` step in Phase 3.
- **UI layout** — use the anchor helpers from `ui/` for responsive positioning. Hard-coded pixel offsets break on resize.
