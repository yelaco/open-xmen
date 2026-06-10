import { describe, expect, test } from "bun:test";
import { executeWorkflow } from "../src/workflow/engine.js";
import type { EngineDeps, EngineToolContext } from "../src/workflow/engine.js";
import { createEventRecorder } from "../src/workflow/events.js";
import { createTaskMutex, loadTasks, saveTasks, writeJson, manifestFile } from "../src/workflow/fs.js";
import type { Verifier } from "../src/workflow/verify.js";
import type { TaskRecord } from "../src/workflow/types.js";
import { completedTaskResult, createFakeSessions, makeTask, makeTestContext } from "./helpers.js";
import type { DispatchChildArgs } from "../src/workflow/sessions.js";

const RUN_ID = "test-run";

const passVerifier: Verifier = async (commands) => ({
  result: "PASS",
  commands: commands.map((command) => ({ command, exitCode: 0, pass: true, stdout: "", stderr: "", durationMs: 1, timedOut: false })),
});

function failVerifier(failTimes: number): Verifier {
  let calls = 0;
  return async (commands) => {
    calls += 1;
    if (calls <= failTimes) {
      return {
        result: "FAIL",
        commands: commands.map((command) => ({ command, exitCode: 1, pass: false, stdout: "", stderr: "boom", durationMs: 1, timedOut: false })),
        failureOutput: `Command failed (exit code 1): ${commands[0]}\nboom`,
      };
    }
    return passVerifier(commands, { cwd: "", timeoutMs: 0 });
  };
}

function auditAwareOutput(workerOutput: (args: DispatchChildArgs, index: number) => string) {
  return (args: DispatchChildArgs, index: number) =>
    args.agent === "cyclops" ? "AUDIT_PASSED\nRUN_ID: test-run\nNOTES:\n- NONE" : workerOutput(args, index);
}

async function setup(tasks: TaskRecord[], outputFor: (args: DispatchChildArgs, index: number) => string) {
  const ctx = makeTestContext();
  await writeJson(manifestFile(ctx, RUN_ID), { run_id: RUN_ID, objective: "test objective" });
  await saveTasks(ctx, RUN_ID, tasks);
  const mutex = createTaskMutex();
  const events = createEventRecorder(ctx, mutex);
  const fake = createFakeSessions(ctx, outputFor);
  const deps: Omit<EngineDeps, "verifier"> = { ctx, sessions: fake.runner, events, mutex };
  const toolContext: EngineToolContext = { sessionID: "parent", directory: ctx.directory, metadata: () => {} };
  return { ctx, deps, fake, toolContext };
}

function run(deps: Omit<EngineDeps, "verifier">, verifier: Verifier, toolContext: EngineToolContext, args: Record<string, unknown> = {}) {
  return executeWorkflow({ ...deps, verifier }, { run_id: RUN_ID, ...args }, toolContext);
}

