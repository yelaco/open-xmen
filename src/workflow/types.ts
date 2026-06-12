import { CEREBRO_TASK_STATUSES } from "../council/index.js";

export type TaskStatus = (typeof CEREBRO_TASK_STATUSES)[number];

export type ProgressStatus = "started" | "running" | "completed" | "blocked" | "failed" | "info";
export type ProblemSeverity = "info" | "warning" | "error" | "blocker";
export type ProblemStatus = "open" | "mitigated" | "resolved";

export type ToolProgressContext = {
  metadata?: (input: { title?: string; metadata?: Record<string, unknown> }) => void;
};

export type RuntimeContext = {
  worktree: string;
  directory: string;
};

export type TaskRecord = {
  id: string;
  subject: string;
  description: string;
  owner: string;
  category?: string;
  verification_commands?: string[];
  files?: string[];
  attempts?: number;
  status: TaskStatus;
  depends_on: string[];
  created_at: string;
  updated_at: string;
  notes: string[];
  verification: Array<{ at: string; result: string; command?: string; notes?: string }>;
};
