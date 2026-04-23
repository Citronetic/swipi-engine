#!/usr/bin/env node
/**
 * E2E smoke test — boots the Hono app in-process with a NoopLLMClient and
 * PlaceholderAssetProvider, hits /generate, tails /runs/:id/events,
 * downloads /runs/:id/artifact.zip, and asserts contents.
 *
 * No ANTHROPIC_API_KEY required — uses the stubbed LLM adapter.
 */

import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { NoopLLMClient } from '@swipi/core';
import {
  createApp,
  RunManager,
  PlaceholderAssetProvider,
} from '../dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Resolve sharedDir from this script's location so the test works
// regardless of CWD (npm script from repo root OR direct from packages/api).
const sharedDir = resolve(__dirname, '..', '..', 'shared');

// Canned LLM responses for: classify, gdd
const classifyJson = JSON.stringify({
  archetype: 'platformer',
  reasoning: 'smoke test',
  physicsProfile: {
    hasGravity: true,
    perspective: 'side',
    movementType: 'continuous',
  },
});
const gddBody = `# Smoke Test GDD

## Section 0 — Architecture
LEVEL_ORDER: ['Level1']

## Section 1 — Assets
(none for smoke test)

## Section 5 — Roadmap
(none)
`;

let failed = 0;
const check = (cond, msg) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failed++; }
};

const runsRoot = await mkdtemp(join(tmpdir(), 'swipi-api-smoke-'));
console.log(`  runs root: ${runsRoot}`);

const llm = new NoopLLMClient([classifyJson, gddBody]);
const manager = new RunManager({
  runsRoot,
  sharedDir,
  llm,
  assetProvider: new PlaceholderAssetProvider(),
});

const app = createApp({ manager, enableLogger: false });
const { server, baseUrl } = await new Promise((resolveServer) => {
  const s = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, (info) => {
    resolveServer({ server: s, baseUrl: `http://127.0.0.1:${info.port}` });
  });
});
console.log(`  server: ${baseUrl}`);

try {
  // 1. Health check
  const health = await fetch(`${baseUrl}/healthz`).then((r) => r.json());
  check(health.ok === true, 'GET /healthz returns ok:true');

  // 2. Start a run
  const startRes = await fetch(`${baseUrl}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'A simple jumping game' }),
  });
  check(startRes.status === 202, 'POST /generate returns 202 Accepted');
  const { runId, links } = await startRes.json();
  check(typeof runId === 'string' && runId.length > 0, 'returns a runId');
  check(typeof links.events === 'string', 'returns links.events URL');

  // 3. Follow SSE until done. Use a simple line parser.
  const events = [];
  const sseRes = await fetch(`${baseUrl}${links.events}`);
  check(sseRes.status === 200, 'GET /runs/:id/events returns 200');
  check(
    sseRes.headers.get('content-type')?.includes('text/event-stream'),
    'SSE content-type is text/event-stream',
  );
  const reader = sseRes.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  outer: while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    for (;;) {
      const sep = buf.indexOf('\n\n');
      if (sep < 0) break;
      const block = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const dataLine = block.split('\n').find((l) => l.startsWith('data:'));
      if (dataLine) {
        const event = JSON.parse(dataLine.slice(5).trim());
        events.push(event);
        if (event.kind === 'done') break outer;
      }
    }
  }
  reader.cancel();

  check(events.length > 0, `received ${events.length} SSE events`);
  check(
    events.some((e) => e.kind === 'classification'),
    'received classification event',
  );
  check(
    events.some((e) => e.kind === 'phase-complete' && e.data?.phase === 'gdd'),
    'received phase-complete for gdd',
  );
  check(
    events.at(-1)?.kind === 'done',
    'final event is kind=done',
  );

  // 4. Check run state
  const stateRes = await fetch(`${baseUrl}/runs/${runId}`).then((r) => r.json());
  check(stateRes.status === 'succeeded', 'run state.status === succeeded');
  check(stateRes.archetype === 'platformer', 'run state.archetype === platformer');
  check(stateRes.completedPhases?.length >= 2, 'at least classify+scaffold+gdd in completedPhases');

  // 5. Download artifact
  const artifactRes = await fetch(`${baseUrl}${links.artifact}`);
  check(artifactRes.status === 200, 'GET /runs/:id/artifact.zip returns 200');
  check(
    artifactRes.headers.get('content-type') === 'application/zip',
    'artifact content-type is application/zip',
  );
  const artifactBuf = await artifactRes.arrayBuffer();
  check(artifactBuf.byteLength > 500, `artifact has content (${artifactBuf.byteLength} bytes)`);

  // 6. Verify GAME_DESIGN.md was written to workspace
  const gddPath = join(runsRoot, runId, 'workspace', 'GAME_DESIGN.md');
  try {
    const s = await stat(gddPath);
    check(s.size > 0, `GAME_DESIGN.md written to workspace (${s.size} bytes)`);
  } catch {
    check(false, `GAME_DESIGN.md written to workspace`);
  }

  // 7. Verify 404 on unknown run
  const notFound = await fetch(`${baseUrl}/runs/bogus-id`);
  check(notFound.status === 404, 'GET /runs/bogus-id returns 404');
} finally {
  server.close();
  await rm(runsRoot, { recursive: true, force: true });
}

if (failed > 0) {
  console.error(`\nSmoke test FAILED: ${failed} check(s) did not pass.`);
  process.exit(1);
}
console.log('\nSmoke test PASSED.');
