---
name: swipi-debug-protocol
description: Pre-build consistency checklist and verify→diagnose→repair loop for swipi games. Invoke during Phase 6 of the swipi-workflow, or any time a build/test/dev command fails, or whenever the user reports that a generated game does not run.
---

# Debug protocol

**Authoritative source:** `${CLAUDE_PLUGIN_ROOT}/docs/debug_protocol.md`

Read the full protocol before running any verification — it enumerates the seven reactive error signatures (TS2307, TS2339, TypeError, TextureNotFound, AnimationNotFound, SceneNotFound, RangeError) and the seven proactive consistency checks the OpenGame team curated from real game failures.

## Pre-build checklist (run before `npm run build`)

Do these first — they catch bugs that survive the TypeScript compiler:

1. Every `scene.start('X')` target is registered in `main.ts`.
2. `LEVEL_ORDER[0]` matches the actual first game scene key.
3. `gameConfig.json` still contains `screenSize`, `debugConfig`, `renderConfig`. If any is missing, `read_file` and FIX now — this crashes the game instantly on load.
4. `TitleScreen.ts` uses the game's actual name, not `GAME TITLE`.
5. Every `asset-pack.json` key used in code is spelled identically in source.

## Verify loop

Run this loop until both `npm run build` and `npm run test` pass:

```
REPEAT
  1. npm run build         → parse errors, classify by error code
  2. If TS error:
       - match against the seven reactive signatures
       - apply the known fix from docs/debug_protocol.md
       - if no match: read the file, identify the root cause, fix it
  3. npm run test          → parse runtime errors
  4. If runtime error:
       - same triage (TextureNotFound / SceneNotFound / ...)
UNTIL build + test both pass
```

Then: `npm run dev` and open the browser. A build that succeeds but shows a black canvas usually means a missing scene registration in `main.ts` or a wrong scene key in `LEVEL_ORDER`.

## Recurring failure patterns (and their fixes)

- **TS2307 "Cannot find module"** → import path has wrong `../` depth. `Read` the importing file's actual path and recount.
- **TS2339 "Property does not exist"** → typo or missing declaration on the base class. `Read` the base class, not the child.
- **TypeError in runtime console** → object accessed before initialization. Move the access into `create()` or later.
- **TextureNotFound** → key in code does not match `asset-pack.json`. Grep for the exact string, fix the typo.
- **AnimationNotFound** → animation key defined in `animations.json` does not appear in the `asset-pack.json` spritesheet registration. The three-layer chain must match: `asset-pack.json` → `animations.json` → code.
- **SceneNotFound** → `scene.start('Foo')` but `Foo` was never `game.scene.add()`-ed in `main.ts`.
- **RangeError: Maximum call stack** → infinite recursion, usually in an `update()` that calls another `update()`.

## After a successful verify

If the user asked for iteration (e.g. "make the enemies faster"), `read_file` `gameConfig.json` first, make the minimal change, rebuild. Do not regenerate assets or rewrite scenes without an explicit request.
