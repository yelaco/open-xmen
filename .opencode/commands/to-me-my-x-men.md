---
description: Autonomous Cerebro full-team mode for best-effort execution.
agent: cerebro
model: openai/gpt-5.4
---
Assemble the full Cerebro team for autonomous execution of: $ARGUMENTS

## Best-effort standard

The user expects the best the team can produce, not the minimum viable version. Prefer excellent architecture, complete UX states, strong verification, and polished results. Fast is good; generic and under-verified is failure.

## Required flow

1. Announce maximum Cerebro power.
2. Classify mission shape and risk. If HIGH risk, ask for explicit confirmation before destructive/production/credentialed/data/billing/legal/git-history actions.
3. Call `cerebro_model_slots` and `cerebro_run_start` with command `/to-me-my-x-men`.
4. Always start with Legion and Cypher:
   - Legion writes customer vision under `.cerebro/notepads/customer/`.
   - Cypher writes requirements under `.cerebro/notepads/requirements/`.
   Ask one focused, structured confirmation question in plain text only for non-inferable blockers. Do not stack questions or ask for open-ended replies when a safe assumption can be documented.
5. Promote requirements into a Professor X product brief or implementation plan, reviewed by Beast and validated by Emma Frost when risk/complexity warrants.
6. Create task records, then use Cyclops to coordinate implementation with Wolverine, Storm, Forge, Nightcrawler, Sage, Beast, and Emma Frost as appropriate.
7. Maintain task-scoped todos for worker tasks and record mailbox decisions/checkpoints. Use Spark for instant first drafts only when it accelerates the mission without lowering final quality; full Codex/frontier agents own final implementation and verification.
8. Run verification and final Legion acceptance. A Legion reject creates retry tasks before completion.
9. Call `cerebro_verify_pending`; final-report only when todos are clear or explicitly blocked.

Final report must include assumptions, files changed, tests/verification, customer acceptance verdict, unresolved issues, and `.cerebro` run paths.
