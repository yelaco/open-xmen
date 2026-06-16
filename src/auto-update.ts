import type { PluginInput } from "@opencode-ai/plugin";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { globalOpenCodeConfigDir, installOpenXmenPackageWorkspace } from "./cli/config.js";
import { refreshSkillsIfStale } from "./cli/runtime.js";
import { tryParseJsonc } from "./cli/jsonc.js";

const PACKAGE_NAME = "open-xmen";
const NPM_DIST_TAGS_URL = `https://registry.npmjs.org/-/package/${PACKAGE_NAME}/dist-tags`;
const FETCH_TIMEOUT_MS = 5_000;
const EXACT_SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type AutoUpdateResult =
  | { status: "updated"; currentVersion: string; latestVersion: string; workspace: string }
  | { status: "skipped"; reason: string; currentVersion?: string; latestVersion?: string }
  | { status: "failed"; reason: string; currentVersion?: string; latestVersion?: string; workspace?: string };

export function shouldRunAutoUpdateForEvent(event: { type?: string; properties?: unknown }) {
  if (event.type !== "session.created") return false;
  if (process.env.OPENCODE_CLI_RUN_MODE === "true") return false;
  if (parentSessionId(event.properties)) return false;
  return true;
}

export function scheduleOpenXmenAutoUpdate(ctx: PluginInput) {
  const timeout = setTimeout(() => {
    void runOpenXmenAutoUpdate(ctx).catch((error) => {
      console.warn(`open-xmen auto-update check failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, 5_000);
  timeout.unref?.();
}

export async function runOpenXmenAutoUpdate(ctx: PluginInput): Promise<AutoUpdateResult> {
  if (process.env.OPEN_XMEN_SKIP_AUTO_UPGRADE === "1" || process.env.OPEN_XMEN_AUTO_UPGRADE === "0") {
    return { status: "skipped", reason: "disabled" };
  }

  const packageRoot = findPackageRoot(path.dirname(fileURLToPath(import.meta.url)));
  if (!packageRoot) return { status: "skipped", reason: "package-root-not-found" };
  if (existsSync(path.join(packageRoot, ".git"))) return { status: "skipped", reason: "local-development" };

  const packageJson = readJson(path.join(packageRoot, "package.json"));
  const currentVersion = isRecord(packageJson) && typeof packageJson.version === "string" ? packageJson.version : undefined;
  if (!currentVersion) return { status: "skipped", reason: "current-version-not-found" };

  const pluginEntry = findPluginEntry(ctx.directory);
  if (!pluginEntry) return { status: "skipped", reason: "plugin-entry-not-found", currentVersion };
  if (pluginEntry.isPinned) {
    const latestVersion = await fetchLatestVersion();
    if (latestVersion && compareSemver(latestVersion, currentVersion) > 0) {
      await showToast(ctx, "Open X-Men update available", `${latestVersion} is available, but your plugin entry is pinned to ${pluginEntry.entry}.`, "warning");
    }
    return { status: "skipped", reason: "pinned-plugin-entry", currentVersion, latestVersion };
  }

  const latestVersion = await fetchLatestVersion();
  if (!latestVersion) return { status: "skipped", reason: "latest-version-not-found", currentVersion };
  if (compareSemver(latestVersion, currentVersion) <= 0) return { status: "skipped", reason: "already-current", currentVersion, latestVersion };

  const workspace = moduleHostingWorkspace(packageRoot);
  if (!workspace) return { status: "failed", reason: "install-workspace-not-found", currentVersion, latestVersion };

  await showToast(ctx, "Updating Open X-Men", `Installing ${PACKAGE_NAME}@latest (${currentVersion} → ${latestVersion})...`, "info");
  const installed = installOpenXmenPackageWorkspace(workspace, { forceRefresh: true, stdio: "pipe" });
  if (!installed) {
    await showToast(ctx, "Open X-Men update failed", `${latestVersion} is available. Run: bunx ${PACKAGE_NAME}@latest install`, "warning");
    return { status: "failed", reason: "bun-install-failed", currentVersion, latestVersion, workspace };
  }

  await showToast(ctx, "Open X-Men updated", `${currentVersion} → ${latestVersion}. Restart OpenCode to use the new plugin code.`, "success");
  return { status: "updated", currentVersion, latestVersion, workspace };
}

export function currentPackageVersion(): string | undefined {
  const packageRoot = findPackageRoot(path.dirname(fileURLToPath(import.meta.url)));
  if (!packageRoot) return undefined;
  const packageJson = readJson(path.join(packageRoot, "package.json"));
  return isRecord(packageJson) && typeof packageJson.version === "string" ? packageJson.version : undefined;
}

// Self-heal the global skills dir to match the running package version. Auto-update reinstalls the
// npm package but never touches <configDir>/skills, so on-disk skills drift until a manual install.
// Run this once at plugin load (after the post-update restart, the loaded code IS the new version,
// so this writes the new skills). Best-effort and silent: never block or break plugin startup.
export function syncInstalledSkills(): { status: string; detail?: string } {
  try {
    const packageRoot = findPackageRoot(path.dirname(fileURLToPath(import.meta.url)));
    if (!packageRoot) return { status: "skipped-no-package-root" };
    // Local checkouts manage skills via `open-xmen install` themselves — don't clobber them.
    if (existsSync(path.join(packageRoot, ".git"))) return { status: "skipped-local-development" };
    const version = currentPackageVersion();
    if (!version) return { status: "skipped-no-version" };
    let configDir: string;
    try {
      configDir = globalOpenCodeConfigDir();
    } catch {
      return { status: "skipped-no-config-dir" };
    }
    const result = refreshSkillsIfStale(configDir, version);
    return result.refreshed
      ? { status: "refreshed", detail: `${result.count} skills → ${version}` }
      : { status: `skipped-${result.reason}` };
  } catch (error) {
    return { status: "failed", detail: error instanceof Error ? error.message : String(error) };
  }
}

async function fetchLatestVersion() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  timeout.unref?.();
  try {
    const response = await fetch(NPM_DIST_TAGS_URL, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) return undefined;
    const tags = await response.json();
    return isRecord(tags) && typeof tags.latest === "string" ? tags.latest : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function findPluginEntry(directory: string) {
  for (const configPath of configPaths(directory)) {
    const config = readJsonc(configPath);
    if (!isRecord(config)) continue;
    const plugins = Array.isArray(config.plugin) ? config.plugin : [];
    for (const plugin of plugins) {
      const entry = Array.isArray(plugin) ? plugin[0] : plugin;
      if (typeof entry !== "string") continue;
      if (entry === PACKAGE_NAME) return { entry, isPinned: false };
      if (entry.startsWith(`${PACKAGE_NAME}@`)) {
        const spec = entry.slice(PACKAGE_NAME.length + 1).trim();
        return { entry, isPinned: EXACT_SEMVER.test(spec) };
      }
      if (isLocalPackageRootEntry(entry)) return { entry, isPinned: true };
    }
  }
  return undefined;
}

function configPaths(directory: string) {
  const paths = [path.join(directory, "opencode.jsonc"), path.join(directory, "opencode.json")];
  const globalConfigDir = process.env.OPENCODE_CONFIG_DIR || (process.env.XDG_CONFIG_HOME
    ? path.join(process.env.XDG_CONFIG_HOME, "opencode")
    : process.env.HOME
      ? path.join(process.env.HOME, ".config", "opencode")
      : undefined);
  if (globalConfigDir) paths.push(path.join(globalConfigDir, "opencode.jsonc"), path.join(globalConfigDir, "opencode.json"));
  return [...new Set(paths)];
}

function readJson(file: string): JsonValue | undefined {
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as JsonValue;
  } catch {
    return undefined;
  }
}

function readJsonc(file: string): JsonValue | undefined {
  if (!existsSync(file)) return undefined;
  try {
    return tryParseJsonc(readFileSync(file, "utf8")) as JsonValue | undefined;
  } catch {
    return undefined;
  }
}

function findPackageRoot(startPath: string) {
  let current = startPath;
  while (true) {
    const packageJson = readJson(path.join(current, "package.json"));
    if (isRecord(packageJson) && packageJson.name === PACKAGE_NAME) return current;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function moduleHostingWorkspace(packageRoot: string) {
  const nodeModulesDir = path.dirname(packageRoot);
  if (path.basename(nodeModulesDir) !== "node_modules") return undefined;
  return path.dirname(nodeModulesDir);
}

function isLocalPackageRootEntry(entry: string) {
  const packageJson = readJson(path.join(entry, "package.json"));
  return isRecord(packageJson) && packageJson.name === PACKAGE_NAME;
}

function parseSemver(version: string): { core: number[]; pre?: string } {
  const [coreAndPre] = version.split("+"); // drop build metadata (ignored in precedence)
  const [core, ...preParts] = coreAndPre.split("-");
  const nums = core.split(".").map((part) => Number.parseInt(part, 10) || 0);
  return { core: nums, pre: preParts.length ? preParts.join("-") : undefined };
}

// Compares prerelease identifier lists per semver §11: numeric identifiers compare numerically and
// rank below alphanumeric ones; a shorter set ranks lower when all preceding identifiers are equal.
function comparePrerelease(a: string, b: string): number {
  const as = a.split(".");
  const bs = b.split(".");
  for (let i = 0; i < Math.max(as.length, bs.length); i++) {
    const x = as[i];
    const y = bs[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) {
      const diff = Number(x) - Number(y);
      if (diff !== 0) return Math.sign(diff);
    } else if (xn !== yn) {
      return xn ? -1 : 1; // numeric identifiers have lower precedence than alphanumeric
    } else {
      const cmp = x.localeCompare(y);
      if (cmp !== 0) return Math.sign(cmp);
    }
  }
  return 0;
}

export function compareSemver(a: string, b: string): number {
  const left = parseSemver(a);
  const right = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    const diff = (left.core[i] || 0) - (right.core[i] || 0);
    if (diff !== 0) return Math.sign(diff);
  }
  // Equal core: a version WITHOUT a prerelease outranks one WITH (1.0.0 > 1.0.0-rc1).
  if (!left.pre && !right.pre) return 0;
  if (!left.pre) return 1;
  if (!right.pre) return -1;
  return comparePrerelease(left.pre, right.pre);
}

async function showToast(ctx: PluginInput, title: string, message: string, variant: "info" | "success" | "warning" | "error") {
  const tui = isRecord(ctx.client) ? ctx.client.tui : undefined;
  if (!isRecord(tui) || typeof tui.showToast !== "function") return;
  try {
    await tui.showToast({ body: { title, message, variant, duration: 8_000 }, query: { directory: ctx.directory } });
  } catch {
    // Toasts are best-effort only; update checks should never block OpenCode startup.
  }
}

function parentSessionId(properties: unknown) {
  if (!isRecord(properties)) return undefined;
  const info = properties.info;
  if (!isRecord(info)) return undefined;
  return typeof info.parentID === "string" && info.parentID ? info.parentID : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
