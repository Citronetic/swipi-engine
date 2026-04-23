import Anthropic from '@anthropic-ai/sdk';
import type {
  CompletionRequest,
  CompletionResponse,
  LLMClient,
} from './types.js';
import { LLMProviderError } from './types.js';

export interface AnthropicAdapterOptions {
  apiKey?: string;
  /** Override tier → model mapping. */
  tierModels?: Partial<Record<'fast' | 'balanced' | 'smart', string>>;
  /** Override default per-tier temperature. */
  tierTemperatures?: Partial<Record<'fast' | 'balanced' | 'smart', number>>;
  /** Override default max tokens per call. */
  defaultMaxTokens?: number;
  /** Forward to Anthropic client (proxies, custom base URL). */
  baseURL?: string;
}

const DEFAULT_TIER_MODELS: Record<'fast' | 'balanced' | 'smart', string> = {
  fast: 'claude-haiku-4-5',
  balanced: 'claude-sonnet-4-6',
  smart: 'claude-opus-4-7',
};

const DEFAULT_TEMPS: Record<'fast' | 'balanced' | 'smart', number> = {
  fast: 0.2,
  balanced: 0.5,
  smart: 0.6,
};

/**
 * Claude adapter. Maps the three tiers to Haiku 4.5 / Sonnet 4.6 / Opus 4.7
 * by default — override via `tierModels` if you're pinning versions.
 */
export class AnthropicLLMClient implements LLMClient {
  private readonly client: Anthropic;
  private readonly tierModels: Record<'fast' | 'balanced' | 'smart', string>;
  private readonly tierTemps: Record<'fast' | 'balanced' | 'smart', number>;
  private readonly defaultMaxTokens: number;

  constructor(options: AnthropicAdapterOptions = {}) {
    this.client = new Anthropic({
      apiKey: options.apiKey ?? process.env['ANTHROPIC_API_KEY'],
      baseURL: options.baseURL,
    });
    this.tierModels = { ...DEFAULT_TIER_MODELS, ...(options.tierModels ?? {}) };
    this.tierTemps = { ...DEFAULT_TEMPS, ...(options.tierTemperatures ?? {}) };
    this.defaultMaxTokens = options.defaultMaxTokens ?? 4096;
  }

  private resolveModel(request: CompletionRequest): string {
    if (request.model) return request.model;
    return this.tierModels[request.tier ?? 'balanced'];
  }

  private resolveTemperature(request: CompletionRequest): number {
    if (typeof request.temperature === 'number') return request.temperature;
    return this.tierTemps[request.tier ?? 'balanced'];
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const systemMessages = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const chatMessages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const model = this.resolveModel(request);

    try {
      const response = await this.client.messages.create(
        {
          model,
          max_tokens: request.maxTokens ?? this.defaultMaxTokens,
          temperature: this.resolveTemperature(request),
          system: systemMessages || undefined,
          messages: chatMessages,
        },
        { signal: request.signal, timeout: request.timeoutMs },
      );

      const content = response.content
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('');

      return {
        content,
        model: response.model,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        finishReason: response.stop_reason ?? undefined,
      };
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        throw new LLMProviderError(err.message, {
          status: err.status,
          providerCode: err.error?.type,
        });
      }
      throw err;
    }
  }

  async *stream(request: CompletionRequest): AsyncIterable<string> {
    const systemMessages = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const chatMessages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const stream = await this.client.messages.stream(
      {
        model: this.resolveModel(request),
        max_tokens: request.maxTokens ?? this.defaultMaxTokens,
        temperature: this.resolveTemperature(request),
        system: systemMessages || undefined,
        messages: chatMessages,
      },
      { signal: request.signal, timeout: request.timeoutMs },
    );

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield event.delta.text;
      }
    }
  }
}
