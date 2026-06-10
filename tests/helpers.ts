import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { RuntimeContext, TaskRecord } from "../src/workflow/types.js";
import { summarizeTaskResult, terminalAssistantMarker } from "../src/workflow/results.js";
import { loadTasks, saveTasks } from "../src/workflow/fs.js";
import type { DispatchChildArgs, SessionRunner } from "../src/workflow/sessions.js";

export function makeTask(overrides: Partial<TaskRecord> & { id: string }): TaskRecord {
  return {
    subject: overrides.id,
    description: `do ${overrides.id}`,
    owner: "wolverine",
    status: "pending",
    depends_on: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    notes: [],
    verification: [],
    ...overrides,
  };
}

export function makeTestContext(): RuntimeContext {
  const dir = mkdtempSync(path.join(tmpdir(), "open-xmen-test-"));
  return { worktree: dir, directory: dir };
}

export function completedTaskResult(taskId: string, extra = ""): string {
  return [
    "TASK_RESULT:",
    "STATUS: completed",
    `TASK: ${taskId}`,
    "SUMMARY: did the thing",
    "FILES CHANGED:",
    "- src/example.ts",
    "TESTS RUN:",
    "- NOT RUN with reason: engine verifies",
    "VERIFICATION:",
    "- self-checked",
    "ISSUES:",
    "- NONE",
    extra,
  ].join("\n");
}

export type FakeSessions = {
  runner: SessionRunner;
  dispatches: DispatchChildArgs[];
  collects: Array<{ child_session_id: string; poll?: boolean }>;
  seedOutput(childSessionId: string, output: string): void;
};

// Mimics the real SessionRunner closely enough for engine tests: dispatch hands out
// child ids and records the prompt; collect returns the scripted output and, like the
// real collectChildSessionResult, applies a parsed TASK_RESULT status to the ledger.
export function createFakeSessions(
  ctx: RuntimeContext,
  outputFor: (args: DispatchChildArgs, callIndex: number) => string,
): FakeSessions {
  let counter = 0;
  const dispatches: DispatchChildArgs[] = [];
  const collects: Array<{ child_session_id: string; poll?: boolean }> = [];
  const outputs = new Map<string, string>();

  const runner: SessionRunner = {
    async dispatch(args) {
      dispatches.push(args);
      const id = `child-${counter++}`;
      outputs.set(id, outputFor(args, dispatches.length - 1));
      return { dispatched: true, child_session_id: id, agent: args.agent, task_id: args.task_id, model: "fake" };
    },
    async collect(args) {
      collects.push({ child_session_id: args.child_session_id, poll: args.poll });
      const output = outputs.get(args.child_session_id) ?? "";
      if (!output) {
        return { collected: false, child_session_id: args.child_session_id, message: "No assistant result found yet." };
      }
      const parsed = summarizeTaskResult(output);
      if (args.task_id && parsed.status) {
        const tasks = await loadTasks(ctx, args.run_id);
        const task = tasks.find((entry) => entry.id === args.task_id);
        if (task) {
          task.status = parsed.status;
          await saveTasks(ctx, args.run_id, tasks);
        }
      }
      return {
        collected: true,
        child_session_id: args.child_session_id,
        agent: args.agent,
        task_id: args.task_id,
        terminal_marker: terminalAssistantMarker(output) ?? "assistant_text",
        parsed,
        output,
      };
    },
  };

  return {
    runner,
    dispatches,
    collects,
    seedOutput(childSessionId, output) {
      outputs.set(childSessionId, output);
    },
  };
}
