import path from "node:path";
import type { TaskRecord } from "./types.js";

// A task counts as complete for dependency purposes when it has been verified, or when it
// finished and has no verification commands to gate it.
export function isTaskComplete(task: TaskRecord): boolean {
  if (task.status === "verified") return true;
  return task.status === "done" && !(task.verification_commands?.length);
}

// Pending tasks whose every dependency resolves to a complete task. Tasks that name an
// unknown dependency id are never ready — the engine reports those as a deadlock.
export function selectFrontier(tasks: TaskRecord[]): TaskRecord[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return tasks.filter((task) =>
    task.status === "pending" &&
    task.depends_on.every((dep) => {
      const depTask = byId.get(dep);
      return depTask !== undefined && isTaskComplete(depTask);
    })
  );
}

// Pending tasks that can never become ready: a dependency is unknown, or every path to
// readiness runs through a blocked/failed task while nothing else is in flight.
export function findDeadlockedTasks(tasks: TaskRecord[]): TaskRecord[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return tasks.filter((task) => {
    if (task.status !== "pending") return false;
    return task.depends_on.some((dep) => {
      const depTask = byId.get(dep);
      return depTask === undefined || depTask.status === "blocked" || depTask.status === "failed";
    });
  });
}

function normalizeFiles(task: TaskRecord): Set<string> {
  return new Set((task.files ?? []).map((file) => path.normalize(file).replace(/^\.\//, "")));
}

// Tasks with no declared files are lenient: they conflict with nothing. The planner is
// required to declare Files per task, so undeclared means "no scheduling constraint".
export function hasFileConflict(a: TaskRecord, b: TaskRecord): boolean {
  const aFiles = normalizeFiles(a);
  if (aFiles.size === 0) return false;
  for (const file of normalizeFiles(b)) {
    if (aFiles.has(file)) return true;
  }
  return false;
}

// Greedy in ledger order: take each frontier task unless it conflicts with one already taken.
export function pickBatch(frontier: TaskRecord[], maxParallel: number): TaskRecord[] {
  const limit = Math.max(1, Math.min(8, Math.floor(maxParallel)));
  const batch: TaskRecord[] = [];
  for (const task of frontier) {
    if (batch.length >= limit) break;
    if (batch.some((taken) => hasFileConflict(taken, task))) continue;
    batch.push(task);
  }
  return batch;
}

export type LedgerSummary = {
  total: number;
  pending: number;
  active: number;
  done: number;
  verified: number;
  blocked: number;
  failed: number;
};

export function summarizeLedger(tasks: TaskRecord[]): LedgerSummary {
  const summary: LedgerSummary = { total: tasks.length, pending: 0, active: 0, done: 0, verified: 0, blocked: 0, failed: 0 };
  for (const task of tasks) summary[task.status] += 1;
  return summary;
}

export function allTasksComplete(tasks: TaskRecord[]): boolean {
  return tasks.length > 0 && tasks.every(isTaskComplete);
}
