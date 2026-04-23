/**
 * @swipi/core — framework-agnostic game-generation engine.
 *
 * Surface:
 *   - LLM adapters           → ./llm
 *   - Game tools             → ./tools
 *   - Template Skill         → ./skills/template
 *   - Debug Skill            → ./skills/debug
 *   - 6-phase orchestrator   → ./workflow
 */

export * from './llm/index.js';
export * from './tools/index.js';
export * from './workflow/index.js';

// Named re-exports for the two skill pipelines. (Full surface is under
// the ./skills/template and ./skills/debug subpath exports.)
export * as templateSkill from './skills/template-skill/index.js';
export * as debugSkill from './skills/debug-skill/index.js';
