import { describe, expect, test } from "bun:test";
import {
  MAX_VERIFY_ATTEMPTS,
  allTasksComplete,
  applyVerificationFailure,
  claimTasks,
  findDeadlockedTasks,
  hasFileConflict,
  isTaskComplete,
  pickBatch,
  reactivateStaleActive,
  selectFrontier,
  summarizeLedger,
} from "../src/workflow/scheduler.js";
import { makeTask } from "./helpers.js";

const STAMP = "2026-06-12T00:00:00.000Z";

describe("isTaskComplete", () => {
  test("verified is complete", () => {
    expect(isTaskComplete(makeTask({ id: "a", status: "verified" }))).toBe(true);
  });

  test("done without verification commands is complete", () => {
    expect(isTaskComplete(makeTask({ id: "a", status: "done" }))).toBe(true);
  });

  test("done with verification commands is not complete", () => {
    expect(isTaskComplete(makeTask({ id: "a", status: "done", verification_commands: ["true"] }))).toBe(false);
  });

  test("pending/active/blocked/failed are not complete", () => {
    for (const status of ["pending", "active", "blocked", "failed"] as const) {
      expect(isTaskComplete(makeTask({ id: "a", status }))).toBe(false);
    }
  });
});

describe("selectFrontier", () => {
  test("pending task with no deps is ready", () => {
    const tasks = [makeTask({ id: "a" })];
    expect(selectFrontier(tasks).map((task) => task.id)).toEqual(["a"]);
  });

  test("dep must be complete", () => {
    const tasks = [
      makeTask({ id: "a", status: "active" }),
      makeTask({ id: "b", depends_on: ["a"] }),
    ];
    expect(selectFrontier(tasks)).toEqual([]);
    tasks[0].status = "verified";
    expect(selectFrontier(tasks).map((task) => task.id)).toEqual(["b"]);
  });

  test("done dep with pending verification does not unlock dependents", () => {
    const tasks = [
      makeTask({ id: "a", status: "done", verification_commands: ["true"] }),
      makeTask({ id: "b", depends_on: ["a"] }),
    ];
    expect(selectFrontier(tasks)).toEqual([]);
  });

  test("unknown dep id excludes the task", () => {
    const tasks = [makeTask({ id: "b", depends_on: ["ghost"] })];
    expect(selectFrontier(tasks)).toEqual([]);
    expect(findDeadlockedTasks(tasks).map((task) => task.id)).toEqual(["b"]);
  });

  test("blocked dep deadlocks the dependent", () => {
    const tasks = [
      makeTask({ id: "a", status: "blocked" }),
      makeTask({ id: "b", depends_on: ["a"] }),
    ];
    expect(findDeadlockedTasks(tasks).map((task) => task.id)).toEqual(["b"]);
  });
});

