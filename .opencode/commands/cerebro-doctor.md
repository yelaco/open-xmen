---
description: Validate Cerebro OpenCode runtime health.
agent: cerebro
model: openai/gpt-5.4
---
Validate the Cerebro OpenCode workflow. Do not modify source files except temporary runtime files needed for safe checks.

Check and report PASS/FAIL for:

1. `opencode.jsonc` exists and loads the `open-xmen` plugin package or local `.opencode/plugins/open-xmen.ts` development bridge.
2. `.opencode/agents/` contains all Cerebro role agents.
3. `.opencode/commands/` contains preserved command names.
4. `.cerebro/cerebro-identity.md`, schemas, templates, plans, notepads, and team-runs exist.
5. `cerebro_model_slots` returns only available configured models.
6. `cerebro_verify_pending` correctly reports clear or blocked pending todos.
7. Type/package validation if available: `npm run build`.
8. Existing schema validators if available: `.cerebro/scripts/validate-boulder.py`, `.cerebro/scripts/validate-team-runs.py`.

Summarize exact failures and suggested fixes.
