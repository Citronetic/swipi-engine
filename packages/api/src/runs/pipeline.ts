/**
 * Runs the phases of a game-generation job using @swipi/core's orchestrator.
 *
 * Phases implemented in the MVP:
 *   1. classify  (via classifyGame in @swipi/core)
 *   2. scaffold  (via scaffoldPhase)
 *   3. gdd       (via gddPhase)
 *
 * Phases 4-6 (assets / config merge / code implementation / verify) require
 * an LLM agent loop and are scoped to Phase 3b once the driver pattern
 * stabilises. The generated workspace at this MVP contains:
 *   - all template + module code for the chosen archetype (runnable as-is)
 *   - GAME_DESIGN.md (generated)
 *   - docs/ with the archetype-specific protocols
 */

import type { LLMClient, AssetProvider } from '@swipi/core';
import { classifyPhase, scaffoldPhase, gddPhase } from '@swipi/core';
import type { RunEvent } from './state.js';
import type { RunStorage } from './state.js';

export interface OrchestrationContext {
  runId: string;
  input: { prompt: string; archetype?: import('@swipi/core').GameArchetype };
  storage: RunStorage;
  llm: LLMClient;
  assetProvider: AssetProvider;
  sharedDir: string;
  emit: (event: Omit<RunEvent, 'ts'>) => Promise<void>;
}

export async function runOrchestration(ctx: OrchestrationContext): Promise<void> {
  const workspaceDir = ctx.storage.workspaceDir(ctx.runId);

  // Build the options object once — orchestrator phase callbacks share it.
  const options = {
    llm: ctx.llm,
    sharedDir: ctx.sharedDir,
    workspaceDir,
    assetProvider: ctx.assetProvider,
    onPhaseStart: async (phase: string) => {
      await ctx.storage.updateState(ctx.runId, (s) => {
        s.currentPhase = phase as typeof s.currentPhase;
      });
      await ctx.emit({ kind: 'phase-start', data: { phase } });
    },
    onPhaseComplete: async (phase: string, result: unknown) => {
      await ctx.storage.updateState(ctx.runId, (s) => {
        if (!s.completedPhases.includes(phase as never)) {
          s.completedPhases.push(phase as never);
        }
        s.currentPhase = undefined;
      });
      await ctx.emit({ kind: 'phase-complete', data: { phase, result: summarize(result) } });
    },
  };

  // Phase 1: classify (or accept override).
  let archetype = ctx.input.archetype;
  let classification: unknown;
  if (!archetype) {
    classification = await classifyPhase(ctx.input.prompt, options);
    archetype = (classification as { archetype: typeof archetype }).archetype;
  } else {
    await ctx.emit({ kind: 'phase-start', data: { phase: 'classify' } });
    await ctx.emit({
      kind: 'phase-complete',
      data: { phase: 'classify', result: { archetype, reason: 'caller-supplied' } },
    });
    classification = { archetype, reasoning: 'caller-supplied' };
  }
  await ctx.emit({ kind: 'classification', data: classification });
  await ctx.storage.updateState(ctx.runId, (s) => {
    s.archetype = archetype;
  });

  // Phase 2: scaffold.
  if (!archetype) throw new Error('internal: archetype is unset after classify');
  await scaffoldPhase(archetype, options);

  // Phase 3: GDD.
  const gdd = await gddPhase(ctx.input.prompt, archetype, options);
  await ctx.emit({ kind: 'artifact', data: { path: 'GAME_DESIGN.md', bytes: gdd.content.length } });

  // Mark run succeeded — phases 4-6 are not yet in scope.
  await ctx.storage.updateState(ctx.runId, (s) => {
    s.status = 'succeeded';
    s.finishedAt = new Date().toISOString();
  });
  await ctx.emit({
    kind: 'status',
    data: {
      status: 'succeeded',
      note: 'Phases 4-6 (assets, config, code, verify) deferred to Phase 3b — generated workspace contains the scaffolded template + GAME_DESIGN.md.',
    },
  });
}

/**
 * Strip large fields before publishing phase results over SSE. Full data
 * lives on disk in the workspace; the event channel stays light.
 */
function summarize(result: unknown): unknown {
  if (!result || typeof result !== 'object') return result;
  const r = result as Record<string, unknown>;
  // gddPhase returns { content, path }; only surface path.
  if (typeof r['content'] === 'string' && typeof r['path'] === 'string') {
    return { path: r['path'], bytes: (r['content'] as string).length };
  }
  return result;
}
