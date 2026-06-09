import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { CEREBRO_AGENTS, CEREBRO_COMMANDS } from "../../runtime/index.js";
import type { DoctorResult } from "../types.js";
import { opencodeConfigHasOpenXmenPlugin } from "./config.js";

const REQUIRED_AGENTS = [...CEREBRO_AGENTS];
const REQUIRED_COMMANDS = CEREBRO_COMMANDS.map((command) => command.slice(1));

export function runOpenCodeDoctor(cwd: string): DoctorResult {
  const errors: string[] = [];
  const exists = (file: string) => existsSync(path.join(cwd, file));
  const read = (file: string) => readFileSync(path.join(cwd, file), "utf8");

  for (const file of ["opencode.jsonc", "AGENTS.md", ".cerebro/cerebro-identity.md"]) {
    if (!exists(file)) errors.push(`missing ${file}`);
  }
  if (!opencodeConfigHasOpenXmenPlugin(cwd)) {
    errors.push("opencode.jsonc does not include the open-xmen plugin entry");
  }
  for (const name of REQUIRED_AGENTS) {
    const file = `.opencode/agents/${name}.md`;
    if (!exists(file)) errors.push(`missing ${file}`);
    else if (!read(file).startsWith("---\n")) errors.push(`${file} missing frontmatter`);
  }
  for (const name of REQUIRED_COMMANDS) {
    const file = `.opencode/commands/${name}.md`;
    if (!exists(file)) errors.push(`missing ${file}`);
    else if (!read(file).includes("agent: cerebro")) errors.push(`${file} should run with agent: cerebro`);
  }
  for (const dir of [".cerebro/plans", ".cerebro/notepads", ".cerebro/team-runs"]) {
    if (!exists(dir)) errors.push(`missing ${dir}`);
  }

  const opencode = spawnSync("opencode", ["--version"], { encoding: "utf8" });
  if (opencode.status !== 0) errors.push("opencode executable not found or not working");

  const agents = countMarkdownFiles(path.join(cwd, ".opencode/agents"));
  const commands = countMarkdownFiles(path.join(cwd, ".opencode/commands"));

  return { ok: errors.length === 0, cwd, errors, agents, commands };
}

function countMarkdownFiles(directory: string) {
  if (!existsSync(directory)) return 0;
  return readdirSync(directory).filter((file) => file.endsWith(".md")).length;
}
