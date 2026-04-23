# @swipi/shared

Source-of-truth templates and design documents, shared across all swipi-engine delivery modes.

- `templates/core/` — base Phaser + Vite + TypeScript + Tailwind scaffold.
- `templates/modules/{platformer,top_down,grid_logic,tower_defense,ui_heavy}/` — per-archetype code (scenes, entities, behaviors, systems).
- `docs/gdd/core.md` — universal Game Design Document schema.
- `docs/asset_protocol.md` — rules for generating sprites / tilemaps / audio.
- `docs/debug_protocol.md` — pre-build consistency checks and verify loop.
- `docs/modules/{archetype}/` — `design_rules.md`, `template_api.md`, `{archetype}.md` per archetype.

These assets are imported verbatim from [OpenGame `agent-test/`](https://github.com/leigest519/OpenGame/tree/main/agent-test) and are Apache-2.0 licensed. Downstream packages consume them via workspace path (`../shared/...`) or, for the plugin, via symlink so they resolve as `${CLAUDE_PLUGIN_ROOT}/templates/...` at runtime.
