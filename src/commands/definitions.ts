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
    description: "Interactive planning mode — Cypher interviews the user, Professor X drafts, Beast and Emma Frost review.",
    model: COMMAND_MODEL,
    content: `Plan this work: $ARGUMENTS

## Required flow

1. Announce strategic planning mode.
2. Call \`cerebro_model_slots\` and \`cerebro_run_start\` with command \`/cerebro-plan\` and initial risk classification.
3. **Classify intent sub-type**: \`refactoring\` | \`build-from-scratch\` | \`mid-sized-task\` | \`architecture\` | \`bug-fix\`. Announce it in one line.
4. Gather codebase context: use Nightcrawler for structure and Sage for relevant docs before the interview begins.
5. **Legion** (product-shaped or user-facing work only): dispatch Legion to produce customer vision. Pass Legion's \`CUSTOMER_VISION_READY\` to Cypher as context.
6. **Cypher** (\`MODE: interactive\`): dispatch Cypher with the request, intent sub-type, Legion's vision (if produced), and \`MODE: interactive\`. Run the interview loop:
   - Cypher returns \`CLARIFY\` with a prioritized question list.
   - Present the questions to the user in a clean numbered list (in Cerebro's voice — do not expose Cypher's raw block).
   - Collect answers and pass back to Cypher.
   - Repeat until Cypher returns \`REQUIREMENTS_READY\` (max 3 rounds).
7. **Professor X**: draft the plan from \`REQUIREMENTS_READY\` using \`.cerebro/templates/plan.md\` or \`.cerebro/templates/product-brief.md\`. Each task must include a \`Category\` field (visual-engineering | architecture | explore | research | deep | quick).
8. **Beast**: gap review. **Emma Frost**: validate if HIGH risk, public API, auth, data, billing, or migration work.
9. Iterate on the plan until all review blockers are resolved.
10. Write the approved plan to \`.cerebro/plans/{slug}.md\`.
11. Checkpoint and report: plan path, risk, approval gates, acceptance criteria, and verification commands.

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
    description: "Fully autonomous Cerebro full-team mode. One prompt in, complete result out — no user interaction after trigger.",
    model: COMMAND_MODEL,
    content: `Assemble the full Cerebro team for autonomous execution of: $ARGUMENTS

## Autonomous standard

The user has given one prompt and expects a complete result with no further questions. Every ambiguity is resolved by codebase inspection or documented as an assumption. Do not ask the user anything. If HIGH risk, pause only for explicit confirmation on destructive/production/credentialed/billing/legal/git-history actions — nothing else.

## Required flow

1. Announce maximum Cerebro power and the detected intent sub-type (\`refactoring\` | \`build-from-scratch\` | \`mid-sized-task\` | \`architecture\` | \`bug-fix\`).
2. Call \`cerebro_model_slots\` and \`cerebro_run_start\` with command \`/to-me-my-x-men\` and classified risk.
3. **Legion** (product-shaped work only): dispatch Legion to produce customer vision from the prompt and codebase. Legion writes \`CUSTOMER_VISION_READY\` under \`.cerebro/notepads/customer/\` — no user questions.
4. **Cypher** (\`MODE: autonomous\`): dispatch Cypher with the original prompt, intent sub-type, Legion's vision (if produced), and \`MODE: autonomous\`. Cypher produces \`REQUIREMENTS_READY\` directly — using safe defaults and documenting all assumptions. No CLARIFY rounds.
5. **Professor X**: draft the plan from \`REQUIREMENTS_READY\` using \`.cerebro/templates/plan.md\` or \`.cerebro/templates/product-brief.md\`. Each task must include a \`Category\` field (visual-engineering | architecture | explore | research | deep | quick).
6. **Beast**: gap review. **Emma Frost**: validate if HIGH risk, auth, billing, migration, or data-integrity work.
7. Write approved plan to \`.cerebro/plans/{slug}.md\`.
8. Create task records and **dispatch Cyclops as execution conductor**: hand off the full task list, run_id, and plan. Cyclops routes by category, manages worker sequencing, tracks wisdom, verifies results, and returns EXECUTION_COMPLETE or EXECUTION_BLOCKED.
9. On EXECUTION_BLOCKED: resolve autonomously if possible; escalate to user only if truly unresolvable.
10. **Legion acceptance** (product-shaped work only): dispatch Legion for a final customer verdict. A \`CUSTOMER_VERDICT: REJECT\` creates retry tasks and re-dispatches Cyclops.
11. Call \`cerebro_verify_pending\`; final-report only when todos are clear or explicitly blocked.

Final report: assumptions made, files changed, tests/verification, customer verdict (if run), unresolved issues, \`.cerebro\` run paths.`,
  },
];

/** Generate the OpenCode markdown for a command definition. */
export function toOpenCodeCommandMarkdown(cmd: CommandDefinition): string {
  return `---\ndescription: ${cmd.description}\nagent: cerebro\nmodel: ${cmd.model}\n---\n${cmd.content}`;
}
