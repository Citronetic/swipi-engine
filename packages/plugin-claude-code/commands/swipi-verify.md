---
description: Run the swipi debug protocol on the current project — pre-build consistency checks plus the verify→diagnose→repair loop.
argument-hint: '[--dev]'
allowed-tools: Read, Edit, Bash, Grep, Glob, Skill
---

You are being asked to verify and debug the current swipi project. The user may be in the middle of a `/swipi-new` run, or may have returned to a previously generated project.

**Arguments:** $ARGUMENTS (if `--dev` is present, also run `npm run dev` after build + test pass).

## Procedure

1. Invoke the `swipi-debug-protocol` skill immediately — it contains the authoritative checklist and loop.
2. Run the pre-build consistency checks first (they catch bugs the compiler won't).
3. Enter the verify loop: `npm run build` → `npm run test` → fix → repeat until both pass.
4. If `--dev` is present, run `npm run dev` and report the URL, then stop (do not block waiting for the user).

## Stop conditions

- Both build and test passing — success.
- Five consecutive iterations with no progress (same error persists) — stop and summarise what you've tried, what failed, and which file needs the user's attention.
