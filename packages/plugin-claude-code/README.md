# @swipi/plugin-claude-code

A Claude Code plugin that turns a one-line prompt into a playable Phaser web game. It ships the swipi 6-phase workflow, the archetype classifier, five archetype-specific design guides, the asset and debug protocols, four slash commands, and a debug subagent.

## Install

From this repo (symlink-based, live-reloads as you edit skills):

```bash
claude /plugin install ./packages/plugin-claude-code
```

For a portable distribution directory (symlinks resolved to real copies):

```bash
npm run build --workspace=@swipi/plugin-claude-code
claude /plugin install ./packages/plugin-claude-code/dist
```

Verify the plugin structure before installing:

```bash
npm run verify --workspace=@swipi/plugin-claude-code
```

## Use

Open Claude Code in an empty directory and run any of these:

| Command | What it does |
|---------|--------------|
| `/swipi-new "<game idea>"` | Full 6-phase build: classify → scaffold → GDD → assets → config → code → verify. The main flow. |
| `/swipi-classify "<game idea>"` | Return only the archetype + reasoning. Does not touch the filesystem. |
| `/swipi-scaffold <archetype>` | Copy the core template + module code + docs for one archetype. Does not generate a GDD or assets. |
| `/swipi-verify [--dev]` | Run the pre-build checks and verify→diagnose→repair loop on the current project. |

The plugin also exposes a proactive subagent, `swipi-debugger`, which Claude will delegate to when a build/test/dev command fails during a session.

## What's inside

```
plugin-claude-code/
├── .claude-plugin/plugin.json    # manifest
├── skills/                       # 10 SKILL.md files — loaded on demand by Claude
│   ├── swipi-workflow/              (the 6-phase orchestration contract)
│   ├── swipi-classify-game/         (physics-first archetype decision procedure)
│   ├── swipi-gdd-schema/            (universal 6-section GDD format)
│   ├── swipi-asset-protocol/        (asset generation rules)
│   ├── swipi-debug-protocol/        (verify→diagnose→repair loop)
│   └── swipi-module-{archetype}/    (design rules + API + gotchas per archetype × 5)
├── commands/                     # slash commands
│   ├── swipi-new.md
│   ├── swipi-classify.md
│   ├── swipi-scaffold.md
│   └── swipi-verify.md
├── agents/swipi-debugger.md      # subagent invoked on build/test/dev failures
├── hooks/                        # (reserved for Phase 2 — session-start provider status, etc.)
├── scripts/
│   ├── verify-plugin.mjs            # structural validation
│   └── build-plugin.mjs             # assemble dist/ with symlinks resolved
├── templates/  → ../shared/templates  (symlink)
└── docs/       → ../shared/docs       (symlink)
```

## Skill vs. command vs. subagent — when each fires

- **Skills** are loaded when Claude decides they're relevant to the user's message, or when another skill invokes them by name. They are background knowledge — not actions.
- **Commands** (`/swipi-new`, `/swipi-verify`, …) are user-triggered. They kick off a specific flow and typically invoke one or more skills internally.
- **Subagents** (`swipi-debugger`) run in isolated context. Claude delegates to them proactively — you don't call them directly.

## Known Phase-1 gaps (fixed in later phases)

- **No bundled MCP tools yet.** Asset generation runs via plain `Bash` + whatever CLI/API the user has configured. Phase 2 will add an MCP server exposing the OpenGame `GenerateAssetsTool`, `GenerateGDDTool`, `GenerateTilemapTool`, and `GameTypeClassifierTool` so Claude can call them structurally rather than scripting shell commands.
- **No commercial-LLM-specific routing.** Every phase runs on whatever model Claude Code is configured to use (default: Opus). Phase 3 (the REST API) will introduce the Haiku → Sonnet → Opus tiering that makes end-to-end runs economic.
- **No Template Skill / Debug Skill evolution.** Those pipelines live in OpenGame's `agent-test/template-skill` and `agent-test/debug-skill`. Phase 2 will port them as library APIs the plugin can call (e.g. post-`/swipi-new` the project gets automatically fed into the template-skill evolver).

See [`../../docs/MIGRATION_PLAN.md`](../../docs/MIGRATION_PLAN.md) for the detailed roadmap.
