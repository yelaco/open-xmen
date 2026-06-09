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

If the user explicitly invokes `/to-me-my-x-men` for ambiguous or product-shaped work, Cerebro asks only for blockers it cannot infer safely. Otherwise Legion and Cypher record assumptions in customer/requirements notepads before Professor X, Beast, Emma Frost, and the workers proceed.

## Three-Layer Architecture

### Planning Layer (Cerebro + consultants)

Cerebro classifies the request and owns user interaction. Consultants are invoked selectively:

- **Legion + Cypher**: product-shaped or vague work only — customer vision and requirements.
- **Professor X**: complex/risky tasks — authors the plan with `Category` fields per task.
- **Beast**: gap review on all plans.
- **Emma Frost**: HIGH risk, auth, billing, migration, or data-integrity plans.

Cerebro writes the approved plan to `.cerebro/plans/{slug}.md` and creates task records, then hands off to Cyclops.

### Execution Layer (Cyclops)

Cyclops receives the plan+task list and owns all execution:

1. Routes each task by `Category` to the correct worker chain.
2. Respects `depends_on` — never dispatches a task whose dependencies are not yet done.
3. Tracks todos under `.cerebro/pending-todos/{run_id}/cyclops/`.
4. After each TASK_RESULT, runs verification commands from the plan. Retries (max 2) on failure with exact output routed back to the worker.
5. Returns `EXECUTION_COMPLETE` or `EXECUTION_BLOCKED`.

**Category routing table:**

| Category | Worker chain |
|---|---|
| visual-engineering | Jean Grey → Wolverine → Storm |
| architecture | Forge |
| explore | Nightcrawler |
| research | Sage |
| deep / quick / *(default)* | Wolverine |

### Worker Layer

Workers own their domain and return `TASK_RESULT` with files changed, tests run, and verification evidence. Workers do not re-dispatch to each other — that is Cyclops's job.

## Verification Standard

Worker self-report is not enough. Cyclops runs the plan's verification commands after each TASK_RESULT and routes failures back to the responsible worker with exact output. Final synthesis happens only after `cerebro_verify_pending` confirms task-scoped todos are clear or explicitly blocked.

## Multi-Model Resilience

Each agent has a primary model and fallback chain in `options.model_fallbacks`. If the primary is unavailable, OpenCode tries fallbacks in order. Intelligence is in the system, not any single model. See `opencode/model-routing.md` for the full table.
