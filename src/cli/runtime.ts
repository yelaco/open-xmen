import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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
