import type { DoctorResult, InstallContext, TargetAdapter } from "../types.js";

const unsupported = "Codex target emitter is not implemented yet.";

export const codexTarget: TargetAdapter = {
  id: "codex",
  description: unsupported,
  install(context: InstallContext) {
    if (context.dryRun) {
      context.planned.push("codex target is not implemented yet");
      return;
    }
    throw new Error(unsupported);
  },
  doctor(cwd: string): DoctorResult {
    return {
      ok: false,
      cwd,
      errors: [unsupported],
      agents: 0,
      commands: 0,
    };
  },
};
