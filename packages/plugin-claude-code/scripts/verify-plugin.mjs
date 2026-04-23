#!/usr/bin/env node
// Structural verification for the swipi-engine Claude Code plugin.
// Checks that the manifest, skills, commands, and agent files are well-formed
// and that template / docs assets resolve (via symlink in dev, or as a real
// directory after a `build` copy).

import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, '..');

const errors = [];
const notes = [];

const push = (arr, msg) => arr.push(msg);

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function readJson(p) {
  return JSON.parse(await readFile(p, 'utf8'));
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;
  const frontmatter = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (m) frontmatter[m[1]] = m[2].trim();
  }
  return { frontmatter, body: match[2] };
}

async function verifyManifest() {
  const p = join(pluginRoot, '.claude-plugin', 'plugin.json');
  if (!await exists(p)) return push(errors, `missing manifest: ${p}`);
  const manifest = await readJson(p);
  for (const field of ['name', 'version', 'description']) {
    if (!manifest[field]) push(errors, `manifest missing required field: ${field}`);
  }
  notes.push(`manifest ok: ${manifest.name}@${manifest.version}`);
}

async function verifySkills() {
  const dir = join(pluginRoot, 'skills');
  if (!await exists(dir)) return push(errors, `skills dir missing: ${dir}`);
  const entries = await readdir(dir, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = join(dir, entry.name, 'SKILL.md');
    if (!await exists(skillPath)) { push(errors, `skill missing SKILL.md: ${entry.name}`); continue; }
    const parsed = parseFrontmatter(await readFile(skillPath, 'utf8'));
    if (!parsed) { push(errors, `skill ${entry.name}: bad frontmatter`); continue; }
    if (!parsed.frontmatter.name) push(errors, `skill ${entry.name}: missing name field`);
    if (!parsed.frontmatter.description) push(errors, `skill ${entry.name}: missing description field`);
    if (parsed.frontmatter.name !== entry.name) push(errors, `skill ${entry.name}: name field "${parsed.frontmatter.name}" does not match directory name`);
    count++;
  }
  notes.push(`skills ok: ${count}`);
}

async function verifyCommands() {
  const dir = join(pluginRoot, 'commands');
  if (!await exists(dir)) { notes.push('no commands directory'); return; }
  const files = (await readdir(dir)).filter(f => f.endsWith('.md'));
  for (const f of files) {
    const parsed = parseFrontmatter(await readFile(join(dir, f), 'utf8'));
    if (!parsed) { push(errors, `command ${f}: bad frontmatter`); continue; }
    if (!parsed.frontmatter.description) push(errors, `command ${f}: missing description`);
  }
  notes.push(`commands ok: ${files.length}`);
}

async function verifyAgents() {
  const dir = join(pluginRoot, 'agents');
  if (!await exists(dir)) { notes.push('no agents directory'); return; }
  const files = (await readdir(dir)).filter(f => f.endsWith('.md'));
  for (const f of files) {
    const parsed = parseFrontmatter(await readFile(join(dir, f), 'utf8'));
    if (!parsed) { push(errors, `agent ${f}: bad frontmatter`); continue; }
    for (const field of ['name', 'description']) {
      if (!parsed.frontmatter[field]) push(errors, `agent ${f}: missing ${field}`);
    }
  }
  notes.push(`agents ok: ${files.length}`);
}

async function verifyAssets() {
  for (const asset of ['templates', 'docs']) {
    const p = join(pluginRoot, asset);
    if (!await exists(p)) push(errors, `asset missing: ${p} (did you run the shared symlink or build copy?)`);
  }
  // Spot-check a few expected paths.
  const spotChecks = [
    'templates/core/src/main.ts',
    'templates/modules/platformer/src/scenes',
    'docs/gdd/core.md',
    'docs/asset_protocol.md',
    'docs/debug_protocol.md',
    'docs/modules/platformer/design_rules.md',
    'docs/modules/ui_heavy/template_api.md',
  ];
  for (const rel of spotChecks) {
    const p = join(pluginRoot, rel);
    if (!await exists(p)) push(errors, `expected asset missing: ${rel}`);
  }
  notes.push(`asset spot-checks ok: ${spotChecks.length}`);
}

await verifyManifest();
await verifySkills();
await verifyCommands();
await verifyAgents();
await verifyAssets();

for (const n of notes) console.log(`  ${n}`);
if (errors.length === 0) {
  console.log('\nplugin verification: PASS');
  process.exit(0);
} else {
  console.error('\nplugin verification: FAIL');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
