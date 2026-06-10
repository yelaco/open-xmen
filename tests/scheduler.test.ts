import { describe, expect, test } from "bun:test";
import {
  allTasksComplete,
  findDeadlockedTasks,
  hasFileConflict,
  isTaskComplete,
  pickBatch,
  selectFrontier,
  summarizeLedger,
} from "../src/workflow/scheduler.js";
import { makeTask } from "./helpers.js";

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

  test("tasks without declared files never conflict", () => {
    const a = makeTask({ id: "a" });
    const b = makeTask({ id: "b", files: ["src/x.ts"] });
    expect(hasFileConflict(a, b)).toBe(false);
    expect(hasFileConflict(b, a)).toBe(false);
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
    const frontier = Array.from({ length: 12 }, (_, i) => makeTask({ id: `t${i}` }));
    expect(pickBatch(frontier, 2)).toHaveLength(2);
    expect(pickBatch(frontier, 99)).toHaveLength(8);
    expect(pickBatch(frontier, 0)).toHaveLength(1);
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
