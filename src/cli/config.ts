import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const PACKAGE_NAME = "open-xmen";
const PACKAGE_CACHE_TAG = "latest";
const OPENCODE_INSTRUCTIONS = ["AGENTS.md", ".cerebro/cerebro-identity.md", ".cerebro/opencode/model-routing.md"];

type JsonObject = { [key: string]: JsonValue };
type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;

export type UpdateOpenCodeConfigOptions = {
  dryRun: boolean;
  planned: string[];
  defaultAgent?: string;
  includeRuntimeInstructions?: boolean;
  setCerebroDefaults?: boolean;
};

export function globalOpenCodeConfigDir() {
  if (process.env.OPENCODE_CONFIG_DIR) return path.resolve(process.env.OPENCODE_CONFIG_DIR);
  const configHome = process.env.XDG_CONFIG_HOME || (process.env.HOME ? path.join(process.env.HOME, ".config") : undefined);
  if (!configHome) throw new Error("Cannot resolve OpenCode global config directory: HOME is not set");
  return path.join(configHome, "opencode");
}

export function updateOpencodeConfig(target: string, opts: UpdateOpenCodeConfigOptions) {
  const destination = path.join(target, "opencode.jsonc");
  let parsed: JsonValue = {};
  if (existsSync(destination)) {
    try {
      parsed = parseJsonc(readFileSync(destination, "utf8"));
    } catch (err) {
      throw new Error(`Could not parse ${destination}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const config: JsonObject = isRecord(parsed) ? parsed : {};
  config.$schema ||= "https://opencode.ai/config.json";
  config.plugin = replaceOpenXmenPluginEntries(asArray(config.plugin), getPluginEntry());
  if (opts.defaultAgent) {
    config.default_agent ||= opts.defaultAgent;
  }
  if (opts.includeRuntimeInstructions) {
    config.instructions = appendUnique(asArray(config.instructions), ...OPENCODE_INSTRUCTIONS);
  }
  if (opts.setCerebroDefaults) {
    config.default_agent ??= "cerebro";
    config.share ??= "disabled";
    config.permission ??= { edit: "ask", bash: "ask", webfetch: "ask", task: "ask", question: "allow" };
  }
  const content = `${JSON.stringify(config, null, 2)}\n`;

  if (opts.dryRun) {
    if (existsSync(destination)) opts.planned.push(`atomically update ${destination} (backup ${destination}.bak)`);
    else opts.planned.push(`create ${destination}`);
    return;
  }
  writeAtomicConfig(destination, content);
}

export function warmOpenCodePluginCache(packageRoot: string) {
  if (isLocalDevelopmentCheckout(packageRoot)) {
    console.log("Local development install - cache warm-up not required");
    return;
  }
  const home = process.env.HOME;
  if (!home) return;
  const cacheRoot = process.env.XDG_CACHE_HOME || path.join(home, ".cache");
  const cacheDir = path.join(cacheRoot, "opencode", "packages", `${PACKAGE_NAME}@${PACKAGE_CACHE_TAG}`);
  mkdirSync(cacheDir, { recursive: true });
  if (process.env.OPEN_XMEN_SEED_OPENCODE_CACHE === "1" && seedOpenCodePluginCache(cacheDir, packageRoot)) {
    console.log(`OpenCode plugin cache warmed: ${cacheDir}`);
    return;
  }
  if (installOpenXmenPackageWorkspace(cacheDir, { forceRefresh: true, stdio: "inherit" })) {
    console.log(`OpenCode plugin cache warmed: ${cacheDir}`);
  } else {
    console.warn("open-xmen install: skipped OpenCode plugin cache warm-up; bun install failed");
  }
}

export function installOpenXmenPackageWorkspace(workspaceDir: string, opts: { forceRefresh?: boolean; stdio?: "inherit" | "pipe" } = {}) {
  mkdirSync(workspaceDir, { recursive: true });
  writeFileSync(path.join(workspaceDir, "package.json"), `${JSON.stringify({
    name: `${PACKAGE_NAME}-cache`,
    private: true,
    dependencies: { [PACKAGE_NAME]: PACKAGE_CACHE_TAG },
  }, null, 2)}\n`, "utf8");
  if (opts.forceRefresh) {
    rmSync(path.join(workspaceDir, "bun.lock"), { force: true });
    rmSync(path.join(workspaceDir, "bun.lockb"), { force: true });
    rmSync(path.join(workspaceDir, "node_modules", PACKAGE_NAME), { recursive: true, force: true });
  }
  const bun = spawnSync("bun", ["install", "--ignore-scripts"], { cwd: workspaceDir, encoding: "utf8", stdio: opts.stdio ?? "inherit" });
  return bun.status === 0;
}

export function opencodeConfigHasOpenXmenPlugin(cwd = process.cwd()) {
  const configPath = path.join(cwd, "opencode.jsonc");
  if (!existsSync(configPath)) return false;
  try {
    const config = parseJsonc(readFileSync(configPath, "utf8"));
    return asArray(config.plugin).some((entry) => {
      const spec = Array.isArray(entry) ? entry[0] : entry;
      return typeof spec === "string" && isOpenXmenPluginEntry(spec);
    });
  } catch {
    return false;
  }
}

function writeAtomicConfig(destination: string, content: string) {
  mkdirSync(path.dirname(destination), { recursive: true });
  if (existsSync(destination)) {
    const current = readFileSync(destination, "utf8");
    if (current === content) return;
    copyFileSync(destination, `${destination}.bak`);
  }
  const temp = `${destination}.tmp`;
  writeFileSync(temp, content, "utf8");
  renameSync(temp, destination);
}

function getPluginEntry() {
  const cliEntryPath = process.argv[1];
  if (!cliEntryPath) return PACKAGE_NAME;
  const packageRoot = findPackageRoot(cliEntryPath);
  if (!packageRoot) return PACKAGE_NAME;
  if (isLocalDevelopmentCheckout(packageRoot)) return packageRoot;
  return PACKAGE_NAME;
}

function replaceOpenXmenPluginEntries(items: JsonValue[], pluginEntry: string): JsonValue[] {
  return [...items.filter((entry) => {
    const spec = Array.isArray(entry) ? entry[0] : entry;
    return !(typeof spec === "string" && isOpenXmenPluginEntry(spec));
  }), pluginEntry];
}

function isOpenXmenPluginEntry(entry: string) {
  return entry === PACKAGE_NAME || entry.startsWith(`${PACKAGE_NAME}@`) || entry.endsWith(".opencode/plugins/open-xmen.ts") || isLocalPackageRootEntry(entry);
}

function findPackageRoot(startPath: string) {
  let current = path.dirname(startPath);
  while (true) {
    const packageJsonPath = path.join(current, "package.json");
    if (existsSync(packageJsonPath)) {
      const packageJson = readJsonFile(packageJsonPath);
      if (isRecord(packageJson) && packageJson.name === PACKAGE_NAME) return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function isLocalPackageRootEntry(entry: string) {
  if (!entry || entry.startsWith("file://")) return false;
  const packageJsonPath = path.join(entry, "package.json");
  if (!existsSync(packageJsonPath)) return false;
  const packageJson = readJsonFile(packageJsonPath);
  return isRecord(packageJson) && packageJson.name === PACKAGE_NAME;
}

function isLocalDevelopmentCheckout(packageRoot: string) {
  return existsSync(path.join(packageRoot, ".git"));
}

function seedOpenCodePluginCache(cacheDir: string, packageRoot: string) {
  const sourceNodeModules = path.dirname(packageRoot);
  if (path.basename(sourceNodeModules) !== "node_modules") return false;
  if (!existsSync(path.join(sourceNodeModules, PACKAGE_NAME, "package.json"))) return false;
  try {
    const targetNodeModules = path.join(cacheDir, "node_modules");
    rmSync(targetNodeModules, { recursive: true, force: true });
    cpSync(sourceNodeModules, targetNodeModules, { recursive: true, dereference: true });
    return true;
  } catch (error) {
    console.warn(`open-xmen install: could not seed OpenCode plugin cache from installed package; falling back to bun install (${error instanceof Error ? error.message : String(error)})`);
    return false;
  }
}

function readJsonFile(file: string): JsonValue | undefined {
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as JsonValue;
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonc(text: string) {
  const stripped = removeTrailingCommas(stripJsonComments(text));
  return stripped.trim() ? JSON.parse(stripped) : {};
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

function appendUnique<T>(items: T[], ...values: T[]) {
  const result = [...items];
  for (const value of values) {
    if (!result.includes(value)) result.push(value);
  }
  return result;
}

function asArray(value: unknown): JsonValue[] {
  return Array.isArray(value) ? value.filter(isJsonValue) : [];
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  if (["boolean", "number", "string"].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}
