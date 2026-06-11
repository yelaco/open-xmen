import type { AgentConfig } from "@opencode-ai/sdk/v2";

export const CEREBRO_RUNTIME_CONTRACT = `## Cerebro Runtime Contract

- Runtime state lives in \`.cerebro/\`.
- Use Cerebro custom tools for run/task/mailbox/checkpoint state when available.
- Emit visible progress milestones with \`cerebro_progress\` at major phase changes so the user can track work without reading mailbox files.
- Record workflow problems with \`cerebro_problem_report\` so failures, blockers, weak verification, missing tool support, and UX gaps become an improvement backlog.
- Spawn specialists with the native \`task\` tool (\`subagent_type\` = the agent name); each runs in its own visible session and returns its result when done. Cerebro drives the orchestration loop — scheduling with \`cerebro_next_tasks\` and verifying each task with \`cerebro_verify\`.
- Preserve command names and role names.
- Do not read \`.env\`, secret, or credential files without explicit user authorization.
- If Cerebro spawns you for a plan task, end your reply with a \`TASK_RESULT:\` block including \`STATUS:\`, \`FILES CHANGED:\`, \`TESTS RUN:\`, \`VERIFICATION:\`, and \`ISSUES:\` — Cerebro reads it to track status, files, and verification at a glance.`;

export type OpenCodePermissionLevel = "ask" | "allow" | "deny";

export type OpenCodeThinkingVariant = "none" | "low" | "medium" | "high" | "xhigh";

export interface OpenCodeMeta {
  mode?: "primary" | "subagent";
  steps?: number;
  variant?: OpenCodeThinkingVariant;
  permission?: {
    edit?: OpenCodePermissionLevel;
    bash?: OpenCodePermissionLevel;
    webfetch?: OpenCodePermissionLevel;
    task?: OpenCodePermissionLevel;
    question?: OpenCodePermissionLevel;
    external_directory?: OpenCodePermissionLevel;
    websearch?: OpenCodePermissionLevel;
    todowrite?: OpenCodePermissionLevel;
    skill?: OpenCodePermissionLevel;
  };
}

export interface AgentDefinition {
  name: string;
  displayName?: string;
  description?: string;
  config: AgentConfig;
  /** OpenCode-specific frontmatter metadata for markdown generation. */
  opencode?: OpenCodeMeta;
  /** Priority-ordered model entries for runtime fallback resolution. */
  _modelArray?: Array<{ id: string; variant?: string }>;
}

/**
 * Resolve agent prompt from base/custom/append inputs.
 * If customPrompt is provided, it replaces the base entirely.
 * Otherwise, customAppendPrompt is appended to the base.
 */
export function resolvePrompt(base: string, customPrompt?: string, customAppendPrompt?: string): string {
  if (customPrompt) return customPrompt;
  if (customAppendPrompt) return `${base}\n\n${customAppendPrompt}`;
  return base;
}
