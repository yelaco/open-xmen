import { defaultModelForAgent } from "../config/models.js";

export const CEREBRO_COMMANDS = [
  "/cerebro-ultrawork",
  "/cerebro-plan",
  "/cerebro-start-work",
  "/cerebro-index",
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
    name: "cerebro-index",
    description: "Build or refresh .cerebro/project-context.md with OpenCode Cerebro agents.",
    model: COMMAND_MODEL,
    content: `Create or refresh \`.cerebro/project-context.md\` for this repository.

## Required flow

1. Announce Cerebro indexing mode.
2. Call \`cerebro_model_slots\` and \`cerebro_run_start\` with command \`/cerebro-index\`, the objective, and risk \`LOW\`.
3. Create tasks for:
   - \`nightcrawler\`: map directories, entrypoints, tests, configs, risky files.
   - \`sage\`: identify frameworks, package managers, docs, version gotchas, likely verification commands.
   - \`forge\`: summarize architecture, ownership boundaries, and risky areas.
   - \`beast\`: gap-check the final index for invented facts and weak verification guidance.
4. Use \`cerebro_agent_task\` or OpenCode subagents/mentions for the tasks where available; otherwise do the read-only inspection directly but still record task state.
5. Fill \`.cerebro/templates/project-context.md\` with discovered facts only. Use \`Unknown\` for unknown fields.
6. Write \`.cerebro/project-context.md\`.
7. Record mailbox decisions for conflicting findings, checkpoint the run, verify pending todos, and report the indexed stack, commands, risky areas, manifest path, and cleanup status.

Do not modify source files outside \`.cerebro/project-context.md\` and run metadata.`,
  },
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

## Required flow

