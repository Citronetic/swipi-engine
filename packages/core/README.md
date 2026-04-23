# @swipi/core

Framework-agnostic game-generation engine. Every non-qwen piece of OpenGame, exposed as plain async TypeScript functions behind a provider-agnostic `LLMClient` interface.

## Install

```bash
# from the swipi-engine repo root
npm install
npm run build --workspace=@swipi/core
```

The package has one runtime dependency: `@anthropic-ai/sdk`. Other providers (OpenAI, OpenRouter, DashScope, local) are supported through the built-in `OpenAICompatClient` — no extra install required.

## Surface

```typescript
import {
  // LLM adapters
  AnthropicLLMClient,
  OpenAICompatClient,
  NoopLLMClient,
  type LLMClient,
  // Game tools
  classifyGame,
  generateGDD,
  generateAssets,
  generateTilemap,
  type AssetProvider,
  // Orchestrator
  classifyPhase,
  scaffoldPhase,
  gddPhase,
  runClassifyScaffoldGDD,
  // Skill pipelines (also reachable via '@swipi/core/skills/template' and '@swipi/core/skills/debug')
  templateSkill,
  debugSkill,
} from '@swipi/core';
```

## Quick example — classify + scaffold + GDD

```typescript
import path from 'node:path';
import { AnthropicLLMClient, runClassifyScaffoldGDD } from '@swipi/core';

const result = await runClassifyScaffoldGDD(
  "Build a Snake clone with WASD controls and a dark theme",
  {
    llm: new AnthropicLLMClient({ apiKey: process.env.ANTHROPIC_API_KEY }),
    sharedDir: path.resolve('packages/shared'),
    workspaceDir: path.resolve('games/my-snake'),
    onPhaseStart: (p) => console.log(`[${p}] start`),
    onPhaseComplete: (p) => console.log(`[${p}] done`),
  },
);

console.log(result.classification.archetype);  // "grid_logic"
console.log(result.gddPath);                    // "games/my-snake/GAME_DESIGN.md"
```

## What was ported from OpenGame

| OpenGame source | @swipi/core destination | Status |
|-----------------|-------------------------|--------|
| `tools/game-type-classifier.ts` | `src/tools/classify-game.ts` | Clean port — prompt and parse logic preserved |
| `tools/generate-gdd.ts` | `src/tools/generate-gdd.ts` | Verbatim port of prompts + archetype section guidance; qwen wrapper swapped for `generateGDD()` |
| `tools/generate-tilemap.ts` + `services/auto-tiler.ts` | `src/tools/generate-tilemap.ts` + `src/utils/auto-tiler.ts` | Verbatim port — deterministic, no LLM |
| `tools/generate-assets-types.ts` | `src/tools/generate-assets-types.ts` | Verbatim |
| `tools/generate-assets.ts` + `services/asset*.ts` (~1800 LOC) | `src/tools/generate-assets.ts` | **Redesigned** — replaced DashScope/Doubao hardcoding with `AssetProvider` interface; prompt IP preserved inline |
| `agent-test/template-skill/*` | `src/skills/template-skill/*` | Drop-in port (self-contained) |
| `agent-test/debug-skill/*` | `src/skills/debug-skill/*` | Drop-in port (self-contained) |

## Tiered Claude routing

`AnthropicLLMClient` maps three logical tiers to concrete models. Override in the constructor if you're pinning versions:

| Tier | Default model | Typical use |
|------|---------------|-------------|
| `fast` | `claude-haiku-4-5` | Classification, consistency checks, debug signature matching |
| `balanced` | `claude-sonnet-4-6` | GDD drafting, asset prompt authoring, repair diagnoses |
| `smart` | `claude-opus-4-7` | Phase-5 code implementation, complex refactors |

## Asset providers

`@swipi/core` does not ship image-generation code. Supply an `AssetProvider`:

```typescript
import type { AssetProvider } from '@swipi/core';

const myProvider: AssetProvider = {
  async generateImage(input, outputPath, signal) {
    // call OpenAI DALL-E 3, Stability, fal.ai, DashScope, Replicate, local SDXL, ...
    // write the PNG to outputPath, return { url: outputPath }
  },
  async generateAnimationStrip(refImage, frames, outputDir, signal) { /* ... */ },
  async generateAudio(input, outputPath, signal) { /* ... */ },
};
```

`@swipi/api` (Phase 3) ships a reference provider wired to Vercel AI SDK's image generation.

## Skill pipelines — env-based LLM config

Both skill pipelines were imported verbatim and continue to use OpenAI-compatible chat-completions via environment variables (`REASONING_MODEL_API_KEY`, `REASONING_MODEL_BASE_URL`, `REASONING_MODEL_NAME`, plus per-service `DIAGNOSER_MODEL_NAME` / `GENERALIZER_MODEL_NAME` / `REPAIRER_MODEL_NAME` / `CLASSIFIER_MODEL_NAME` / `ABSTRACTOR_MODEL_NAME` overrides).

To run them against Claude, point those env vars at an OpenAI-compatible proxy (LiteLLM, OpenRouter). Native `LLMClient` injection for skill pipelines is scheduled for Phase 3.

## What's deliberately not ported

- OpenGame's DashScope/Doubao-specific `ModelRouter`, `assetImageService`, `assetAudioService`, `assetVideoService`, `assetBaseService` (~1700 LOC). Replaced by the user-supplied `AssetProvider` interface.
- OpenGame's `BackgroundRemovalService` (imgly + Python rembg). Providers handle transparency themselves or chain their own post-processor.
- OpenGame's `FrameExtractionService` (ffmpeg subprocess + video-to-frames pipeline). Providers expose animation support directly.
- OpenGame's `TilesetProcessor` tile-slicing helper. Users can add their own if their provider returns a composed sheet rather than per-tile images.
- The qwen `BaseDeclarativeTool` / `ToolInvocation` / `Config` / `ToolRegistry` hierarchy. Replaced by plain async functions.

Phase 2 closes the "framework-agnostic core" gap from the migration plan. Phase 3 (`@swipi/api`) consumes this library and exposes it as a REST service.
