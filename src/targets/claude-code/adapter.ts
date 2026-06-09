import type { DoctorResult, InstallContext, TargetAdapter } from "../types.js";

const unsupported = "Claude Code target emitter is not implemented yet.";

export const claudeCodeTarget: TargetAdapter = {
  id: "claude-code",
  description: unsupported,
  install(context: InstallContext) {
    if (context.dryRun) {
      context.planned.push("claude-code target is not implemented yet");
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
