import { fileURLToPath } from "node:url";
import path from "node:path";
import { installManagedAgentInstructions, installManagedRuntime } from "../../cli/runtime.js";
import { warmOpenCodePluginCache, updateOpencodeConfig } from "./config.js";
import { runOpenCodeDoctor } from "./doctor.js";
import type { InstallContext, TargetAdapter } from "../types.js";

export const opencodeTarget: TargetAdapter = {
  id: "opencode",
  description: "Emit OpenCode runtime files and config.",
  install(context: InstallContext) {
    installManagedRuntime(context.targetDir, {
      dryRun: context.dryRun,
      overwrite: context.overwrite,
      planned: context.planned,
    });
    installManagedAgentInstructions(context.targetDir, {
      dryRun: context.dryRun,
      overwrite: context.overwrite,
      planned: context.planned,
    });
    updateOpencodeConfig(context.targetDir, { dryRun: context.dryRun, planned: context.planned });
    if (!context.dryRun && !context.skipDeps) warmOpenCodePluginCache(packageRoot());
  },
  doctor(cwd: string) {
    return runOpenCodeDoctor(cwd);
  },
};

function packageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}
