import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runtimeAssetsByPrefix } from "../runtime/index.js";

export type SkillInstallOptions = {
  dryRun: boolean;
  planned: string[];
};

// Skills are user-global: OpenCode discovers them from <configDir>/skills/<name>/SKILL.md.
// They are plugin-owned and namespaced with an `open-xmen-` prefix, so install always
// refreshes them to track the package version.
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
  return skills.length;
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
