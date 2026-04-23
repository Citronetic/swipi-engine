export { classifyGame } from './classify-game.js';
export type {
  ClassificationResult,
  ClassifyGameOptions,
  GameArchetype,
} from './classify-game.js';

export { generateGDD, validateGenerateGDDParams } from './generate-gdd.js';
export type {
  GenerateGDDParams,
  GenerateGDDOptions,
} from './generate-gdd.js';

export { generateTilemap } from './generate-tilemap.js';
export type {
  GenerateTilemapParams,
  GenerateTilemapOptions,
  GenerateTilemapResult,
  MapDefinition,
} from './generate-tilemap.js';

export { generateAssets } from './generate-assets.js';
export type {
  AssetProvider,
  GenerateAssetsOptions,
  GenerateAssetsSummary,
  ImageGenerationInput,
  AudioGenerationInput,
} from './generate-assets.js';
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
} from './generate-assets-types.js';
