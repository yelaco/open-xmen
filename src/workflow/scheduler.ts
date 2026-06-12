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

// A task's declared footprint, or undefined when `files` is omitted entirely (unknown footprint).
// An explicit empty array is a positive declaration of "touches no files" — distinct from omitted.
function declaredFiles(task: TaskRecord): Set<string> | undefined {
  if (task.files === undefined) return undefined;
  return new Set(task.files.map((file) => path.normalize(file).replace(/^\.\//, "")));
}

// Whether two tasks may not run in the same parallel wave. If either omits `files`, its footprint is
// unknown — we can't prove it won't write a file the other touches, so it conflicts (and runs alone),
// the safe default against a parallel-write clobber. When both declare their files (an empty list
// included — e.g. a read-only scout/test task), they conflict only on a genuinely shared path, so
// disjoint and footprint-free tasks fan out.
export function hasFileConflict(a: TaskRecord, b: TaskRecord): boolean {
  const aFiles = declaredFiles(a);
  const bFiles = declaredFiles(b);
  if (aFiles === undefined || bFiles === undefined) return true;
  for (const file of bFiles) {
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

// Verification failures a task may accumulate before it is auto-blocked (initial attempt + retries).
export const MAX_VERIFY_ATTEMPTS = 3;

// Stale-claim recovery. `active` means a task was claimed and spawned in some session; across a
// restart nothing is truly in flight, so any leftover `active` is a claim that never completed —
// reset it to `pending` so it re-enters the frontier. Mutates in place; returns true if anything
// changed. Run this once per session before the first claim (when no claim could be genuinely live).
export function reactivateStaleActive(tasks: TaskRecord[], stamp: string): boolean {
  let changed = false;
  for (const task of tasks) {
    if (task.status === "active") {
      task.status = "pending";
      task.updated_at = stamp;
      changed = true;
    }
  }
  return changed;
}

// Claims a ready batch by flipping the named pending tasks to `active`, so a re-query of the
// frontier can't hand the same tasks out again — the double-spawn guard for parallel waves
// (selectFrontier only returns `pending`). Mutates in place.
export function claimTasks(tasks: TaskRecord[], ids: string[], stamp: string): void {
  const claim = new Set(ids);
  for (const task of tasks) {
    if (claim.has(task.id) && task.status === "pending") {
      task.status = "active";
      task.updated_at = stamp;
    }
  }
}

// Decides a failed task's next status: requeue (`pending`) for another attempt, or `blocked` once
// it has burned the retry budget. Increments `attempts`. Mutates in place; returns the new status.
export function applyVerificationFailure(task: TaskRecord, stamp: string): "pending" | "blocked" {
  task.attempts = (task.attempts ?? 0) + 1;
  task.status = task.attempts >= MAX_VERIFY_ATTEMPTS ? "blocked" : "pending";
  task.updated_at = stamp;
  return task.status;
}
