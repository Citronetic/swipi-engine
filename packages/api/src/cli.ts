#!/usr/bin/env node
/**
 * swipi-api binary — boots the REST server on Node.
 *
 * Configuration via env vars:
 *   PORT                  HTTP port (default 3000)
 *   HOST                  bind address (default 0.0.0.0)
 *   SWIPI_RUNS_DIR        per-run state + artifacts (default ./.swipi/runs)
 *   SWIPI_SHARED_DIR      templates/ + docs/ root (default ../shared of this package)
 *   SWIPI_MODE            "smart" (default, uses Opus for phase 5) or "cheap" (Sonnet throughout)
 *   ANTHROPIC_API_KEY     Claude credentials (required)
 *   SWIPI_ASSET_PROVIDER  "placeholder" (default) or "openai-images" (requires OPENAI_API_KEY)
 *   OPENAI_API_KEY        Required when SWIPI_ASSET_PROVIDER=openai-images
 */

import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnthropicLLMClient, type AssetProvider } from '@swipi/core';
import { createApp } from './server.js';
import { RunManager } from './runs/manager.js';
import { PlaceholderAssetProvider } from './providers/placeholder-assets.js';
import { OpenAIImageAssetProvider } from './providers/openai-images.js';

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

  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    console.error(
      '[swipi-api] ANTHROPIC_API_KEY is not set. Exiting.\n' +
        '  Either set the env var, or import @swipi/api programmatically with your own Anthropic client.',
    );
    process.exit(1);
  }

  const mode: 'cheap' | 'smart' =
    process.env['SWIPI_MODE'] === 'cheap' ? 'cheap' : 'smart';

  const providerName = process.env['SWIPI_ASSET_PROVIDER'] ?? 'placeholder';
  const assetProvider: AssetProvider =
    providerName === 'openai-images'
      ? new OpenAIImageAssetProvider()
      : new PlaceholderAssetProvider();

  await mkdir(runsRoot, { recursive: true });

  const anthropic = new Anthropic({ apiKey });
  const manager = new RunManager({
    runsRoot,
    sharedDir,
    llm: new AnthropicLLMClient({ apiKey }),
    assetProvider,
    anthropic,
    defaultMode: mode,
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
