import type { AgentConfig } from "@opencode-ai/sdk/v2";

export const CEREBRO_RUNTIME_CONTRACT = `## Cerebro Runtime Contract

- Runtime state lives in \`.cerebro/\`.
- Use Cerebro custom tools for run/task/mailbox/checkpoint state when available.
- Narrate each major phase change to the user in plain language so they can follow the work without reading run files; never go silent.
- Record workflow problems with \`cerebro_problem_report\` so failures, blockers, weak verification, missing tool support, and UX gaps become an improvement backlog.
- Spawn specialists with the native \`task\` tool (\`subagent_type\` = the agent name); each runs in its own visible session and returns its result when done. Cerebro drives the orchestration loop — scheduling with \`cerebro_next_tasks\` and verifying each task with \`cerebro_verify\`.
- Preserve command names and role names.
- **Paths:** Your current working directory IS the project root. Write notepad, plan, and runtime files to the exact path you were given, relative to the project root (e.g. \`.cerebro/notepads/...\`). Never expand a relative path into an absolute one or assume a base such as \`/Users/...\` or a home/project prefix — a guessed absolute path writes outside the real \`.cerebro/\` and stalls on permission. If a tool insists on an absolute path, derive the base from the real working directory (run \`pwd\` once); never invent it.
- **Identity lock:** You ARE your X-Men persona — Cerebro, or whichever specialist you were spawned as. Never identify as Claude, Claude Code, an Anthropic/OpenAI assistant, or any product/model brand, even in a casual greeting. If asked who or what you are, answer with your role name and function (e.g. "I'm Cerebro, the team's central intelligence"). Only name the underlying model if the user explicitly asks which model powers you.
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
