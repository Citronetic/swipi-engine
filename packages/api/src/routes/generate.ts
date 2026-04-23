import { Hono } from 'hono';
import type { RunManager } from '../runs/manager.js';
import type { GameArchetype } from '@swipi/core';

const VALID_ARCHETYPES: readonly GameArchetype[] = [
  'platformer',
  'top_down',
  'grid_logic',
  'tower_defense',
  'ui_heavy',
];

export function generateRoute(manager: RunManager): Hono {
  const app = new Hono();

  app.post('/generate', async (c) => {
    let body: { prompt?: string; archetype?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length < 3) {
      return c.json({ error: '`prompt` must be a non-empty string of at least 3 characters' }, 400);
    }

    let archetype: GameArchetype | undefined;
    if (body.archetype !== undefined) {
      if (!VALID_ARCHETYPES.includes(body.archetype as GameArchetype)) {
        return c.json(
          {
            error: `Invalid \`archetype\`. Must be one of: ${VALID_ARCHETYPES.join(', ')}, or omit to let swipi classify.`,
          },
          400,
        );
      }
      archetype = body.archetype as GameArchetype;
    }

    const state = await manager.start({ prompt: body.prompt, archetype });
    return c.json(
      {
        runId: state.runId,
        status: state.status,
        links: {
          status: `/runs/${state.runId}`,
          events: `/runs/${state.runId}/events`,
          artifact: `/runs/${state.runId}/artifact.zip`,
        },
      },
      202,
    );
  });

  return app;
}
