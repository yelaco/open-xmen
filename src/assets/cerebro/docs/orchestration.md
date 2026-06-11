# Orchestration System Guide

Cerebro turns OpenCode into a coordinated X-Men-themed agent workflow using native project files: `AGENTS.md`, `.opencode/agents/`, `.opencode/commands/`, the `open-xmen` plugin, and `.cerebro/` runtime state.

## When To Use What

| Complexity | Approach | When to use |
|---|---|---|
| Simple | Ask normally | Explanation, small command, single obvious edit. |
| Clear implementation | `/cerebro-ultrawork [task]` | Clear goal, low/medium risk, no long interview needed. |
| Complex or risky | `/cerebro-plan [task]` then `/cerebro-start-work` | Multi-step feature, architecture change, migration, security, data, production impact. |
| Interrupted plan | `/cerebro-start-work` | Continue from `.cerebro/boulder.json`. |

If the user explicitly invokes `/cerebro-ultrawork` for ambiguous or product-shaped work, Cerebro asks only for blockers it cannot infer safely. Otherwise Legion and Cypher record assumptions in customer/requirements notepads before Professor X, Beast, Emma Frost, and the workers proceed.

On a natural-language request (no slash command), Cerebro's **Intent Gate** triages the request by complexity and risk, picks a recommended path from the table above, then confirms it as a **selectable choice** via OpenCode's built-in `question` tool — recommended option first — instead of asking the user to type a number. A request triaged as Simple is answered directly with no confirmation.

## Three-Layer Architecture

### Planning Layer (Cerebro + consultants)

Cerebro classifies the request and owns user interaction. Consultants are invoked selectively:

- **Legion + Cypher**: product-shaped or vague work only — customer vision and requirements.
- **Professor X**: complex/risky tasks — authors the plan with `Category` fields per task.
- **Beast**: gap review on all plans.
- **Emma Frost**: HIGH risk, auth, billing, migration, or data-integrity plans.

Cerebro writes the approved plan to `.cerebro/plans/{slug}.md`, creates task records with `category`/`depends_on`/`files`/`verification_commands`/`effort`, then drives the delegation loop itself.

### Execution (Cerebro-driven, deterministic tools)

**Cerebro is the orchestrator** — it spawns subagents and drives the loop, narrating each step. Determinism lives in the tools it calls, not in removing Cerebro from the loop:

1. **`cerebro_next_tasks`** returns the deterministic ready batch: pending tasks whose `depends_on` are all complete, conflict-free (tasks sharing declared `Files` are never co-scheduled), each with its routed `agent` and visual-engineering `chain`.
2. Cerebro **spawns** each ready task with the native `task` tool (`subagent_type` = the routed `agent`), launching independent tasks concurrently for parallelism and running chains in order, threading the design spec/component paths forward. Each subagent runs in its own visible session and returns when done — OpenCode manages completion, so Cerebro never polls. (Each agent uses its own configured model; the `task` tool has no per-call model override.)
3. **`cerebro_verify`** runs the task's `Verify` commands in a real shell, records PASS/FAIL on the ledger with captured output, and is the only path to status `verified` — no model self-grading.
4. On FAIL, Cerebro re-spawns the responsible agent with the exact failure output (≈2 retries), else marks the task blocked and records a problem.
5. Worker `GOTCHAS:` sections are harvested to `.cerebro/notepads/{run_id}/gotchas.md` and forwarded to later workers; progress and problems are recorded throughout.
6. Cerebro repeats until `cerebro_next_tasks` is empty, resuming any interrupted run straight from the ledger.

**Category routing** (applied by `cerebro_next_tasks`):

| Category | Worker chain |
|---|---|
| visual-engineering | Jean Grey → Wolverine → Storm |
| architecture | Forge |
| explore | Nightcrawler |
| research | Sage |
| deep / quick / *(default)* | Wolverine |

### Worker Layer

Workers own their domain and return `TASK_RESULT` with files changed, tests run, and verification evidence. Workers do not re-dispatch to each other — sequencing belongs to Cerebro.

### Audit (Cyclops)

When every task is done and verified, Cerebro spawns Cyclops once via the native `task` tool (`subagent_type: cyclops`) as the final quality gate — a visible session like any other. Cyclops inspects the diff, cross-checks verification evidence against the plan's acceptance criteria, and hunts scope creep, missed work, and test gaps. It ends with `AUDIT_PASSED` or `AUDIT_FAILED` plus findings; Cerebro reads the verdict, records findings as problems (`cerebro_problem_report`), and re-queues retriable ones for another pass.

## Verification Standard

Worker self-report is not enough. Cerebro runs the plan's verification commands via `cerebro_verify` after each task, records PASS/FAIL with captured output on the task ledger, and routes failures back to the responsible worker. Cyclops then independently audits the final state before the run can complete. Final synthesis happens only after `cerebro_verify_pending` confirms task-scoped todos are clear or explicitly blocked.

## Multi-Model Resilience

Each agent has a primary model and fallback chain in `options.model_fallbacks`. The canonical role-slot table lives in `opencode/model-routing.md` and is mirrored by `cerebro_model_slots`.
