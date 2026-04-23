# @swipi/api  (Phase 3 — stub)

Thin HTTP wrapper around `@swipi/core`. Planned endpoints:

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/generate` | Start a new game-generation run (returns `runId`) |
| `GET` | `/runs/:id/events` | Server-sent events stream: classify → scaffold → gdd → assets → config → code → verify |
| `GET` | `/runs/:id/artifacts` | Download the generated Phaser project as a zip |
| `POST` | `/skills/template/evolve` | Feed a completed project into the Template Skill library |
| `POST` | `/skills/debug/debug-loop` | Run the Debug Skill verify→diagnose→repair loop |

**Planned stack:**
- Runtime: Node.js (Hono framework) for portability; target deployments include plain Node servers, Vercel Functions, Cloudflare Workers (via AI SDK v5 edge-compatible APIs).
- LLM: Vercel AI SDK with Anthropic provider — `claude-haiku-4-5` for classification, `claude-sonnet-4-6` for GDD, `claude-opus-4-7` for Phase 5 implementation.
- Durability: a workflow layer (Vercel Workflow DevKit, Inngest, or Temporal — decision deferred to Phase 3) to keep 10–30 minute runs resumable across request boundaries.

Implementation deferred. See [`docs/MIGRATION_PLAN.md`](../../docs/MIGRATION_PLAN.md) Phase 3.
