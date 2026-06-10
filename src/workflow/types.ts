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
  child_session_id?: string;
  chain_state?: {
    design_spec_path?: string;
    component_files?: string[];
    completed_stages?: string[];
  };
  status: TaskStatus;
  depends_on: string[];
  created_at: string;
  updated_at: string;
  notes: string[];
  verification: Array<{ at: string; result: string; command?: string; notes?: string }>;
};

export type ChildSessionClient = {
  session: {
    create(input: {
      body: { parentID?: string; title: string };
      query?: { directory: string };
    }): Promise<{ data?: { id?: string } | null; id?: string }>;
    promptAsync(input: {
      path: { id: string };
      query?: { directory: string };
      body: {
        agent: string;
        model?: { providerID: string; modelID: string };
        noReply: boolean;
        parts: Array<{ type: "text"; text: string }>;
      };
    }): Promise<unknown>;
    prompt?(input: {
      path: { id: string };
      query?: { directory: string };
      body: {
        agent: string;
        model?: { providerID: string; modelID: string };
        noReply?: boolean;
        parts: Array<{ type: "text"; text: string }>;
      };
    }): Promise<unknown>;
    messages?(input: {
      path: { id: string };
      query?: { directory: string; limit?: number };
    }): Promise<unknown>;
  };
};
