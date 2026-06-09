---
description: Execute or resume the latest Cerebro plan through Cyclops coordination.
agent: cerebro
model: openai/gpt-5.4
---
Execute or resume the latest Cerebro plan.

## Required flow

1. Announce field execution mode.
2. Read the newest `.cerebro/plans/*.md`, `.cerebro/project-context.md` if present, `.cerebro/boulder.json` if present, and relevant `.cerebro/notepads/`.
3. Call `cerebro_model_slots` and `cerebro_run_start` with command `/cerebro-start-work`, objective from the plan, and the plan risk.
4. Create task records for each implementation, UI, review, and verification task in the plan.
5. Use Cyclops to sequence dependencies, assign Wolverine/Storm/Forge/Nightcrawler/Sage/Beast/Emma Frost as needed, and independently verify results. For tiny low-risk boilerplate or test-stub drafts, Cyclops may dispatch a Spark first-pass with `cerebro_dispatch_agent` using `model_slot: "spark"`, but final implementation and verification stay with full Codex/frontier models.
6. Require Wolverine and Storm to maintain `.cerebro/pending-todos/{team}/{agent}/{task}.txt` and return `TASK_RESULT` evidence.
7. Record decisions and blockers with `cerebro_mailbox_send`; update task state with `cerebro_task_update`.
8. Run all verification commands listed in the plan when safe. If a command is destructive, external, credentialed, or production-affecting, ask first.
9. Update `.cerebro/boulder.json` with status, approvals, verification history, and decisions.
10. Call `cerebro_verify_pending`; do not final-report while pending todos remain.
11. Final report: plan path, files changed, tests run, verification evidence, unresolved issues, rollback notes, and checkpoint paths.
