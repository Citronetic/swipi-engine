/**
 * Game-type classifier — physics-first logic.
 *
 * Ported from OpenGame/packages/core/src/tools/game-type-classifier.ts.
 * Strips the qwen BaseDeclarativeTool wrapper; the classification prompt,
 * parse logic, and fallback behavior are preserved verbatim so generated
 * archetype distribution matches OpenGame's golden behavior.
 */

import type { LLMClient } from '../llm/types.js';

export type GameArchetype =
  | 'platformer'
  | 'top_down'
  | 'grid_logic'
  | 'tower_defense'
  | 'ui_heavy';

export interface ClassificationResult {
  archetype: GameArchetype;
  reasoning: string;
  physicsProfile: {
    hasGravity: boolean;
    perspective: 'side' | 'top_down' | 'none';
    movementType: 'continuous' | 'grid' | 'path' | 'ui_only';
  };
}

export interface ClassifyGameOptions {
  llm: LLMClient;
  /** Signal forwarded to the LLM adapter for cancellation. */
  signal?: AbortSignal;
  /** Override model tier (defaults to `fast`). */
  tier?: 'fast' | 'balanced' | 'smart';
}

const SYSTEM_PROMPT = `# Game Type Classifier (Physics-First Logic)

You are a game physics analyzer. Your job is to classify games based on their PHYSICS and PERSPECTIVE, not their genre name.

## Classification Rules

### 1. platformer (Side View + Gravity)
**Physics**: Y-axis gravity enabled, characters fall down
**Perspective**: Side view (camera looks from the side)
**Movement**: Left/right + jump
**Examples**: Mario, Angry Birds, Street Fighter, Terraria, Hill Climb Racing, Metal Slug, Flappy Bird

**Key Question**: Does the character FALL if there's no ground beneath them?

### 2. top_down (Top-Down + Free Movement)
**Physics**: No gravity (or negligible), free 8-direction movement
**Perspective**: Top-down or isometric (camera looks from above)
**Movement**: WASD in any direction
**Examples**: Zelda, Binding of Isaac, Vampire Survivors, Asteroids, GTA 2D, Hotline Miami

**Key Question**: Can the character move UP without jumping?

### 3. grid_logic (Grid + Turn/Static Logic)
**Physics**: Minimal physics, snap-to-grid movement
**Perspective**: Usually top-down, but grid-locked
**Movement**: Discrete steps (one tile at a time)
**Examples**: Sokoban, Fire Emblem, Chess, Tetris, Match-3, Minesweeper, Snake

**Key Question**: Does movement happen in discrete grid steps?

### 4. tower_defense (Path + Waves)
**Physics**: Enemies follow predefined paths
**Perspective**: Usually top-down
**Movement**: Path-following for enemies, point-and-click for towers
**Examples**: Kingdom Rush, Bloons TD, Plants vs Zombies

**Key Question**: Do enemies follow a fixed path while player places defenses?

### 5. ui_heavy (UI Driven / No Physics)
**Physics**: Almost no arcade physics
**Perspective**: N/A (UI panels)
**Movement**: Click/tap interactions
**Examples**: Card games (Slay the Spire), Visual Novels, Idle/Clicker games, Rhythm games (note highways)

**Key Question**: Is the game primarily UI panels and state changes?

## Output Format

Respond with ONLY a JSON object (no markdown, no explanation outside JSON):

{
  "archetype": "platformer" | "top_down" | "grid_logic" | "tower_defense" | "ui_heavy",
  "reasoning": "Brief explanation of why this archetype was chosen based on physics",
  "physicsProfile": {
    "hasGravity": true | false,
    "perspective": "side" | "top_down" | "none",
    "movementType": "continuous" | "grid" | "path" | "ui_only"
  }
}

## Common Mistakes to Avoid

- Terraria is NOT top_down (it has gravity, it's platformer)
- Angry Birds is NOT puzzle (it has gravity physics, it's platformer)
- Hill Climb Racing is NOT top_down (it has gravity, it's platformer)
- SimCity/Factorio are grid_logic (grid-based building), not top_down
- Racing games: If side-view with gravity = platformer, if top-down = top_down
`;

function buildUserPrompt(description: string): string {
  return `Classify this game based on its PHYSICS and PERSPECTIVE:

"${description}"

Remember: Think about GRAVITY, PERSPECTIVE, and MOVEMENT TYPE. Output JSON only.`;
}

function parseClassification(raw: string): ClassificationResult {
  let jsonStr = raw.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  }

  try {
    const parsed = JSON.parse(jsonStr) as Partial<ClassificationResult>;
    return {
      archetype: (parsed.archetype ?? 'platformer') as GameArchetype,
      reasoning: parsed.reasoning ?? 'No reasoning provided',
      physicsProfile: parsed.physicsProfile ?? {
        hasGravity: true,
        perspective: 'side',
        movementType: 'continuous',
      },
    };
  } catch {
    // Fallback — scan text for an archetype keyword.
    const archetypes: GameArchetype[] = [
      'platformer',
      'top_down',
      'grid_logic',
      'tower_defense',
      'ui_heavy',
    ];
    for (const arch of archetypes) {
      if (raw.toLowerCase().includes(arch)) {
        return {
          archetype: arch,
          reasoning: raw,
          physicsProfile: {
            hasGravity: arch === 'platformer',
            perspective: arch === 'platformer' ? 'side' : 'top_down',
            movementType: arch === 'grid_logic' ? 'grid' : 'continuous',
          },
        };
      }
    }
    return {
      archetype: 'platformer',
      reasoning: 'Failed to parse, defaulting to platformer',
      physicsProfile: {
        hasGravity: true,
        perspective: 'side',
        movementType: 'continuous',
      },
    };
  }
}

/**
 * Classify a game idea into a swipi archetype.
 *
 * @example
 * const result = await classifyGame(
 *   "A game like Terraria where I dig and build",
 *   { llm: new AnthropicLLMClient() }
 * );
 * // result.archetype === "platformer"
 */
export async function classifyGame(
  description: string,
  options: ClassifyGameOptions,
): Promise<ClassificationResult> {
  if (!description || description.trim().length < 3) {
    throw new Error('game description must be at least 3 characters');
  }

  const response = await options.llm.complete({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(description) },
    ],
    tier: options.tier ?? 'fast',
    temperature: 0.3,
    maxTokens: 500,
    signal: options.signal,
  });

  return parseClassification(response.content);
}
