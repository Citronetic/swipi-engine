/**
 * Game-generation tools wrapping @swipi/core as Claude tool-use handlers.
 *
 * Each tool is a thin JSON-schema wrapper that:
 *   - validates the Claude-supplied input
 *   - calls the underlying @swipi/core function
 *   - formats the result into a single string (tool_result content)
 *
 * generateGDD and generateTilemap are straightforward. generateAssets
 * depends on an AssetProvider instance supplied at tool-construction time.
 */

import type { LLMClient, AssetProvider, GameArchetype } from '@swipi/core';
import {
  classifyGame,
  generateGDD,
  generateAssets,
  generateTilemap,
  validateGenerateGDDParams,
} from '@swipi/core';
import type { ToolContext, ToolHandler } from './types.js';

/**
 * Factory: game tools need an LLM and an AssetProvider injected. Caller
 * passes those once, gets back an array of handlers ready to register.
 */
export function createGameTools(params: {
  llm: LLMClient;
  assetProvider: AssetProvider;
}): ToolHandler[] {
  return [
    makeClassifyGameTool(params.llm),
    makeGenerateGDDTool(params.llm),
    makeGenerateAssetsTool(params.assetProvider),
    makeGenerateTilemapTool(),
  ];
}

function makeClassifyGameTool(llm: LLMClient): ToolHandler {
  return {
    definition: {
      name: 'classify_game',
      description:
        'Classify a game idea into one of five archetypes (platformer, top_down, grid_logic, tower_defense, ui_heavy) using physics-first logic. Returns a JSON object with archetype, reasoning, and physicsProfile. Call this before scaffolding so you pick the right template module.',
      input_schema: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'The game idea or prompt to classify.',
          },
        },
        required: ['description'],
      },
    },
    async execute(input: unknown): Promise<string> {
      const { description } = input as { description: string };
      const result = await classifyGame(description, { llm, tier: 'fast' });
      return JSON.stringify(result, null, 2);
    },
  };
}

function makeGenerateGDDTool(llm: LLMClient): ToolHandler {
  return {
    definition: {
      name: 'generate_gdd',
      description:
        'Generate a Technical Game Design Document as Markdown. Consumes archetype-specific design rules + template API from the shared docs directory. Use after classify + scaffold. Returns the full GDD content — the agent is responsible for writing it to GAME_DESIGN.md with write_file afterward.',
      input_schema: {
        type: 'object',
        properties: {
          raw_user_requirement: {
            type: 'string',
            description: 'The full user prompt / game idea.',
          },
          archetype: {
            type: 'string',
            enum: ['platformer', 'top_down', 'grid_logic', 'tower_defense', 'ui_heavy'],
            description: 'Archetype returned by classify_game.',
          },
          config_summary: {
            type: 'string',
            description:
              'Optional summary of an existing src/gameConfig.json when regenerating a GDD for an already-scaffolded project.',
          },
        },
        required: ['raw_user_requirement', 'archetype'],
      },
    },
    async execute(input: unknown, ctx: ToolContext): Promise<string> {
      const typed = input as {
        raw_user_requirement: string;
        archetype: GameArchetype;
        config_summary?: string;
      };
      const err = validateGenerateGDDParams(typed);
      if (err) return `validation error: ${err}`;
      const docsDir = `${ctx.sharedDir}/docs`;
      const gdd = await generateGDD(typed, {
        llm,
        docsDir,
        tier: 'balanced',
      });
      return gdd;
    },
  };
}

function makeGenerateAssetsTool(provider: AssetProvider): ToolHandler {
  return {
    definition: {
      name: 'generate_assets',
      description:
        'Generate every asset listed in GDD Section 1 (Asset Registry). Writes files under public/assets/ and updates asset-pack.json in-place. Pass the full assets array from the GDD verbatim.',
      input_schema: {
        type: 'object',
        properties: {
          style_anchor: {
            type: 'string',
            description: 'One-sentence visual style description that every asset prompt inherits.',
          },
          assets: {
            type: 'array',
            description: 'Array of asset requests — backgrounds, images, animations, audio, tilesets.',
            items: {
              type: 'object',
            },
          },
          output_dir_name: {
            type: 'string',
            description: 'Relative output directory. Default "public/assets".',
          },
        },
        required: ['style_anchor', 'assets'],
      },
    },
    async execute(input: unknown, ctx: ToolContext): Promise<string> {
      const typed = input as {
        style_anchor: string;
        assets: Array<Record<string, unknown>>;
        output_dir_name?: string;
      };
      const params = {
        style_anchor: typed.style_anchor,
        assets: typed.assets as never,
        output_dir_name: typed.output_dir_name,
      };
      const result = await generateAssets(params as never, {
        provider,
        workspaceDir: ctx.workspaceDir,
        signal: ctx.signal,
      });
      return result.summary;
    },
  };
}

function makeGenerateTilemapTool(): ToolHandler {
  return {
    definition: {
      name: 'generate_tilemap',
      description:
        'Convert ASCII map layouts from GDD Section 4 into Phaser tilemap JSON files under public/assets/. Auto-tiles based on the tileset grid size. Skip this tool for ui_heavy games.',
      input_schema: {
        type: 'object',
        properties: {
          tileset_key: {
            type: 'string',
            description: 'Key of the tileset image — must already exist in asset-pack.json.',
          },
          maps: {
            type: 'array',
            description: 'Array of map definitions with map_key, layout_ascii, legend.',
            items: { type: 'object' },
          },
          mode: {
            type: 'string',
            enum: ['floor', 'walls'],
            description:
              'Dual-tileset mode for top-down games. Auto-computes legend and auto_tile_chars.',
          },
          tile_size: { type: 'number', description: 'Pixels per tile. Default 64.' },
          tileset_grid_size: {
            type: 'number',
            description: '7 for 47-tile blob auto-tiling (default), 3 for 9-slice.',
          },
        },
        required: ['tileset_key'],
      },
    },
    async execute(input: unknown, ctx: ToolContext): Promise<string> {
      const result = await generateTilemap(input as never, {
        workspaceDir: ctx.workspaceDir,
      });
      return result.summary;
    },
  };
}
