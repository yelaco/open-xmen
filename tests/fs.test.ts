import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadTasks, saveTasks, taskFile } from "../src/workflow/fs.js";
import { makeTask, makeTestContext } from "./helpers.js";
import type { RuntimeContext } from "../src/workflow/types.js";

describe("task ledger durability", () => {
  let ctx: RuntimeContext;
  afterEach(() => {
    if (ctx) rmSync(ctx.directory, { recursive: true, force: true });
  });

  test("save → load round-trips and leaves no temp file behind", async () => {
    ctx = makeTestContext();
    await saveTasks(ctx, "run1", [makeTask({ id: "a" })]);
    expect((await loadTasks(ctx, "run1")).map((t) => t.id)).toEqual(["a"]);
    const dir = path.dirname(taskFile(ctx, "run1"));
    expect(readdirSync(dir).some((f) => f.endsWith(".tmp"))).toBe(false);
  });

  test("keeps a .bak of the prior ledger and recovers from a corrupt primary", async () => {
    ctx = makeTestContext();
    await saveTasks(ctx, "run1", [makeTask({ id: "a", status: "verified" })]);
    // Second save snapshots the first as .bak.
    await saveTasks(ctx, "run1", [makeTask({ id: "a", status: "verified" }), makeTask({ id: "b" })]);
    const file = taskFile(ctx, "run1");
    expect(existsSync(`${file}.bak`)).toBe(true);

    // Simulate a torn write: corrupt the primary ledger.
    writeFileSync(file, "{ this is not json", "utf8");
    const recovered = await loadTasks(ctx, "run1");
    // Falls back to the last-good backup (the single-task ledger) instead of throwing.
    expect(recovered.map((t) => t.id)).toEqual(["a"]);
  });

  test("missing ledger loads as empty", async () => {
    ctx = makeTestContext();
    expect(await loadTasks(ctx, "never-created")).toEqual([]);
  });

  test("corrupt primary with no backup throws a clear error", async () => {
    ctx = makeTestContext();
    const file = taskFile(ctx, "run1");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "nonsense", "utf8");
    let message = "";
    try {
      await loadTasks(ctx, "run1");
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toMatch(/corrupt/i);
  });
});
