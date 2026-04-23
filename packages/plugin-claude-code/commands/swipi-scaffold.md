---
description: Scaffold an empty swipi project for a given archetype (core template + module code + docs). Does not classify or generate a GDD.
argument-hint: '<platformer|top_down|grid_logic|tower_defense|ui_heavy>'
allowed-tools: Bash, Read
---

You are being asked to scaffold a blank swipi project of a specific archetype in the current working directory.

**Archetype argument:** $ARGUMENTS

## Validate

1. Archetype must be one of: `platformer`, `top_down`, `grid_logic`, `tower_defense`, `ui_heavy`. If not, stop and explain.
2. The current working directory should be empty (or contain only a prior swipi project). Run `ls -A` to verify. If it has unrelated files, stop and ask the user to `cd` elsewhere.

## Execute (four copies in order — do not reorder)

```bash
cp -r "${CLAUDE_PLUGIN_ROOT}/templates/core/." ./
cp -r "${CLAUDE_PLUGIN_ROOT}/templates/modules/<archetype>/src/." ./src/
mkdir -p docs/gdd docs/modules/<archetype>
cp "${CLAUDE_PLUGIN_ROOT}/docs/gdd/core.md" docs/gdd/
cp "${CLAUDE_PLUGIN_ROOT}/docs/asset_protocol.md" "${CLAUDE_PLUGIN_ROOT}/docs/debug_protocol.md" docs/
cp -r "${CLAUDE_PLUGIN_ROOT}/docs/modules/<archetype>/." docs/modules/<archetype>/
```

Substitute `<archetype>` with the validated argument.

## After

Report to the user:
- Which archetype was used.
- The top-level directories and files that now exist.
- That `GAME_DESIGN.md`, asset generation, and code implementation are deliberately **not** done — they require the full `/swipi-new` flow.

Do not read any source files. Do not generate a GDD.
