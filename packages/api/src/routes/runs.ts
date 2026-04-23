import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { RunManager } from '../runs/manager.js';
import { zipDirectory } from '../utils/zip.js';

export function runsRoute(manager: RunManager): Hono {
  const app = new Hono();

  // GET /runs/:id  — current state (JSON).
  app.get('/runs/:id', async (c) => {
    const runId = c.req.param('id');
    const state = await manager.getState(runId);
    if (!state) return c.json({ error: 'Run not found' }, 404);
    return c.json(state);
  });

  // GET /runs/:id/events  — Server-Sent Events stream.
  app.get('/runs/:id/events', (c) => {
    const runId = c.req.param('id');
    return streamSSE(c, async (stream) => {
      try {
        let seq = 0;
        for await (const event of manager.subscribe(runId)) {
          await stream.writeSSE({
            id: String(seq++),
            event: event.kind,
            data: JSON.stringify(event),
          });
          if (event.kind === 'done') break;
        }
      } catch (err) {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({
            message: err instanceof Error ? err.message : String(err),
          }),
        });
      }
    });
  });

  // GET /runs/:id/artifact.zip — lazily build + stream the zip.
  app.get('/runs/:id/artifact.zip', async (c) => {
    const runId = c.req.param('id');
    const state = await manager.getState(runId);
    if (!state) return c.json({ error: 'Run not found' }, 404);
    if (state.status !== 'succeeded' && state.status !== 'failed') {
      return c.json(
        {
          error: 'Run is still in progress. Wait for the "done" event on /runs/:id/events.',
          status: state.status,
        },
        409,
      );
    }

    const zipPath = manager.storage.artifactPath(runId);
    const alreadyBuilt = await manager.storage.hasArtifact(runId);
    if (!alreadyBuilt) {
      await zipDirectory(manager.storage.workspaceDir(runId), zipPath);
    }
    const size = (await stat(zipPath)).size;

    c.header('Content-Type', 'application/zip');
    c.header('Content-Length', String(size));
    c.header(
      'Content-Disposition',
      `attachment; filename="swipi-${runId.slice(0, 8)}.zip"`,
    );
    // Hono's Node adapter accepts Web ReadableStream for the body.
    return c.body(Readable.toWeb(manager.storage.streamArtifact(runId)) as ReadableStream);
  });

  return app;
}
