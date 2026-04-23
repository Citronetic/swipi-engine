/**
 * Programmatic 6-phase orchestration — the non-interactive analogue of the
 * Claude Code plugin's `/swipi-new` command.
 *
 * Phases 1, 2 are fully automated here. Phases 3 (asset generation), 4
 * (config merge), 5 (code implementation) require either an LLM agent loop
 * or a user-supplied AssetProvider, so they are surfaced as callbacks the
 * caller wires up. This keeps @swipi/core framework-agnostic: the REST API
 * wraps this with a Claude-backed agent loop, but other consumers (CI
 * pipelines, batch jobs) can wire it differently.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { LLMClient } from '../llm/types.js';
import { classifyGame } from '../tools/classify-game.js';
import type {
  ClassificationResult,
  GameArchetype,
} from '../tools/classify-game.js';
import { generateGDD } from '../tools/generate-gdd.js';
import { generateAssets } from '../tools/generate-assets.js';
import type { AssetProvider } from '../tools/generate-assets.js';
import { generateTilemap } from '../tools/generate-tilemap.js';
import type {
  GenerateAssetsParams,
  GenerateTilemapParams,
} from '../tools/index.js';

export interface OrchestratorOptions {
  llm: LLMClient;
  /**
   * Absolute path to the swipi shared assets directory (templates/ + docs/).
   * In the swipi-engine monorepo this is typically
   * `<repo>/packages/shared`. Must contain `templates/core/`,
   * `templates/modules/{archetype}/`, and `docs/gdd/core.md`.
   */
  sharedDir: string;
  /** Absolute path of the empty project directory that will receive the game. */
  workspaceDir: string;
  /** Optional asset provider. Required for Phase 3 if called. */
  assetProvider?: AssetProvider;
  signal?: AbortSignal;
  /** Phase callbacks — every phase is awaited before the next begins. */
  onPhaseStart?: (phase: Phase) => void | Promise<void>;
  onPhaseComplete?: (phase: Phase, result: unknown) => void | Promise<void>;
}

export type Phase =
  | 'classify'
  | 'scaffold'
  | 'gdd'
  | 'assets'
  | 'config'
  | 'code'
  | 'verify';

export interface OrchestrationResult {
  classification: ClassificationResult;
  gdd: string;
  gddPath: string;
  /** Non-null when phases beyond GDD were executed. */
  assets?: { summary: string; assetPackPath: string };
  /** Non-null when a tilemap was requested. */
  tilemap?: { generatedMaps: string[] };
}

// ============ Public entry points ============

export async function classifyPhase(
  prompt: string,
  options: OrchestratorOptions,
): Promise<ClassificationResult> {
  await options.onPhaseStart?.('classify');
  const result = await classifyGame(prompt, {
    llm: options.llm,
    signal: options.signal,
    tier: 'fast',
  });
  await options.onPhaseComplete?.('classify', result);
  return result;
}

export async function scaffoldPhase(
  archetype: GameArchetype,
  options: OrchestratorOptions,
): Promise<void> {
  await options.onPhaseStart?.('scaffold');
  const templatesRoot = path.join(options.sharedDir, 'templates');
  const docsRoot = path.join(options.sharedDir, 'docs');

  await copyDir(path.join(templatesRoot, 'core'), options.workspaceDir);
  await copyDir(
    path.join(templatesRoot, 'modules', archetype, 'src'),
    path.join(options.workspaceDir, 'src'),
  );

  const projectDocs = path.join(options.workspaceDir, 'docs');
  await fs.mkdir(path.join(projectDocs, 'gdd'), { recursive: true });
  await fs.mkdir(path.join(projectDocs, 'modules', archetype), {
    recursive: true,
  });
  await fs.copyFile(
    path.join(docsRoot, 'gdd', 'core.md'),
    path.join(projectDocs, 'gdd', 'core.md'),
  );
  await fs.copyFile(
    path.join(docsRoot, 'asset_protocol.md'),
    path.join(projectDocs, 'asset_protocol.md'),
  );
  await fs.copyFile(
    path.join(docsRoot, 'debug_protocol.md'),
    path.join(projectDocs, 'debug_protocol.md'),
  );
  await copyDir(
    path.join(docsRoot, 'modules', archetype),
    path.join(projectDocs, 'modules', archetype),
  );

  await options.onPhaseComplete?.('scaffold', undefined);
}

export async function gddPhase(
  prompt: string,
  archetype: GameArchetype,
  options: OrchestratorOptions,
): Promise<{ content: string; path: string }> {
  await options.onPhaseStart?.('gdd');
  const content = await generateGDD(
    { raw_user_requirement: prompt, archetype },
    {
      llm: options.llm,
      docsDir: path.join(options.sharedDir, 'docs'),
      signal: options.signal,
      tier: 'balanced',
    },
  );
  const gddPath = path.join(options.workspaceDir, 'GAME_DESIGN.md');
  await fs.writeFile(gddPath, content, 'utf8');
  await options.onPhaseComplete?.('gdd', { path: gddPath });
  return { content, path: gddPath };
}

export async function assetsPhase(
  params: GenerateAssetsParams,
  options: OrchestratorOptions,
) {
  if (!options.assetProvider) {
    throw new Error(
      'assetsPhase requires an AssetProvider. Supply one via OrchestratorOptions.assetProvider.',
    );
  }
  await options.onPhaseStart?.('assets');
  const result = await generateAssets(params, {
    provider: options.assetProvider,
    workspaceDir: options.workspaceDir,
    signal: options.signal,
  });
  await options.onPhaseComplete?.('assets', result);
  return result;
}

export async function tilemapPhase(
  params: GenerateTilemapParams,
  options: OrchestratorOptions,
) {
  const result = await generateTilemap(params, {
    workspaceDir: options.workspaceDir,
  });
  return result;
}

/**
 * End-to-end phases 1–3 (classify, scaffold, GDD). Stops before asset
 * generation because that step is optional and provider-dependent.
 */
export async function runClassifyScaffoldGDD(
  prompt: string,
  options: OrchestratorOptions,
): Promise<OrchestrationResult> {
  const classification = await classifyPhase(prompt, options);
  await scaffoldPhase(classification.archetype, options);
  const { content, path: gddPath } = await gddPhase(
    prompt,
    classification.archetype,
    options,
  );
  return { classification, gdd: content, gddPath };
}

// ============ Helpers ============

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
