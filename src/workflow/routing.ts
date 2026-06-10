import { AGENT_MODEL_SLOTS } from "../config/models.js";
import type { CerebroModelSlot } from "../config/models.js";
import { TASK_RESULT_CONTRACT } from "../agents/team.js";
import type { TaskRecord } from "./types.js";

const PLAN_EXCERPT_CAP = 6000;
const GOTCHAS_CAP = 4000;
const FAILURE_OUTPUT_CAP = 4000;

export type ChainStage = {
  name: "design" | "structure" | "visual";
  agent: string;
  modelSlot: CerebroModelSlot;
  terminalMarker: string;
};

export type Route =
  | { kind: "single"; agent: string; modelSlot: CerebroModelSlot }
  | { kind: "chain"; stages: ChainStage[] };

export const VISUAL_ENGINEERING_STAGES: ChainStage[] = [
  { name: "design", agent: "jean-grey", modelSlot: "design", terminalMarker: "DESIGN_SPEC_READY" },
  { name: "structure", agent: "wolverine", modelSlot: "workers", terminalMarker: "TASK_RESULT:" },
  { name: "visual", agent: "storm", modelSlot: "workers", terminalMarker: "TASK_RESULT:" },
];

export const CATEGORY_ROUTES: Record<string, Route> = {
  "visual-engineering": { kind: "chain", stages: VISUAL_ENGINEERING_STAGES },
  architecture: { kind: "single", agent: "forge", modelSlot: AGENT_MODEL_SLOTS.forge },
  explore: { kind: "single", agent: "nightcrawler", modelSlot: AGENT_MODEL_SLOTS.nightcrawler },
  research: { kind: "single", agent: "sage", modelSlot: AGENT_MODEL_SLOTS.sage },
  deep: { kind: "single", agent: "wolverine", modelSlot: AGENT_MODEL_SLOTS.wolverine },
  quick: { kind: "single", agent: "wolverine", modelSlot: AGENT_MODEL_SLOTS.wolverine },
};

// Agents the engine may dispatch directly when a task names one as owner.
// Cerebro is the parent session and Cyclops is reserved for the audit wave.
const NON_DISPATCHABLE_OWNERS = new Set(["cerebro", "cyclops"]);

function normalizeOwner(owner: string): string {
  return owner.trim().toLowerCase().replace(/\s+/g, "-");
}

export function resolveRoute(task: TaskRecord): Route {
  const category = task.category?.trim().toLowerCase();
  if (category && CATEGORY_ROUTES[category]) return CATEGORY_ROUTES[category];
  const owner = normalizeOwner(task.owner);
  if (owner in AGENT_MODEL_SLOTS && !NON_DISPATCHABLE_OWNERS.has(owner)) {
    return { kind: "single", agent: owner, modelSlot: AGENT_MODEL_SLOTS[owner as keyof typeof AGENT_MODEL_SLOTS] };
  }
  return { kind: "single", agent: "wolverine", modelSlot: AGENT_MODEL_SLOTS.wolverine };
}

function tail(text: string, cap: number): string {
  return text.length <= cap ? text : `…(truncated)\n${text.slice(-cap)}`;
}

export type WorkerPromptInput = {
  task: TaskRecord;
  runId: string;
  attempt: number;
  planExcerpt?: string;
  gotchas?: string;
  failureOutput?: string;
  stage?: ChainStage;
  stageContext?: { designSpecPath?: string; componentFiles?: string[] };
};

export function buildWorkerPrompt(input: WorkerPromptInput): string {
  const { task, runId, attempt, stage, stageContext } = input;
  const sections: string[] = [];

  sections.push([
    `## Cerebro Task Dispatch`,
    ``,
    `RUN_ID: ${runId}`,
    `TASK_ID: ${task.id}`,
    `SUBJECT: ${task.subject}`,
    ...(task.category ? [`CATEGORY: ${task.category}`] : []),
    `ATTEMPT: ${attempt}`,
  ].join("\n"));

  sections.push(`## Task\n\n${task.description}`);

  if (task.files?.length) {
    sections.push(`## Declared Files\n\nThis task is scoped to these files — stay within them unless the task demands otherwise:\n${task.files.map((file) => `- ${file}`).join("\n")}`);
  }

  if (stage?.name === "structure" && stageContext?.designSpecPath) {
    sections.push(`## Design Spec\n\nJean Grey's design spec: ${stageContext.designSpecPath}\nBuild the component structure, behavior, state, events, and tests to satisfy it. Do not apply visual styling — Storm follows you.`);
  }
  if (stage?.name === "visual") {
    const lines = ["Apply the visual layer on top of Wolverine's structure. Do not make structural or behavioral changes."];
    if (stageContext?.designSpecPath) lines.push(`Apply the design spec at: ${stageContext.designSpecPath}`);
    if (stageContext?.componentFiles?.length) lines.push(`Wolverine's components:\n${stageContext.componentFiles.map((file) => `- ${file}`).join("\n")}`);
    sections.push(`## Visual Handoff\n\n${lines.join("\n")}`);
  }

  if (input.planExcerpt) {
    sections.push(`## Plan Context\n\n${tail(input.planExcerpt, PLAN_EXCERPT_CAP)}`);
  }

  if (input.gotchas) {
    sections.push(`## Gotchas From Earlier Tasks\n\n${tail(input.gotchas, GOTCHAS_CAP)}`);
  }

  if (task.verification_commands?.length) {
    sections.push(`## Verification\n\nThe Cerebro workflow engine will run these commands in a shell after you finish — self-check against them before returning:\n${task.verification_commands.map((command) => `- \`${command}\``).join("\n")}`);
  }

  if (input.failureOutput) {
    sections.push(`## RETRY (attempt ${attempt})\n\nThe previous attempt failed verification. Fix the exact failure below — do not redo unrelated work.\n\n\`\`\`text\n${tail(input.failureOutput, FAILURE_OUTPUT_CAP)}\n\`\`\``);
  }

  if (stage?.name === "design") {
    sections.push(`## Output Contract\n\nWrite the design spec under .cerebro/notepads/design/ and end your reply with \`DESIGN_SPEC_READY\` followed by the spec file path.`);
  } else {
    sections.push(TASK_RESULT_CONTRACT);
  }

  return sections.join("\n\n");
}
