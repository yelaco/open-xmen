import { randomUUID } from "node:crypto";
import { appendJsonl, loadTasks, mailboxFile, now, problemsFile, progressFile, saveTasks } from "./fs.js";
import type { TaskMutex } from "./fs.js";
import { summarizeTaskResult } from "./results.js";
import type { TaskResultSummary } from "./results.js";
import type { ProblemSeverity, ProblemStatus, ProgressStatus, RuntimeContext, ToolProgressContext } from "./types.js";

export function setToolProgress(toolContext: ToolProgressContext | undefined, title: string, metadata?: Record<string, unknown>) {
  try {
    toolContext?.metadata?.({ title, ...(metadata ? { metadata } : {}) });
  } catch {
    // Tool metadata is best-effort UI sugar; never fail workflow state updates.
  }
}

export function formatElapsed(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
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
  recordAgentResult(runId: string, agent: string, childSessionId: string, output: string, taskId?: string): Promise<TaskResultSummary>;
};

export function createEventRecorder(ctx: RuntimeContext, mutex: TaskMutex): EventRecorder {
  async function recordProgress(runId: string, event: ProgressEvent, toolContext?: ToolProgressContext): Promise<ProgressRecord> {
    const record: ProgressRecord = { at: now(), ...event, status: event.status ?? "info" };
    await appendJsonl(progressFile(ctx, runId), record);
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

  async function recordAgentResult(runId: string, agent: string, childSessionId: string, output: string, taskId?: string): Promise<TaskResultSummary> {
    const summary = summarizeTaskResult(output);
    await appendJsonl(mailboxFile(ctx, runId), {
      at: now(),
      type: "agent_result",
      from: agent,
      to: "cerebro",
      child_session_id: childSessionId,
      task_id: taskId,
      status: summary.status ?? "unknown",
      summary: summary.summary,
      body: output,
    });

    if (!taskId) return summary;
    await mutex.serialize(runId, async () => {
      const tasks = await loadTasks(ctx, runId);
      const taskRecord = tasks.find((task) => task.id === taskId);
      if (!taskRecord) throw new Error(`Unknown task ${taskId}`);
      if (summary.status) taskRecord.status = summary.status;
      taskRecord.notes.push(`${now()} ${agent} returned ${summary.status ?? "unparsed"} from child session ${childSessionId}${summary.summary ? `: ${summary.summary}` : ""}`);
      taskRecord.updated_at = now();
      await saveTasks(ctx, runId, tasks);
    });
    return summary;
  }

  return { recordProgress, recordProblem, recordAgentResult };
}
