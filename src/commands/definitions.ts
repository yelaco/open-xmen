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
5. **Legion** (product-shaped or user-facing work only): run Legion through \`cerebro_agent_task\` to produce customer vision. Pass Legion's \`CUSTOMER_VISION_READY\` to Cypher as context.
6. **Cypher** (\`MODE: interactive\`): run Cypher through \`cerebro_agent_task\` with the request, intent sub-type, Legion's vision (if produced), and \`MODE: interactive\`. Run the interview loop:
   - Cypher returns \`CLARIFY\` with a prioritized question list.
   - Present the questions to the user in a clean numbered list (in Cerebro's voice — do not expose Cypher's raw block).
   - Collect answers and pass back to Cypher.
   - Repeat until Cypher returns \`REQUIREMENTS_READY\` (max 3 rounds).
7. **Professor X**: draft the plan from \`REQUIREMENTS_READY\` using \`.cerebro/templates/plan.md\` or \`.cerebro/templates/product-brief.md\`. Each task must include \`Category\`, \`Depends On\`, \`Files\`, and \`Verify\` fields (where \`Category\` is visual-engineering | architecture | explore | research | deep | quick). These fields become machine-scheduled task records consumed by the workflow engine, so they must be precise, not decorative — \`Files\` drives parallel-batch conflict avoidance and \`Verify\` commands run verbatim in a shell.
8. **Beast**: gap review through \`cerebro_agent_task\`. **Emma Frost**: validate through \`cerebro_agent_task\` if HIGH risk, public API, auth, data, billing, or migration work.
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
3. Call \`cerebro_model_slots\` and \`cerebro_run_start\` with command \`/cerebro-start-work\`, objective from the plan, and the plan risk.
4. Create one task record per plan task with \`cerebro_task_create\`. Each call must include \`category\` (visual-engineering | architecture | explore | research | deep | quick), \`depends_on\` (task ids), \`files\` from the task's \`Files\` field, and \`verification_commands\` from the task's \`Verify\` field. Pass \`effort\` only when the plan marks a task trivial (\`low\`) or hard (\`high\`). Task descriptions must carry the task's \`What\` and \`TDD\` text so workers receive full context.
5. **Smart Delegation loop** — announce the delegation plan to the user, then drive the loop, narrating each step:
   a. \`cerebro_next_tasks\` — get the ready batch (each task's routed \`agent\` + \`model_slot\`, and \`chain\` for visual-engineering).
   b. Spawn each ready task with \`cerebro_agent_task\` (or \`cerebro_dispatch_batch\` + \`cerebro_collect_batch_results\` to run independent tasks in parallel), using the returned \`agent\` and \`model_slot\`. Run chains in order (jean-grey → wolverine → storm), threading the spec/component paths forward.
   c. \`cerebro_verify\` each task — the only path to \`verified\`. On FAIL, re-spawn the agent with the exact failure output (≤2 retries); if still failing, mark it \`blocked\` with \`cerebro_task_update\` and report it.
   d. Emit a \`cerebro_progress\` milestone and narrate the step, then repeat from (a) until \`cerebro_next_tasks\` returns nothing ready.
6. **Independent Verification** — when nothing is ready and 0 remain, call \`cerebro_audit\`. On AUDIT_FAILED, re-queue retriable findings (\`cerebro_task_update\` → pending) and resume the loop; escalate non-retriable findings. Never skip the audit.
7. Record decisions and blockers with \`cerebro_mailbox_send\`; use \`cerebro_task_update\` for status corrections.
8. Update \`.cerebro/boulder.json\` with status, approvals, verification history, and decisions.
9. **Legion acceptance** (product-shaped plans only): if the plan includes user-facing acceptance criteria or was derived from Legion/Cypher notepads, run Legion through \`cerebro_agent_task\` for a final customer acceptance verdict. A \`CUSTOMER_VERDICT: REJECT\` creates retry tasks via \`cerebro_task_create\` and re-enters the loop.
10. Call \`cerebro_verify_pending\`; do not final-report while pending todos remain.
11. Final report: call \`cerebro_run_report\` for a consolidated task/problem summary, then report plan path, files changed, tests run, verification evidence, the Cyclops audit verdict and findings, Legion verdict (if run), unresolved issues (the report's blocked tasks + open blockers/errors), rollback notes, and checkpoint paths.`,
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
2. Call \`cerebro_model_slots\` and \`cerebro_run_start\` with command \`/cerebro-ultrawork\` and classified risk.
3. **Codebase Assessment** — map the architecture before touching a line: scout the structure in scope (Nightcrawler / Forge, or quick reads for small repos). Report a short summary (stack, in-scope areas, conventions, verify commands, risks) to the user before planning.
4. Emit visible progress milestones with \`cerebro_progress\` whenever the run enters a new phase or a batch of work starts/completes, and narrate each transition to the user.
5. **Legion** (product-shaped work only): run Legion through \`cerebro_agent_task\` to produce customer vision from the prompt and codebase. Legion writes \`CUSTOMER_VISION_READY\` under \`.cerebro/notepads/customer/\` — no user questions.
6. **Cypher** (\`MODE: autonomous\`): run Cypher through \`cerebro_agent_task\` with the original prompt, intent sub-type, Legion's vision (if produced), and \`MODE: autonomous\`. Cypher produces \`REQUIREMENTS_READY\` directly — using safe defaults and documenting all assumptions. No CLARIFY rounds.
7. **Professor X**: draft the plan from \`REQUIREMENTS_READY\` using \`.cerebro/templates/plan.md\` or \`.cerebro/templates/product-brief.md\`. Each task must include \`Category\`, \`Depends On\`, \`Files\`, and \`Verify\` fields (where \`Category\` is visual-engineering | architecture | explore | research | deep | quick). These fields become machine-scheduled task records — \`Files\` drives parallel-batch conflict avoidance and \`Verify\` commands run verbatim in a shell.
8. **Beast**: gap review. **Emma Frost**: validate if HIGH risk, auth, billing, migration, or data-integrity work.
9. Write approved plan to \`.cerebro/plans/{slug}.md\`, then create task records with \`cerebro_task_create\` — each with \`category\`, \`depends_on\`, \`files\`, and \`verification_commands\` from the plan (and \`effort\` low/high when a task is trivial or hard).
10. **Smart Delegation loop** — announce the delegation plan, then drive the loop, narrating each step: (a) \`cerebro_next_tasks\` for the ready batch with routing; (b) spawn each via \`cerebro_agent_task\` (or \`cerebro_dispatch_batch\` + \`cerebro_collect_batch_results\` for parallel), running visual-engineering chains in order; (c) \`cerebro_verify\` each (the only path to \`verified\`; on FAIL re-spawn with the failure output, ≤2 retries, else \`cerebro_task_update\` → blocked); (d) emit \`cerebro_progress\` and repeat until nothing is ready.
11. **Independent Verification** — call \`cerebro_audit\` (Cyclops). On AUDIT_FAILED, re-queue retriable findings (\`cerebro_task_update\` → pending) and resume the loop; escalate non-retriable findings autonomously where possible. Never skip the audit.
12. **Legion acceptance** (product-shaped work only): run Legion through \`cerebro_agent_task\` for a final customer verdict. A \`CUSTOMER_VERDICT: REJECT\` creates retry tasks and re-enters the loop.
13. Call \`cerebro_verify_pending\`; final-report only when todos are clear or explicitly blocked.

Final report: call \`cerebro_run_report\` for a consolidated task/problem summary, then report assumptions made, files changed, tests/verification, the Cyclops audit verdict, customer verdict (if run), unresolved issues (the report's blocked tasks + open blockers/errors), and \`.cerebro\` run paths.`,
  },
];
