# Orchestration System Guide

Cerebro turns OpenCode into a coordinated X-Men-themed agent workflow using native project files: `AGENTS.md`, `.opencode/agents/`, `.opencode/commands/`, the `open-xmen` plugin, and `.cerebro/` runtime state.

## When To Use What

| Complexity | Approach | When to use |
|---|---|---|
| Simple | Ask normally | Explanation, small command, single obvious edit. |
| New repo or stale context | `/cerebro-index` | Build `.cerebro/project-context.md` before planning or execution. |
| Clear implementation | `/cerebro-ultrawork [task]` | Clear goal, low/medium risk, no long interview needed. |
| Complex or risky | `/cerebro-plan [task]` then `/cerebro-start-work` | Multi-step feature, architecture change, migration, security, data, production impact. |
| Interrupted plan | `/cerebro-start-work` | Continue from `.cerebro/boulder.json`. |

If the user explicitly invokes `/cerebro-ultrawork` for ambiguous or product-shaped work, Cerebro asks only for blockers it cannot infer safely. Otherwise Legion and Cypher record assumptions in customer/requirements notepads before Professor X, Beast, Emma Frost, and the workers proceed.

## Three-Layer Architecture

### Planning Layer (Cerebro + consultants)

Cerebro classifies the request and owns user interaction. Consultants are invoked selectively:

- **Legion + Cypher**: product-shaped or vague work only — customer vision and requirements.
- **Professor X**: complex/risky tasks — authors the plan with `Category` fields per task.
- **Beast**: gap review on all plans.
- **Emma Frost**: HIGH risk, auth, billing, migration, or data-integrity plans.

Cerebro writes the approved plan to `.cerebro/plans/{slug}.md`, creates task records with `category`/`depends_on`/`files`/`verification_commands`, then invokes `cerebro_execute_workflow`.

### Execution Engine (deterministic TypeScript)

`cerebro_execute_workflow` is plugin runtime code, not an agent. No LLM decides scheduling, verification, or retry counts. The engine:

1. Computes the dependency frontier — pending tasks whose `depends_on` tasks are all complete.
2. Routes each task by `Category` to the correct worker chain (table below).
3. Dispatches conflict-free frontier tasks in parallel batches; tasks sharing declared `Files` are never co-scheduled.
4. Collects each worker's `TASK_RESULT` from its child session.
5. Runs the task's `Verify` commands in a real shell, recording PASS/FAIL on the ledger with captured output — no model self-grading.
6. Retries failed tasks at most twice, sending the responsible worker the exact failure output.
7. Harvests each worker's `GOTCHAS:` section into `.cerebro/notepads/{run_id}/gotchas.md` and forwards it to later workers.
8. Emits progress milestones for every phase transition and records blockers, failed verification, and runtime gaps to `.cerebro/team-runs/{run-id}.problems.jsonl`.
9. Returns a structured result (`complete` / `blocked` / `timeout` / `aborted`) with task, verification, retry, and audit summaries. Re-invoking with the same run_id resumes from the task ledger.

**Category routing table:**

| Category | Worker chain |
|---|---|
| visual-engineering | Jean Grey → Wolverine → Storm |
| architecture | Forge |
| explore | Nightcrawler |
| research | Sage |
| deep / quick / *(default)* | Wolverine |

### Worker Layer

Workers own their domain and return `TASK_RESULT` with files changed, tests run, and verification evidence. Workers do not re-dispatch to each other — sequencing belongs to the engine.

### Audit Wave (Cyclops)

When every task is done and verified, the engine dispatches Cyclops once as the final quality gate. Cyclops inspects the diff, cross-checks verification evidence against the plan's acceptance criteria, and hunts scope creep, missed work, and test gaps. It rules `AUDIT_PASSED` or `AUDIT_FAILED` with a structured JSON findings array; failures become problem records, and retriable findings re-queue their tasks for one more engine pass.

## Verification Standard

Worker self-report is not enough. The engine runs the plan's verification commands itself after each `TASK_RESULT`, records PASS/FAIL with captured output on the task ledger, and routes failures back to the responsible worker. Cyclops then independently audits the final state before the run can complete. Final synthesis happens only after `cerebro_verify_pending` confirms task-scoped todos are clear or explicitly blocked.

## Multi-Model Resilience

Each agent has a primary model and fallback chain in `options.model_fallbacks`. The canonical role-slot table lives in `opencode/model-routing.md` and is mirrored by `cerebro_model_slots`.
