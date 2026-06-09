---
description: Reset Cerebro runtime state after explicit confirmation.
agent: cerebro
model: openai/gpt-5.4
---
Reset Cerebro runtime state.

This is destructive to `.cerebro` runtime files only. Before deleting anything, show what would be removed and ask for explicit confirmation.

Runtime reset targets:
- `.cerebro/boulder.json`
- `.cerebro/.pending-todos`
- `.cerebro/pending-todos/`
- `.cerebro/plans/`
- `.cerebro/notepads/`
- `.cerebro/team-runs/`

Never delete schemas, templates, scripts, docs, integrations, identity, OpenCode agents, OpenCode commands, or source files.

Use `.cerebro/scripts/reset-runtime.py` if available.
