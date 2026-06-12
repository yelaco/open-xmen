import { afterEach, describe, expect, test } from "bun:test";
import { routeReadyBatch } from "../src/workflow/orchestrate.js";
import { resetPresetCache } from "../src/config/models.js";
import { makeTask } from "./helpers.js";

afterEach(() => resetPresetCache());

describe("routeReadyBatch", () => {
  test("returns the dependency frontier with routing resolved", () => {
    const next = routeReadyBatch([
      makeTask({ id: "a", category: "quick", files: ["src/a.ts"] }),
      makeTask({ id: "b", category: "architecture", files: ["src/b.ts"] }),
    ]);
    expect(next.ready.map((t) => t.task_id).sort()).toEqual(["a", "b"]);
    const a = next.ready.find((t) => t.task_id === "a")!;
    const b = next.ready.find((t) => t.task_id === "b")!;
    expect(a).toMatchObject({ agent: "wolverine" });
    expect(b).toMatchObject({ agent: "forge" });
    expect(next.remaining).toBe(2);
    expect(next.blocked).toBe(false);
  });

  test("schedules an undeclared-files task alone, not in a parallel wave", () => {
    const next = routeReadyBatch([
      makeTask({ id: "a" }), // no files → unknown footprint
      makeTask({ id: "b" }),
    ]);
    expect(next.ready.map((t) => t.task_id)).toEqual(["a"]);
    expect(next.remaining).toBe(2);
    expect(next.blocked).toBe(false);
  });

  test("withholds tasks whose deps aren't complete", () => {
    const next = routeReadyBatch([
      makeTask({ id: "a", status: "active" }),
      makeTask({ id: "b", depends_on: ["a"] }),
    ]);
    expect(next.ready).toEqual([]);
    expect(next.remaining).toBe(2);
  });

  test("never co-schedules tasks that share declared files", () => {
    const next = routeReadyBatch([
      makeTask({ id: "a", files: ["src/x.ts"] }),
      makeTask({ id: "b", files: ["src/x.ts"] }),
      makeTask({ id: "c", files: ["src/y.ts"] }),
    ]);
    expect(next.ready.map((t) => t.task_id)).toEqual(["a", "c"]);
  });

  test("visual-engineering returns the sequential agent chain", () => {
    const next = routeReadyBatch([makeTask({ id: "a", category: "visual-engineering" })]);
    const t = next.ready[0];
    expect(t.agent).toBe("jean-grey");
    expect(t.chain?.map((s) => s.agent)).toEqual(["jean-grey", "wolverine", "storm"]);
  });

  test("flags a deadlock when the frontier is empty and a dep is blocked", () => {
    const next = routeReadyBatch([
      makeTask({ id: "a", status: "blocked" }),
      makeTask({ id: "b", depends_on: ["a"] }),
    ]);
    expect(next.ready).toEqual([]);
    expect(next.blocked).toBe(true);
    expect(next.deadlocked.map((d) => d.task_id)).toContain("b");
  });

  test("all-complete ledger yields empty ready, zero remaining, not blocked", () => {
    const next = routeReadyBatch([
      makeTask({ id: "a", status: "verified" }),
      makeTask({ id: "b", status: "done" }),
    ]);
    expect(next.ready).toEqual([]);
    expect(next.remaining).toBe(0);
    expect(next.blocked).toBe(false);
  });
});
