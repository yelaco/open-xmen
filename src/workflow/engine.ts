import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { AGENT_MODEL_SLOTS, effortModelSlot } from "../config/models.js";
import {
  appendText,
  failuresFile,
  gotchasFile,
  loadTasks,
  manifestFile,
  now,
  problemsFile,
  readJson,
  saveTasks,
  verificationLogFile,
} from "./fs.js";
import type { TaskMutex } from "./fs.js";
import { parseAuditVerdict, parseDesignSpecPath, parseGotchas } from "./results.js";
import type { AuditFinding } from "./results.js";
import { allTasksComplete, findDeadlockedTasks, pickBatch, selectFrontier, summarizeLedger } from "./scheduler.js";
import type { LedgerSummary } from "./scheduler.js";
import { buildWorkerPrompt, resolveRoute } from "./routing.js";
import type { EventRecorder } from "./events.js";
import type { CollectResult, SessionRunner } from "./sessions.js";
import type { Verifier } from "./verify.js";
import type { RuntimeContext, TaskRecord, ToolProgressContext } from "./types.js";

export type WorkflowArgs = {
  run_id: string;
  max_parallel?: number;
  max_retries?: number;
  stop_on_blocker?: boolean;
  audit?: boolean;
  verification_timeout_seconds?: number;
  overall_timeout_minutes?: number;
  plan_path?: string;
};

export type WorkflowResult = {
  status: "complete" | "blocked" | "aborted" | "timeout";
  run_id: string;
  waves: number;
  tasks: LedgerSummary;
  verification: { commands_run: number; passed: number; failed: number };
  retries: number;
  problems_reported: number;
  audit: { verdict: "AUDIT_PASSED" | "AUDIT_FAILED" | "SKIPPED" | "UNAVAILABLE"; findings: AuditFinding[] } | null;
  blocked_tasks: Array<{ task_id: string; reason: string }>;
};

export type EngineToolContext = { sessionID: string; directory: string; abort?: AbortSignal } & ToolProgressContext;

export type EngineDeps = {
  ctx: RuntimeContext;
  sessions: SessionRunner;
  verifier: Verifier;
  events: EventRecorder;
  mutex: TaskMutex;
  sleep?: (ms: number) => Promise<void>;
};

const DEFAULTS = {
  max_parallel: 4,
  max_retries: 2,
  stop_on_blocker: true,
  audit: true,
  verification_timeout_seconds: 600,
  overall_timeout_minutes: 360,
} as const;

const AUDIT_RETRY_BUDGET = 1;

type TaskOutcome = "complete" | "blocked" | "aborted";

