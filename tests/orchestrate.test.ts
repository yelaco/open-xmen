import { afterEach, describe, expect, test } from "bun:test";
import { routeReadyBatch } from "../src/workflow/orchestrate.js";
import { resetPresetCache } from "../src/config/models.js";
import { makeTask } from "./helpers.js";

afterEach(() => resetPresetCache());

describe("routeReadyBatch", () => {
  test("returns the dependency frontier with routing resolved", () => {
    const next = routeReadyBatch([
      makeTask({ id: "a", category: "quick" }),
      makeTask({ id: "b", category: "architecture" }),
    ]);
    expect(next.ready.map((t) => t.task_id).sort()).toEqual(["a", "b"]);
    const a = next.ready.find((t) => t.task_id === "a")!;
    const b = next.ready.find((t) => t.task_id === "b")!;
    expect(a).toMatchObject({ agent: "wolverine", model_slot: "workers" });
    expect(b).toMatchObject({ agent: "forge", model_slot: "planner" });
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

  test("effort overrides the dispatch model tier without changing the agent", () => {
    const low = routeReadyBatch([makeTask({ id: "a", category: "deep", effort: "low" })]).ready[0];
    const high = routeReadyBatch([makeTask({ id: "b", category: "deep", effort: "high" })]).ready[0];
    expect(low).toMatchObject({ agent: "wolverine", model_slot: "fast" });
    expect(high).toMatchObject({ agent: "wolverine", model_slot: "planner" });
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
