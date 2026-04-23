/**
 * Debug Skill — living debugging protocol that accumulates fixes across runs.
 *
 * Ported from OpenGame/agent-test/debug-skill. Same design notes as
 * template-skill: self-contained, OpenAI-compat chat endpoint via env vars,
 * LLMClient injection deferred to Phase 3.
 *
 * Pipeline: Validator → Runner → Diagnoser → Repairer → Recorder → loop;
 * Generalizer promotes repeated failures into proactive ProtocolRules.
 */

export { debugLoop } from './debug-loop.js';
export type {
  DebugLoopOptions,
  DebugLoopResult,
} from './debug-loop.js';
export {
  evolveFromTrace,
  evolveBatch,
  evolveInline,
} from './evolve.js';
export {
  loadOrInitProtocol,
  initFromSeed,
  bumpAndSave,
} from './protocol-manager.js';
export * from './types.js';
export {
  MODULE_ROOT,
  SEED_PROTOCOL_PATH,
  OUTPUT_PATH,
  PROTOCOL_JSON_PATH,
  HISTORY_PATH,
  MAX_DEBUG_ITERATIONS,
  GENERALIZATION_THRESHOLD,
  SIGNATURE_MATCH_THRESHOLD,
} from './config.js';
