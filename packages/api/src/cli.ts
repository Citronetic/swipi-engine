#!/usr/bin/env node
/**
 * swipi-api binary — boots the REST server on Node.
 *
 * Configuration via env vars:
 *   PORT                  HTTP port (default 3000)
 *   HOST                  bind address (default 0.0.0.0)
 *   SWIPI_RUNS_DIR        directory for per-run state + artifacts (default ./.swipi/runs)
 *   SWIPI_SHARED_DIR      directory containing templates/ and docs/ (default ../shared relative to this package)
 *   ANTHROPIC_API_KEY     Claude credentials (required unless you swap LLMClient in embedding mode)
 *   SWIPI_ASSET_PROVIDER  "placeholder" (default) — stubs images; swap in embedding mode for real providers
 */

import { serve } from '@hono/node-server';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnthropicLLMClient } from '@swipi/core';
import { createApp } from './server.js';
import { RunManager } from './runs/manager.js';
import { PlaceholderAssetProvider } from './providers/placeholder-assets.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const port = Number(process.env['PORT'] ?? 3000);
  const host = process.env['HOST'] ?? '0.0.0.0';
  const runsRoot = resolve(
    process.env['SWIPI_RUNS_DIR'] ?? './.swipi/runs',
  );
  const sharedDir = resolve(
    process.env['SWIPI_SHARED_DIR'] ?? resolve(__dirname, '../../shared'),
  );

  if (!process.env['ANTHROPIC_API_KEY']) {
    console.error(
      '[swipi-api] ANTHROPIC_API_KEY is not set. Exiting.\n' +
        '  Either set the env var, or import @swipi/api programmatically and supply your own LLMClient.',
    );
    process.exit(1);
  }

  await mkdir(runsRoot, { recursive: true });

  const manager = new RunManager({
    runsRoot,
    sharedDir,
    llm: new AnthropicLLMClient({ apiKey: process.env['ANTHROPIC_API_KEY'] }),
    assetProvider: new PlaceholderAssetProvider(),
  });

  const app = createApp({ manager });

  serve({ fetch: app.fetch, port, hostname: host }, (info) => {
    console.log(`swipi-api listening on http://${info.address}:${info.port}`);
    console.log(`  runs dir:   ${runsRoot}`);
    console.log(`  shared dir: ${sharedDir}`);
    console.log('  endpoints:');
    console.log('    GET  /healthz');
    console.log('    POST /generate              { prompt, archetype? }');
    console.log('    GET  /runs/:id              current state');
    console.log('    GET  /runs/:id/events       SSE stream');
    console.log('    GET  /runs/:id/artifact.zip download generated project');
  });
}

main().catch((err) => {
  console.error('[swipi-api] fatal:', err);
  process.exit(1);
});
