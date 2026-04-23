/**
 * Orchestrator for game-asset generation.
 *
 * Ported from OpenGame/packages/core/src/tools/generate-assets.ts with one
 * design change: instead of OpenGame's hard-wired DashScope/Doubao model
 * router, @swipi/core exposes an `AssetProvider` interface. Callers supply
 * a provider implementation (OpenAI DALL-E 3, Stability AI, Replicate,
 * DashScope, fal.ai, local SDXL — anything that maps to the four asset
 * kinds). This keeps @swipi/core provider-agnostic and matches how the
 * rest of the package treats LLMs.
 *
 * Prompt-engineering IP from OpenGame (background vs. character framing,
 * animation frame hints, audio genre tags, tileset blob layout) is
 * preserved by embedding it in the prompts built here — the provider only
 * receives the final prompt string and size parameters.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  AnimationRequest,
  AssetPack,
  AssetPackFile,
  AssetRequest,
  AudioRequest,
  BackgroundRequest,
  GenerateAssetsParams,
  GenerationResult,
  ImageRequest,
  TilesetRequest,
} from './generate-assets-types.js';

// ============ Provider Interface ============

export interface ImageGenerationInput {
  /** Fully-assembled prompt including style anchor and composition context. */
  prompt: string;
  /** `"1024*1024"` style. Provider adapts to its own syntax. */
  size: string;
  /**
   * True when the resulting image must be rendered on transparent background
   * (characters, props, icons). False for full-scene backgrounds.
   * Providers that can't produce transparent output should delegate to a
   * background-removal post-processing step.
   */
  transparentBackground: boolean;
}

export interface AudioGenerationInput {
  prompt: string;
  audioType: 'bgm' | 'sfx';
  durationSeconds: number;
}

export interface AssetProvider {
  /**
   * Generate a single image from a prompt. Must persist the image to disk
   * at `outputPath` (.png) and return `{ url }` where url is a path or
   * HTTP URL that will be written into asset-pack.json.
   */
  generateImage(
    input: ImageGenerationInput,
    outputPath: string,
    signal?: AbortSignal,
  ): Promise<{ url: string }>;

  /**
   * Generate an animation frame strip. Should produce one image per frame,
   * saved as `<outputDir>/<key>_<action>_<N>.png`. Return the strip path
   * that will be referenced from asset-pack.json.
   */
  generateAnimationStrip?(
    baseImagePath: string,
    frames: Array<{ name: string; count: number; actionDescription: string }>,
    outputDir: string,
    signal?: AbortSignal,
  ): Promise<{ url: string }>;

  /** Generate an audio clip (BGM or SFX). Saves to `outputPath` (.mp3 / .wav). */
  generateAudio?(
    input: AudioGenerationInput,
    outputPath: string,
    signal?: AbortSignal,
  ): Promise<{ url: string }>;

  /**
   * Generate a tileset image arranged as an NxN grid.
   * Providers that don't natively understand tileset layout should call
   * generateImage() with a tileset-specific prompt. Optional; if omitted
   * the orchestrator falls back to generateImage().
   */
  generateTileset?(
    input: { prompt: string; gridSize: number; tilePixelSize: number },
    outputPath: string,
    signal?: AbortSignal,
  ): Promise<{ url: string }>;
}

// ============ Prompt Construction (OpenGame IP preserved) ============

function buildBackgroundPrompt(
  req: BackgroundRequest,
  styleAnchor: string,
): string {
  return `Visual style: ${styleAnchor}

Subject: ${req.description}

IMPORTANT: This is a BACKGROUND - must be fully opaque with rich colors. No transparency, no UI elements, no characters, no text overlays. Composition fills the full frame edge-to-edge.`;
}

function buildImagePrompt(req: ImageRequest, styleAnchor: string): string {
  return `Visual style: ${styleAnchor}

Subject: ${req.description}

IMPORTANT: Isolated subject on transparent background. Single character/object, centered, clean silhouette. No ground, no environment, no extra props.`;
}

function buildAnimationBasePrompt(
  req: AnimationRequest,
  styleAnchor: string,
): string {
  return `Visual style: ${styleAnchor}

Subject: ${req.description}

IMPORTANT: Reference pose for animation. Single character facing RIGHT, isolated on transparent background. Clean silhouette suitable for frame-by-frame animation.`;
}

