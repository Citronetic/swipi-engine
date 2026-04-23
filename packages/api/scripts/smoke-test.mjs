#!/usr/bin/env node
/**
 * E2E smoke test — boots the Hono app in-process, hits /generate, tails
 * SSE, downloads the zip artifact.
 *
 * No real API keys needed:
 *   - NoopLLMClient handles the deterministic classify phase.
 *   - A fake Anthropic client short-circuits the agent loop (end_turn,
 *     no tool calls) so the pipeline completes without calling Claude.
 *   - PlaceholderAssetProvider generates 1x1 PNG stubs.
 *
 * What this validates: HTTP surface, SSE stream, state transitions,
 * artifact packaging, 404 handling. It does NOT validate that the agent
 * loop actually produces a working game — that requires a real run with
 * ANTHROPIC_API_KEY against live Claude.
 */

import { mkdtemp, rm } from 'node:fs/promises';
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

// Fake Anthropic client: returns end_turn immediately, no tool calls.
// Only shape that matters for the agent loop is `messages.create`.
const fakeAnthropic = {
  messages: {
    async create(_req, _opts) {
      return {
        content: [{ type: 'text', text: 'No further action needed (smoke stub).' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };
    },
  },
};

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
  anthropic: fakeAnthropic,
  defaultMode: 'cheap',
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
    events.some((e) => e.kind === 'phase-complete' && e.data?.phase === 'classify'),
    'received phase-complete for classify',
  );
  check(
    events.some((e) => e.kind === 'phase-start' && e.data?.phase === 'scaffold'),
    'received phase-start for scaffold (agent-loop hand-off)',
  );
  // Fake Anthropic returns end_turn immediately with no tool calls,
  // so the final status payload should reflect iterations=1 and
  // toolCalls=0 — proves the pipeline reached the agent loop.
  check(
    events.some(
      (e) =>
        e.kind === 'status' &&
        e.data?.status === 'succeeded' &&
        e.data?.agent?.iterations === 1 &&
        e.data?.agent?.toolCalls === 0,
    ),
    'pipeline reached + completed the agent loop (iter=1, tools=0 with fake client)',
  );
  check(
    events.at(-1)?.kind === 'done',
    'final event is kind=done',
  );

  // 4. Check run state
  const stateRes = await fetch(`${baseUrl}/runs/${runId}`).then((r) => r.json());
  check(stateRes.status === 'succeeded', 'run state.status === succeeded');
  check(stateRes.archetype === 'platformer', 'run state.archetype === platformer');
  check(
    Array.isArray(stateRes.completedPhases) && stateRes.completedPhases.includes('classify'),
    'completedPhases includes "classify"',
  );

  // 5. Download artifact (workspace is mostly empty with fake agent —
  //    real runs produce a full scaffolded project).
  const artifactRes = await fetch(`${baseUrl}${links.artifact}`);
  check(artifactRes.status === 200, 'GET /runs/:id/artifact.zip returns 200');
  check(
    artifactRes.headers.get('content-type') === 'application/zip',
    'artifact content-type is application/zip',
  );
  const artifactBuf = await artifactRes.arrayBuffer();
  check(artifactBuf.byteLength > 0, `artifact has non-zero bytes (${artifactBuf.byteLength})`);

  // 6. Verify 404 on unknown run
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
