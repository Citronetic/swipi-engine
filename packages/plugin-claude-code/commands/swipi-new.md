---
description: Generate a playable Phaser web game end-to-end from a prompt using the swipi 6-phase workflow.
argument-hint: '<game description>'
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, TodoWrite, Skill
---

You are about to create a new web game in the current working directory.

**User's game idea:** $ARGUMENTS

## What to do

1. Invoke the `swipi-workflow` skill immediately. It contains the authoritative 6-phase procedure. Do not attempt the task without loading it.
2. Follow every phase in order: classify → scaffold → GDD → assets → config → code → verify.
3. Create a todo list at the very start covering all six phases; expand Phase 5 into per-file todos once the GDD exists.

## Guardrails

- The working directory should be empty or contain only a previous swipi game. If it contains unrelated source, stop and ask the user to `cd` elsewhere.
- Do not read template source files before Phase 5. Context discipline is load-bearing.
- Do not skip Phase 6 verification. A game that does not `npm run build` is not delivered.

Begin now by invoking the `swipi-workflow` skill.
