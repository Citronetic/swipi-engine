---
name: swipi-asset-protocol
description: Reference for generating game assets (sprites, backgrounds, tilemaps, audio) and wiring them into asset-pack.json. Invoked by the swipi-workflow skill during Phase 3, or any time the user asks Claude to add, replace, or debug game assets.
---

# Asset protocol

Read the full protocol document before generating assets — it is the single source of truth for asset keys, file conventions, and pack structure.

**Authoritative source:** `${CLAUDE_PLUGIN_ROOT}/docs/asset_protocol.md`

Use the `Read` tool with that absolute path. Do not paraphrase from memory.

## Phase-3 checklist

1. `Read` the asset protocol in full.
2. Produce every texture listed in GDD Section 1 (Asset Registry).
3. Produce every tilemap described in GDD Section 4 (Level Layouts) except for `ui_heavy` games.
4. Register every produced asset in `public/assets/asset-pack.json` under the correct bucket (`images` / `spritesheets` / `audio` / `atlases`).
5. `Read` the resulting `asset-pack.json` so the exact string keys are in your context for Phase 5.

## Invariants (violations cause runtime `TextureNotFound` / `AnimationNotFound`)

- Every texture/audio key used in source code **must** exist in `asset-pack.json` with identical spelling.
- Every animation key in `animations.json` **must** point to a spritesheet registered in `asset-pack.json`.
- `title_bg` in `asset-pack.json` must point to a real image file before `TitleScreen` runs.
- If `>8` assets are required, split generation into two batches (backgrounds/tilesets first, animations/audio second) to keep each tool call focused.

## Tool choice for asset generation

When running inside the swipi-engine Claude Code plugin, use Claude's `Bash` tool plus whatever image/audio CLI is configured locally — there is no bundled `generate-assets` MCP tool in this Phase-1 POC. Phase 2 will expose the OpenGame `GenerateAssetsTool`, `GenerateTilemapTool`, and `GenerateGDDTool` through an MCP server bundled with this plugin.

Until then:

- For images: use `curl` against any image-generation API you have keys for (DashScope, OpenAI Image, Stability, fal.ai) and save under `public/assets/`.
- For tilemaps: write the Phaser JSON tilemap format by hand from GDD Section 4 ASCII maps (the asset protocol document includes the exact schema).
- For audio: either use placeholder silent WAVs or call an audio-generation endpoint if configured.
