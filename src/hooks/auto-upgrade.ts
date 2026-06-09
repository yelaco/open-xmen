import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const PACKAGE_NAME = "open-xmen";
const AUTO_UPGRADE_STATUS_FILE = "auto-upgrade.json";
const AUTO_UPGRADE_TIMEOUT_MS = 15_000;
const execFileAsync = promisify(execFile);

type RuntimeContext = {
  worktree: string;
  directory: string;
};

type AutoUpgradeStatus = {
  checked_at: string;
  current_version: string;
  latest_version: string;
  status: "current" | "upgraded" | "skipped" | "unavailable" | "failed";
  detail?: string;
};

function now() {
  return new Date().toISOString().replace("+00:00", "Z");
}

export async function autoUpgradePackage(ctx: RuntimeContext) {
  const statusFile = safeRuntimePath(ctx, AUTO_UPGRADE_STATUS_FILE);
  const writeStatus = async (status: AutoUpgradeStatus) => writeJson(statusFile, status);
  const skipped = async (detail: string) => {
    await writeStatus({ checked_at: now(), current_version: await currentVersion(), latest_version: await currentVersion(), status: "skipped", detail });
  };

  if (process.env.OPEN_XMEN_SKIP_AUTO_UPGRADE === "1" || process.env.OPEN_XMEN_AUTO_UPGRADE === "0") {
    await skipped("auto-upgrade disabled by environment");
    return;
  }

  try {
    const current = await currentVersion();
    const latest = await latestVersion();
    if (!latest) {
      await writeStatus({ checked_at: now(), current_version: current, latest_version: current, status: "unavailable", detail: "npm registry version lookup failed" });
      return;
    }
    if (!isNewerVersion(latest, current)) {
      await writeStatus({ checked_at: now(), current_version: current, latest_version: latest, status: "current" });
      return;
    }

    const root = packageRoot();
    const managerRoot = findPackageManagerRoot(root);
    if (!managerRoot) {
      await writeStatus({ checked_at: now(), current_version: current, latest_version: latest, status: "skipped", detail: "local development source tree" });
      return;
    }

    await execFileAsync("npm", ["install", `${PACKAGE_NAME}@${latest}`, "--ignore-scripts"], {
      cwd: managerRoot,
      timeout: AUTO_UPGRADE_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });

    const cliPath = path.join(root, "dist", "cli.js");
    await execFileAsync(process.execPath, [cliPath, "install", "--dir", ctx.directory, "--reset", "--no-deps"], {
      cwd: root,
      timeout: AUTO_UPGRADE_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });

    await writeStatus({ checked_at: now(), current_version: current, latest_version: latest, status: "upgraded", detail: `upgraded via ${managerRoot}` });
  } catch (error) {
    await writeStatus({
      checked_at: now(),
      current_version: await currentVersion().catch(() => "unknown"),
      latest_version: "unknown",
      status: "failed",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

function packageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function runtimeRoot(ctx: RuntimeContext) {
  return path.join(ctx.worktree || ctx.directory, ".cerebro");
}

function safeRuntimePath(ctx: RuntimeContext, relativePath: string) {
  const root = runtimeRoot(ctx);
  const full = path.resolve(root, relativePath);
  const normalizedRoot = path.resolve(root) + path.sep;
  if (full !== path.resolve(root) && !full.startsWith(normalizedRoot)) {
    throw new Error(`Path escapes .cerebro runtime: ${relativePath}`);
  }
  return full;
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  if (!existsSync(file)) return fallback;
  return JSON.parse(await readFile(file, "utf8")) as T;
}

async function writeJson(file: string, data: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function currentVersion() {
  const pkg = await readJson<{ version?: string }>(path.join(packageRoot(), "package.json"), {});
  return typeof pkg.version === "string" ? pkg.version : "unknown";
}

async function latestVersion() {
  try {
    const { stdout } = await execFileAsync("npm", ["view", PACKAGE_NAME, "version", "--silent"], {
      timeout: AUTO_UPGRADE_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });
    const version = stdout.trim();
    return version || null;
  } catch {
    return null;
  }
}

function findPackageManagerRoot(root: string) {
  const normalized = root.replaceAll("\\", "/");
  const marker = `/node_modules/${PACKAGE_NAME}`;
  const index = normalized.lastIndexOf(marker);
  if (index === -1) return null;
  const managerRoot = root.slice(0, index);
  return managerRoot || null;
}

function parseVersion(version: string) {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;
  return match.slice(1).map(Number) as [number, number, number];
}

function isNewerVersion(latest: string, current: string) {
  const next = parseVersion(latest);
  const base = parseVersion(current);
  if (!next || !base) return latest !== current;
  for (let i = 0; i < 3; i += 1) {
    if (next[i] > base[i]) return true;
    if (next[i] < base[i]) return false;
  }
  return false;
}
