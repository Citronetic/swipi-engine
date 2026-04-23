/**
 * Claude agent loop — tool_use / tool_result cycle.
 *
 * Calls Claude with the configured tools, feeds every tool_use through
 * our handlers, returns tool_result content, loops until the model
 * returns a stop_reason of "end_turn" (or max iterations).
 *
 * Directly uses @anthropic-ai/sdk (v0.91) for the tool-use API shape.
 * This is deliberately separate from @swipi/core's LLMClient abstraction
 * because tool-use is a vendor-specific feature and the LLMClient interface
 * stays minimal.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ToolContext, ToolHandler } from './tools/types.js';
import { buildToolMap } from './tools/types.js';

export interface AgentOptions {
  client: Anthropic;
  /** Concrete model id (e.g., "claude-opus-4-7" or "claude-sonnet-4-6"). */
  model: string;
  systemPrompt: string;
  userPrompt: string;
  tools: ToolHandler[];
  toolContext: ToolContext;
  /** Max tool_use ↔ tool_result iterations. Default 60. */
  maxIterations?: number;
  /** Hard cap on cumulative output tokens. Default 300k. */
  maxOutputTokens?: number;
  /** Per-call max_tokens. Default 8192. */
  perCallMaxTokens?: number;
  /** Event sink for observability — invoked once per tool call. */
  onToolCall?: (event: ToolCallEvent) => void | Promise<void>;
  /** Event sink for text deltas from the assistant. */
  onAssistantText?: (text: string) => void | Promise<void>;
  /** Abort signal — cancels in-flight requests. */
  signal?: AbortSignal;
}

export interface ToolCallEvent {
  iteration: number;
  toolName: string;
  input: unknown;
  output: string;
  durationMs: number;
  error?: string;
}

export interface AgentResult {
  stopReason: string;
  iterations: number;
  inputTokens: number;
  outputTokens: number;
  finalText: string;
  toolCalls: ToolCallEvent[];
}

export async function runAgent(options: AgentOptions): Promise<AgentResult> {
  const maxIterations = options.maxIterations ?? 60;
  const maxOutputTokens = options.maxOutputTokens ?? 300_000;
  const perCallMaxTokens = options.perCallMaxTokens ?? 8192;

  const toolMap = buildToolMap(options.tools);
  const toolDefinitions = options.tools.map((t) => t.definition);

  const conversation: Anthropic.Messages.MessageParam[] = [
    { role: 'user', content: options.userPrompt },
  ];

  let iterations = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason = '';
  let finalText = '';
  const toolCalls: ToolCallEvent[] = [];

  while (iterations < maxIterations) {
    iterations += 1;

    const response = await options.client.messages.create(
      {
        model: options.model,
        max_tokens: perCallMaxTokens,
        system: options.systemPrompt,
        tools: toolDefinitions,
        messages: conversation,
      },
      { signal: options.signal },
    );

    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;
    stopReason = response.stop_reason ?? '';

    if (outputTokens > maxOutputTokens) {
      throw new Error(
        `Agent exceeded maxOutputTokens=${maxOutputTokens} (cumulative=${outputTokens}). Abort.`,
      );
    }

    conversation.push({ role: 'assistant', content: response.content });

    const toolUses: Anthropic.Messages.ToolUseBlock[] = [];
    for (const block of response.content) {
      if (block.type === 'text') {
        finalText = block.text;
        if (options.onAssistantText) await options.onAssistantText(block.text);
      } else if (block.type === 'tool_use') {
        toolUses.push(block);
      }
    }

    // Terminal — model said it's done.
    if (stopReason === 'end_turn' || toolUses.length === 0) {
      break;
    }

    // Execute every tool_use and build a single user message with
    // tool_result blocks in matching order.
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const handler = toolMap.get(use.name);
      if (!handler) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          is_error: true,
          content: `Unknown tool: ${use.name}`,
        });
        continue;
      }
      const start = Date.now();
      try {
        const output = await handler.execute(use.input, options.toolContext);
        const event: ToolCallEvent = {
          iteration: iterations,
          toolName: use.name,
          input: use.input,
          output,
          durationMs: Date.now() - start,
        };
        toolCalls.push(event);
        if (options.onToolCall) await options.onToolCall(event);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: output,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const event: ToolCallEvent = {
          iteration: iterations,
          toolName: use.name,
          input: use.input,
          output: '',
          durationMs: Date.now() - start,
          error: message,
        };
        toolCalls.push(event);
        if (options.onToolCall) await options.onToolCall(event);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          is_error: true,
          content: message,
        });
      }
    }

    conversation.push({ role: 'user', content: toolResults });
  }

  if (iterations >= maxIterations && stopReason !== 'end_turn') {
    throw new Error(
      `Agent hit maxIterations=${maxIterations} without reaching end_turn. Last stop_reason=${stopReason}`,
    );
  }

  return {
    stopReason,
    iterations,
    inputTokens,
    outputTokens,
    finalText,
    toolCalls,
  };
}
