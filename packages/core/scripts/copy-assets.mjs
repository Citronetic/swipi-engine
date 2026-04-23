#!/usr/bin/env node
/**
 * Copies non-TS data files that the skill pipelines load at runtime:
 *   src/skills/template-skill/meta-template → dist/skills/template-skill/meta-template
 *   src/skills/debug-skill/seed-protocol    → dist/skills/debug-skill/seed-protocol
 *
 * tsc doesn't copy these (and excludes them from compilation), but they're
 * required for MODULE_ROOT-based resolution at runtime.
 */

import { cp, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const pairs = [
  ['src/skills/template-skill/meta-template', 'dist/skills/template-skill/meta-template'],
  ['src/skills/debug-skill/seed-protocol', 'dist/skills/debug-skill/seed-protocol'],
];

for (const [src, dest] of pairs) {
  const srcAbs = resolve(root, src);
  const destAbs = resolve(root, dest);
  await rm(destAbs, { recursive: true, force: true });
  await cp(srcAbs, destAbs, { recursive: true });
  console.log(`  copied ${src} → ${dest}`);
}
