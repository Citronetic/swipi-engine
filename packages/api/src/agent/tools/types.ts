/**
 * Shared tool-handler contract for the Claude agent loop.
 *
 * Every tool has a Claude-facing definition (name, description, JSON schema
 * for `input`) and a handler that executes with typed input and returns a
 * string. Strings are what Anthropic's tool_result content blocks expect.
 */

import type Anthropic from '@anthropic-ai/sdk';

export type ToolDefinition = Anthropic.Messages.Tool;

export interface ToolHandler<TInput = unknown> {
  definition: ToolDefinition;
  execute(input: TInput, ctx: ToolContext): Promise<string>;
}

export interface ToolContext {
  /** Absolute path to the workspace directory the agent is allowed to write into. */
  workspaceDir: string;
  /** Absolute path to the swipi shared dir (templates/ + docs/). */
  sharedDir: string;
  /** Optional abort signal — shell handlers honor it. */
  signal?: AbortSignal;
  /** Invoked on every observable agent action; used for run telemetry. */
  emitLog?: (msg: string) => void;
}

/**
 * Build a map of tool name → handler for fast lookup during agent loop.
 */
export function buildToolMap(handlers: ToolHandler[]): Map<string, ToolHandler> {
  const map = new Map<string, ToolHandler>();
  for (const h of handlers) map.set(h.definition.name, h);
  return map;
}
