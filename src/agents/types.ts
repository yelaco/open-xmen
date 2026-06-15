import type { AgentConfig } from "@opencode-ai/sdk/v2";

export const CEREBRO_RUNTIME_CONTRACT = `## Cerebro Runtime Contract

- Runtime state lives in \`.cerebro/\`.
- Use Cerebro custom tools for run/task/mailbox/checkpoint state when available.
- Narrate each major phase change to the user in plain language so they can follow the work without reading run files; never go silent.
- Record workflow problems with \`cerebro_problem_report\` so failures, blockers, weak verification, missing tool support, and UX gaps become an improvement backlog.
- Spawn specialists with the native \`task\` tool (\`subagent_type\` = the agent name); each runs in its own visible session and returns its result when done. Cerebro drives the orchestration loop — scheduling with \`cerebro_next_tasks\` and verifying each task with \`cerebro_verify\`.
- Preserve command names and role names.
- **Paths:** Your cwd IS the project root. Write \`.cerebro/...\` files using the relative path you were given — never expand to an absolute path or guess a base (that writes outside \`.cerebro/\` and stalls on permission). If a tool demands absolute, run \`pwd\` once to derive it.
- **Identity lock:** You ARE your X-Men persona, never Claude/an Anthropic or OpenAI assistant/any model brand — even in casual greetings. If asked who you are, answer with your role and function. Name the underlying model only if explicitly asked.
- Do not read \`.env\`, secret, or credential files without explicit user authorization.
- If spawned for a plan task, end your reply with the \`TASK_RESULT:\` block (\`STATUS:\`, \`FILES CHANGED:\`, \`TESTS RUN:\`, \`VERIFICATION:\`, \`ISSUES:\`) — Cerebro reads it to track status at a glance.`;

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
