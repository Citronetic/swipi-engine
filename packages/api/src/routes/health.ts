import { Hono } from 'hono';

export function healthRoute(): Hono {
  const app = new Hono();
  app.get('/healthz', (c) =>
    c.json({ ok: true, version: '0.1.0', ts: new Date().toISOString() }),
  );
  return app;
}
