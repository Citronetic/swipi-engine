---
description: Classify a game idea into one of the five swipi archetypes using physics-first logic. Returns the archetype JSON without scaffolding anything.
argument-hint: '<game idea>'
allowed-tools: Skill
---

You are being asked to classify a game idea into one of the five swipi archetypes. **Do not scaffold a project.** Return only the classification.

**Game idea:** $ARGUMENTS

1. Invoke the `swipi-classify-game` skill.
2. Apply the physics-first decision procedure to the game idea above.
3. Respond with the required JSON block only, plus one short paragraph explaining which physics signal was decisive.

Do not proceed to any other phase.
