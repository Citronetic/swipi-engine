/**
 * Provider-agnostic LLM adapter interface.
 *
 * Everything in @swipi/core depends on this interface, never on a specific SDK.
 * Built-in adapters live in sibling files:
 *   - ./anthropic.ts      Claude via @anthropic-ai/sdk
 *   - ./openai-compat.ts  OpenAI chat/completions (works with OpenRouter,
 *                         DashScope compat-mode, vLLM, etc.)
 *   - ./noop.ts           test double
 *
 * Users of this library can supply their own adapter by implementing LLMClient.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  /** Ordered chat messages. `system` is optional but recommended. */
  messages: ChatMessage[];
  /**
   * Logical model tier — adapters map this to a concrete model name.
   * Use `fast` for classification / simple checks, `balanced` for GDD drafting,
   * `smart` for code implementation and complex reasoning.
   */
  tier?: 'fast' | 'balanced' | 'smart';
  /** Override the tier mapping with a concrete model id. */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Optional abort signal forwarded to fetch / SDK. */
  signal?: AbortSignal;
  /**
   * Timeout in ms. Ignored when `signal` is supplied — caller is responsible
   * for its own abort policy in that case.
   */
  timeoutMs?: number;
}

export interface CompletionResponse {
  /** Plain text content. Adapters concatenate multi-part content automatically. */
  content: string;
  /** Concrete model id used (after tier mapping). */
  model: string;
  /** Optional — populated when the adapter can read it. */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  /** Stop reason if the adapter exposes one. */
  finishReason?: string;
}

export interface LLMClient {
  /** Non-streaming completion. Required. */
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  /** Streaming completion. Optional — callers should feature-detect. */
  stream?(request: CompletionRequest): AsyncIterable<string>;
}

/**
 * Error class adapters throw for non-retryable provider errors (bad key,
 * model-not-found, content policy). Network / 5xx errors should be surfaced
 * as plain Error so upstream retry logic can distinguish them.
 */
export class LLMProviderError extends Error {
  readonly status?: number;
  readonly providerCode?: string;
  constructor(message: string, opts: { status?: number; providerCode?: string } = {}) {
    super(message);
    this.name = 'LLMProviderError';
    this.status = opts.status;
    this.providerCode = opts.providerCode;
  }
}
