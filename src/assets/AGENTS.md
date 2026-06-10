# Cerebro OpenCode Runtime

This project uses the Cerebro workflow ported to OpenCode.

- Primary runtime state lives under `.cerebro/`.
- Use OpenCode commands `/cerebro-index`, `/cerebro-plan`, `/cerebro-start-work`, and `/to-me-my-x-men` for non-trivial work.
- Preserve Cerebro role names: Legion, Cypher, Professor X, Cyclops, Wolverine, Storm, Forge, Nightcrawler, Sage, Beast, and Emma Frost.
- OpenCode does not provide Claude Code native team APIs; use Cerebro custom tools and OpenCode subagents/child sessions for coordination.
- Never read `.env`, `.env.*`, secret, or credential files unless the user explicitly authorizes it for the current task.
- Do not write generated build output (`dist/`, `build/`, `target/`) unless the task explicitly targets those directories.

When handling a Cerebro command, read `.cerebro/cerebro-identity.md` and `.cerebro/opencode/model-routing.md` first if they are not already in context.
