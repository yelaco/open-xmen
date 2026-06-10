import type { AgentConfig } from "@opencode-ai/sdk/v2";

export const CEREBRO_RUNTIME_CONTRACT = `## Cerebro Runtime Contract

- Runtime state lives in \`.cerebro/\`.
- Use Cerebro custom tools for run/task/mailbox/checkpoint state when available.
- Emit visible progress milestones with \`cerebro_progress\` at major phase changes so the user can track work without reading mailbox files. Blocking collect tools also update their visible status while polling.
- Record workflow problems with \`cerebro_problem_report\` so failures, blockers, weak verification, missing tool support, and UX gaps become an improvement backlog.
- When dispatching one required result, use \`cerebro_agent_task\`; when dispatching independent parallel work, use \`cerebro_dispatch_batch\` or repeated \`cerebro_dispatch_agent\`, then collect with \`cerebro_collect_batch_results\` or \`cerebro_collect_result(poll: true)\`.
- Preserve command names and role names.
- Do not read \`.env\`, secret, or credential files without explicit user authorization.
- If Cyclops assigns you a plan execution task, report with \`TASK_RESULT:\` including \`STATUS:\`, \`FILES CHANGED:\`, \`TESTS RUN:\`, \`VERIFICATION:\`, and \`ISSUES:\`.`;

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
