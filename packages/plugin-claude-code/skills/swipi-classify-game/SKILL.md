---
name: swipi-classify-game
description: Pick the correct swipi game archetype (platformer, top_down, grid_logic, tower_defense, ui_heavy) from a user prompt using physics-first logic. Invoke from the swipi-workflow skill during Phase 1, or any time you need to decide which template module a game belongs to.
---

# Physics-first archetype classifier

Do not classify by genre name. Classify by the physics the game requires.

| Archetype       | Physics profile                 | Key question                        | Examples (don't match the name — match the physics)        |
|-----------------|---------------------------------|--------------------------------------|-------------------------------------------------------------|
| `platformer`    | Side view + gravity              | Does the character fall if unsupported? | Mario, Terraria, Street Fighter, Castlevania            |
| `top_down`      | Top-down + free continuous motion | Can the character move UP without jumping? | Zelda, Isaac, Vampire Survivors, twin-stick shooters |
| `grid_logic`    | Grid + discrete turns/snaps       | Does position snap to a grid?         | Sokoban, Fire Emblem, Match-3, Pikachu-grid puzzles     |
| `tower_defense` | Fixed paths + waves                | Do enemies follow predetermined routes? | Kingdom Rush, Bloons TD, any "defend the base" game    |
| `ui_heavy`      | No physics — primarily UI         | Is gameplay driven by UI widgets, not spatial movement? | Card games, visual novels, quiz battles, trivia    |

## Decision procedure

1. Read the prompt once. Identify the **primary verb** — is it jump, move, place, defend, or click/select?
2. Ask the gravity question first. If yes → `platformer`. Stop.
3. Ask the grid question. If yes → `grid_logic`. Stop.
4. Ask the path question. If yes → `tower_defense`. Stop.
5. Ask the free-movement question. If yes → `top_down`. Stop.
6. Otherwise → `ui_heavy`.

## Output shape

Return a single JSON block with:

```json
{
  "archetype": "platformer",
  "reasoning": "One sentence explaining which physics signal was decisive.",
  "physicsProfile": {
    "hasGravity": true,
    "perspective": "side",
    "movementType": "continuous"
  }
}
```

## Common mis-classifications to avoid

- **"Card battle game"** → `ui_heavy`, not `grid_logic`, even if cards appear on a grid-like board — gameplay is driven by UI/state, not spatial collisions.
- **"Fighting game like Street Fighter"** → `platformer`, not `ui_heavy` — characters fall under gravity when knocked up.
- **"Tower defense on a hex grid"** → `tower_defense`, not `grid_logic` — fixed paths dominate over discrete grid logic.
- **"Mandalorian twin-stick shooter"** → `top_down`, not `platformer` — the character moves up without jumping.
