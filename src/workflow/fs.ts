import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RuntimeContext, TaskRecord } from "./types.js";

export function now() {
  return new Date().toISOString();
}

export function slug(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "cerebro-run";
}

export function runtimeRoot(ctx: RuntimeContext) {
  return path.join(ctx.worktree || ctx.directory, ".cerebro");
}

export function safeRuntimePath(ctx: RuntimeContext, relativePath: string) {
  const root = runtimeRoot(ctx);
  const full = path.resolve(root, relativePath);
  const normalizedRoot = path.resolve(root) + path.sep;
  if (full !== path.resolve(root) && !full.startsWith(normalizedRoot)) {
    throw new Error(`Path escapes .cerebro runtime: ${relativePath}`);
  }
  return full;
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

export async function writeJson(file: string, data: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function appendJsonl(file: string, data: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(data)}\n`, "utf8");
}

export async function appendText(file: string, text: string) {
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, text, "utf8");
}

export function taskFile(ctx: RuntimeContext, runId: string) {
  return safeRuntimePath(ctx, `team-runs/${runId}.tasks.json`);
}

export function manifestFile(ctx: RuntimeContext, runId: string) {
  return safeRuntimePath(ctx, `team-runs/${runId}.json`);
}

export function progressFile(ctx: RuntimeContext, runId: string) {
  return safeRuntimePath(ctx, `team-runs/${runId}.progress.jsonl`);
}

export function problemsFile(ctx: RuntimeContext, runId: string) {
  return safeRuntimePath(ctx, `team-runs/${runId}.problems.jsonl`);
}

export function mailboxFile(ctx: RuntimeContext, runId: string) {
  return safeRuntimePath(ctx, `team-runs/${runId}.mailbox.jsonl`);
}

export function gotchasFile(ctx: RuntimeContext, runId: string) {
  return safeRuntimePath(ctx, `notepads/${runId}/gotchas.md`);
}

export function verificationLogFile(ctx: RuntimeContext, runId: string) {
  return safeRuntimePath(ctx, `notepads/${runId}/verification.md`);
}

export function failuresFile(ctx: RuntimeContext, runId: string) {
  return safeRuntimePath(ctx, `notepads/${runId}/failures.md`);
}

export async function loadTasks(ctx: RuntimeContext, runId: string): Promise<TaskRecord[]> {
  return readJson<TaskRecord[]>(taskFile(ctx, runId), []);
}

export async function saveTasks(ctx: RuntimeContext, runId: string, tasks: TaskRecord[]) {
  await writeJson(taskFile(ctx, runId), tasks);
}

export type TaskMutex = {
  serialize<T>(runId: string, fn: () => Promise<T>): Promise<T>;
};

// Serialises load→mutate→save cycles per run_id to prevent concurrent writes clobbering each other.
// The plugin factory must create exactly one mutex and share it between the cerebro_* tools and the
// workflow engine, otherwise their ledger writes can interleave.
export function createTaskMutex(): TaskMutex {
  const locks = new Map<string, Promise<unknown>>();
  return {
    serialize<T>(runId: string, fn: () => Promise<T>): Promise<T> {
      const prev = locks.get(runId) ?? Promise.resolve();
      const next: Promise<T> = prev.then(fn, () => fn());
      locks.set(runId, next.then(() => {}, () => {}));
      return next;
    },
  };
}
