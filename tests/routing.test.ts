import { describe, expect, test } from "bun:test";
import { buildWorkerPrompt, resolveRoute, VISUAL_ENGINEERING_STAGES } from "../src/workflow/routing.js";
import { makeTask } from "./helpers.js";

describe("resolveRoute", () => {
  test("category routes win", () => {
    expect(resolveRoute(makeTask({ id: "a", category: "architecture" }))).toMatchObject({ kind: "single", agent: "forge" });
    expect(resolveRoute(makeTask({ id: "a", category: "explore" }))).toMatchObject({ kind: "single", agent: "nightcrawler" });
    expect(resolveRoute(makeTask({ id: "a", category: "research" }))).toMatchObject({ kind: "single", agent: "sage" });
    expect(resolveRoute(makeTask({ id: "a", category: "deep" }))).toMatchObject({ kind: "single", agent: "wolverine" });
    expect(resolveRoute(makeTask({ id: "a", category: "quick" }))).toMatchObject({ kind: "single", agent: "wolverine" });
  });

  test("visual-engineering routes to the three-stage chain", () => {
    const route = resolveRoute(makeTask({ id: "a", category: "visual-engineering" }));
    expect(route.kind).toBe("chain");
    if (route.kind === "chain") {
      expect(route.stages.map((stage) => stage.agent)).toEqual(["jean-grey", "wolverine", "storm"]);
    }
  });

  test("dispatchable owner is used when no category matches", () => {
    expect(resolveRoute(makeTask({ id: "a", owner: "Sage" }))).toMatchObject({ kind: "single", agent: "sage" });
    expect(resolveRoute(makeTask({ id: "a", owner: "jean grey" }))).toMatchObject({ kind: "single", agent: "jean-grey" });
  });

  test("cerebro/cyclops/unknown owners fall back to wolverine", () => {
    expect(resolveRoute(makeTask({ id: "a", owner: "cyclops" }))).toMatchObject({ kind: "single", agent: "wolverine" });
    expect(resolveRoute(makeTask({ id: "a", owner: "cerebro" }))).toMatchObject({ kind: "single", agent: "wolverine" });
    expect(resolveRoute(makeTask({ id: "a", owner: "Forge consultation" }))).toMatchObject({ kind: "single", agent: "wolverine" });
  });
});

describe("buildWorkerPrompt", () => {
  const task = makeTask({
    id: "task-1",
    subject: "build the widget",
    files: ["src/widget.ts"],
    verification_commands: ["bun test widget"],
  });

  test("includes task identity, files, verification, and the TASK_RESULT contract", () => {
    const prompt = buildWorkerPrompt({ task, runId: "r1", attempt: 1 });
    expect(prompt).toContain("TASK_ID: task-1");
    expect(prompt).toContain("RUN_ID: r1");
    expect(prompt).toContain("- src/widget.ts");
    expect(prompt).toContain("`bun test widget`");
    expect(prompt).toContain("TASK_RESULT:");
    expect(prompt).toContain("GOTCHAS:");
    expect(prompt).not.toContain("## RETRY");
  });

  test("includes gotchas and plan context when provided", () => {
    const prompt = buildWorkerPrompt({ task, runId: "r1", attempt: 1, gotchas: "- watch the cache", planExcerpt: "## Objective\nship it" });
    expect(prompt).toContain("watch the cache");
    expect(prompt).toContain("ship it");
  });

  test("retry attempts include the failure output", () => {
    const prompt = buildWorkerPrompt({ task, runId: "r1", attempt: 2, failureOutput: "Command failed: bun test widget\nexpected 2 got 3" });
    expect(prompt).toContain("## RETRY (attempt 2)");
    expect(prompt).toContain("expected 2 got 3");
  });

  test("design stage demands DESIGN_SPEC_READY instead of TASK_RESULT", () => {
    const prompt = buildWorkerPrompt({ task, runId: "r1", attempt: 1, stage: VISUAL_ENGINEERING_STAGES[0] });
    expect(prompt).toContain("DESIGN_SPEC_READY");
    expect(prompt).not.toContain("TASK_RESULT:");
  });

  test("structure and visual stages thread the chain context", () => {
    const structure = buildWorkerPrompt({
      task, runId: "r1", attempt: 1,
      stage: VISUAL_ENGINEERING_STAGES[1],
      stageContext: { designSpecPath: ".cerebro/notepads/design/spec.md" },
    });
    expect(structure).toContain("Jean Grey's design spec: .cerebro/notepads/design/spec.md");

    const visual = buildWorkerPrompt({
      task, runId: "r1", attempt: 1,
      stage: VISUAL_ENGINEERING_STAGES[2],
      stageContext: { designSpecPath: ".cerebro/notepads/design/spec.md", componentFiles: ["src/widget.ts"] },
    });
    expect(visual).toContain("Apply the design spec at: .cerebro/notepads/design/spec.md");
    expect(visual).toContain("Wolverine's components:");
  });
});
