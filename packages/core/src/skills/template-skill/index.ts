/**
 * Template Skill — evolving library of game project skeletons.
 *
 * Ported from OpenGame/agent-test/template-skill. The pipeline is fully
 * self-contained (no qwen internals) and already speaks an OpenAI-compatible
 * chat-completions endpoint via REASONING_MODEL_API_KEY / REASONING_MODEL_BASE_URL
 * env vars. Claude users can point those at a LiteLLM proxy; Phase 3 will
 * replace the env-based config with LLMClient injection.
 *
 * Pipeline: Collector → Classifier → Extractor → Abstractor → Merger
 * → updated library.json + families/{archetype}/src/
 */

export { evolveFromProject, evolveBatch } from './evolve.js';
export {
  createEmptyLibrary,
  initializeLibrary,
  loadLibrary,
  saveLibrary,
} from './library-manager.js';
export * from './types.js';
export {
  MODULE_ROOT,
  META_TEMPLATE_PATH,
  OUTPUT_PATH,
  LIBRARY_JSON_PATH,
  FAMILIES_PATH,
} from './config.js';
