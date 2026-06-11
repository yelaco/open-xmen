import { randomUUID } from "node:crypto";
import { appendJsonl, now, problemsFile } from "./fs.js";
import type { ProblemSeverity, ProblemStatus, ProgressStatus, RuntimeContext, ToolProgressContext } from "./types.js";

export function setToolProgress(toolContext: ToolProgressContext | undefined, title: string, metadata?: Record<string, unknown>) {
  try {
    toolContext?.metadata?.({ title, ...(metadata ? { metadata } : {}) });
  } catch {
    // Tool metadata is best-effort UI sugar; never fail workflow state updates.
  }
}

export type ProgressEvent = {
  phase: string;
  message: string;
  status?: ProgressStatus;
  task_id?: string;
  agent?: string;
  child_session_id?: string;
  detail?: string;
};

export type ProblemInput = {
  title: string;
  severity?: ProblemSeverity;
  status?: ProblemStatus;
  source?: string;
  task_id?: string;
  agent?: string;
  evidence?: string;
  recommendation?: string;
};

export type ProgressRecord = ProgressEvent & { at: string; status: ProgressStatus };
export type ProblemRecord = ProblemInput & { id: string; at: string; severity: ProblemSeverity; status: ProblemStatus };

export type EventRecorder = {
  recordProgress(runId: string, event: ProgressEvent, toolContext?: ToolProgressContext): Promise<ProgressRecord>;
  recordProblem(runId: string, problem: ProblemInput, toolContext?: ToolProgressContext): Promise<ProblemRecord>;
};

export function createEventRecorder(ctx: RuntimeContext): EventRecorder {
  // Progress is surfaced as live tool status in the TUI (and Cerebro narrates each step itself);
  // it is no longer persisted to a file, since nothing read it. Problems are still recorded to
  // `{run}.problems.jsonl` because cerebro_run_report consolidates them.
  async function recordProgress(runId: string, event: ProgressEvent, toolContext?: ToolProgressContext): Promise<ProgressRecord> {
    const record: ProgressRecord = { at: now(), ...event, status: event.status ?? "info" };
    const titlePrefix = record.status === "completed" ? "✓" : record.status === "failed" ? "✗" : record.status === "blocked" ? "!" : "→";
    setToolProgress(toolContext, `${titlePrefix} ${record.phase}: ${record.message}`, {
      run_id: runId,
      status: record.status,
      task_id: record.task_id,
      agent: record.agent,
      child_session_id: record.child_session_id,
    });
    return record;
  }

  async function recordProblem(runId: string, problem: ProblemInput, toolContext?: ToolProgressContext): Promise<ProblemRecord> {
    const record: ProblemRecord = {
      id: `problem-${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      at: now(),
      ...problem,
      severity: problem.severity ?? "warning",
      status: problem.status ?? "open",
    };
    await appendJsonl(problemsFile(ctx, runId), record);
    const prefix = record.severity === "blocker" ? "BLOCKER" : record.severity.toUpperCase();
    setToolProgress(toolContext, `⚠ ${prefix}: ${record.title}`, {
      run_id: runId,
      problem_id: record.id,
      severity: record.severity,
      status: record.status,
      task_id: record.task_id,
      agent: record.agent,
    });
    await recordProgress(runId, {
      phase: "problem",
      status: record.severity === "blocker" ? "blocked" : record.severity === "error" ? "failed" : "info",
      message: record.title,
      task_id: record.task_id,
      agent: record.agent,
      detail: record.evidence,
    }, toolContext).catch(() => undefined);
    return record;
  }

  return { recordProgress, recordProblem };
}