1. Announce field execution mode.
2. Read the newest \`.cerebro/plans/*.md\`, \`.cerebro/project-context.md\` if present, \`.cerebro/boulder.json\` if present, and relevant \`.cerebro/notepads/\`.
3. Call \`cerebro_model_slots\` and \`cerebro_run_start\` with command \`/cerebro-start-work\`, objective from the plan, and the plan risk.
4. Emit a \`cerebro_progress\` milestone when execution starts and whenever work is blocked, resumed, audited, or completed. The engine emits its own per-task progress while running.
5. Create one task record per plan task with \`cerebro_task_create\`. Each call must include \`category\` (visual-engineering | architecture | explore | research | deep | quick), \`depends_on\` (task ids), \`files\` from the task's \`Files\` field, and \`verification_commands\` from the task's \`Verify\` field. Task descriptions must carry the task's \`What\` and \`TDD\` text so workers receive full context.
6. **Run the workflow engine**: call \`cerebro_execute_workflow\` with the run_id and \`plan_path\`. The engine — not an agent — owns everything from here: dependency-frontier scheduling, category routing (visual-engineering→Jean Grey→Wolverine→Storm, architecture→Forge, explore→Nightcrawler, research→Sage, deep/quick/default→Wolverine), parallel batch dispatch, result collection, deterministic shell verification, retries (max 2 per task), and a final Cyclops audit wave. Do NOT dispatch workers or Cyclops yourself, and do NOT route tasks manually if the engine reports a failure.
7. Interpret the engine's structured result:
   - \`status: complete\` with \`AUDIT_PASSED\` — proceed to acceptance and reporting.
   - \`status: complete\` or \`blocked\` with \`AUDIT_FAILED\` — surface the findings; the engine already re-queued retriable findings once, so escalate the remaining findings to the user or fix the plan, set affected tasks back to \`pending\` with \`cerebro_task_update\`, and call \`cerebro_execute_workflow\` again.
   - \`status: blocked\` — surface the blocked task and reason from \`blocked_tasks\`; unblock (answer the blocker, adjust the plan, or get user input), set the task back to \`pending\`, and call \`cerebro_execute_workflow\` again — the engine skips tasks that are already done and verified.
   - \`status: timeout\` or \`aborted\` — re-invoke \`cerebro_execute_workflow\` with the same run_id to resume from the ledger.
8. Record decisions and blockers with \`cerebro_mailbox_send\`. The engine maintains task state itself — use \`cerebro_task_update\` only for manual corrections such as re-queueing a blocked task.
9. Update \`.cerebro/boulder.json\` with status, approvals, verification history, and decisions.
10. **Legion acceptance** (product-shaped plans only): if the plan includes user-facing acceptance criteria or was derived from Legion/Cypher notepads, run Legion through \`cerebro_agent_task\` for a final customer acceptance verdict. A \`CUSTOMER_VERDICT: REJECT\` creates retry tasks via \`cerebro_task_create\` and re-runs \`cerebro_execute_workflow\` before the run completes.
11. Call \`cerebro_verify_pending\`; do not final-report while pending todos remain.
12. Final report: plan path, files changed, tests run, verification evidence, audit verdict and findings, Legion verdict (if run), unresolved issues, workflow problem list path, rollback notes, and checkpoint paths.`,
  },
  {
    name: "cerebro-ultrawork",
    description: "Fully autonomous Cerebro full-team mode. One prompt in, complete result out — no user interaction after trigger.",
    model: COMMAND_MODEL,
    content: `Assemble the full Cerebro team for autonomous execution of: $ARGUMENTS

## Autonomous standard

The user has given one prompt and expects a complete result with no further questions. Every ambiguity is resolved by codebase inspection or documented as an assumption. Do not ask the user anything. If HIGH risk, pause only for explicit confirmation on destructive/production/credentialed/billing/legal/git-history actions — nothing else.

## Required flow

1. Open with the exact catchphrase on its own line — **"To me, my X-Men!"** — then state the detected intent sub-type (\`refactoring\` | \`build-from-scratch\` | \`mid-sized-task\` | \`architecture\` | \`bug-fix\`) in one short line.
2. Call \`cerebro_model_slots\` and \`cerebro_run_start\` with command \`/cerebro-ultrawork\` and classified risk.
3. Emit visible progress milestones with \`cerebro_progress\` whenever the run enters a new phase or a batch of work starts/completes.
4. **Legion** (product-shaped work only): run Legion through \`cerebro_agent_task\` to produce customer vision from the prompt and codebase. Legion writes \`CUSTOMER_VISION_READY\` under \`.cerebro/notepads/customer/\` — no user questions.
5. **Cypher** (\`MODE: autonomous\`): run Cypher through \`cerebro_agent_task\` with the original prompt, intent sub-type, Legion's vision (if produced), and \`MODE: autonomous\`. Cypher produces \`REQUIREMENTS_READY\` directly — using safe defaults and documenting all assumptions. No CLARIFY rounds.
6. **Professor X**: draft the plan from \`REQUIREMENTS_READY\` using \`.cerebro/templates/plan.md\` or \`.cerebro/templates/product-brief.md\`. Each task must include \`Category\`, \`Depends On\`, \`Files\`, and \`Verify\` fields (where \`Category\` is visual-engineering | architecture | explore | research | deep | quick). These fields become machine-scheduled task records consumed by the workflow engine — \`Files\` drives parallel-batch conflict avoidance and \`Verify\` commands run verbatim in a shell.
7. **Beast**: gap review. **Emma Frost**: validate if HIGH risk, auth, billing, migration, or data-integrity work.
8. Write approved plan to \`.cerebro/plans/{slug}.md\`.
9. Create task records with \`cerebro_task_create\` — each with \`category\`, \`depends_on\`, \`files\`, and \`verification_commands\` from the plan — then **run the workflow engine**: call \`cerebro_execute_workflow\` with the run_id and \`plan_path\`. The deterministic engine schedules dependency frontiers, routes by category, fans out independent tasks in parallel, runs every task's \`Verify\` commands in a shell, retries failures (max 2 per task), and finishes with a Cyclops audit wave that rules AUDIT_PASSED or AUDIT_FAILED. **Never dispatch workers or Cyclops yourself; never bypass the engine.**
10. On \`status: blocked\`, \`timeout\`, or non-retriable AUDIT_FAILED findings: resolve autonomously when possible (fix the plan, re-queue tasks with \`cerebro_task_update\`, create corrective tasks, re-run \`cerebro_execute_workflow\`); escalate to the user only if truly unresolvable.
11. **Legion acceptance** (product-shaped work only): run Legion through \`cerebro_agent_task\` for a final customer verdict. A \`CUSTOMER_VERDICT: REJECT\` creates retry tasks and re-runs \`cerebro_execute_workflow\`.
12. Call \`cerebro_verify_pending\`; final-report only when todos are clear or explicitly blocked.

Final report: assumptions made, files changed, tests/verification, audit verdict, customer verdict (if run), unresolved issues, workflow problem list path, \`.cerebro\` run paths.`,
  },
];

/** Generate the OpenCode markdown for a command definition. */
export function toOpenCodeCommandMarkdown(cmd: CommandDefinition): string {
  return `---\ndescription: ${cmd.description}\nagent: cerebro\nmodel: ${cmd.model}\n---\n${cmd.content}`;
}
