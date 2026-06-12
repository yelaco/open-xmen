import { appendFile, copyFile, mkdir, open, readFile, rename } from "node:fs/promises";
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

// Writes durably: stream into a temp file, fsync, then atomically rename over the target. A crash
// (or kill/disk-full) mid-write can never leave a half-written/truncated file — the target is always
// either the previous complete contents or the new complete contents.
async function writeFileAtomic(file: string, content: string) {
  const tmp = `${file}.tmp`;
  const handle = await open(tmp, "w");
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmp, file);
}

export async function writeJson(file: string, data: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFileAtomic(file, `${JSON.stringify(data, null, 2)}\n`);
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

type ReadResult<T> = { ok: true; data: T } | { ok: false; missing: boolean };

async function tryReadJson<T>(file: string): Promise<ReadResult<T>> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ok: false, missing: true };
    throw err;
  }
  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return { ok: false, missing: false };
  }
}

// The task ledger is the durability backbone (resume, stale-claim reconciliation, retry all read it).
// If the primary file is corrupt or truncated, fall back to the last-good `.bak` saveTasks keeps,
// rather than throwing and bricking the run.
export async function loadTasks(ctx: RuntimeContext, runId: string): Promise<TaskRecord[]> {
  const file = taskFile(ctx, runId);
  const primary = await tryReadJson<TaskRecord[]>(file);
  if (primary.ok) return primary.data;
  if (primary.missing) return [];
  const backup = await tryReadJson<TaskRecord[]>(`${file}.bak`);
  if (backup.ok) return backup.data;
  throw new Error(`Cerebro task ledger ${path.basename(file)} is corrupt and has no valid .bak backup`);
}

export async function saveTasks(ctx: RuntimeContext, runId: string, tasks: TaskRecord[]) {
  const file = taskFile(ctx, runId);
  // Snapshot the prior ledger as .bak before overwriting, so a corrupt write is recoverable.
  await copyFile(file, `${file}.bak`).catch(() => undefined);
  await writeJson(file, tasks);
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
      const guard = next.then(() => {}, () => {});
      locks.set(runId, guard);
      // Evict the run's entry once its queue drains, unless newer work has since been chained on —
      // keeps the map bounded to runs with in-flight operations over a long-lived process.
      void guard.then(() => {
        if (locks.get(runId) === guard) locks.delete(runId);
      });
      return next;
    },
  };
}
