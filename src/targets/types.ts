export const TARGET_IDS = ["opencode", "claude-code", "codex"] as const;

export type TargetID = (typeof TARGET_IDS)[number];

export type InstallContext = {
  targetDir: string;
  dryRun: boolean;
  overwrite: boolean;
  skipDeps: boolean;
  planned: string[];
};

export type DoctorResult = {
  ok: boolean;
  cwd: string;
  errors: string[];
  agents: number;
  commands: number;
};

export type TargetAdapter = {
  id: TargetID;
  description: string;
  install(context: InstallContext): void;
  doctor(cwd: string): DoctorResult;
};
