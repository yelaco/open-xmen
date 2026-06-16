import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runtimeAssetsByPrefix } from "../runtime/index.js";

// Records which package version's skills are currently on disk, so the plugin can detect drift
// (auto-update refreshes the package but not the global skills dir) and self-heal on next load.
const SKILLS_VERSION_FILE = "skills/.open-xmen-skills-version";

export type SkillInstallOptions = {
  dryRun: boolean;
  planned: string[];
  /** When set (and not a dry run), stamp the installed skills with this package version. */
  version?: string;
};

// Skills are user-global: OpenCode discovers them from <configDir>/skills/<name>/SKILL.md.
// They are plugin-owned and namespaced with an `opx-` prefix, so install always refreshes them
// to track the package version (and stamps that version when one is provided).
export function installSkills(globalConfigDir: string, opts: SkillInstallOptions): number {
  const skills = runtimeAssetsByPrefix("skills/");
  for (const asset of skills) {
    const destination = path.join(globalConfigDir, asset.path);
    if (opts.dryRun) {
      opts.planned.push(`${existsSync(destination) ? "refresh" : "write"} ${destination}`);
      continue;
    }
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, asset.content, "utf8");
  }
  if (!opts.dryRun && opts.version) writeSkillsVersionStamp(globalConfigDir, opts.version);
  return skills.length;
}

export function readSkillsVersionStamp(globalConfigDir: string): string | undefined {
  const file = path.join(globalConfigDir, SKILLS_VERSION_FILE);
  if (!existsSync(file)) return undefined;
  try {
    return readFileSync(file, "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

function writeSkillsVersionStamp(globalConfigDir: string, version: string) {
  const file = path.join(globalConfigDir, SKILLS_VERSION_FILE);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${version}\n`, "utf8");
}

// Self-heal entry: bring the on-disk skills back in line with the running package version WITHOUT
// bootstrapping (a user who never ran install) or resurrecting (a user who ran uninstall). Only
// refreshes when at least one shipped skill is already present and the recorded version differs.
export function refreshSkillsIfStale(
  globalConfigDir: string,
  currentVersion: string,
): { refreshed: boolean; reason: string; count: number } {
  const skills = runtimeAssetsByPrefix("skills/");
  const anyInstalled = skills.some((asset) => existsSync(path.join(globalConfigDir, asset.path)));
  if (!anyInstalled) return { refreshed: false, reason: "no-existing-skills", count: 0 };
  if (readSkillsVersionStamp(globalConfigDir) === currentVersion) return { refreshed: false, reason: "current", count: 0 };
  const count = installSkills(globalConfigDir, { dryRun: false, planned: [], version: currentVersion });
  return { refreshed: true, reason: "synced", count };
}

// Reverse of installSkills: remove each plugin-owned skill directory (<configDir>/skills/<name>)
// that the package installs. Derives the skill dirs from the same runtime assets, so it always
// tracks the shipped skill set. Returns the number of directories removed.
export function uninstallSkills(globalConfigDir: string, opts: SkillInstallOptions): number {
  const skillDirs = new Set<string>();
  for (const asset of runtimeAssetsByPrefix("skills/")) {
    // asset.path is "skills/<skill-name>/SKILL.md" — remove the whole "<skill-name>" dir once.
    const segments = asset.path.split("/");
    if (segments.length >= 2) skillDirs.add(path.join("skills", segments[1]));
  }
  let removed = 0;
  for (const dir of skillDirs) {
    const destination = path.join(globalConfigDir, dir);
    if (!existsSync(destination)) continue;
    if (opts.dryRun) opts.planned.push(`remove ${destination}`);
    else rmSync(destination, { recursive: true, force: true });
    removed += 1;
  }
  return removed;
}
