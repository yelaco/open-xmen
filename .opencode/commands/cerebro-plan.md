---
description: Interview-first Cerebro planning with Professor X, Beast, and Emma Frost.
agent: cerebro
model: openai/gpt-5.4
---
Plan this work: $ARGUMENTS

## Required flow

1. Announce strategic planning mode.
2. If the objective is ambiguous and cannot be safely inferred from repository inspection, ask one focused question before drafting. Otherwise proceed.
3. Call `cerebro_model_slots` and `cerebro_run_start` with command `/cerebro-plan`, the objective, and risk classification `LOW`, `MEDIUM`, or `HIGH`.
4. Gather context first: use Nightcrawler for codebase search and Sage for current docs only when needed.
5. For product-shaped or vague work, use Legion to produce customer vision and Cypher to produce requirements under `.cerebro/notepads/`.
6. Use Professor X to draft the plan from `.cerebro/templates/plan.md` or `.cerebro/templates/product-brief.md`.
7. Use Beast for gap review. Use Emma Frost for HIGH risk, public API, auth, data, billing, migration, or high-accuracy plans.
8. Iterate until review blockers are addressed.
9. Write the final approved plan to `.cerebro/plans/{slug}.md`.
10. Checkpoint and report the plan path, risk, approval gates, acceptance criteria, and verification commands.

Do not implement the plan in this command.
