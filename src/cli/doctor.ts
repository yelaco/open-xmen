import { existsSync, readFileSync, openSync, closeSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { CEREBRO_AGENTS, CEREBRO_COMMANDS } from "../runtime/index.js";
import { opencodeConfigHasOpenXmenPlugin } from "./config.js";

export type DoctorResult = {
  ok: boolean;
  cwd: string;
  errors: string[];
  agents: number;
  commands: number;
  mode: "plugin";
};

const REQUIRED_AGENTS = [...CEREBRO_AGENTS];
const REQUIRED_COMMANDS = CEREBRO_COMMANDS.map((command) => command.slice(1));

export function runOpenCodeDoctor(cwd: string): DoctorResult {
  const errors: string[] = [];
  const exists = (file: string) => existsSync(path.join(cwd, file));
  const read = (file: string) => readFileSync(path.join(cwd, file), "utf8");
  const resolvedConfig = resolvedOpenCodeConfig(cwd);
  const localHasPlugin = opencodeConfigHasOpenXmenPlugin(cwd);

  if (!resolvedConfig) {
    errors.push("could not read resolved OpenCode config with `opencode debug config`");
  }
  if (exists("opencode.jsonc")) {
    const opencodeConfig = parseJsonc(read("opencode.jsonc"));
    if (!isRecord(opencodeConfig)) {
      errors.push("opencode.jsonc should contain a JSON object");
    } else if (localHasPlugin && opencodeConfig.default_agent !== "cerebro") {
      errors.push("project opencode.jsonc default_agent should be cerebro");
    }
  }

  if (resolvedConfig) {
    const resolvedCommands = isRecord(resolvedConfig.command) ? resolvedConfig.command : {};
    for (const name of REQUIRED_COMMANDS) {
      const command = resolvedCommands[name];
      if (!isRecord(command)) errors.push(`resolved OpenCode config missing command ${name}`);
      else if (command.agent !== "cerebro") errors.push(`resolved command ${name} should run with agent: cerebro`);
    }
    const resolvedAgents = isRecord(resolvedConfig.agent) ? resolvedConfig.agent : {};
    for (const name of REQUIRED_AGENTS) {
      if (!isRecord(resolvedAgents[name])) errors.push(`resolved OpenCode config missing agent ${name}`);
    }
  }

  if (isOpenXmenPackageRoot(cwd) && exists("README.md")) {
    const readme = read("README.md");
    for (const command of CEREBRO_COMMANDS) {
      if (!readme.includes(command)) errors.push(`README.md missing command ${command}`);
    }
    const advertisedCommands = [...readme.matchAll(/`(\/cerebro-[^` ]+)`/g)].map((match) => match[1]);
    for (const advertised of advertisedCommands) {
      if (!CEREBRO_COMMANDS.includes(advertised as (typeof CEREBRO_COMMANDS)[number])) errors.push(`README.md advertises undefined command ${advertised}`);
    }
  }

  const opencode = spawnSync("opencode", ["--version"], { encoding: "utf8" });
  if (opencode.status !== 0) errors.push("opencode executable not found or not working");

  const resolvedAgentCount = resolvedConfig && isRecord(resolvedConfig.agent)
    ? REQUIRED_AGENTS.filter((name) => isRecord(resolvedConfig.agent?.[name])).length
    : 0;
  const resolvedCommandCount = resolvedConfig && isRecord(resolvedConfig.command)
    ? REQUIRED_COMMANDS.filter((name) => isRecord(resolvedConfig.command?.[name])).length
    : 0;

  return { ok: errors.length === 0, cwd, errors, agents: resolvedAgentCount, commands: resolvedCommandCount, mode: "plugin" };
}

function resolvedOpenCodeConfig(cwd: string) {
  // `opencode debug config` truncates its piped stdout (it exits before the pipe finishes
  // draining) once the resolved config grows past ~64KB — which our 13-agent config does —
  // producing invalid JSON. Redirect stdout to a temp file so we always read the full output.
  const tmpFile = path.join(tmpdir(), `open-xmen-doctor-${process.pid}-${Date.now()}.json`);
  let fd: number | undefined;
  try {
    fd = openSync(tmpFile, "w");
    const opencode = spawnSync("opencode", ["debug", "config"], { cwd, stdio: ["ignore", fd, "ignore"] });
    closeSync(fd);
    fd = undefined;
    if (opencode.status !== 0) return undefined;
    const text = readFileSync(tmpFile, "utf8");
    if (!text.trim()) return undefined;
    return parseJsonc(text);
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) { try { closeSync(fd); } catch {} }
    try { rmSync(tmpFile, { force: true }); } catch {}
  }
}

function isOpenXmenPackageRoot(cwd: string) {
  const packageJson = path.join(cwd, "package.json");
  if (!existsSync(packageJson)) return false;
  try {
    const parsed = JSON.parse(readFileSync(packageJson, "utf8"));
    return isRecord(parsed) && parsed.name === "open-xmen";
  } catch {
    return false;
  }
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