describe("file conflicts and batching", () => {
  test("overlapping files conflict, normalized paths included", () => {
    const a = makeTask({ id: "a", files: ["./src/x.ts"] });
    const b = makeTask({ id: "b", files: ["src/x.ts", "src/y.ts"] });
    expect(hasFileConflict(a, b)).toBe(true);
  });

  test("a task that omits files conflicts (unknown footprint, runs alone)", () => {
    const a = makeTask({ id: "a" }); // files omitted → unknown
    const b = makeTask({ id: "b", files: ["src/x.ts"] });
    const c = makeTask({ id: "c" });
    expect(hasFileConflict(a, b)).toBe(true);
    expect(hasFileConflict(b, a)).toBe(true);
    expect(hasFileConflict(a, c)).toBe(true); // both unknown
  });

  test("an explicit empty files list (read-only) never conflicts", () => {
    const readOnly = makeTask({ id: "a", files: [] });
    const writer = makeTask({ id: "b", files: ["src/x.ts"] });
    const otherReadOnly = makeTask({ id: "c", files: [] });
    expect(hasFileConflict(readOnly, writer)).toBe(false);
    expect(hasFileConflict(writer, readOnly)).toBe(false);
    expect(hasFileConflict(readOnly, otherReadOnly)).toBe(false);
  });

  test("tasks with disjoint declared files do not conflict", () => {
    const a = makeTask({ id: "a", files: ["src/x.ts"] });
    const b = makeTask({ id: "b", files: ["src/y.ts"] });
    expect(hasFileConflict(a, b)).toBe(false);
  });

  test("pickBatch never co-schedules conflicting tasks", () => {
    const frontier = [
      makeTask({ id: "a", files: ["src/x.ts"] }),
      makeTask({ id: "b", files: ["src/x.ts"] }),
      makeTask({ id: "c", files: ["src/z.ts"] }),
    ];
    expect(pickBatch(frontier, 4).map((task) => task.id)).toEqual(["a", "c"]);
  });

  test("pickBatch respects and clamps maxParallel", () => {
    // Distinct files per task so the clamp is what's exercised, not file conflicts.
    const frontier = Array.from({ length: 12 }, (_, i) => makeTask({ id: `t${i}`, files: [`src/f${i}.ts`] }));
    expect(pickBatch(frontier, 2)).toHaveLength(2);
    expect(pickBatch(frontier, 99)).toHaveLength(8);
    expect(pickBatch(frontier, 0)).toHaveLength(1);
  });

  test("pickBatch runs a footprint-unknown task alone", () => {
    const frontier = [
      makeTask({ id: "a" }), // files omitted → unknown footprint
      makeTask({ id: "b", files: ["src/x.ts"] }),
      makeTask({ id: "c", files: ["src/y.ts"] }),
    ];
    expect(pickBatch(frontier, 4).map((task) => task.id)).toEqual(["a"]);
  });

  test("pickBatch fans out read-only (empty files) tasks together", () => {
    const frontier = [
      makeTask({ id: "a", files: [] }),
      makeTask({ id: "b", files: [] }),
      makeTask({ id: "c", files: ["src/x.ts"] }),
    ];
    expect(pickBatch(frontier, 4).map((task) => task.id)).toEqual(["a", "b", "c"]);
  });
});

describe("claim & retry (safe parallel orchestration)", () => {
  test("claimTasks flips only the named pending tasks to active", () => {
    const tasks = [
      makeTask({ id: "a" }),
      makeTask({ id: "b" }),
      makeTask({ id: "c", status: "verified" }),
    ];
    claimTasks(tasks, ["a", "c"], STAMP);
    expect(tasks.find((t) => t.id === "a")!.status).toBe("active"); // claimed
    expect(tasks.find((t) => t.id === "b")!.status).toBe("pending"); // not in the batch
    expect(tasks.find((t) => t.id === "c")!.status).toBe("verified"); // non-pending left alone
  });

  test("a claimed task is excluded from the next frontier (no double-spawn)", () => {
    const tasks = [makeTask({ id: "a" }), makeTask({ id: "b" })];
    claimTasks(tasks, ["a"], STAMP);
    expect(selectFrontier(tasks).map((t) => t.id)).toEqual(["b"]);
  });

  test("reactivateStaleActive resets leftover active claims to pending", () => {
    const tasks = [
      makeTask({ id: "a", status: "active" }),
      makeTask({ id: "b", status: "verified" }),
    ];
    expect(reactivateStaleActive(tasks, STAMP)).toBe(true);
    expect(tasks.find((t) => t.id === "a")!.status).toBe("pending");
    expect(tasks.find((t) => t.id === "b")!.status).toBe("verified");
    // No active tasks → no change reported.
    expect(reactivateStaleActive(tasks, STAMP)).toBe(false);
  });

  test("applyVerificationFailure requeues until the budget, then blocks", () => {
    const task = makeTask({ id: "a", status: "active" });
    for (let i = 1; i < MAX_VERIFY_ATTEMPTS; i++) {
      expect(applyVerificationFailure(task, STAMP)).toBe("pending");
      expect(task.attempts).toBe(i);
    }
    // The failure that reaches the budget blocks the task.
    expect(applyVerificationFailure(task, STAMP)).toBe("blocked");
    expect(task.attempts).toBe(MAX_VERIFY_ATTEMPTS);
  });
});

describe("ledger summary", () => {
  test("counts statuses and completion", () => {
    const tasks = [
      makeTask({ id: "a", status: "verified" }),
      makeTask({ id: "b", status: "done" }),
      makeTask({ id: "c", status: "blocked" }),
    ];
    const summary = summarizeLedger(tasks);
    expect(summary).toEqual({ total: 3, pending: 0, active: 0, done: 1, verified: 1, blocked: 1, failed: 0 });
    expect(allTasksComplete(tasks)).toBe(false);
    expect(allTasksComplete(tasks.slice(0, 2))).toBe(true);
    expect(allTasksComplete([])).toBe(false);
  });
});
