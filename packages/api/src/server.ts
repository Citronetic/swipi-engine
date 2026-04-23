/**
 * Hono app factory — composes routes around a RunManager. Exposed as a
 * plain function so callers choose their own Node / Bun / Workers adapter.
 */

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import type { RunManager } from './runs/manager.js';
import { healthRoute } from './routes/health.js';
import { generateRoute } from './routes/generate.js';
import { runsRoute } from './routes/runs.js';

export interface ServerOptions {
  manager: RunManager;
  /** Pretty-print logs to stdout per request. Default true outside NODE_ENV=test. */
  enableLogger?: boolean;
}

export function createApp(options: ServerOptions): Hono {
  const { manager, enableLogger = process.env['NODE_ENV'] !== 'test' } = options;
  const app = new Hono();

  if (enableLogger) {
    app.use('*', logger());
  }

  app.route('/', healthRoute());
  app.route('/', generateRoute(manager));
  app.route('/', runsRoute(manager));

  app.notFound((c) => c.json({ error: 'Not found', path: c.req.path }, 404));
  app.onError((err, c) => {
    console.error('[swipi-api]', err);
    return c.json(
      {
        error: err instanceof Error ? err.message : 'Internal error',
      },
      500,
    );
  });

  return app;
}
