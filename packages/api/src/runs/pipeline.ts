/**
 * Runs the phases of a game-generation job.
 *
 * Phase 1 (classify) is handled as a deterministic pre-step via @swipi/core
 * so we can emit a typed `classification` event for the SSE stream.
 * Phases 2-6 (scaffold, GDD, assets + tilemap, config, code, verify) run
 * through the Claude agent loop in ./agent — the model calls our tools
 * (game-tools, file-tools, shell) to drive the workspace end-to-end.
 *
 * The agent loop emits a `tool-call` SSE event per tool invocation and
 * infers phase boundaries from the tool names it sees.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { LLMClient, AssetProvider, GameArchetype } from '@swipi/core';
import { classifyPhase } from '@swipi/core';
import { runAgent } from '../agent/loop.js';
import { buildSystemPrompt } from '../agent/prompt.js';
import { createGameTools } from '../agent/tools/game-tools.js';
import {
  readFileTool,
  writeFileTool,
  editFileTool,
  listFilesTool,
} from '../agent/tools/file-tools.js';
import { shellTool } from '../agent/tools/shell-tool.js';
import type { RunEvent, RunStorage, Phase } from './state.js';

export interface OrchestrationContext {
  runId: string;
  input: { prompt: string; archetype?: GameArchetype };
  storage: RunStorage;
  llm: LLMClient;
  assetProvider: AssetProvider;
  sharedDir: string;
  /** Anthropic client used by the agent loop. Must be configured with ANTHROPIC_API_KEY. */
  anthropic: Anthropic;
  /** "cheap" routes everything through Sonnet, "smart" uses Opus for Phase 5. */
  mode: 'cheap' | 'smart';
  emit: (event: Omit<RunEvent, 'ts'>) => Promise<void>;
}

// Map a tool name to the workflow phase it represents, so we can emit
// phase-start / phase-complete events from the agent loop.
const TOOL_PHASE: Record<string, Phase> = {
  classify_game: 'classify',
  generate_gdd: 'gdd',
  generate_assets: 'assets',
  generate_tilemap: 'assets',
  // scaffold / config / code / verify are inferred from run_shell + file ops
};

export async function runOrchestration(ctx: OrchestrationContext): Promise<void> {
  // Phase 1 deterministic: classify before handing off to the agent.
  const archetype = await classifyAndAnnounce(ctx);

  // Phases 2-6 via Claude agent loop.
  await ctx.emit({ kind: 'phase-start', data: { phase: 'scaffold' } });
  await ctx.storage.updateState(ctx.runId, (s) => {
    s.currentPhase = 'scaffold';
  });

  const workspaceDir = ctx.storage.workspaceDir(ctx.runId);
  const systemPrompt = buildSystemPrompt({
    workspaceDir,
    sharedDir: ctx.sharedDir,
    cheap: ctx.mode === 'cheap',
  });

  // Give the agent the user prompt + the already-classified archetype so it
  // can jump straight to Phase 2 without redoing classification.
  const userPrompt = `User prompt: ${ctx.input.prompt}

Archetype (already classified in Phase 1): ${archetype}

Begin at Phase 2 (scaffold). Run the full pipeline through Phase 6 (verify). Use your tools.`;

  const tools = [
    ...createGameTools({ llm: ctx.llm, assetProvider: ctx.assetProvider }),
    readFileTool,
    writeFileTool,
    editFileTool,
    listFilesTool,
    shellTool,
  ];

  const model =
    ctx.mode === 'cheap' ? 'claude-sonnet-4-6' : 'claude-opus-4-7';

  const seenPhases = new Set<Phase>(['classify']);

  const result = await runAgent({
    client: ctx.anthropic,
    model,
    systemPrompt,
    userPrompt,
    tools,
    toolContext: {
      workspaceDir,
      sharedDir: ctx.sharedDir,
    },
    onToolCall: async (event) => {
      const derivedPhase = TOOL_PHASE[event.toolName];
      if (derivedPhase && !seenPhases.has(derivedPhase)) {
        seenPhases.add(derivedPhase);
        await ctx.emit({
          kind: 'phase-start',
          data: { phase: derivedPhase },
        });
        await ctx.storage.updateState(ctx.runId, (s) => {
          s.currentPhase = derivedPhase;
        });
      }
      await ctx.emit({
        kind: 'log',
        data: {
          toolName: event.toolName,
          iteration: event.iteration,
          durationMs: event.durationMs,
          error: event.error,
          outputPreview: event.output.slice(0, 200),
        },
      });
    },
  });

  await ctx.storage.updateState(ctx.runId, (s) => {
    s.status = 'succeeded';
    s.finishedAt = new Date().toISOString();
    for (const p of seenPhases) {
      if (!s.completedPhases.includes(p)) s.completedPhases.push(p);
    }
    s.currentPhase = undefined;
  });

  await ctx.emit({
    kind: 'status',
    data: {
      status: 'succeeded',
      agent: {
        iterations: result.iterations,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        toolCalls: result.toolCalls.length,
      },
      finalMessage: result.finalText.slice(0, 500),
    },
  });
}

async function classifyAndAnnounce(ctx: OrchestrationContext): Promise<GameArchetype> {
  const options = {
    llm: ctx.llm,
    sharedDir: ctx.sharedDir,
    workspaceDir: ctx.storage.workspaceDir(ctx.runId),
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
      await ctx.emit({ kind: 'phase-complete', data: { phase, result } });
    },
  };

  if (ctx.input.archetype) {
    await ctx.emit({ kind: 'phase-start', data: { phase: 'classify' } });
    await ctx.emit({
      kind: 'phase-complete',
      data: { phase: 'classify', result: { archetype: ctx.input.archetype, reason: 'caller-supplied' } },
    });
    await ctx.emit({
      kind: 'classification',
      data: { archetype: ctx.input.archetype, reasoning: 'caller-supplied' },
    });
    await ctx.storage.updateState(ctx.runId, (s) => {
      s.archetype = ctx.input.archetype;
    });
    return ctx.input.archetype;
  }

  const classification = await classifyPhase(ctx.input.prompt, options);
  await ctx.emit({ kind: 'classification', data: classification });
  await ctx.storage.updateState(ctx.runId, (s) => {
    s.archetype = classification.archetype;
  });
  return classification.archetype;
}
