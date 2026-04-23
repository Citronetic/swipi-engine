#!/usr/bin/env node
/**
 * Smoke test — exercises the public surface without real API calls.
 * Uses NoopLLMClient + canned JSON responses. Exits 0 on pass.
 */

import { NoopLLMClient, classifyGame, validateGenerateGDDParams } from '../dist/index.js';
import { META_TEMPLATE_PATH } from '../dist/skills/template-skill/index.js';
import { SEED_PROTOCOL_PATH } from '../dist/skills/debug-skill/index.js';
import { access } from 'node:fs/promises';

let failed = 0;
const check = (cond, msg) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failed++; }
};

// 1. Classify-game with a canned response.
const llm = new NoopLLMClient([
  JSON.stringify({
    archetype: 'platformer',
    reasoning: 'test',
    physicsProfile: { hasGravity: true, perspective: 'side', movementType: 'continuous' },
  }),
]);
const classification = await classifyGame('A Mario-like game', { llm });
check(classification.archetype === 'platformer', 'classifyGame returns expected archetype');
check(llm.requests.length === 1, 'classifyGame made exactly one LLM call');
check(llm.requests[0].tier === 'fast', 'classifyGame uses the fast tier by default');

// 2. GDD param validation.
check(validateGenerateGDDParams({}) !== null, 'validateGenerateGDDParams rejects empty input');
check(
  validateGenerateGDDParams({
    raw_user_requirement: 'foo',
    archetype: 'platformer',
  }) === null,
  'validateGenerateGDDParams accepts valid input',
);

// 3. Skill pipeline data files resolve at runtime.
try {
  await access(META_TEMPLATE_PATH);
  check(true, `template-skill META_TEMPLATE_PATH resolves: ${META_TEMPLATE_PATH}`);
} catch {
  check(false, `template-skill META_TEMPLATE_PATH resolves: ${META_TEMPLATE_PATH}`);
}
try {
  await access(SEED_PROTOCOL_PATH);
  check(true, `debug-skill SEED_PROTOCOL_PATH resolves: ${SEED_PROTOCOL_PATH}`);
} catch {
  check(false, `debug-skill SEED_PROTOCOL_PATH resolves: ${SEED_PROTOCOL_PATH}`);
}

if (failed > 0) {
  console.error(`\nSmoke test FAILED: ${failed} check(s) did not pass.`);
  process.exit(1);
}
console.log('\nSmoke test PASSED.');
