import { defaultModelForAgent } from "../config/models.js";

export const CEREBRO_COMMANDS = [
  "/cerebro-ultrawork",
  "/cerebro-plan",
  "/cerebro-start-work",
] as const;

export type CerebroCommand = (typeof CEREBRO_COMMANDS)[number];

export interface CommandDefinition {
  name: string;
  description: string;
  model: string;
  content: string;
}

const COMMAND_MODEL = defaultModelForAgent("cerebro");

export const CEREBRO_COMMAND_DEFINITIONS: CommandDefinition[] = [
  {
    name: "cerebro-plan",
    description: "Interactive planning mode — Cypher interviews the user, Professor X drafts, Beast and Emma Frost review.",
    model: COMMAND_MODEL,
    content: `Plan this work: $ARGUMENTS

## Required flow

1. Announce strategic planning mode.
2. Call \`cerebro_model_slots\` and \`cerebro_run_start\` with command \`/cerebro-plan\` and initial risk classification.
3. **Classify intent sub-type**: \`refactoring\` | \`build-from-scratch\` | \`mid-sized-task\` | \`architecture\` | \`bug-fix\`. Announce it in one line.
4. Gather codebase context: use Nightcrawler for structure and Sage for relevant docs before the interview begins.
5. **Compose the planning team from the intent characterization** — run only the specialists this request needs; skip any that don't apply and note why. **Legion** → \`CUSTOMER_VISION_READY\` (context for Cypher), via the native \`task\` tool (subagent_type = the agent) ⇐ product-shaped or user-facing work where the WANT / quality bar is unclear.
6. **Cypher** (\`MODE: interactive\`): run Cypher via the native \`task\` tool (subagent_type = the agent) with the request, intent sub-type, Legion's vision (if produced), and \`MODE: interactive\`. Run the interview loop:
   - Cypher returns \`CLARIFY\` with a prioritized question list.
   - Present the questions to the user with the \`question\` tool — one selectable entry per question, in Cerebro's voice (do not expose Cypher's raw block). Cypher supplies the list; Cerebro renders it through the tool so the user answers with keystrokes. Provide discrete options where Cypher's question implies them, and lead with a recommended default marked *(recommended)*. If the \`question\` tool isn't available in this build, fall back to a concise numbered list and ask the user to reply by number.
   - Collect answers and pass back to Cypher.
   - Repeat until Cypher returns \`REQUIREMENTS_READY\` (max 3 rounds).
7. **Professor X**: draft the plan from \`REQUIREMENTS_READY\` using \`.cerebro/templates/plan.md\` or \`.cerebro/templates/product-brief.md\`. Each task must include \`Category\`, \`Depends On\`, \`Files\`, and \`Verify\` fields (where \`Category\` is visual-engineering | architecture | explore | research | deep | quick). These fields become machine-scheduled task records consumed by the workflow engine, so they must be precise, not decorative — \`Files\` drives parallel-batch conflict avoidance — list the files a task WRITES; use an empty list for read-only tasks (scouts/research/test-only) so they still parallelize; a task that omits \`Files\` has an unknown footprint and is scheduled alone — so declare them to unlock parallelism) and \`Verify\` commands run verbatim in a shell.
8. **Beast** gap review via the native \`task\` tool (subagent_type = the agent) ⇐ any non-trivial plan. **Emma Frost** via the native \`task\` tool ⇐ HIGH risk: auth, billing, migration, data integrity, public API, or irreversible work.
9. Iterate on the plan until all review blockers are resolved.
10. Write the approved plan to \`.cerebro/plans/{slug}.md\`.
11. Checkpoint and report: plan path, risk, approval gates, acceptance criteria, and verification commands.

Do not implement the plan in this command.`,
  },
  {
    name: "cerebro-start-work",
    description: "Execute or resume the latest Cerebro plan through the deterministic workflow engine.",
    model: COMMAND_MODEL,
    content: `Execute or resume the latest Cerebro plan.

Use the \`opx-personal-assistant\` skill if available and narrate every phase to the user — never run silently. You drive the loop yourself; follow Cerebro's four-phase orchestration process.

## Required flow

1. Announce field execution mode.
2. **Codebase Assessment** — read the newest \`.cerebro/plans/*.md\`, \`.cerebro/boulder.json\` if present, and relevant \`.cerebro/notepads/\`; scout the structure in scope (Nightcrawler / Forge, or quick reads for small repos). Give the user a short summary of the architecture in scope, the verify commands, and any risks before execution. If \`boulder.json\` shows an interrupted run, tell the user you're resuming and from where.
3. Call \`cerebro_model_slots\` and \`cerebro_run_start\` with command \`/cerebro-start-work\`, objective from the plan, and the plan risk. Then immediately call \`todowrite\` with a short run checklist so the sidebar shows progress from the start.
4. Create one task record per plan task with \`cerebro_task_create\`. Each call must include \`category\` (visual-engineering | architecture | explore | research | deep | quick), \`depends_on\` (task ids), \`files\` from the task's \`Files\` field (pass an explicit empty array \`[]\` for read-only tasks so they still parallelize), and \`verification_commands\` from the task's \`Verify\` field. Task descriptions must carry the task's \`What\` and \`TDD\` text so workers receive full context. Then refine the sidebar TODO with \`todowrite\` to one item per task (prefixed with its routed specialist), all \`pending\`.
5. **Smart Delegation loop** — announce the delegation plan to the user, then drive the loop, narrating each step:
   a. \`cerebro_next_tasks\` — get the ready batch (each task's routed \`agent\`, and \`chain\` for visual-engineering).
   b. \`cerebro_next_tasks\` **claims** the batch (marks it \`active\`), so re-calling it never double-hands a task. Spawn **every** returned task with the native \`task\` tool concurrently — multiple \`task\` calls in one message (\`subagent_type\` = the returned \`agent\`, \`prompt\` = the task context) — so the conflict-free batch runs in parallel; each subagent runs in its own visible session and returns when done (no polling). Run chains in order (jean-grey → wolverine → storm), threading the spec/component paths forward.
   c. \`cerebro_verify\` each task — the only path to \`verified\`. On FAIL it auto-requeues (→ \`pending\`, tracking \`attempts\`) or auto-blocks at the budget. **Escalate on repeat failure** by the returned \`attempts\`: attempts 1 → re-dispatch the owner with the recorded failure output; attempts 2 → spawn an \`opx-debug\` diagnostic pass (reproduce → root-cause → targeted fix) instead of re-sending; auto-blocked → re-plan the task with Professor X/Beast or escalate to the user with the diagnosis.
   d. Narrate the step to the user (what ran, what verified, what's next), then repeat from (a) until \`cerebro_next_tasks\` returns nothing ready. **Keep the sidebar TODO current each wave** — \`todowrite\` the wave's tasks to \`in_progress\` before spawning and to \`completed\` when they verify.
6. **Independent Verification** — when nothing is ready and 0 remain, run the final audit scaled to risk/size: for any multi-task, risky, or non-trivial run, spawn **Cyclops** via the \`task\` tool (\`subagent_type: cyclops\`), giving it the objective, task + verification summary, and acceptance criteria; read its \`AUDIT_PASSED\`/\`AUDIT_FAILED\` verdict. On AUDIT_FAILED, record findings with \`cerebro_problem_report\`, re-queue retriable ones (\`cerebro_task_update\` → pending) and resume the loop; escalate non-retriable findings. You may skip Cyclops only for a trivial, low-risk single-task run whose per-task \`cerebro_verify\` already exercised the change — say so and why.
7. Record decisions and blockers with \`cerebro_mailbox_send\`; use \`cerebro_task_update\` for status corrections.
8. Update \`.cerebro/boulder.json\` with status, approvals, verification history, and decisions.
9. Call \`cerebro_verify_pending\`; do not final-report while pending todos remain.
10. Final report: call \`cerebro_run_report\` for a consolidated task/problem summary, then report plan path, files changed, tests run, verification evidence, the Cyclops audit verdict and findings, unresolved issues (the report's blocked tasks + open blockers/errors), rollback notes, and checkpoint paths.`,
  },
  {
    name: "cerebro-ultrawork",
    description: "Fully autonomous Cerebro full-team mode. One prompt in, complete result out — no user interaction after trigger.",
    model: COMMAND_MODEL,
    content: `Assemble the full Cerebro team for autonomous execution of: $ARGUMENTS

## Autonomous standard

The user has given one prompt and expects a complete result with no further questions. Every ambiguity is resolved by codebase inspection or documented as an assumption. Do not ask the user anything. If HIGH risk, pause only for explicit confirmation on destructive/production/credentialed/billing/legal/git-history actions (present **Approve / Cancel** via the \`question\` tool) — nothing else.

**Autonomous is not silent.** Use the \`opx-personal-assistant\` skill if available and narrate every phase to the user as it happens — intent, assessment findings, the delegation plan, progress, and the verified result. You don't ask questions; you keep them continuously informed like a personal assistant. You drive the loop yourself (Cerebro's four-phase process).

## Required flow

1. Open with the exact catchphrase on its own line — **"To me, my X-Men!"** — then state the detected intent sub-type (\`refactoring\` | \`build-from-scratch\` | \`mid-sized-task\` | \`architecture\` | \`bug-fix\`) in one short line.
2. Call \`cerebro_model_slots\` and \`cerebro_run_start\` with command \`/cerebro-ultrawork\` and classified risk. Then immediately call \`todowrite\` with a short run checklist (the phases) so the sidebar shows progress from the start — you'll refine it to one item per task once the plan exists.
3. **Codebase Assessment** — map the architecture before touching a line: scout the structure in scope (Nightcrawler / Forge, or quick reads for small repos). Report a short summary (stack, in-scope areas, conventions, verify commands, risks) to the user before planning.
4. Narrate each phase transition and batch start/completion to the user in plain language as it happens — keep them continuously informed.
5. **Compose the planning team from the Intent Gate analysis** — run only the specialists this request needs, in dependency order via the native \`task\` tool (subagent_type = the agent), threading each one's output to the next. Skip any agent that didn't earn a seat and note why in the delegation plan; don't run a fixed pipeline. **Legion** → \`CUSTOMER_VISION_READY\` under \`.cerebro/notepads/customer/\` (no user questions) ⇐ run only for product-shaped work where the WANT / quality bar is unclear.
6. **Cypher** (\`MODE: autonomous\`) → \`REQUIREMENTS_READY\` (safe defaults, documented assumptions, no CLARIFY rounds), seeded with the prompt, intent sub-type, and Legion's vision if produced ⇐ run only when requirements are ambiguous or acceptance criteria need pinning.
7. **Professor X** (⇐ multi-task or needs a structured plan; skip for a single obvious task): draft the plan from \`REQUIREMENTS_READY\` using \`.cerebro/templates/plan.md\` or \`.cerebro/templates/product-brief.md\`. Each task must include \`Category\`, \`Depends On\`, \`Files\`, and \`Verify\` fields (where \`Category\` is visual-engineering | architecture | explore | research | deep | quick). These fields become machine-scheduled task records — \`Files\` drives parallel-batch conflict avoidance — list the files a task WRITES; use an empty list for read-only tasks (scouts/research/test-only) so they still parallelize; a task that omits \`Files\` has an unknown footprint and is scheduled alone — so declare them to unlock parallelism) and \`Verify\` commands run verbatim in a shell.
8. **Beast** gap review ⇐ any non-trivial plan. **Emma Frost** ⇐ HIGH risk (auth, billing, migration, data integrity, public API, irreversible actions).
9. Write approved plan to \`.cerebro/plans/{slug}.md\`, then create task records with \`cerebro_task_create\` — each with \`category\`, \`depends_on\`, \`files\`, and \`verification_commands\` from the plan. Refine the sidebar TODO with \`todowrite\` to one item per task (content = task subject, prefixed with its routed specialist, e.g. "[wolverine] add auth endpoint"), all \`pending\`.
10. **Smart Delegation loop** — announce the delegation plan, then drive the loop, narrating each step: (a) \`cerebro_next_tasks\` for the ready batch with routing — it **claims** the batch (→ \`active\`) so re-calls never double-hand a task; (b) spawn **every** returned task via the native \`task\` tool concurrently (multiple \`task\` calls in one message, \`subagent_type\` = the routed \`agent\`) so the conflict-free batch runs in parallel, running visual-engineering chains in order; (c) \`cerebro_verify\` each (the only path to \`verified\`; on FAIL it auto-requeues → \`pending\` tracking \`attempts\`, or auto-blocks at the budget). **Escalate on repeat failure** by the returned \`attempts\`: attempts 1 → re-dispatch the owner with the recorded failure output; attempts 2 → spawn an \`opx-debug\` diagnostic pass (reproduce → root-cause → targeted fix) instead of re-sending; auto-blocked → re-plan the task with Professor X/Beast or escalate to the user with the diagnosis. (d) narrate the step and repeat until nothing is ready. **Keep the sidebar TODO current each wave** — \`todowrite\` the wave's tasks to \`in_progress\` before spawning and to \`completed\` when they verify, so the waves are always visible.
11. **Independent Verification** — scaled to risk/size: for any multi-task, risky, or non-trivial run, spawn **Cyclops** via the \`task\` tool (\`subagent_type: cyclops\`) for the final audit; read its \`AUDIT_PASSED\`/\`AUDIT_FAILED\` verdict. On AUDIT_FAILED, record findings with \`cerebro_problem_report\`, re-queue retriable ones (\`cerebro_task_update\` → pending) and resume the loop; escalate non-retriable findings autonomously where possible. You may skip Cyclops only for a trivial, low-risk single-task run whose per-task \`cerebro_verify\` already exercised the change — say so and why.
12. Call \`cerebro_verify_pending\`; final-report only when todos are clear or explicitly blocked.

Final report: call \`cerebro_run_report\` for a consolidated task/problem summary, then report assumptions made, files changed, tests/verification, the Cyclops audit verdict (or why it was skipped), unresolved issues (the report's blocked tasks + open blockers/errors), and \`.cerebro\` run paths.`,
  },
];
