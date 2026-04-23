import type {
  CompletionRequest,
  CompletionResponse,
  LLMClient,
} from './types.js';

/**
 * Test double. Records every request it receives and returns a scripted
 * response from `responses` in order. When `responses` is exhausted it
 * echoes back a fixed marker so tests fail loudly on unexpected calls.
 */
export class NoopLLMClient implements LLMClient {
  readonly requests: CompletionRequest[] = [];
  private cursor = 0;
  constructor(private readonly responses: string[] = []) {}

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    this.requests.push(request);
    const content =
      this.cursor < this.responses.length
        ? this.responses[this.cursor++]
        : '[NoopLLMClient] unexpected extra call';
    return {
      content: content ?? '',
      model: request.model ?? `noop-${request.tier ?? 'balanced'}`,
    };
  }
}
