# Orchestration System Guide

Cerebro turns OpenCode into a coordinated X-Men-themed agent workflow using native project files: `AGENTS.md`, `.opencode/agents/`, `.opencode/commands/`, the `open-xmen` plugin, and `.cerebro/` runtime state.

## When To Use What

| Complexity | Approach | When to use |
|---|---|---|
| Simple | Ask normally | Explanation, small command, single obvious edit. |
| New repo or stale context | `/cerebro-index` | Build `.cerebro/project-context.md` before planning or execution. |
| Clear implementation | `/to-me-my-x-men [task]` | Clear goal, low/medium risk, no long interview needed. |
| Complex or risky | `/cerebro-plan [task]` then `/cerebro-start-work` | Multi-step feature, architecture change, migration, security, data, production impact. |
| Interrupted plan | `/cerebro-start-work` | Continue from `.cerebro/boulder.json`. |

If the user explicitly invokes `/to-me-my-x-men` for ambiguous or product-shaped work, Cerebro asks only for blockers it cannot infer safely. Otherwise Legion and Cypher record assumptions in customer/requirements notepads before Professor X, Beast, Emma Frost, Cyclops, and the workers proceed.

## Layers

1. Cerebro classifies the user request and reads `.cerebro/project-context.md` plus OpenCode routing guidance when it exists.
2. Legion captures customer intent and Cypher converts it into requirements when autonomous mode needs product judgment.
3. Professor X plans complex or risky work and writes `.cerebro/plans/{name}.md`.
4. Cyclops creates/updates Cerebro task records and delegates to Wolverine, Storm, Forge, Nightcrawler, Sage, Beast, and Emma Frost.
5. Workers report evidence; Cyclops verifies independently.
6. Run manifests, task ledgers, mailbox logs, checkpoints, boulder state, and notepads are stored under `.cerebro/`.

## Verification Standard

Worker self-report is not enough. Cyclops verifies by reading changed files, running the plan's verification commands, and sending failures back to the worker with exact output. Final synthesis happens only after `cerebro_verify_pending` confirms task-scoped todos are clear or explicitly blocked.
