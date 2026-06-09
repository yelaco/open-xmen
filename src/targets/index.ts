import { claudeCodeTarget } from "./claude-code/adapter.js";
import { codexTarget } from "./codex/adapter.js";
import { opencodeTarget } from "./opencode/adapter.js";
import type { TargetAdapter, TargetID } from "./types.js";

const targets = [opencodeTarget, claudeCodeTarget, codexTarget] as const;

export { TARGET_IDS } from "./types.js";
export type { DoctorResult, InstallContext, TargetAdapter, TargetID } from "./types.js";

export function availableTargets(): readonly TargetAdapter[] {
  return targets;
}

export function resolveTarget(targetID: TargetID): TargetAdapter {
  const target = targets.find((candidate) => candidate.id === targetID);
  if (!target) throw new Error(`Unsupported target: ${targetID}`);
  return target;
}