function buildAudioPrompt(req: AudioRequest): string {
  const genre = req.genre ? `, genre: ${req.genre}` : '';
  const tempo = req.tempo ? `, tempo: ${req.tempo}` : '';
  const scope =
    req.audioType === 'bgm'
      ? 'Looping background music track'
      : 'Short sound effect (single hit)';
  return `${scope} for a 2D game. Style: ${req.description}${genre}${tempo}.`;
}

function buildTilesetPrompt(req: TilesetRequest, styleAnchor: string): string {
  const grid = req.tileset_size ?? 7;
  return `Visual style: ${styleAnchor}

Subject: ${req.description}

IMPORTANT: A ${grid}x${grid} tileset grid showing every required permutation for 47-tile blob auto-tiling (or a 3x3 for 9-slice if grid is 3). Each tile is a seamless edge piece that connects to its neighbors. Tiles are uniform size, arranged edge-to-edge, no gaps, no padding.`;
}

// ============ Orchestrator ============

export interface GenerateAssetsOptions {
  provider: AssetProvider;
  /** Project directory whose `public/assets/` (or `output_dir_name`) gets written. */
  workspaceDir: string;
  /** Abort signal forwarded to every provider call. */
  signal?: AbortSignal;
  /** Max parallel provider requests. Defaults to 2 (OpenGame's value). */
  maxConcurrency?: number;
}

export interface GenerateAssetsSummary {
  results: GenerationResult[];
  assetPackPath: string;
  /** OpenGame-style instruction block — include in an agent response. */
  summary: string;
}

