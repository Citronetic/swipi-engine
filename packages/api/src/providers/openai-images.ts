/**
 * OpenAIImageAssetProvider — uses OpenAI's /v1/images/generations endpoint.
 *
 * Zero SDK dependency: plain fetch. Supports any OpenAI-compatible image
 * API that returns a b64_json or url response (fal.ai, Stability, DashScope
 * compat-mode all follow the same shape).
 *
 * Audio: OpenAI does not offer a bgm/sfx music generator. This provider
 * ships a tiny silent-WAV stub so runs don't crash if the GDD asks for
 * audio — swap to a dedicated audio provider for real music.
 */

import { writeFile } from 'node:fs/promises';
import type {
  AssetProvider,
  AudioGenerationInput,
  ImageGenerationInput,
} from '@swipi/core';

export interface OpenAIImageProviderOptions {
  apiKey?: string;
  /** Base URL (default OpenAI). Swap for fal.ai / DashScope compat endpoint. */
  baseURL?: string;
  /** Model id (default gpt-image-1). */
  model?: string;
  /** HTTP timeout in ms. Default 120_000. */
  timeoutMs?: number;
}

interface ImagesGenResponse {
  data?: Array<{ b64_json?: string; url?: string }>;
  error?: { message: string; type?: string };
}

export class OpenAIImageAssetProvider implements AssetProvider {
  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(options: OpenAIImageProviderOptions = {}) {
    const key = options.apiKey ?? process.env['OPENAI_API_KEY'];
    if (!key) {
      throw new Error(
        'OpenAIImageAssetProvider: OPENAI_API_KEY is not set. Pass apiKey explicitly or export OPENAI_API_KEY.',
      );
    }
    this.apiKey = key;
    this.baseURL = options.baseURL ?? 'https://api.openai.com/v1';
    this.model = options.model ?? 'gpt-image-1';
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  async generateImage(
    input: ImageGenerationInput,
    outputPath: string,
    signal?: AbortSignal,
  ): Promise<{ url: string }> {
    // Map swipi's "WxH" string to OpenAI's "WxH" format.
    const size = normaliseSize(input.size);
    const background = input.transparentBackground ? 'transparent' : 'opaque';

    const controller = signal ? undefined : new AbortController();
    const timer =
      controller && this.timeoutMs
        ? setTimeout(() => controller.abort(), this.timeoutMs)
        : undefined;

    try {
      const response = await fetch(`${this.baseURL}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          prompt: input.prompt,
          size,
          background,
          n: 1,
        }),
        signal: signal ?? controller?.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `OpenAI images API returned ${response.status}: ${text.slice(0, 500)}`,
        );
      }

      const body = (await response.json()) as ImagesGenResponse;
      if (body.error) throw new Error(body.error.message);
      const datum = body.data?.[0];
      if (!datum) throw new Error('OpenAI returned empty image data');

      let bytes: Buffer;
      if (datum.b64_json) {
        bytes = Buffer.from(datum.b64_json, 'base64');
      } else if (datum.url) {
        const download = await fetch(datum.url, { signal: signal ?? controller?.signal });
        if (!download.ok) throw new Error(`Failed to download image: ${download.status}`);
        bytes = Buffer.from(await download.arrayBuffer());
      } else {
        throw new Error('OpenAI response missing both b64_json and url');
      }

      await writeFile(outputPath, bytes);
      return { url: outputPath };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async generateAudio(
    _input: AudioGenerationInput,
    outputPath: string,
  ): Promise<{ url: string }> {
    // OpenAI has no music/SFX generator. Emit a silent stub so runs don't
    // crash — swap this provider for one with real audio if you need it.
    const silentWav = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
      0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
      0x44, 0xac, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00, 0x02, 0x00, 0x10, 0x00,
      0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00,
    ]);
    await writeFile(outputPath, silentWav);
    return { url: outputPath };
  }
}

/**
 * Normalise swipi's "1024*1024" notation to OpenAI's "1024x1024".
 * Also clamps to OpenAI's supported set — unknown sizes fall back to 1024x1024.
 */
function normaliseSize(swipiSize: string): string {
  const [w, h] = swipiSize.split(/[x*]/).map((n) => parseInt(n, 10));
  if (!w || !h) return '1024x1024';
  const supported = [
    [1024, 1024],
    [1024, 1536],
    [1536, 1024],
    [2048, 2048],
  ];
  for (const [sw, sh] of supported) {
    if (w === sw && h === sh) return `${sw}x${sh}`;
  }
  // Nearest supported.
  let best = [1024, 1024];
  let bestDist = Number.MAX_SAFE_INTEGER;
  for (const [sw, sh] of supported) {
    const d = Math.abs(sw - w) + Math.abs(sh - h);
    if (d < bestDist) {
      bestDist = d;
      best = [sw, sh];
    }
  }
  return `${best[0]}x${best[1]}`;
}
