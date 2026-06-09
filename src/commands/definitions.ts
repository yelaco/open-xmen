export const CEREBRO_COMMANDS = [
  "/to-me-my-x-men",
  "/cerebro-plan",
  "/cerebro-start-work",
  "/cerebro-index",
  "/cerebro-doctor",
] as const;

export type CerebroCommand = (typeof CEREBRO_COMMANDS)[number];

export interface CommandDefinition {
  name: string;
  description: string;
  model: string;
  content: string;
}

const COMMAND_MODEL = "openai/gpt-5.5";

export const CEREBRO_COMMAND_DEFINITIONS: CommandDefinition[] = [
  {
    name: "cerebro-doctor",
    description: "Validate Cerebro OpenCode runtime health.",
    model: COMMAND_MODEL,
    content: `Validate the Cerebro OpenCode workflow. Do not modify source files except temporary runtime files needed for safe checks.

Check and report PASS/FAIL for:

1. \`opencode.jsonc\` exists and loads the \`open-xmen\` plugin package or local \`.opencode/plugins/open-xmen.ts\` development bridge.
2. \`.opencode/agents/\` contains all Cerebro role agents.
3. \`.opencode/commands/\` contains preserved command names.
4. \`.cerebro/cerebro-identity.md\`, schemas, templates, plans, notepads, and team-runs exist.
5. \`cerebro_model_slots\` returns only available configured models.
6. \`cerebro_verify_pending\` correctly reports clear or blocked pending todos.
7. Type/package validation if available: \`npm run build\`.
8. Existing schema validators if available: \`.cerebro/scripts/validate-boulder.py\`, \`.cerebro/scripts/validate-team-runs.py\`.

Summarize exact failures and suggested fixes.`,
  },
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
4. Use OpenCode subagents/mentions for the tasks where available; otherwise do the read-only inspection directly but still record task state.
5. Fill \`.cerebro/templates/project-context.md\` with discovered facts only. Use \`Unknown\` for unknown fields.
6. Write \`.cerebro/project-context.md\`.
7. Record mailbox decisions for conflicting findings, checkpoint the run, verify pending todos, and report the indexed stack, commands, risky areas, manifest path, and cleanup status.

Do not modify source files outside \`.cerebro/project-context.md\` and run metadata.`,
  },
  {
    name: "cerebro-plan",
    description: "Planning mode with Professor X, Beast, and optional Legion/Cypher consultation.",
    model: COMMAND_MODEL,
    content: `Plan this work: $ARGUMENTS

## Required flow

1. Announce strategic planning mode.
2. If the objective is ambiguous and cannot be safely inferred from repository inspection, ask one focused question before drafting. Otherwise proceed.
3. Call \`cerebro_model_slots\` and \`cerebro_run_start\` with command \`/cerebro-plan\`, the objective, and risk classification \`LOW\`, \`MEDIUM\`, or \`HIGH\`.
4. Gather context first: use Nightcrawler for codebase search and Sage for current docs only when needed.
5. **Optional — product-shaped or vague work only**: use Legion for customer vision and Cypher for requirements under \`.cerebro/notepads/\`. Skip for clearly technical tasks where requirements are already concrete.
6. Use Professor X to draft the plan from \`.cerebro/templates/plan.md\` or \`.cerebro/templates/product-brief.md\`. Each task in the plan must include a \`Category\` field (visual-engineering | architecture | explore | research | deep | quick).
7. Use Beast for gap review. Use Emma Frost for HIGH risk, public API, auth, data, billing, migration, or high-accuracy plans.
8. Iterate until review blockers are addressed.
9. Write the final approved plan to \`.cerebro/plans/{slug}.md\`.
10. Checkpoint and report the plan path, risk, approval gates, acceptance criteria, and verification commands.

Do not implement the plan in this command.`,
  },
  {
    name: "cerebro-start-work",
    description: "Execute or resume the latest Cerebro plan via Cyclops.",
    model: COMMAND_MODEL,
    content: `Execute or resume the latest Cerebro plan.

## Required flow

1. Announce field execution mode.
2. Read the newest \`.cerebro/plans/*.md\`, \`.cerebro/project-context.md\` if present, \`.cerebro/boulder.json\` if present, and relevant \`.cerebro/notepads/\`.
3. Call \`cerebro_model_slots\` and \`cerebro_run_start\` with command \`/cerebro-start-work\`, objective from the plan, and the plan risk.
4. Create task records for each task in the plan. Each task must have a \`category\` field (visual-engineering | architecture | explore | research | deep | quick).
5. **Dispatch Cyclops as execution conductor**: hand off the full task list, run_id, and plan context. Cyclops owns all worker routing, sequencing, todo tracking, wisdom accumulation, and result verification from this point.
   - Cyclops routes by category: visual-engineering→Jean Grey→Wolverine→Storm, architecture→Forge, explore→Nightcrawler, research→Sage, deep/quick/default→Wolverine.
   - Cyclops handles retries (max 2 per task) and returns EXECUTION_COMPLETE or EXECUTION_BLOCKED.
6. On EXECUTION_BLOCKED: unblock or escalate; re-dispatch Cyclops to resume from the blocked task.
7. Record decisions and blockers with \`cerebro_mailbox_send\`; update task state with \`cerebro_task_update\`.
8. Update \`.cerebro/boulder.json\` with status, approvals, verification history, and decisions.
9. **Legion acceptance** (product-shaped plans only): if the plan includes user-facing acceptance criteria or was derived from Legion/Cypher notepads, dispatch Legion for a final customer acceptance verdict. A \`CUSTOMER_VERDICT: REJECT\` creates retry tasks and re-dispatches Cyclops before the run completes.
10. Call \`cerebro_verify_pending\`; do not final-report while pending todos remain.
11. Final report: plan path, files changed, tests run, verification evidence, Legion verdict (if run), unresolved issues, rollback notes, and checkpoint paths.`,
  },
  {
    name: "to-me-my-x-men",
    description: "Autonomous Cerebro full-team mode for best-effort execution.",
    model: COMMAND_MODEL,
    content: `Assemble the full Cerebro team for autonomous execution of: $ARGUMENTS

## Best-effort standard

The user expects the best the team can produce, not the minimum viable version. Prefer excellent architecture, complete UX states, strong verification, and polished results. Fast is good; generic and under-verified is failure.

## Required flow

1. Announce maximum Cerebro power.
2. Classify mission shape and risk. If HIGH risk, ask for explicit confirmation before destructive/production/credentialed/data/billing/legal/git-history actions.
3. Call \`cerebro_model_slots\` and \`cerebro_run_start\` with command \`/to-me-my-x-men\`.
4. **Requirements gathering (product-shaped work only)**: For product or feature missions where intent is vague or user-facing, consult Legion (customer vision) and Cypher (requirements). For clearly technical or scoped tasks, skip directly to planning. Ask one focused confirmation question for non-inferable blockers only — do not stack questions.
5. Promote requirements into a Professor X plan (from \`.cerebro/templates/plan.md\` or \`.cerebro/templates/product-brief.md\`), reviewed by Beast and validated by Emma Frost when risk/complexity warrants. Each task must include a \`Category\` field (visual-engineering | architecture | explore | research | deep | quick).
6. Create task records and **dispatch Cyclops as execution conductor**: hand off the full task list and plan context. Cyclops routes by category, manages worker sequencing, verifies results, and returns EXECUTION_COMPLETE or EXECUTION_BLOCKED.
7. On EXECUTION_BLOCKED: unblock or escalate; re-dispatch Cyclops to resume.
8. Maintain task-scoped todos and record mailbox decisions/checkpoints.
9. Run final Legion acceptance if mission is product-shaped. A Legion reject creates retry tasks before completion.
10. Call \`cerebro_verify_pending\`; final-report only when todos are clear or explicitly blocked.

Final report must include assumptions, files changed, tests/verification, customer acceptance verdict (if applicable), unresolved issues, and \`.cerebro\` run paths.`,
  },
];

/** Generate the OpenCode markdown for a command definition. */
export function toOpenCodeCommandMarkdown(cmd: CommandDefinition): string {
  return `---\ndescription: ${cmd.description}\nagent: cerebro\nmodel: ${cmd.model}\n---\n${cmd.content}`;
}