export async function executeWorkflow(
  deps: EngineDeps,
  args: WorkflowArgs,
  toolContext: EngineToolContext,
): Promise<WorkflowResult> {
  const { ctx, sessions, verifier, events, mutex } = deps;
  const { recordProgress, recordProblem } = events;
  const runId = args.run_id;
  const maxParallel = Math.max(1, Math.min(8, args.max_parallel ?? DEFAULTS.max_parallel));
  const maxRetries = Math.max(0, Math.min(5, args.max_retries ?? DEFAULTS.max_retries));
  const stopOnBlocker = args.stop_on_blocker ?? DEFAULTS.stop_on_blocker;
  const auditEnabled = args.audit ?? DEFAULTS.audit;
  const verificationTimeoutMs = (args.verification_timeout_seconds ?? DEFAULTS.verification_timeout_seconds) * 1000;
  const deadlineAt = Date.now() + (args.overall_timeout_minutes ?? DEFAULTS.overall_timeout_minutes) * 60 * 1000;
  const projectRoot = ctx.worktree || ctx.directory;

  const stats = {
    waves: 0,
    retries: 0,
    problems: 0,
    verification: { commands_run: 0, passed: 0, failed: 0 },
  };

  async function reportProblem(problem: Parameters<EventRecorder["recordProblem"]>[1]) {
    stats.problems += 1;
    return recordProblem(runId, problem, toolContext).catch(() => undefined);
  }

  async function mutateTask(taskId: string, fn: (task: TaskRecord) => void): Promise<TaskRecord> {
    return mutex.serialize(runId, async () => {
      const tasks = await loadTasks(ctx, runId);
      const task = tasks.find((entry) => entry.id === taskId);
      if (!task) throw new Error(`Unknown task ${taskId}`);
      fn(task);
      task.updated_at = now();
      await saveTasks(ctx, runId, tasks);
      return task;
    });
  }

  let planExcerpt: string | undefined;
  if (args.plan_path) {
    try {
      planExcerpt = await readFile(path.resolve(projectRoot, args.plan_path), "utf8");
    } catch {
      planExcerpt = undefined;
    }
  }

  async function readGotchas(): Promise<string | undefined> {
    const file = gotchasFile(ctx, runId);
    if (!existsSync(file)) return undefined;
    try {
      return await readFile(file, "utf8");
    } catch {
      return undefined;
    }
  }

  async function appendGotchas(agent: string, taskId: string, gotchas: string[]) {
    if (gotchas.length === 0) return;
    const block = `\n## ${now()} — ${agent} (${taskId})\n${gotchas.map((item) => `- ${item}`).join("\n")}\n`;
    await appendText(gotchasFile(ctx, runId), block).catch(() => undefined);
  }

  function aborted() {
    return Boolean(toolContext.abort?.aborted);
  }

  function pastDeadline() {
    return Date.now() >= deadlineAt;
  }

  // ── Single dispatch+collect round trip for one agent ────────────────────────

  async function dispatchAndCollect(
    task: TaskRecord,
    agent: string,
    modelSlot: string,
    prompt: string,
    description: string,
  ): Promise<CollectResult | { collected: false; error: string; child_session_id?: string }> {
    const dispatched = await sessions.dispatch({
      run_id: runId,
      task_id: task.id,
      agent,
      description,
      prompt,
      model_slot: modelSlot,
    }, toolContext);
    if (!dispatched.dispatched || !dispatched.child_session_id) {
      return { collected: false, error: dispatched.error ?? "dispatch failed" };
    }
    await mutateTask(task.id, (record) => {
      record.child_session_id = dispatched.child_session_id;
    });
    return sessions.collect({
      run_id: runId,
      child_session_id: dispatched.child_session_id,
      agent,
      task_id: task.id,
      poll: true,
    }, toolContext);
  }

  // ── Verification gate ────────────────────────────────────────────────────────

  async function verifyTask(task: TaskRecord): Promise<{ passed: boolean; failureOutput?: string }> {
    const commands = task.verification_commands ?? [];
    if (commands.length === 0) return { passed: true };
    await recordProgress(runId, {
      phase: "verification",
      status: "running",
      message: `running ${commands.length} command(s) for ${task.id}`,
      task_id: task.id,
    }, toolContext);
    const outcome = await verifier(commands, {
      cwd: projectRoot,
      timeoutMs: verificationTimeoutMs,
      signal: toolContext.abort,
    });
    stats.verification.commands_run += outcome.commands.length;
    stats.verification.passed += outcome.commands.filter((command) => command.pass).length;
    stats.verification.failed += outcome.commands.filter((command) => !command.pass).length;

    await mutateTask(task.id, (record) => {
      for (const command of outcome.commands) {
        record.verification.push({
          at: now(),
          result: command.pass ? "PASS" : "FAIL",
          command: command.command,
          notes: [command.stdout, command.stderr].filter(Boolean).join("\n").slice(-2000) || undefined,
        });
      }
    });

    const log = outcome.commands.map((command) =>
      `\n## ${now()} — ${task.id}: \`${command.command}\` → ${command.pass ? "PASS" : "FAIL"} (exit ${command.exitCode}${command.timedOut ? ", timed out" : ""})\n\`\`\`text\n${[command.stdout, command.stderr].filter(Boolean).join("\n").slice(-4000)}\n\`\`\`\n`
    ).join("");
    await appendText(verificationLogFile(ctx, runId), log).catch(() => undefined);

    if (outcome.result === "PASS") {
      await recordProgress(runId, {
        phase: "verification",
        status: "completed",
        message: `PASS: ${task.id} (${outcome.commands.length} command(s))`,
        task_id: task.id,
      }, toolContext);
      return { passed: true };
    }
    await appendText(failuresFile(ctx, runId), `\n## ${now()} — ${task.id}\n${outcome.failureOutput ?? "verification failed"}\n`).catch(() => undefined);
    await recordProgress(runId, {
      phase: "verification",
      status: "failed",
      message: `FAIL: ${task.id}`,
      task_id: task.id,
      detail: outcome.failureOutput?.slice(0, 500),
    }, toolContext);
    return { passed: false, failureOutput: outcome.failureOutput };
  }

  // ── One attempt of one task (single agent or visual-engineering chain) ───────

  type AttemptResult =
    | { kind: "ok"; output: string }
    | { kind: "blocked"; reason: string }
    | { kind: "failed"; failureOutput: string };

  async function runAttempt(task: TaskRecord, attempt: number, failureOutput?: string): Promise<AttemptResult> {
    const route = resolveRoute(task);
    const gotchas = await readGotchas();

    if (route.kind === "single") {
      const prompt = buildWorkerPrompt({ task, runId, attempt, planExcerpt, gotchas, failureOutput });
      // A per-task effort override remaps the dispatch model tier (low→fast, high→top) without
      // changing the agent. Chains keep their built-in per-stage tiering.
      const modelSlot = effortModelSlot(task.effort, route.modelSlot);
      const result = await dispatchAndCollect(task, route.agent, modelSlot, prompt, task.subject);
      return interpretWorkerResult(route.agent, result);
    }

    // visual-engineering chain: design → structure → visual, persisted in chain_state so a
    // retry/resume skips completed stages. A retry keeps the design spec but redoes the build.
    const completed = new Set(task.chain_state?.completed_stages ?? []);
    let designSpecPath = task.chain_state?.design_spec_path;
    let componentFiles = task.chain_state?.component_files;
    let lastOutput = "";

    for (const stage of route.stages) {
      if (completed.has(stage.name)) continue;
      if (aborted()) return { kind: "failed", failureOutput: "aborted between chain stages" };
      const prompt = buildWorkerPrompt({
        task,
        runId,
        attempt,
        planExcerpt,
        gotchas: await readGotchas(),
        failureOutput: stage.name === "design" ? undefined : failureOutput,
        stage,
        stageContext: { designSpecPath, componentFiles },
      });
      const result = await dispatchAndCollect(task, stage.agent, stage.modelSlot, prompt, `${task.subject} (${stage.name})`);
      const interpreted = interpretWorkerResult(stage.agent, result);
      if (interpreted.kind !== "ok") return interpreted;
      lastOutput = interpreted.output;

      if (stage.name === "design") {
        designSpecPath = parseDesignSpecPath(interpreted.output) ?? designSpecPath;
      }
      if (stage.name === "structure" && result.collected && result.parsed?.files?.length) {
        componentFiles = result.parsed.files;
      }
      await mutateTask(task.id, (record) => {
        record.chain_state = {
          ...(record.chain_state ?? {}),
          ...(designSpecPath ? { design_spec_path: designSpecPath } : {}),
          ...(componentFiles ? { component_files: componentFiles } : {}),
          completed_stages: [...(record.chain_state?.completed_stages?.filter((name) => name !== stage.name) ?? []), stage.name],
        };
      });
      await appendGotchas(stage.agent, task.id, parseGotchas(interpreted.output));
    }
    return { kind: "ok", output: lastOutput };
  }

  function interpretWorkerResult(
    agent: string,
    result: CollectResult | { collected: false; error: string },
  ): AttemptResult {
    if (!result.collected) {
      const reason = "error" in result && result.error
        ? result.error
        : "timed_out" in result && result.timed_out
          ? "worker timed out without a terminal marker"
          : ("message" in result ? result.message : undefined) ?? "no result collected";
      return { kind: "failed", failureOutput: `${agent} produced no usable result: ${reason}` };
    }
    const output = result.output ?? "";
    const status = result.parsed?.status;
    if (status === "blocked") {
      return { kind: "blocked", reason: result.parsed?.summary || `${agent} reported STATUS: blocked` };
    }
    if (status === "failed") {
      return { kind: "failed", failureOutput: `${agent} reported STATUS: failed\n${output.slice(-2000)}` };
    }
    return { kind: "ok", output };
  }

  // ── Full lifecycle of one task: attempts, verification, retries ─────────────

  async function executeTask(task: TaskRecord): Promise<TaskOutcome> {
    let failureOutput: string | undefined;

    while (true) {
      if (aborted()) return "aborted";
      const attempt = ((await mutateTask(task.id, (record) => {
        record.status = "active";
        record.attempts = (record.attempts ?? 0) + 1;
        record.notes.push(`${now()} engine attempt ${(record.attempts ?? 1)} started`);
      })).attempts) ?? 1;

      if (attempt > 1) {
        stats.retries += 1;
        await recordProgress(runId, {
          phase: "retry",
          status: "running",
          message: `${task.id} attempt ${attempt}`,
          task_id: task.id,
        }, toolContext);
        // A chain retry keeps the design spec but rebuilds structure and visuals.
        await mutateTask(task.id, (record) => {
          if (record.chain_state?.completed_stages) {
            record.chain_state.completed_stages = record.chain_state.completed_stages.filter((name) => name === "design");
          }
        });
      }

      const current = await mutex.serialize(runId, async () => {
        const tasks = await loadTasks(ctx, runId);
        return tasks.find((entry) => entry.id === task.id) ?? task;
      });
      const result = await runAttempt(current, attempt, failureOutput);

      if (result.kind === "blocked") {
        await mutateTask(task.id, (record) => {
          record.status = "blocked";
          record.notes.push(`${now()} blocked: ${result.reason}`);
        });
        await reportProblem({
          title: `Task ${task.id} blocked: ${task.subject}`,
          severity: "blocker",
          source: "workflow-engine",
          task_id: task.id,
          evidence: result.reason,
          recommendation: "Resolve the blocker, set the task back to pending with cerebro_task_update, and re-run cerebro_execute_workflow.",
        });
        return "blocked";
      }

      if (result.kind === "ok") {
        await appendGotchas(task.owner, task.id, parseGotchas(result.output));
        const verification = await verifyTask(current);
        if (verification.passed) {
          await mutateTask(task.id, (record) => {
            record.status = (record.verification_commands?.length) ? "verified" : "done";
            record.notes.push(`${now()} engine marked ${(record.verification_commands?.length) ? "verified" : "done"} after attempt ${attempt}`);
          });
          return "complete";
        }
        failureOutput = verification.failureOutput;
      } else {
        failureOutput = result.failureOutput;
      }

      if (aborted()) return "aborted";
      if (attempt > maxRetries) {
        await mutateTask(task.id, (record) => {
          record.status = "blocked";
          record.notes.push(`${now()} blocked after ${attempt} attempt(s); last failure: ${(failureOutput ?? "unknown").slice(0, 500)}`);
        });
        await reportProblem({
          title: `Task ${task.id} failed after ${attempt} attempt(s): ${task.subject}`,
          severity: "blocker",
          source: "workflow-engine",
          task_id: task.id,
          evidence: failureOutput,
          recommendation: "Inspect the failure output, fix or re-scope the task, set it back to pending, and re-run cerebro_execute_workflow.",
        });
        return "blocked";
      }
      await mutateTask(task.id, (record) => {
        record.status = "pending";
        record.notes.push(`${now()} attempt ${attempt} failed; retry scheduled`);
      });
    }
  }

  // ── Resume pass: reconcile in-flight state from a previous engine invocation ─

  async function resumePass() {
    const tasks = await loadTasks(ctx, runId);
    for (const task of tasks) {
      if (aborted()) return;
      if (task.status === "active") {
        let recovered = false;
        if (task.child_session_id) {
          await recordProgress(runId, {
            phase: "resume",
            status: "running",
            message: `checking in-flight ${task.id} (${task.child_session_id})`,
            task_id: task.id,
          }, toolContext);
          const peek = await sessions.collect({
            run_id: runId,
            child_session_id: task.child_session_id,
            agent: task.owner,
            task_id: task.id,
            poll: false,
          }, toolContext);
          if (peek.collected && peek.terminal_marker && peek.terminal_marker !== "assistant_text") {
            // recordAgentResult inside collect already updated the task status from TASK_RESULT.
            recovered = true;
          } else if (peek.collected) {
            // Assistant output exists but no terminal marker yet — the child may still be
            // working, so wait for it properly.
            const polled = await sessions.collect({
              run_id: runId,
              child_session_id: task.child_session_id,
              agent: task.owner,
              task_id: task.id,
              poll: true,
            }, toolContext);
            recovered = polled.collected === true;
          }
        }
        if (!recovered) {
          await mutateTask(task.id, (record) => {
            record.status = "pending";
            record.notes.push(`${now()} reset to pending on resume; previous child session ${record.child_session_id ?? "unknown"} had no usable result`);
          });
        }
      }
      if (task.status === "failed" && (task.attempts ?? 0) <= maxRetries) {
        await mutateTask(task.id, (record) => {
          record.status = "pending";
          record.notes.push(`${now()} failed task reset to pending on resume`);
        });
      }
    }
    // Tasks that landed on done with pending verification (e.g. recovered above) get the gate now.
    const after = await loadTasks(ctx, runId);
    for (const task of after) {
      if (task.status === "done" && task.verification_commands?.length) {
        const verification = await verifyTask(task);
        await mutateTask(task.id, (record) => {
          record.status = verification.passed ? "verified" : "pending";
          record.notes.push(`${now()} resume verification ${verification.passed ? "passed" : "failed; re-queued"}`);
        });
      }
    }
  }

  // ── Audit wave ────────────────────────────────────────────────────────────────

  async function runAuditWave(): Promise<WorkflowResult["audit"]> {
    if (!auditEnabled) return { verdict: "SKIPPED", findings: [] };
    const tasks = await loadTasks(ctx, runId);
    const manifest = await readJson<{ objective?: string }>(manifestFile(ctx, runId), {});
    const problemsCount = existsSync(problemsFile(ctx, runId))
      ? (await readFile(problemsFile(ctx, runId), "utf8")).split("\n").filter(Boolean).length
      : 0;

    const taskTable = tasks.map((task) => {
      const verifications = task.verification.slice(-3).map((entry) => `${entry.result}: ${entry.command ?? "manual"}`).join("; ") || "none recorded";
      return `- ${task.id} [${task.status}] (${task.owner}, ${task.attempts ?? 1} attempt(s)): ${task.subject}\n  files: ${(task.files ?? []).join(", ") || "undeclared"}\n  verification: ${verifications}`;
    }).join("\n");

    const prompt = [
      `## Final Audit Request`,
      ``,
      `RUN_ID: ${runId}`,
      `OBJECTIVE: ${manifest.objective ?? "(read the run manifest)"}`,
      args.plan_path ? `PLAN: ${args.plan_path}` : `PLAN: locate the active plan under .cerebro/plans/`,
      `TASK SUMMARIES:`,
      taskTable,
      ``,
      `NOTEPADS: gotchas/verification/failures under .cerebro/notepads/${runId}/ (if present)`,
      `OPEN PROBLEM RECORDS: ${problemsCount} in .cerebro/team-runs/${runId}.problems.jsonl`,
      ``,
      `Every task above is done and verified by the workflow engine. You are the final gate:`,
      `inspect the diff (git diff, git status), cross-check verification evidence against the`,
      `plan's acceptance criteria, and hunt scope creep, missed work, and test gaps.`,
      ``,
      `End your reply with exactly one verdict: a line containing only AUDIT_PASSED, or a line`,
      `containing only AUDIT_FAILED followed by a fenced \`\`\`json array of findings, each with`,
      `severity (critical|major|minor), task_id (or null), criterion, evidence, recommendation,`,
      `and retriable (true|false).`,
    ].join("\n");

    await recordProgress(runId, {
      phase: "audit",
      status: "running",
      message: "Cyclops audit wave started",
      agent: "cyclops",
    }, toolContext);

    const dispatched = await sessions.dispatch({
      run_id: runId,
      agent: "cyclops",
      description: "final run audit",
      prompt,
      model_slot: AGENT_MODEL_SLOTS.cyclops,
    }, toolContext);
    if (!dispatched.dispatched || !dispatched.child_session_id) {
      await reportProblem({
        title: "Cyclops audit could not be dispatched",
        severity: "warning",
        source: "workflow-engine",
        agent: "cyclops",
        evidence: dispatched.error,
      });
      return { verdict: "UNAVAILABLE", findings: [] };
    }
    const collected = await sessions.collect({
      run_id: runId,
      child_session_id: dispatched.child_session_id,
      agent: "cyclops",
      poll: true,
    }, toolContext);
    if (!collected.collected || !collected.output) {
      await reportProblem({
        title: "Cyclops audit result could not be collected",
        severity: "warning",
        source: "workflow-engine",
        agent: "cyclops",
        evidence: "error" in collected ? collected.error : collected.message,
      });
      return { verdict: "UNAVAILABLE", findings: [] };
    }
    const { verdict, findings } = parseAuditVerdict(collected.output);
    if (verdict === "AUDIT_PASSED") {
      await recordProgress(runId, {
        phase: "audit",
        status: "completed",
        message: "AUDIT_PASSED",
        agent: "cyclops",
      }, toolContext);
      return { verdict, findings: [] };
    }
    if (verdict === "AUDIT_FAILED") {
      await recordProgress(runId, {
        phase: "audit",
        status: "failed",
        message: `AUDIT_FAILED with ${findings.length} finding(s)`,
        agent: "cyclops",
      }, toolContext);
      for (const finding of findings) {
        await reportProblem({
          title: `Audit finding (${finding.severity}): ${finding.criterion ?? finding.evidence ?? "see audit output"}`,
          severity: finding.severity === "minor" ? "warning" : "error",
          source: "cyclops-audit",
          task_id: finding.task_id ?? undefined,
          agent: "cyclops",
          evidence: finding.evidence,
          recommendation: finding.recommendation,
        });
      }
      return { verdict, findings };
    }
    return { verdict: "UNAVAILABLE", findings: [] };
  }

  // ── Main wave loop ───────────────────────────────────────────────────────────

  async function finalize(status: WorkflowResult["status"], audit: WorkflowResult["audit"]): Promise<WorkflowResult> {
    const tasks = await loadTasks(ctx, runId);
    const blockedTasks = tasks
      .filter((task) => task.status === "blocked" || task.status === "failed")
      .map((task) => ({ task_id: task.id, reason: task.notes.at(-1) ?? task.status }));
    const summary = summarizeLedger(tasks);
    await recordProgress(runId, {
      phase: "workflow",
      status: status === "complete" ? "completed" : status === "blocked" ? "blocked" : "failed",
      message: `engine ${status}: ${summary.verified + summary.done}/${summary.total} task(s) complete after ${stats.waves} wave(s)`,
    }, toolContext);
    return {
      status,
      run_id: runId,
      waves: stats.waves,
      tasks: summary,
      verification: stats.verification,
      retries: stats.retries,
      problems_reported: stats.problems,
      audit,
      blocked_tasks: blockedTasks,
    };
  }

  async function resetActiveTasks(noteText: string) {
    const tasks = await loadTasks(ctx, runId);
    for (const task of tasks) {
      if (task.status === "active") {
        await mutateTask(task.id, (record) => {
          record.status = "pending";
          record.notes.push(`${now()} ${noteText}`);
        });
      }
    }
  }

  await recordProgress(runId, {
    phase: "workflow",
    status: "started",
    message: `engine started (max_parallel=${maxParallel}, max_retries=${maxRetries}, audit=${auditEnabled})`,
  }, toolContext);

  await resumePass();

  let auditRetriesUsed = 0;

  while (true) {
    if (aborted()) {
      await resetActiveTasks("aborted mid-flight; child session may still be running");
      return finalize("aborted", null);
    }
    if (pastDeadline()) {
      await resetActiveTasks("overall workflow timeout; re-run cerebro_execute_workflow to resume");
      await reportProblem({
        title: "Workflow engine hit the overall timeout",
        severity: "blocker",
        source: "workflow-engine",
        evidence: `Deadline of ${args.overall_timeout_minutes ?? DEFAULTS.overall_timeout_minutes} minute(s) exceeded`,
        recommendation: "Re-run cerebro_execute_workflow with the same run_id to resume from the ledger.",
      });
      return finalize("timeout", null);
    }

    const tasks = await loadTasks(ctx, runId);
    if (tasks.length === 0) {
      await reportProblem({
        title: "Workflow engine started with an empty task ledger",
        severity: "error",
        source: "workflow-engine",
        recommendation: "Create task records with cerebro_task_create before calling cerebro_execute_workflow.",
      });
      return finalize("blocked", null);
    }

    if (allTasksComplete(tasks)) {
      const audit = await runAuditWave();
      if (audit && audit.verdict === "AUDIT_FAILED") {
        const retriable = audit.findings.filter((finding) => finding.retriable && finding.task_id);
        if (retriable.length > 0 && auditRetriesUsed < AUDIT_RETRY_BUDGET) {
          auditRetriesUsed += 1;
          for (const finding of retriable) {
            await mutateTask(finding.task_id as string, (record) => {
              record.status = "pending";
              record.notes.push(`${now()} re-queued by audit finding: ${(finding.recommendation ?? finding.evidence ?? "").slice(0, 300)}`);
            }).catch(() => undefined);
          }
          await recordProgress(runId, {
            phase: "audit",
            status: "running",
            message: `re-queued ${retriable.length} task(s) from audit findings`,
            agent: "cyclops",
          }, toolContext);
          continue;
        }
        return finalize("blocked", audit);
      }
      return finalize("complete", audit);
    }

    const frontier = selectFrontier(tasks);
    const anyBlocked = tasks.some((task) => task.status === "blocked" || task.status === "failed");

    if (frontier.length === 0) {
      const deadlocked = findDeadlockedTasks(tasks);
      if (deadlocked.length > 0) {
        await reportProblem({
          title: `Dependency deadlock: ${deadlocked.length} task(s) can never become ready`,
          severity: "blocker",
          source: "workflow-engine",
          evidence: deadlocked.map((task) => `${task.id} waits on [${task.depends_on.join(", ")}]`).join("\n"),
          recommendation: "Fix the blocked dependencies or the depends_on graph, then re-run cerebro_execute_workflow.",
        });
      }
      return finalize("blocked", null);
    }

    if (anyBlocked && stopOnBlocker) {
      return finalize("blocked", null);
    }

    const batch = pickBatch(frontier, maxParallel);
    stats.waves += 1;
    await recordProgress(runId, {
      phase: "scheduler",
      status: "running",
      message: `wave ${stats.waves}: dispatching ${batch.length} task(s) — ${batch.map((task) => task.id).join(", ")}`,
    }, toolContext);

    const outcomes = await Promise.all(batch.map((task) => executeTask(task)));

    if (outcomes.includes("aborted")) {
      await resetActiveTasks("aborted mid-flight; child session may still be running");
      return finalize("aborted", null);
    }
    if (outcomes.includes("blocked") && stopOnBlocker) {
      return finalize("blocked", null);
    }
  }
}
