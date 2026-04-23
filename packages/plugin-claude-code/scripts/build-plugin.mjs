#!/usr/bin/env node
// Build the plugin into a distributable directory.
// In dev, templates/ and docs/ are symlinks into ../shared. For distribution
// (git clone on Windows, tarball publish, marketplace install), we want real
// directories inside the plugin so `${CLAUDE_PLUGIN_ROOT}/templates/...`
// resolves reliably.

import { cp, lstat, rm, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, '..');
const sharedRoot = resolve(pluginRoot, '..', 'shared');
const distRoot = resolve(pluginRoot, 'dist');

async function isSymlink(p) {
  try {
    const s = await lstat(p);
    return s.isSymbolicLink();
  } catch { return false; }
}

async function replaceSymlinkWithCopy(name) {
  const link = join(pluginRoot, name);
  if (await isSymlink(link)) {
    console.log(`  resolving ${name}/ symlink → copy`);
    await rm(link);
    await cp(join(sharedRoot, name), link, { recursive: true });
  } else {
    console.log(`  ${name}/ already a real directory — leaving as-is`);
  }
}

async function copyToDist() {
  console.log(`  assembling dist/ → ${distRoot}`);
  await rm(distRoot, { recursive: true, force: true });
  await mkdir(distRoot, { recursive: true });
  const items = [
    '.claude-plugin',
    'skills',
    'commands',
    'agents',
    'hooks',
    'templates',
    'docs',
    'README.md',
  ];
  for (const item of items) {
    const src = join(pluginRoot, item);
    try {
      await cp(src, join(distRoot, item), { recursive: true, dereference: true });
      console.log(`    ${item}/`);
    } catch {
      console.log(`    skip ${item} (not present)`);
    }
  }
}

const mode = process.argv[2] ?? 'dist';

if (mode === 'unlink') {
  await replaceSymlinkWithCopy('templates');
  await replaceSymlinkWithCopy('docs');
  console.log('\nunlink complete.');
} else {
  await copyToDist();
  console.log('\nbuild complete — install with:\n  claude /plugin install ' + distRoot);
}
