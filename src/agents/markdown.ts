import type { AgentDefinition } from "./types.js";

function needsYamlQuote(value: string): boolean {
  return /[:\n#"'|>&*!%@`]/.test(value) || value.startsWith(" ") || value.endsWith(" ");
}

/**
 * Convert an AgentDefinition into an OpenCode agent markdown file
 * (YAML frontmatter + prompt body).
 */
export function toOpenCodeMarkdown(definition: AgentDefinition): string {
  const { config, description, opencode } = definition;
  const meta = opencode ?? {};

  const lines: string[] = ["---"];
  if (description) lines.push(`description: ${needsYamlQuote(description) ? JSON.stringify(description) : description}`);
  if (meta.mode) lines.push(`mode: ${meta.mode}`);
  if (config.model) lines.push(`model: ${config.model}`);
  if (meta.variant) lines.push(`variant: ${meta.variant}`);
  if (config.temperature !== undefined) lines.push(`temperature: ${config.temperature}`);
  if (meta.steps !== undefined) lines.push(`steps: ${meta.steps}`);
  if (meta.permission) {
    lines.push("permission:");
    for (const [key, value] of Object.entries(meta.permission)) {
      lines.push(`  ${key}: ${value}`);
    }
  }
  if (definition._modelArray && definition._modelArray.length > 1) {
    lines.push("options:");
    lines.push("  model_fallbacks:");
    for (const { id } of definition._modelArray.slice(1)) {
      lines.push(`    - ${id}`);
    }
  }
  lines.push("---");

  return `${lines.join("\n")}\n${config.prompt ?? ""}`;
}
