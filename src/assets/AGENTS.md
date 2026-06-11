# Cerebro OpenCode Runtime

This project uses the Cerebro workflow on OpenCode.

- Primary runtime state lives under `.cerebro/`.
- Use OpenCode commands `/cerebro-plan`, `/cerebro-start-work`, and `/cerebro-ultrawork` for non-trivial work.
- Preserve Cerebro role names: Legion, Cypher, Professor X, Cyclops, Wolverine, Storm, Forge, Nightcrawler, Sage, Beast, and Emma Frost.
- Cerebro orchestrates the execution loop itself (`cerebro_next_tasks` → spawn specialists → `cerebro_verify` → `cerebro_audit`), narrating each step; determinism lives in those tools.
- OpenCode does not provide Claude Code native team APIs; use Cerebro custom tools and OpenCode subagents/child sessions for coordination.
- Never read `.env`, `.env.*`, secret, or credential files unless the user explicitly authorizes it for the current task.
- Do not write generated build output (`dist/`, `build/`, `target/`) unless the task explicitly targets those directories.

The Cerebro agent (the default primary agent) is the source of truth for Cerebro's identity and orchestration process.