export async function generateAssets(
  params: GenerateAssetsParams,
  options: GenerateAssetsOptions,
): Promise<GenerateAssetsSummary> {
  if (!params.assets || params.assets.length === 0) {
    throw new Error('`assets` must contain at least one request.');
  }
  if (!params.style_anchor || params.style_anchor.trim() === '') {
    throw new Error('`style_anchor` is required to anchor visual consistency.');
  }

  const targetDirName =
    params.output_dir_name ?? path.join('public', 'assets');
  const absoluteAssetsDir = path.join(options.workspaceDir, targetDirName);
  const assetPackPath = path.join(absoluteAssetsDir, 'asset-pack.json');
  await fs.mkdir(absoluteAssetsDir, { recursive: true });

  const assetPack = await loadAssetPack(assetPackPath);
  const maxConcurrency = options.maxConcurrency ?? 2;

  const results: GenerationResult[] = [];
  const queue = [...params.assets];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const req = queue.shift();
      if (!req) return;
      try {
        const result = await dispatch(
          req,
          params,
          options,
          absoluteAssetsDir,
          assetPack,
        );
        results.push(result);
      } catch (err) {
        results.push({
          success: false,
          key: req.key,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const workers = Array.from({ length: maxConcurrency }, () => worker());
  await Promise.all(workers);

  // Persist asset pack after all workers complete.
  await fs.writeFile(assetPackPath, JSON.stringify(assetPack, null, 2));

  const succeeded = results.filter((r) => r.success).map((r) => r.key);
  const failed = results.filter((r) => !r.success);

  const summary = `Generated ${succeeded.length}/${params.assets.length} assets into ${targetDirName}/.

Successful: ${succeeded.join(', ') || '(none)'}
${failed.length > 0 ? `Failed: ${failed.map((f) => `${f.key} (${f.error})`).join('; ')}` : ''}

Asset pack written to: ${path.relative(options.workspaceDir, assetPackPath)}
Read asset-pack.json for the final texture/audio keys to use in code.`;

  return { results, assetPackPath, summary };
}

// ============ Dispatch ============

async function dispatch(
  req: AssetRequest,
  params: GenerateAssetsParams,
  options: GenerateAssetsOptions,
  assetsDir: string,
  assetPack: AssetPack,
): Promise<GenerationResult> {
  switch (req.type) {
    case 'background': {
      const outPath = path.join(assetsDir, `${req.key}.png`);
      const { url } = await options.provider.generateImage(
        {
          prompt: buildBackgroundPrompt(req, params.style_anchor),
          size: req.resolution ?? '1536*1024',
          transparentBackground: false,
        },
        outPath,
        options.signal,
      );
      addToPack(assetPack, 'backgrounds', { type: 'image', key: req.key, url });
      return { success: true, key: req.key, url };
    }
    case 'image': {
      const outPath = path.join(assetsDir, `${req.key}.png`);
      const { url } = await options.provider.generateImage(
        {
          prompt: buildImagePrompt(req, params.style_anchor),
          size: req.size ?? '1024*1024',
          transparentBackground: true,
        },
        outPath,
        options.signal,
      );
      addToPack(assetPack, 'images', { type: 'image', key: req.key, url });
      return { success: true, key: req.key, url };
    }
    case 'animation': {
      // Step 1: produce the reference image.
      const refPath = path.join(assetsDir, `${req.key}_ref.png`);
      await options.provider.generateImage(
        {
          prompt: buildAnimationBasePrompt(req, params.style_anchor),
          size: '1024*1024',
          transparentBackground: true,
        },
        refPath,
        options.signal,
      );
      // Step 2: expand frames via provider's animation strip method, if available.
      if (!options.provider.generateAnimationStrip) {
        throw new Error(
          `Provider does not implement generateAnimationStrip — animation asset "${req.key}" cannot be produced. Either supply a provider with animation support, or split it into individual image requests.`,
        );
      }
      const { url } = await options.provider.generateAnimationStrip(
        refPath,
        req.animations.map((a) => ({
          name: a.name,
          count: a.frameCount,
          actionDescription: a.action_desc,
        })),
        assetsDir,
        options.signal,
      );
      addToPack(assetPack, 'spritesheets', {
        type: 'image',
        key: req.key,
        url,
      });
      return { success: true, key: req.key, url };
    }
    case 'audio': {
      if (!options.provider.generateAudio) {
        throw new Error(
          `Provider does not implement generateAudio — audio asset "${req.key}" cannot be produced.`,
        );
      }
      const outPath = path.join(assetsDir, `${req.key}.mp3`);
      const { url } = await options.provider.generateAudio(
        {
          prompt: buildAudioPrompt(req),
          audioType: req.audioType,
          durationSeconds: req.duration ?? (req.audioType === 'bgm' ? 30 : 1),
        },
        outPath,
        options.signal,
      );
      addToPack(assetPack, 'audio', { type: 'audio', key: req.key, url });
      return { success: true, key: req.key, url };
    }
    case 'tileset': {
      const outPath = path.join(assetsDir, `${req.key}.png`);
      const tilesetPrompt = buildTilesetPrompt(req, params.style_anchor);
      const gridSize = req.tileset_size ?? 7;
      const tilePixelSize = req.tile_size ?? 64;

      const { url } = options.provider.generateTileset
        ? await options.provider.generateTileset(
            { prompt: tilesetPrompt, gridSize, tilePixelSize },
            outPath,
            options.signal,
          )
        : await options.provider.generateImage(
            {
              prompt: tilesetPrompt,
              size: `${tilePixelSize * gridSize}*${tilePixelSize * gridSize}`,
              transparentBackground: false,
            },
            outPath,
            options.signal,
          );
      addToPack(assetPack, 'tilesets', { type: 'tileset', key: req.key, url });
      return { success: true, key: req.key, url };
    }
    default: {
      const _exhaustive: never = req;
      throw new Error(`Unknown asset request: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// ============ Asset Pack I/O ============

async function loadAssetPack(packPath: string): Promise<AssetPack> {
  try {
    const raw = await fs.readFile(packPath, 'utf8');
    return JSON.parse(raw) as AssetPack;
  } catch {
    return {};
  }
}

function addToPack(
  pack: AssetPack,
  section: string,
  file: AssetPackFile,
): void {
  if (!pack[section]) pack[section] = { files: [] };
  const list = pack[section].files;
  const existing = list.find((f) => f.key === file.key);
  if (existing) {
    existing.url = file.url;
    existing.type = file.type;
  } else {
    list.push(file);
  }
}

export type {
  GenerateAssetsParams,
  AssetRequest,
  BackgroundRequest,
  ImageRequest,
  AnimationRequest,
  AudioRequest,
  TilesetRequest,
  AssetPack,
  AssetPackFile,
};
