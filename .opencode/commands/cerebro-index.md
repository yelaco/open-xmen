---
description: Build or refresh .cerebro/project-context.md with OpenCode Cerebro agents.
agent: cerebro
model: openai/gpt-5.4
---
Create or refresh `.cerebro/project-context.md` for this repository.

## Required flow

1. Announce Cerebro indexing mode.
2. Call `cerebro_model_slots` and `cerebro_run_start` with command `/cerebro-index`, the objective, and risk `LOW`.
3. Create tasks for:
   - `nightcrawler`: map directories, entrypoints, tests, configs, risky files.
   - `sage`: identify frameworks, package managers, docs, version gotchas, likely verification commands.
   - `forge`: summarize architecture, ownership boundaries, and risky areas.
   - `beast`: gap-check the final index for invented facts and weak verification guidance.
4. Use OpenCode subagents/mentions for the tasks where available; otherwise do the read-only inspection directly but still record task state.
5. Fill `.cerebro/templates/project-context.md` with discovered facts only. Use `Unknown` for unknown fields.
6. Write `.cerebro/project-context.md`.
7. Record mailbox decisions for conflicting findings, checkpoint the run, verify pending todos, and report the indexed stack, commands, risky areas, manifest path, and cleanup status.

Do not modify source files outside `.cerebro/project-context.md` and run metadata.
