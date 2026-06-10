import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { CEREBRO_AGENTS, CEREBRO_COMMANDS } from "../runtime/index.js";
import { opencodeConfigHasOpenXmenPlugin } from "./config.js";
import { CEREBRO_MODEL_SLOT_KEYS, DEFAULT_MODEL_SLOTS, MODEL_SLOT_ENV } from "../config/models.js";

export type DoctorResult = {
  ok: boolean;
  cwd: string;
  errors: string[];
  agents: number;
  commands: number;
};

const REQUIRED_AGENTS = [...CEREBRO_AGENTS];
const REQUIRED_COMMANDS = CEREBRO_COMMANDS.map((command) => command.slice(1));
const REQUIRED_RUNTIME_FILES = [
  "opencode.jsonc",
  "AGENTS.md",
  ".cerebro/cerebro-identity.md",
  ".cerebro/opencode/model-routing.md",
  ".cerebro/schemas/boulder.schema.json",
  ".cerebro/schemas/team-run.schema.json",
  ".cerebro/templates/plan.md",
  ".cerebro/templates/project-context.md",
];
const REQUIRED_RUNTIME_DIRS = [".cerebro/plans", ".cerebro/notepads", ".cerebro/team-runs", ".cerebro/pending-todos"];
const REQUIRED_AGENT_FRONTMATTER = ["description", "mode", "model", "permission"];

export function runOpenCodeDoctor(cwd: string): DoctorResult {
  const errors: string[] = [];
  const exists = (file: string) => existsSync(path.join(cwd, file));
  const read = (file: string) => readFileSync(path.join(cwd, file), "utf8");

  for (const file of REQUIRED_RUNTIME_FILES) {
    if (!exists(file)) errors.push(`missing ${file}`);
  }
  if (!opencodeConfigHasOpenXmenPlugin(cwd)) {
    errors.push("opencode.jsonc does not include the open-xmen plugin entry");
  }
  if (exists("opencode.jsonc")) {
    const opencodeConfig = parseJsonc(read("opencode.jsonc"));
    if (!isRecord(opencodeConfig)) {
      errors.push("opencode.jsonc should contain a JSON object");
    } else {
      const instructions = Array.isArray(opencodeConfig.instructions) ? opencodeConfig.instructions : [];
      for (const instruction of ["AGENTS.md", ".cerebro/cerebro-identity.md", ".cerebro/opencode/model-routing.md"]) {
        if (!instructions.includes(instruction)) errors.push(`opencode.jsonc instructions missing ${instruction}`);
      }
      if (opencodeConfig.default_agent !== "cerebro") errors.push("opencode.jsonc default_agent should be cerebro");
    }
  }
  const modelRouting = exists(".cerebro/opencode/model-routing.md") ? read(".cerebro/opencode/model-routing.md") : "";
  for (const slot of CEREBRO_MODEL_SLOT_KEYS) {
    if (!modelRouting.includes(`\`${slot}\``)) errors.push(`model routing missing slot ${slot}`);
    if (!modelRouting.includes(DEFAULT_MODEL_SLOTS[slot])) errors.push(`model routing missing default model ${DEFAULT_MODEL_SLOTS[slot]} for ${slot}`);
    if (!modelRouting.includes(MODEL_SLOT_ENV[slot])) errors.push(`model routing missing env override ${MODEL_SLOT_ENV[slot]}`);
  }
  for (const name of REQUIRED_AGENTS) {
    const file = `.opencode/agents/${name}.md`;
    if (!exists(file)) errors.push(`missing ${file}`);
    else {
      const text = read(file);
      const frontmatter = parseFrontmatter(text);
      if (!frontmatter) {
        errors.push(`${file} missing frontmatter`);
      } else {
        for (const key of REQUIRED_AGENT_FRONTMATTER) {
          if (!frontmatter.has(key)) errors.push(`${file} missing frontmatter key ${key}`);
        }
        const mode = frontmatter.get("mode");
        if (name === "cerebro" && mode !== "primary") errors.push(`${file} should use mode: primary`);
        if (name !== "cerebro" && mode !== "subagent") errors.push(`${file} should use mode: subagent`);
        const model = frontmatter.get("model");
        if (model && modelRouting && !modelRouting.includes(model)) errors.push(`${file} model ${model} not documented in model routing`);
        if (!text.includes("model_fallbacks:")) errors.push(`${file} missing model_fallbacks`);
      }
    }
  }
  for (const name of REQUIRED_COMMANDS) {
    const file = `.opencode/commands/${name}.md`;
    if (!exists(file)) errors.push(`missing ${file}`);
    else if (!read(file).includes("agent: cerebro")) errors.push(`${file} should run with agent: cerebro`);
  }
  if (exists("README.md")) {
    const readme = read("README.md");
    for (const command of CEREBRO_COMMANDS) {
      if (!readme.includes(command)) errors.push(`README.md missing command ${command}`);
    }
    const advertisedCommands = [...readme.matchAll(/`(\/cerebro-[^` ]+|\/to-me-my-x-men)`/g)].map((match) => match[1]);
    for (const advertised of advertisedCommands) {
      if (!CEREBRO_COMMANDS.includes(advertised as (typeof CEREBRO_COMMANDS)[number])) errors.push(`README.md advertises undefined command ${advertised}`);
    }
  }

  for (const dir of REQUIRED_RUNTIME_DIRS) {
    if (!exists(dir)) errors.push(`missing ${dir}`);
  }

  const opencode = spawnSync("opencode", ["--version"], { encoding: "utf8" });
  if (opencode.status !== 0) errors.push("opencode executable not found or not working");

  const agents = countMarkdownFiles(path.join(cwd, ".opencode/agents"));
  const commands = countMarkdownFiles(path.join(cwd, ".opencode/commands"));

  return { ok: errors.length === 0, cwd, errors, agents, commands };
}

function parseFrontmatter(text: string) {
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return null;
  const values = new Map<string, string>();
  for (const line of text.slice(4, end).split("\n")) {
    if (!line || line.startsWith(" ")) continue;
    const index = line.indexOf(":");
    if (index === -1) continue;
    values.set(line.slice(0, index).trim(), line.slice(index + 1).trim());
  }
  return values;
}

function countMarkdownFiles(directory: string) {
  if (!existsSync(directory)) return 0;
  return readdirSync(directory).filter((file) => file.endsWith(".md")).length;
}

function parseJsonc(text: string) {
  try {
    return JSON.parse(removeTrailingCommas(stripJsonComments(text)));
  } catch {
    return undefined;
  }
}

function stripJsonComments(text: string) {
  let out = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      out += ch;
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
      continue;
    }
    out += ch;
  }
  return out;
}

function removeTrailingCommas(text: string) {
  let out = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ",") {
      let j = i + 1;
      while (/\s/.test(text[j] || "")) j++;
      if (text[j] === "}" || text[j] === "]") continue;
    }
    out += ch;
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