describe("executeWorkflow", () => {
  test("happy path: dependency waves, verification, single audit", async () => {
    const tasks = [
      makeTask({ id: "t1", category: "quick", verification_commands: ["true"] }),
      makeTask({ id: "t2", category: "quick", depends_on: ["t1"] }),
    ];
    const { ctx, deps, fake, toolContext } = await setup(tasks, auditAwareOutput((args) => completedTaskResult(args.task_id ?? "")));

    const result = await run(deps, passVerifier, toolContext);

    expect(result.status).toBe("complete");
    expect(result.waves).toBe(2);
    expect(result.audit?.verdict).toBe("AUDIT_PASSED");
    expect(result.tasks).toMatchObject({ total: 2, verified: 1, done: 1 });
    expect(result.verification).toMatchObject({ commands_run: 1, passed: 1, failed: 0 });

    const cyclopsDispatches = fake.dispatches.filter((dispatch) => dispatch.agent === "cyclops");
    expect(cyclopsDispatches).toHaveLength(1);
    expect(cyclopsDispatches[0].prompt).toContain("OBJECTIVE: test objective");

    const ledger = await loadTasks(ctx, RUN_ID);
    expect(ledger.find((task) => task.id === "t1")?.status).toBe("verified");
    expect(ledger.find((task) => task.id === "t2")?.status).toBe("done");
    expect(ledger.find((task) => task.id === "t1")?.child_session_id).toBeDefined();
  });

  test("parallel wave respects file conflicts", async () => {
    const tasks = [
      makeTask({ id: "t1", files: ["src/a.ts"] }),
      makeTask({ id: "t2", files: ["src/a.ts"] }),
      makeTask({ id: "t3", files: ["src/b.ts"] }),
    ];
    const { deps, fake, toolContext } = await setup(tasks, auditAwareOutput((args) => completedTaskResult(args.task_id ?? "")));

    const result = await run(deps, passVerifier, toolContext, { audit: false });

    expect(result.status).toBe("complete");
    expect(result.waves).toBe(2);
    expect(result.audit?.verdict).toBe("SKIPPED");
    expect(fake.dispatches.filter((dispatch) => dispatch.agent !== "cyclops")).toHaveLength(3);
  });

  test("verification failure retries with failure output, then passes", async () => {
    const tasks = [makeTask({ id: "t1", verification_commands: ["check"] })];
    const { ctx, deps, fake, toolContext } = await setup(tasks, auditAwareOutput((args) => completedTaskResult(args.task_id ?? "")));

    const result = await run(deps, failVerifier(1), toolContext, { audit: false });

    expect(result.status).toBe("complete");
    expect(result.retries).toBe(1);
    const workerDispatches = fake.dispatches.filter((dispatch) => dispatch.agent === "wolverine");
    expect(workerDispatches).toHaveLength(2);
    expect(workerDispatches[1].prompt).toContain("## RETRY (attempt 2)");
    expect(workerDispatches[1].prompt).toContain("boom");

    const ledger = await loadTasks(ctx, RUN_ID);
    expect(ledger[0].status).toBe("verified");
    expect(ledger[0].attempts).toBe(2);
  });

  test("max retries exhausted blocks the task and records a problem", async () => {
    const tasks = [makeTask({ id: "t1", verification_commands: ["check"] })];
    const { ctx, deps, toolContext } = await setup(tasks, auditAwareOutput((args) => completedTaskResult(args.task_id ?? "")));

    const result = await run(deps, failVerifier(99), toolContext, { audit: false, max_retries: 1 });

    expect(result.status).toBe("blocked");
    expect(result.problems_reported).toBeGreaterThanOrEqual(1);
    expect(result.blocked_tasks.map((entry) => entry.task_id)).toEqual(["t1"]);

    const ledger = await loadTasks(ctx, RUN_ID);
    expect(ledger[0].status).toBe("blocked");
    expect(ledger[0].attempts).toBe(2);
  });

  test("worker STATUS: blocked short-circuits without retry", async () => {
    const tasks = [makeTask({ id: "t1" })];
    const { deps, fake, toolContext } = await setup(tasks, auditAwareOutput(() =>
      "TASK_RESULT:\nSTATUS: blocked\nTASK: t1\nSUMMARY: missing credentials\nISSUES:\n- need API key"));

    const result = await run(deps, passVerifier, toolContext, { audit: false });

    expect(result.status).toBe("blocked");
    expect(result.retries).toBe(0);
    expect(fake.dispatches.filter((dispatch) => dispatch.agent === "wolverine")).toHaveLength(1);
  });

  test("abort stops the loop and resets active tasks to pending", async () => {
    const controller = new AbortController();
    const tasks = [
      makeTask({ id: "t1" }),
      makeTask({ id: "t2", depends_on: ["t1"] }),
    ];
    const { ctx, deps, toolContext } = await setup(tasks, auditAwareOutput((args) => {
      controller.abort();
      return completedTaskResult(args.task_id ?? "");
    }));

    const result = await run(deps, passVerifier, { ...toolContext, abort: controller.signal });

    expect(result.status).toBe("aborted");
    const ledger = await loadTasks(ctx, RUN_ID);
    expect(ledger.find((task) => task.id === "t2")?.status).toBe("pending");
  });

  test("resume collects a pre-existing active child session before dispatching anything", async () => {
    const tasks = [makeTask({
      id: "t1",
      status: "active",
      attempts: 1,
      child_session_id: "pre-1",
      verification_commands: ["check"],
    })];
    const { ctx, deps, fake, toolContext } = await setup(tasks, auditAwareOutput((args) => completedTaskResult(args.task_id ?? "")));
    fake.seedOutput("pre-1", completedTaskResult("t1"));

    const result = await run(deps, passVerifier, toolContext, { audit: false });

    expect(result.status).toBe("complete");
    expect(fake.collects[0]).toMatchObject({ child_session_id: "pre-1", poll: false });
    expect(fake.dispatches.filter((dispatch) => dispatch.agent === "wolverine")).toHaveLength(0);

    const ledger = await loadTasks(ctx, RUN_ID);
    expect(ledger[0].status).toBe("verified");
  });

  test("resume resets a dead active session to pending and re-dispatches", async () => {
    const tasks = [makeTask({ id: "t1", status: "active", attempts: 1, child_session_id: "dead-1" })];
    const { deps, fake, toolContext } = await setup(tasks, auditAwareOutput((args) => completedTaskResult(args.task_id ?? "")));

    const result = await run(deps, passVerifier, toolContext, { audit: false });

    expect(result.status).toBe("complete");
    expect(fake.dispatches.filter((dispatch) => dispatch.agent === "wolverine")).toHaveLength(1);
  });

  test("visual-engineering chain runs design→structure→visual with one verification", async () => {
    const tasks = [makeTask({ id: "t1", category: "visual-engineering", verification_commands: ["check"] })];
    let verifierCalls = 0;
    const countingVerifier: Verifier = async (commands, opts) => {
      verifierCalls += 1;
      return passVerifier(commands, opts);
    };
    const { ctx, deps, fake, toolContext } = await setup(tasks, auditAwareOutput((args) => {
      if (args.agent === "jean-grey") return "DESIGN_SPEC_READY\nSpec: .cerebro/notepads/design/widget.md";
      if (args.agent === "wolverine") return completedTaskResult("t1").replace("- src/example.ts", "- src/widget.tsx");
      return completedTaskResult("t1");
    }));

    const result = await run(deps, countingVerifier, toolContext, { audit: false });

    expect(result.status).toBe("complete");
    expect(verifierCalls).toBe(1);
    const agents = fake.dispatches.map((dispatch) => dispatch.agent);
    expect(agents).toEqual(["jean-grey", "wolverine", "storm"]);
    expect(fake.dispatches[1].prompt).toContain(".cerebro/notepads/design/widget.md");
    expect(fake.dispatches[2].prompt).toContain(".cerebro/notepads/design/widget.md");
    expect(fake.dispatches[2].prompt).toContain("src/widget.tsx");

    const ledger = await loadTasks(ctx, RUN_ID);
    expect(ledger[0].chain_state?.design_spec_path).toBe(".cerebro/notepads/design/widget.md");
    expect(ledger[0].chain_state?.completed_stages).toEqual(["design", "structure", "visual"]);
  });

  test("AUDIT_FAILED with retriable finding re-queues the task and re-audits once", async () => {
    const tasks = [makeTask({ id: "t1" })];
    let auditCalls = 0;
    const { deps, fake, toolContext } = await setup(tasks, (args) => {
      if (args.agent === "cyclops") {
        auditCalls += 1;
        if (auditCalls === 1) {
          return [
            "AUDIT_FAILED",
            "FINDINGS:",
            "```json",
            JSON.stringify([{ severity: "major", task_id: "t1", criterion: "coverage", evidence: "no test", recommendation: "add a test", retriable: true }]),
            "```",
          ].join("\n");
        }
        return "AUDIT_PASSED\nNOTES:\n- NONE";
      }
      return completedTaskResult(args.task_id ?? "");
    });

    const result = await run(deps, passVerifier, toolContext);

    expect(result.status).toBe("complete");
    expect(result.audit?.verdict).toBe("AUDIT_PASSED");
    expect(auditCalls).toBe(2);
    expect(fake.dispatches.filter((dispatch) => dispatch.agent === "wolverine")).toHaveLength(2);
    expect(result.problems_reported).toBeGreaterThanOrEqual(1);
  });

  test("AUDIT_FAILED with non-retriable findings blocks the run", async () => {
    const tasks = [makeTask({ id: "t1" })];
    const { deps, toolContext } = await setup(tasks, (args) => {
      if (args.agent === "cyclops") {
        return "AUDIT_FAILED\nFINDINGS:\n```json\n" +
          JSON.stringify([{ severity: "critical", task_id: null, criterion: "design", evidence: "wrong approach", retriable: false }]) +
          "\n```";
      }
      return completedTaskResult(args.task_id ?? "");
    });

    const result = await run(deps, passVerifier, toolContext);

    expect(result.status).toBe("blocked");
    expect(result.audit?.verdict).toBe("AUDIT_FAILED");
    expect(result.audit?.findings).toHaveLength(1);
  });

  test("empty ledger reports a problem and blocks", async () => {
    const { deps, toolContext } = await setup([], auditAwareOutput(() => ""));
    const result = await run(deps, passVerifier, toolContext);
    expect(result.status).toBe("blocked");
    expect(result.problems_reported).toBe(1);
  });

  test("dependency deadlock from a blocked dep reports a problem", async () => {
    const tasks = [
      makeTask({ id: "t1", status: "blocked" }),
      makeTask({ id: "t2", depends_on: ["t1"] }),
    ];
    const { deps, toolContext } = await setup(tasks, auditAwareOutput(() => ""));
    const result = await run(deps, passVerifier, toolContext);
    expect(result.status).toBe("blocked");
    expect(result.blocked_tasks.map((entry) => entry.task_id)).toContain("t1");
  });
});
