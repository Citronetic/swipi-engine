import type {
  CompletionRequest,
  CompletionResponse,
  LLMClient,
} from './types.js';
import { LLMProviderError } from './types.js';

/**
 * OpenAI-compatible adapter — works with:
 * - OpenAI (https://api.openai.com/v1)
 * - OpenRouter (https://openrouter.ai/api/v1)
 * - DashScope compat-mode (https://dashscope-intl.aliyuncs.com/compatible-mode/v1)
 * - Any self-hosted vLLM / llama.cpp endpoint that speaks the chat-completions schema.
 *
 * Kept lightweight (no SDK dep) so the library has one mandatory dep
 * (@anthropic-ai/sdk) — this adapter uses plain fetch.
 */

export interface OpenAICompatAdapterOptions {
  apiKey: string;
  baseURL: string;
  /** Tier → model id mapping. No defaults — baseURL/provider specific. */
  tierModels: Record<'fast' | 'balanced' | 'smart', string>;
  tierTemperatures?: Partial<Record<'fast' | 'balanced' | 'smart', number>>;
  defaultMaxTokens?: number;
  /** Additional headers (e.g., OpenRouter's HTTP-Referer). */
  headers?: Record<string, string>;
}

interface ChatCompletionJSON {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: { message: string; code?: string };
}

export class OpenAICompatClient implements LLMClient {
  constructor(private readonly options: OpenAICompatAdapterOptions) {}

  private resolveModel(request: CompletionRequest): string {
    return request.model ?? this.options.tierModels[request.tier ?? 'balanced'];
  }

  private resolveTemperature(request: CompletionRequest): number {
    if (typeof request.temperature === 'number') return request.temperature;
    const tier = request.tier ?? 'balanced';
    return this.options.tierTemperatures?.[tier] ?? 0.4;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const body = {
      model: this.resolveModel(request),
      messages: request.messages,
      temperature: this.resolveTemperature(request),
      max_tokens: request.maxTokens ?? this.options.defaultMaxTokens ?? 4096,
      stream: false,
    };

    const controller = request.signal ? undefined : new AbortController();
    const timeoutId =
      controller && request.timeoutMs
        ? setTimeout(() => controller.abort(), request.timeoutMs)
        : undefined;

    try {
      const response = await fetch(
        `${this.options.baseURL.replace(/\/$/, '')}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.options.apiKey}`,
            ...(this.options.headers ?? {}),
          },
          body: JSON.stringify(body),
          signal: request.signal ?? controller?.signal,
        },
      );

      if (!response.ok) {
        const text = await response.text();
        throw new LLMProviderError(
          `OpenAI-compat request failed: ${response.status} ${response.statusText} — ${text}`,
          { status: response.status },
        );
      }

      const data = (await response.json()) as ChatCompletionJSON;
      if (data.error) {
        throw new LLMProviderError(data.error.message, {
          providerCode: data.error.code,
        });
      }

      const choice = data.choices?.[0];
      const content = choice?.message?.content;
      if (!content) {
        throw new LLMProviderError('Provider returned no content');
      }

      return {
        content,
        model: data.model ?? body.model,
        usage: {
          inputTokens: data.usage?.prompt_tokens,
          outputTokens: data.usage?.completion_tokens,
        },
        finishReason: choice?.finish_reason,
      };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
}
