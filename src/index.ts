import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import type { Permission } from "@opencode-ai/sdk";
import { appendFile, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { AgentDefinition } from "./agents/index.js";
import {
  createBeastAgent,
  createCerebroAgent,
  createCyclopsAgent,
  createCypherAgent,
  createEmmaFrostAgent,
  createForgeAgent,
  createJeanGreyAgent,
  createLegionAgent,
  createNightcrawlerAgent,
  createProfessorXAgent,
  createSageAgent,
  createStormAgent,
  createWolverineAgent,
} from "./agents/index.js";
import { CEREBRO_COMMAND_DEFINITIONS } from "./commands/index.js";
import { CEREBRO_AGENTS, CEREBRO_COMMANDS, CEREBRO_RISKS, CEREBRO_TASK_STATUSES } from "./runtime/index.js";
import { CEREBRO_MODEL_SLOT_KEYS, MODEL_SLOT_ENV, modelSlots } from "./config/models.js";
import { scheduleOpenXmenAutoUpdate, shouldRunAutoUpdateForEvent } from "./auto-update.js";

const COMMANDS = new Set<string>(CEREBRO_COMMANDS);
const RISKS = [...CEREBRO_RISKS] as const;
const TASK_STATUSES = [...CEREBRO_TASK_STATUSES] as const;
const SAFE_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const SECRET_PATH_PATTERN = /(^|[/\\])\.env(\.|$|[/\\])|secret|credential|private[-_]?key/i;
const MAX_PENDING_FILES = 500;
const MAX_PENDING_FILE_BYTES = 64 * 1024;
type Risk = (typeof RISKS)[number];
type TaskStatus = (typeof TASK_STATUSES)[number];

type ProgressStatus = "started" | "running" | "completed" | "blocked" | "failed" | "info";
type ProblemSeverity = "info" | "warning" | "error" | "blocker";
type ProblemStatus = "open" | "mitigated" | "resolved";

type ToolProgressContext = {
  metadata?: (input: { title?: string; metadata?: Record<string, unknown> }) => void;
};

type OpenCodeConfig = Record<string, unknown> & {
  command?: Record<string, {
    template: string;
    description?: string;
    agent?: string;
    model?: string;
    variant?: string;
    subtask?: boolean;
  }>;
  agent?: Record<string, Record<string, unknown> | undefined>;
};

type RuntimeContext = {
  worktree: string;
  directory: string;
};

type TaskRecord = {
  id: string;
  subject: string;
  description: string;
  owner: string;
  category?: string;
  verification_commands?: string[];
  status: TaskStatus;
  depends_on: string[];
  created_at: string;
  updated_at: string;
  notes: string[];
  verification: Array<{ at: string; result: string; command?: string; notes?: string }>;
};

type ChildSessionClient = {
  session: {
    create(input: {
      body: { parentID?: string; title: string };
      query?: { directory: string };
    }): Promise<{ data?: { id?: string } | null; id?: string }>;
    promptAsync(input: {
      path: { id: string };
      query?: { directory: string };
      body: {
        agent: string;
        model?: { providerID: string; modelID: string };
        noReply: boolean;
        parts: Array<{ type: "text"; text: string }>;
      };
    }): Promise<unknown>;
    prompt?(input: {
      path: { id: string };
      query?: { directory: string };
      body: {
        agent: string;
        model?: { providerID: string; modelID: string };
        noReply?: boolean;
        parts: Array<{ type: "text"; text: string }>;
      };
    }): Promise<unknown>;
    messages?(input: {
      path: { id: string };
      query?: { directory: string; limit?: number };
    }): Promise<unknown>;
  };
};

function now() {
  return new Date().toISOString();
}

function slug(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "cerebro-run";
}

function runtimeRoot(ctx: RuntimeContext) {
  return path.join(ctx.worktree || ctx.directory, ".cerebro");
}

function safeRuntimePath(ctx: RuntimeContext, relativePath: string) {
  const root = runtimeRoot(ctx);
  const full = path.resolve(root, relativePath);
  const normalizedRoot = path.resolve(root) + path.sep;
  if (full !== path.resolve(root) && !full.startsWith(normalizedRoot)) {
    throw new Error(`Path escapes .cerebro runtime: ${relativePath}`);
  }
  return full;
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJson(file: string, data: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function appendJsonl(file: string, data: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(data)}\n`, "utf8");
}

function parseModelID(model: string) {
  const [providerID, ...rest] = model.split("/");
  const modelID = rest.join("/");
  if (!providerID || !modelID) throw new Error(`Invalid model id: ${model}`);
  return { providerID, modelID };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultAgentDefinitions() {
  return [
    createCerebroAgent(),
    createLegionAgent(),
    createCypherAgent(),
    createProfessorXAgent(),
    createWolverineAgent(),
    createJeanGreyAgent(),
    createStormAgent(),
    createCyclopsAgent(),
    createForgeAgent(),
    createNightcrawlerAgent(),
    createSageAgent(),
    createBeastAgent(),
    createEmmaFrostAgent(),
  ];
}

function toConfigAgent(definition: AgentDefinition): Record<string, unknown> {
  const { config, description, opencode } = definition;
  const meta = opencode ?? {};
  return {
    ...config,
    ...(description ? { description } : {}),
    ...(meta.mode ? { mode: meta.mode } : {}),
    ...(meta.variant ? { variant: meta.variant } : {}),
    ...(meta.steps !== undefined ? { steps: meta.steps } : {}),
    ...(meta.permission ? { permission: meta.permission } : {}),
    ...(definition._modelArray && definition._modelArray.length > 1
      ? { options: { ...(isRecord(config.options) ? config.options : {}), model_fallbacks: definition._modelArray.slice(1).map(({ id }) => id) } }
      : {}),
  };
}

function registerCerebroConfig(input: OpenCodeConfig) {
  input.command ??= {};
  for (const command of CEREBRO_COMMAND_DEFINITIONS) {
    input.command[command.name] ??= {
      template: command.content,
      description: command.description,
      agent: "cerebro",
      model: command.model,
    };
  }

  input.agent ??= {};
  for (const agent of defaultAgentDefinitions()) {
    input.agent[agent.name] ??= toConfigAgent(agent);
  }
}

function assertSafeName(value: string, label: string) {
  if (!SAFE_NAME_PATTERN.test(value)) throw new Error(`${label} must be a safe slug-like name`);
}

function readToolArgs(args: unknown) {
  return isRecord(args) ? args : {};
}

function isSecretPath(filePath: string) {
  return SECRET_PATH_PATTERN.test(filePath);
}

function isInside(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

async function scanPendingTodos(root: string, teamName?: string) {
  const normalizedRoot = path.resolve(root);
  const base = teamName ? path.resolve(normalizedRoot, teamName) : normalizedRoot;
  if (!isInside(normalizedRoot, base)) throw new Error("pending todo path escapes .cerebro/pending-todos");
  const items: Array<{ file: string; line: string }> = [];
  let filesSeen = 0;

  async function walk(current: string) {
    if (!isInside(normalizedRoot, current)) throw new Error("pending todo scan escaped .cerebro/pending-todos");
    if (isSecretPath(current)) throw new Error("Cerebro safety policy blocks pending todo scans of secret-like paths");
    if (!existsSync(current)) return;
    const stats = await lstat(current);
    if (stats.isSymbolicLink()) return;
    if (stats.isDirectory()) {
      for (const name of await readdir(current)) await walk(path.join(current, name));
      return;
    }
    if (!stats.isFile()) return;
    filesSeen += 1;
    if (filesSeen > MAX_PENDING_FILES) throw new Error(`pending todo scan exceeded ${MAX_PENDING_FILES} files`);
    if (stats.size > MAX_PENDING_FILE_BYTES) throw new Error(`pending todo file is too large: ${current}`);
    for (const line of (await readFile(current, "utf8")).split("\n")) {
      const trimmed = line.trim();
      if (trimmed) items.push({ file: current, line: trimmed });
    }
  }

  await walk(base);
  return items;
}

function hasChildSessionClient(client: PluginInput["client"]): client is PluginInput["client"] & ChildSessionClient {
  if (!isRecord(client)) return false;
  const session = client.session;
  if (!isRecord(session)) return false;
  return typeof session.create === "function" && typeof session.promptAsync === "function";
}

function childSessionID(result: unknown) {
  if (!isRecord(result)) return undefined;
  const data = result.data;
  if (isRecord(data) && typeof data.id === "string") return data.id;
  return typeof result.id === "string" ? result.id : undefined;
}

function resultData(value: unknown) {
  if (isRecord(value) && "data" in value) return value.data;
  return value;
}

function assistantTextFromMessages(result: unknown) {
  const data = resultData(result);
  const messages = Array.isArray(data) ? data : [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const entry = messages[i];
    if (!isRecord(entry)) continue;
    const info = entry.info;
    if (!isRecord(info) || info.role !== "assistant") continue;
    const parts = Array.isArray(entry.parts) ? entry.parts : [];
    const text = parts
      .filter((part) => isRecord(part) && part.type === "text" && typeof part.text === "string")
      .map((part) => String((part as { text: string }).text))
      .join("\n")
      .trim();
    if (text) return text;
    if (isRecord(info.structured) && typeof info.structured.text === "string") return info.structured.text;
  }
  return "";
}

const CHILD_SESSION_TERMINAL_MARKERS = [
  "EXECUTION_COMPLETE",
  "EXECUTION_BLOCKED",
  "TASK_RESULT:",
  "DESIGN_SPEC_READY",
  "CUSTOMER_VISION_READY",
  "CUSTOMER_VERDICT:",
  "REQUIREMENTS_READY",
  "PLAN_DRAFT",
  "CLARIFY",
  "GAPS FOUND:",
  "VERDICT:",
] as const;

function terminalAssistantMarker(text: string) {
  return CHILD_SESSION_TERMINAL_MARKERS.find((marker) => text.includes(marker));
}

function hasTerminalAssistantMarker(text: string) {
  return Boolean(terminalAssistantMarker(text));
}

function taskStatusFromTaskResult(text: string): TaskStatus | undefined {
  const match = text.match(/STATUS:\s*(completed|blocked|failed)/i);
  if (!match) return undefined;
  return match[1].toLowerCase() === "completed" ? "done" : (match[1].toLowerCase() as "blocked" | "failed");
}

function summarizeTaskResult(text: string) {
  const status = taskStatusFromTaskResult(text);
  const summaryMatch = text.match(/SUMMARY:\s*(.+)/i);
  const files = [...text.matchAll(/^\s*-\s*(.+\.[A-Za-z0-9]+)\s*$/gmi)].map((match) => match[1]).slice(0, 20);
  return {
    status,
    summary: summaryMatch?.[1]?.trim() ?? "",
    files,
  };
}

function taskFile(ctx: RuntimeContext, runId: string) {
  return safeRuntimePath(ctx, `team-runs/${runId}.tasks.json`);
}

function manifestFile(ctx: RuntimeContext, runId: string) {
  return safeRuntimePath(ctx, `team-runs/${runId}.json`);
}

function progressFile(ctx: RuntimeContext, runId: string) {
  return safeRuntimePath(ctx, `team-runs/${runId}.progress.jsonl`);
}

function problemsFile(ctx: RuntimeContext, runId: string) {
  return safeRuntimePath(ctx, `team-runs/${runId}.problems.jsonl`);
}

function setToolProgress(toolContext: ToolProgressContext | undefined, title: string, metadata?: Record<string, unknown>) {
  try {
    toolContext?.metadata?.({ title, ...(metadata ? { metadata } : {}) });
  } catch {
    // Tool metadata is best-effort UI sugar; never fail workflow state updates.
  }
}

function formatElapsed(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

async function loadTasks(ctx: RuntimeContext, runId: string): Promise<TaskRecord[]> {
  return readJson<TaskRecord[]>(taskFile(ctx, runId), []);
}

async function saveTasks(ctx: RuntimeContext, runId: string, tasks: TaskRecord[]) {
  await writeJson(taskFile(ctx, runId), tasks);
}

export const CerebroPlugin: Plugin = async (input) => {
  const { worktree, directory, client } = input;
  const ctx = { worktree, directory };
  let sessionCheckDone = false;
  let autoUpdateScheduled = false;

  // Serialises load→mutate→save cycles per run_id to prevent concurrent writes clobbering each other.
  const taskLocks = new Map<string, Promise<unknown>>();
  function serializeTask<T>(runId: string, fn: () => Promise<T>): Promise<T> {
    const prev = taskLocks.get(runId) ?? Promise.resolve();
    const next: Promise<T> = prev.then(fn, () => fn());
    taskLocks.set(runId, next.then(() => {}, () => {}));
    return next;
  }

  async function recordAgentResult(runId: string, agent: string, childSessionId: string, output: string, taskId?: string) {
    const summary = summarizeTaskResult(output);
    await appendJsonl(safeRuntimePath(ctx, `team-runs/${runId}.mailbox.jsonl`), {
      at: now(),
      type: "agent_result",
      from: agent,
      to: "cerebro",
      child_session_id: childSessionId,
      task_id: taskId,
      status: summary.status ?? "unknown",
      summary: summary.summary,
      body: output,
    });

    if (!taskId) return summary;
    await serializeTask(runId, async () => {
      const tasks = await loadTasks(ctx, runId);
      const taskRecord = tasks.find((task) => task.id === taskId);
      if (!taskRecord) throw new Error(`Unknown task ${taskId}`);
      if (summary.status) taskRecord.status = summary.status;
      taskRecord.notes.push(`${now()} ${agent} returned ${summary.status ?? "unparsed"} from child session ${childSessionId}${summary.summary ? `: ${summary.summary}` : ""}`);
      taskRecord.updated_at = now();
      await saveTasks(ctx, runId, tasks);
    });
    return summary;
  }

  async function recordProgress(
    runId: string,
    event: {
      phase: string;
      message: string;
      status?: ProgressStatus;
      task_id?: string;
      agent?: string;
      child_session_id?: string;
      detail?: string;
    },
    toolContext?: ToolProgressContext,
  ) {
    const record = { at: now(), status: event.status ?? "info", ...event };
    await appendJsonl(progressFile(ctx, runId), record);
    const titlePrefix = record.status === "completed" ? "✓" : record.status === "failed" ? "✗" : record.status === "blocked" ? "!" : "→";
    setToolProgress(toolContext, `${titlePrefix} ${record.phase}: ${record.message}`, {
      run_id: runId,
      status: record.status,
      task_id: record.task_id,
      agent: record.agent,
      child_session_id: record.child_session_id,
    });
    return record;
  }

  async function recordProblem(
    runId: string,
    problem: {
      title: string;
      severity?: ProblemSeverity;
      status?: ProblemStatus;
      source?: string;
      task_id?: string;
      agent?: string;
      evidence?: string;
      recommendation?: string;
    },
    toolContext?: ToolProgressContext,
  ) {
    const record = {
      id: `problem-${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      at: now(),
      severity: problem.severity ?? "warning",
      status: problem.status ?? "open",
      ...problem,
    };
    await appendJsonl(problemsFile(ctx, runId), record);
    const prefix = record.severity === "blocker" ? "BLOCKER" : record.severity.toUpperCase();
    setToolProgress(toolContext, `⚠ ${prefix}: ${record.title}`, {
      run_id: runId,
      problem_id: record.id,
      severity: record.severity,
      status: record.status,
      task_id: record.task_id,
      agent: record.agent,
    });
    await recordProgress(runId, {
      phase: "problem",
      status: record.severity === "blocker" ? "blocked" : record.severity === "error" ? "failed" : "info",
      message: record.title,
      task_id: record.task_id,
      agent: record.agent,
      detail: record.evidence,
    }, toolContext).catch(() => undefined);
    return record;
  }

  type DispatchChildArgs = {
    run_id: string;
    task_id?: string;
    agent: string;
    description: string;
    prompt: string;
    model_slot?: string;
    no_reply?: boolean;
  };

  type CollectChildArgs = {
    run_id: string;
    child_session_id: string;
    agent?: string;
    task_id?: string;
    limit?: number;
    poll?: boolean;
  };

  async function dispatchAsyncChildSession(
    args: DispatchChildArgs,
    toolContext: { sessionID: string; directory: string } & ToolProgressContext,
    dispatchType: "dispatch" | "dispatch_batch" = "dispatch",
  ) {
    await recordProgress(args.run_id, {
      phase: dispatchType === "dispatch_batch" ? "batch dispatch" : "dispatch",
      status: "started",
      message: `${args.agent} — ${args.description}`,
      task_id: args.task_id,
      agent: args.agent,
    }, toolContext);
    await appendJsonl(safeRuntimePath(ctx, `team-runs/${args.run_id}.mailbox.jsonl`), {
      at: now(),
      type: dispatchType,
      from: "cerebro",
      to: args.agent,
      task_id: args.task_id,
      description: args.description,
    });
    try {
      if (!hasChildSessionClient(client)) throw new Error("OpenCode SDK client does not expose child session create/promptAsync methods");
      const created = await client.session.create({
        body: { parentID: toolContext.sessionID, title: `${args.agent}: ${args.description}` },
        query: { directory: toolContext.directory },
      });
      const childID = childSessionID(created);
      if (!childID) throw new Error("OpenCode SDK did not return a child session id");
      await recordProgress(args.run_id, {
        phase: "child session",
        status: "running",
        message: `${args.agent} started`,
        task_id: args.task_id,
        agent: args.agent,
        child_session_id: childID,
      }, toolContext);
      await appendJsonl(safeRuntimePath(ctx, `team-runs/${args.run_id}.mailbox.jsonl`), {
        at: now(),
        type: "child_session_started",
        from: "cerebro",
        to: args.agent,
        task_id: args.task_id,
        child_session_id: childID,
        description: args.description,
      });
      const slots = modelSlots();
      const selectedModel = args.model_slot ? slots[args.model_slot as keyof typeof slots] : undefined;
      await client.session.promptAsync({
        path: { id: childID },
        query: { directory: toolContext.directory },
        body: {
          agent: args.agent,
          ...(selectedModel ? { model: parseModelID(selectedModel) } : {}),
          noReply: args.no_reply ?? true,
          parts: [{ type: "text", text: args.prompt }],
        },
      });
      return {
        dispatched: true,
        child_session_id: childID,
        agent: args.agent,
        task_id: args.task_id,
        model: selectedModel || "agent-default",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await recordProgress(args.run_id, {
        phase: "dispatch",
        status: "failed",
        message: `${args.agent} dispatch failed`,
        task_id: args.task_id,
        agent: args.agent,
        detail: message,
      }, toolContext).catch(() => undefined);
      await recordProblem(args.run_id, {
        title: `${args.agent} dispatch failed`,
        severity: "error",
        source: "dispatch",
        task_id: args.task_id,
        agent: args.agent,
        evidence: message,
        recommendation: "Check child-session support and retry the task or fall back to direct agent mention.",
      }, toolContext).catch(() => undefined);
      await appendJsonl(safeRuntimePath(ctx, `team-runs/${args.run_id}.mailbox.jsonl`), {
        at: now(),
        type: "dispatch_failed",
        from: "cerebro",
        to: args.agent,
        task_id: args.task_id,
        description: args.description,
        error: message,
      }).catch(() => undefined);
      return {
        dispatched: false,
        agent: args.agent,
        task_id: args.task_id,
        fallback: `Use @${args.agent} with the prompt supplied to ${dispatchType}.`,
        error: message,
      };
    }
  }

  async function collectChildSessionResult(
    args: CollectChildArgs,
    toolContext: { directory: string; abort?: AbortSignal } & ToolProgressContext,
  ) {
    const POLL_INTERVAL_MS = 2000;
    const HEARTBEAT_MS = 10_000;
    const HEARTBEAT_PROGRESS_LOG_MS = 60_000;
    const MAX_POLL_MS = 30 * 60 * 1000;

    try {
      await recordProgress(args.run_id, {
        phase: "collect",
        status: args.poll ? "running" : "started",
        message: `${args.agent ?? "child-session"} result`,
        task_id: args.task_id,
        agent: args.agent,
        child_session_id: args.child_session_id,
      }, toolContext);
      if (!hasChildSessionClient(client) || typeof client.session.messages !== "function") {
        throw new Error("OpenCode SDK client does not expose child session message listing");
      }

      let response: unknown;

      if (args.poll) {
        const startTime = Date.now();
        let lastHeartbeatAt = 0;
        let lastLoggedHeartbeatAt = 0;

        while (true) {
          if (toolContext.abort?.aborted) {
            throw new Error("Task aborted during polling.");
          }

          response = await client.session.messages({
            path: { id: args.child_session_id },
            query: { directory: toolContext.directory, limit: 100 },
          });

          const currentOutput = assistantTextFromMessages(response);
          if (currentOutput && hasTerminalAssistantMarker(currentOutput)) break;

          const elapsed = Date.now() - startTime;
          if (Date.now() - lastHeartbeatAt >= HEARTBEAT_MS) {
            lastHeartbeatAt = Date.now();
            const agent = args.agent ?? "child-session";
            const markerHint = currentOutput ? "assistant output seen; waiting for terminal marker" : "waiting for assistant output";
            setToolProgress(toolContext, `⏳ ${agent} still working (${formatElapsed(elapsed)}) — ${markerHint}`, {
              run_id: args.run_id,
              status: "running",
              task_id: args.task_id,
              agent: args.agent,
              child_session_id: args.child_session_id,
              elapsed_ms: elapsed,
            });
            if (Date.now() - lastLoggedHeartbeatAt >= HEARTBEAT_PROGRESS_LOG_MS) {
              lastLoggedHeartbeatAt = Date.now();
              await appendJsonl(progressFile(ctx, args.run_id), {
                at: now(),
                status: "running",
                phase: "heartbeat",
                message: `${agent} still working (${formatElapsed(elapsed)})`,
                task_id: args.task_id,
                agent: args.agent,
                child_session_id: args.child_session_id,
              }).catch(() => undefined);
            }
          }

          if (Date.now() - startTime >= MAX_POLL_MS) {
            await recordProgress(args.run_id, {
              phase: "collect",
              status: "blocked",
              message: `${args.agent ?? "child-session"} timed out`,
              task_id: args.task_id,
              agent: args.agent,
              child_session_id: args.child_session_id,
            }, toolContext);
            await recordProblem(args.run_id, {
              title: `${args.agent ?? "child-session"} timed out while collecting result`,
              severity: "blocker",
              source: "cerebro_collect_result",
              task_id: args.task_id,
              agent: args.agent,
              evidence: `No terminal marker after ${formatElapsed(MAX_POLL_MS)} for child session ${args.child_session_id}`,
              recommendation: "Collect again, inspect the child session, or re-dispatch the task with a narrower prompt.",
            }, toolContext).catch(() => undefined);
            return {
              collected: false,
              child_session_id: args.child_session_id,
              timed_out: true,
              terminal_markers: CHILD_SESSION_TERMINAL_MARKERS,
              message: "Polling timed out after 30 minutes. Call cerebro_collect_result again to retry, or escalate as EXECUTION_BLOCKED.",
            };
          }

          await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }
      } else {
        response = await client.session.messages({
          path: { id: args.child_session_id },
          query: { directory: toolContext.directory, limit: args.limit ?? 20 },
        });
      }

      const output = assistantTextFromMessages(response);
      if (!output) {
        return { collected: false, child_session_id: args.child_session_id, message: "No assistant result found yet." };
      }
      const agent = args.agent ?? "child-session";
      const summary = await recordAgentResult(args.run_id, agent, args.child_session_id, output, args.task_id);
      await recordProgress(args.run_id, {
        phase: "collect",
        status: summary.status === "blocked" ? "blocked" : summary.status === "failed" ? "failed" : "completed",
        message: `${agent} returned ${terminalAssistantMarker(output) ?? "assistant output"}`,
        task_id: args.task_id,
        agent,
        child_session_id: args.child_session_id,
        detail: summary.summary,
      }, toolContext);
      return {
        collected: true,
        child_session_id: args.child_session_id,
        agent,
        task_id: args.task_id,
        terminal_marker: terminalAssistantMarker(output) ?? "assistant_text",
        parsed: summary,
        output,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await recordProgress(args.run_id, {
        phase: "collect",
        status: "failed",
        message: `${args.agent ?? "child-session"} collect failed`,
        task_id: args.task_id,
        agent: args.agent,
        child_session_id: args.child_session_id,
        detail: message,
      }, toolContext).catch(() => undefined);
      await recordProblem(args.run_id, {
        title: `${args.agent ?? "child-session"} result collection failed`,
        severity: "error",
        source: "collect",
        task_id: args.task_id,
        agent: args.agent,
        evidence: message,
        recommendation: "Retry collection; if repeated, inspect or re-dispatch the child session.",
      }, toolContext).catch(() => undefined);
      await appendJsonl(safeRuntimePath(ctx, `team-runs/${args.run_id}.mailbox.jsonl`), {
        at: now(), type: "collect_failed", from: "cerebro", to: args.agent ?? "child-session",
        child_session_id: args.child_session_id, task_id: args.task_id, error: message,
      }).catch(() => undefined);
      return {
        collected: false,
        child_session_id: args.child_session_id,
        error: message,
      };
    }
  }

  return {
    async event({ event }) {
      if (autoUpdateScheduled || !shouldRunAutoUpdateForEvent(event)) return;
      autoUpdateScheduled = true;
      scheduleOpenXmenAutoUpdate(input);
    },

    async config(input) {
      registerCerebroConfig(input as OpenCodeConfig);
    },

    async "permission.ask"(input: Permission, output) {
      const pattern = Array.isArray(input.pattern) ? input.pattern[0] : (input.pattern ?? "");
      if (pattern && isSecretPath(pattern)) {
        output.status = "deny";
        return;
      }
      if (pattern) {
        const projectRoot = ctx.worktree || ctx.directory;
        const cerebroRoot = path.resolve(projectRoot, ".cerebro");
        const resolved = path.resolve(projectRoot, pattern);
        if (isInside(cerebroRoot, resolved)) {
          output.status = "allow";
        }
      }
    },

    async "shell.env"(_input, output) {
      const slots = modelSlots();
      for (const slot of CEREBRO_MODEL_SLOT_KEYS) output.env[MODEL_SLOT_ENV[slot]] = slots[slot];
    },

    async "experimental.chat.system.transform"(_input, output) {
      output.system.push(
        "Cerebro OpenCode runtime is active. Runtime state lives under `.cerebro/`. Use the cerebro_* custom tools for run coordination, task tracking, mailbox, checkpoints, and pending-todo verification."
      );
      if (!sessionCheckDone) {
        sessionCheckDone = true;
        try {
          const pendingRoot = safeRuntimePath(ctx, "pending-todos");
          const legacyPendingRoot = safeRuntimePath(ctx, ".pending-todos");
          const [current, legacy] = await Promise.all([
            scanPendingTodos(pendingRoot),
            scanPendingTodos(legacyPendingRoot),
          ]);
          const items = [...current, ...legacy];
          if (items.length > 0) {
            output.system.push(
              `CEREBRO SESSION START — ${items.length} pending todo item(s) found from a previous session:\n` +
              items.map((i) => `- ${i.line} (${i.file})`).join("\n") +
              "\n\nBefore doing anything else, greet the user briefly and ask: " +
              '"Continue previous work? [Y/n]" — default is YES (continue). ' +
              "If they say yes or press enter, summarize the pending work and resume. " +
              "If they say no, call cerebro_clear_pending to discard the todos and start fresh."
            );
          }
        } catch {
          // non-fatal: missing .cerebro dir or scan error at session start
        }
      }
    },

    async "command.execute.before"(input, output) {
      const command = input.command.startsWith("/") ? input.command : `/${input.command}`;
      if (!COMMANDS.has(command)) return;
      const prelude = [
        "Cerebro OpenCode runtime is active.",
        "Before acting, use the Cerebro coordination tools for run state, mailbox, checkpoints, pending-todo checks, and model-slot lookup.",
        "Runtime root: `.cerebro/`. Preserve command names and role names.",
      ].join("\n");
      const firstText = output.parts.find((part) => part.type === "text");
      if (firstText && "text" in firstText) firstText.text = `${prelude}\n\n${firstText.text}`;
    },

    async "tool.execute.before"(input, output) {
      const rawInput = input as { args?: unknown };
      const args = readToolArgs(rawInput.args ?? output.args);
      const filePath = String(args.filePath || args.path || "");
      if (filePath && isSecretPath(filePath)) {
        throw new Error("Cerebro safety policy blocks reading or touching env/secret/credential paths without explicit user authorization.");
      }
    },

    async "experimental.session.compacting"(_input, output) {
      output.context.push(
        "Preserve Cerebro state before compacting: summarize active command, run_id, boulder status, pending approvals, pending todos, verification evidence, and next checkpoint under `.cerebro/`."
      );
    },

    tool: {
      cerebro_model_slots: tool({
        description: "Return the configured Cerebro model slots for role routing.",
        args: {},
        async execute() {
          return JSON.stringify(modelSlots(), null, 2);
        },
      }),

      cerebro_run_start: tool({
        description: "Create a Cerebro run manifest and boulder checkpoint under .cerebro/team-runs/.",
        args: {
          command: tool.schema.enum(Array.from(COMMANDS) as [string, ...string[]]).describe("Cerebro command name"),
          objective: tool.schema.string().min(1).describe("User objective for this run"),
          risk_level: tool.schema.enum(RISKS).describe("Risk level"),
          team_name: tool.schema.string().optional().describe("Stable team/session name (defaults to a slug of command + objective)"),
        },
        async execute(args, toolContext) {
          const timestamp = now();
          const runId = `${timestamp.slice(0, 10).replace(/-/g, "")}-${timestamp.slice(11, 19).replace(/:/g, "")}-${slug(args.objective)}`;
          const teamName = args.team_name || slug(`${args.command}-${args.objective}`);

          await writeJson(manifestFile(ctx, runId), {
            version: 1,
            run_id: runId,
            command: args.command,
            status: args.command === "/cerebro-plan" ? "planning" : "running",
            lead: "cerebro",
            team_name: teamName,
            objective: args.objective,
            risk_level: args.risk_level as Risk,
            started_at: timestamp,
            updated_at: timestamp,
            teammates: [],
            ownership: [],
            mailbox_decisions: [],
            approvals: [],
            verification: [],
            cleanup: { team_stopped: false, pending_todos_clear: false, notes: "" },
          });
          await saveTasks(ctx, runId, []);

          if (["/to-me-my-x-men", "/cerebro-start-work"].includes(args.command)) {
            await writeJson(safeRuntimePath(ctx, "boulder.json"), {
              version: 2,
              active_plan: "",
              plan_name: slug(args.objective),
              status: "in_progress",
              risk_level: args.risk_level,
              team_name: teamName,
              started_at: timestamp,
              updated_at: timestamp,
              approval_gates: [],
              verification_history: [],
              decisions: [],
            });
          }

          await recordProgress(runId, {
            phase: "run",
            status: "started",
            message: `${args.command} — ${args.objective}`,
          }, toolContext);

          return JSON.stringify({ run_id: runId, manifest: `.cerebro/team-runs/${runId}.json`, tasks: `.cerebro/team-runs/${runId}.tasks.json`, progress: `.cerebro/team-runs/${runId}.progress.jsonl`, problems: `.cerebro/team-runs/${runId}.problems.jsonl` }, null, 2);
        },
      }),

      cerebro_task_create: tool({
        description: "Create a task record for a Cerebro run. Include category and verification_commands when creating records from a plan so Cyclops can route, batch, and verify deterministically.",
        args: {
          run_id: tool.schema.string().min(1),
          subject: tool.schema.string().min(1),
          description: tool.schema.string().min(1),
          owner: tool.schema.string().min(1).describe("Cerebro role or spawned agent name"),
          category: tool.schema.enum(["visual-engineering", "architecture", "explore", "research", "deep", "quick"]).optional(),
          verification_commands: tool.schema.array(tool.schema.string().min(1)).optional(),
          depends_on: tool.schema.array(tool.schema.string()).optional(),
        },
        execute: (args, toolContext) => serializeTask(args.run_id, async () => {
          const tasks = await loadTasks(ctx, args.run_id);
          const id = `task-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
          const record: TaskRecord = {
            id,
            subject: args.subject,
            description: args.description,
            owner: args.owner,
            ...(args.category ? { category: args.category } : {}),
            ...(args.verification_commands?.length ? { verification_commands: args.verification_commands } : {}),
            status: "pending",
            depends_on: args.depends_on || [],
            created_at: now(),
            updated_at: now(),
            notes: [],
            verification: [],
          };
          tasks.push(record);
          await saveTasks(ctx, args.run_id, tasks);
          await recordProgress(args.run_id, {
            phase: "task",
            status: "started",
            message: `created ${record.id}: ${args.subject}`,
            task_id: record.id,
            agent: args.owner,
          }, toolContext);
          return JSON.stringify(record, null, 2);
        }),
      }),

      cerebro_task_list: tool({
        description: "List task records for a Cerebro run.",
        args: { run_id: tool.schema.string().min(1) },
        async execute(args) {
          return JSON.stringify(await loadTasks(ctx, args.run_id), null, 2);
        },
      }),

      cerebro_task_update: tool({
        description: "Update task status, notes, or verification for a Cerebro run.",
        args: {
          run_id: tool.schema.string().min(1),
          task_id: tool.schema.string().min(1),
          status: tool.schema.enum(TASK_STATUSES).optional(),
          note: tool.schema.string().optional(),
          verification_result: tool.schema.enum(["PASS", "FAIL", "BLOCKED", "NOT RUN"]).optional(),
          verification_command: tool.schema.string().optional(),
        },
        execute: (args, toolContext) => serializeTask(args.run_id, async () => {
          const tasks = await loadTasks(ctx, args.run_id);
          const taskRecord = tasks.find((task) => task.id === args.task_id);
          if (!taskRecord) throw new Error(`Unknown task ${args.task_id}`);
          if (args.status) taskRecord.status = args.status as TaskStatus;
          if (args.note) taskRecord.notes.push(`${now()} ${args.note}`);
          if (args.verification_result) {
            taskRecord.verification.push({
              at: now(),
              result: args.verification_result,
              command: args.verification_command,
              notes: args.note,
            });
          }
          taskRecord.updated_at = now();
          await saveTasks(ctx, args.run_id, tasks);
          await recordProgress(args.run_id, {
            phase: args.verification_result ? "verification" : "task",
            status: args.verification_result === "FAIL" ? "failed" : args.verification_result === "BLOCKED" ? "blocked" : args.status === "done" ? "completed" : args.status === "failed" ? "failed" : args.status === "blocked" ? "blocked" : "running",
            message: args.verification_result
              ? `${args.verification_result}: ${args.verification_command ?? taskRecord.id}`
              : `${taskRecord.id}${args.status ? ` → ${args.status}` : ""}`,
            task_id: args.task_id,
            agent: taskRecord.owner,
            detail: args.note,
          }, toolContext);
          if (args.verification_result === "FAIL" || args.verification_result === "BLOCKED" || args.status === "failed" || args.status === "blocked") {
            await recordProblem(args.run_id, {
              title: args.verification_result
                ? `Verification ${args.verification_result}: ${args.verification_command ?? taskRecord.id}`
                : `Task ${args.status}: ${taskRecord.subject}`,
              severity: args.verification_result === "BLOCKED" || args.status === "blocked" ? "blocker" : "error",
              source: args.verification_result ? "verification" : "task_update",
              task_id: args.task_id,
              agent: taskRecord.owner,
              evidence: args.note,
              recommendation: "Use the recorded failure output to create a targeted retry task or improve the verification/dispatch prompt.",
            }, toolContext);
          }
          return JSON.stringify(taskRecord, null, 2);
        }),
      }),

      cerebro_mailbox_send: tool({
        description: "Append a mailbox message for a Cerebro run.",
        args: {
          run_id: tool.schema.string().min(1),
          from: tool.schema.string().min(1),
          to: tool.schema.string().min(1),
          type: tool.schema.string().min(1),
          body: tool.schema.string().min(1),
          decision: tool.schema.string().optional(),
        },
        async execute(args) {
          const record = { at: now(), ...args };
          await appendJsonl(safeRuntimePath(ctx, `team-runs/${args.run_id}.mailbox.jsonl`), record);
          return JSON.stringify(record, null, 2);
        },
      }),

      cerebro_mailbox_read: tool({
        description: "Read mailbox messages for a Cerebro run, optionally filtered by recipient.",
        args: {
          run_id: tool.schema.string().min(1),
          to: tool.schema.string().optional(),
          limit: tool.schema.number().int().min(1).max(200).optional(),
        },
        async execute(args) {
          const file = safeRuntimePath(ctx, `team-runs/${args.run_id}.mailbox.jsonl`);
          if (!existsSync(file)) return "[]";
          const lines = (await readFile(file, "utf8")).split("\n");
          const records = lines
            .filter(Boolean)
            .flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } })
            .filter((record) => !args.to || record.to === args.to)
            .slice(-(args.limit || 50));
          return JSON.stringify(records, null, 2);
        },
      }),

      cerebro_progress: tool({
        description: "Emit a visible Cerebro progress milestone for the current run. Use this at major orchestration points so users can see what is happening without reading mailbox files.",
        args: {
          run_id: tool.schema.string().min(1),
          phase: tool.schema.string().min(1).describe("Short phase label, e.g. planning, dispatch, verification, retry, complete"),
          message: tool.schema.string().min(1),
          status: tool.schema.enum(["started", "running", "completed", "blocked", "failed", "info"]).optional(),
          task_id: tool.schema.string().optional(),
          agent: tool.schema.string().optional(),
          detail: tool.schema.string().optional(),
        },
        async execute(args, toolContext) {
          const record = await recordProgress(args.run_id, args, toolContext);
          return {
            title: `${record.status.toUpperCase()} ${record.phase}: ${record.message}`,
            output: JSON.stringify(record, null, 2),
            metadata: record,
          };
        },
      }),

      cerebro_progress_read: tool({
        description: "Read a concise progress summary for a Cerebro run. Use when the user asks what the X-Men are doing or wants current progress.",
        args: {
          run_id: tool.schema.string().min(1),
          limit: tool.schema.number().int().min(1).max(100).optional(),
        },
        async execute(args) {
          const file = progressFile(ctx, args.run_id);
          if (!existsSync(file)) return "No progress events recorded yet.";
          const records = (await readFile(file, "utf8"))
            .split("\n")
            .filter(Boolean)
            .flatMap((line) => { try { return [JSON.parse(line) as { at?: string; status?: string; phase?: string; message?: string; task_id?: string; agent?: string }]; } catch { return []; } })
            .slice(-(args.limit ?? 30));
          return records.map((record) => {
            const task = record.task_id ? ` [${record.task_id}]` : "";
            const agent = record.agent ? ` @${record.agent}` : "";
            return `- ${record.at ?? ""} ${record.status ?? "info"} ${record.phase ?? "progress"}${task}${agent}: ${record.message ?? ""}`;
          }).join("\n") || "No progress events recorded yet.";
        },
      }),

      cerebro_problem_report: tool({
        description: "Record a structured workflow problem visible to the user and persisted for plugin improvement. Use for blockers, failed verification, retries, confusing plans, missing tools, weak evidence, or runtime UX gaps.",
        args: {
          run_id: tool.schema.string().min(1),
          title: tool.schema.string().min(1),
          severity: tool.schema.enum(["info", "warning", "error", "blocker"]).optional(),
          status: tool.schema.enum(["open", "mitigated", "resolved"]).optional(),
          source: tool.schema.string().optional(),
          task_id: tool.schema.string().optional(),
          agent: tool.schema.string().optional(),
          evidence: tool.schema.string().optional(),
          recommendation: tool.schema.string().optional(),
        },
        async execute(args, toolContext) {
          const record = await recordProblem(args.run_id, args, toolContext);
          return {
            title: `${record.severity.toUpperCase()} ${record.title}`,
            output: JSON.stringify(record, null, 2),
            metadata: record,
          };
        },
      }),

      cerebro_problem_list: tool({
        description: "Read the workflow problem list for a Cerebro run. This is the improvement backlog for the plugin/run.",
        args: {
          run_id: tool.schema.string().min(1),
          status: tool.schema.enum(["open", "mitigated", "resolved"]).optional(),
          min_severity: tool.schema.enum(["info", "warning", "error", "blocker"]).optional(),
          limit: tool.schema.number().int().min(1).max(100).optional(),
        },
        async execute(args) {
          const file = problemsFile(ctx, args.run_id);
          if (!existsSync(file)) return "No workflow problems recorded.";
          const severityRank: Record<string, number> = { info: 0, warning: 1, error: 2, blocker: 3 };
          const minRank = args.min_severity ? severityRank[args.min_severity] : 0;
          const records = (await readFile(file, "utf8"))
            .split("\n")
            .filter(Boolean)
            .flatMap((line) => { try { return [JSON.parse(line) as {
              id?: string; at?: string; severity?: string; status?: string; title?: string; source?: string; task_id?: string; agent?: string; recommendation?: string;
            }]; } catch { return []; } })
            .filter((record) => !args.status || record.status === args.status)
            .filter((record) => severityRank[record.severity ?? "warning"] >= minRank)
            .slice(-(args.limit ?? 50));
          if (records.length === 0) return "No workflow problems matched the filter.";
          return records.map((record) => {
            const task = record.task_id ? ` [${record.task_id}]` : "";
            const agent = record.agent ? ` @${record.agent}` : "";
            const source = record.source ? ` (${record.source})` : "";
            const recommendation = record.recommendation ? `\n  fix: ${record.recommendation}` : "";
            return `- ${record.id ?? "problem"} ${record.severity ?? "warning"}/${record.status ?? "open"}${task}${agent}${source}: ${record.title ?? ""}${recommendation}`;
          }).join("\n");
        },
      }),

      cerebro_dispatch_agent: tool({
        description: "Dispatch an asynchronous OpenCode child session for a Cerebro agent and record the dispatch in the mailbox. Use for fire-and-collect flows; for parallel fan-out prefer cerebro_dispatch_batch.",
        args: {
          run_id: tool.schema.string().min(1),
          agent: tool.schema.enum(CEREBRO_AGENTS).describe("Cerebro agent name, e.g. wolverine, nightcrawler, professor-x"),
          description: tool.schema.string().min(1),
          prompt: tool.schema.string().min(1),
          model_slot: tool.schema.enum(CEREBRO_MODEL_SLOT_KEYS).optional().describe("Cerebro role model slot override for this dispatch"),
          no_reply: tool.schema.boolean().optional(),
        },
        async execute(args, toolContext) {
          return JSON.stringify(await dispatchAsyncChildSession(args, toolContext), null, 2);
        },
      }),

      cerebro_dispatch_batch: tool({
        description: "Dispatch multiple independent Cerebro worker child sessions asynchronously in one call for Cyclops-style parallel fan-out. Collect each child session with cerebro_collect_batch_results or cerebro_collect_result.",
        args: {
          run_id: tool.schema.string().min(1),
          requests: tool.schema.array(tool.schema.object({
            task_id: tool.schema.string().optional(),
            agent: tool.schema.enum(CEREBRO_AGENTS).describe("Cerebro agent name, e.g. wolverine, nightcrawler, forge"),
            description: tool.schema.string().min(1),
            prompt: tool.schema.string().min(1),
            model_slot: tool.schema.enum(CEREBRO_MODEL_SLOT_KEYS).optional(),
            no_reply: tool.schema.boolean().optional(),
          })).min(1).max(8),
        },
        async execute(args, toolContext) {
          await recordProgress(args.run_id, {
            phase: "batch dispatch",
            status: "started",
            message: `${args.requests.length} independent task(s)`,
          }, toolContext);
          const results = await Promise.all(args.requests.map((request) =>
            dispatchAsyncChildSession({ run_id: args.run_id, ...request }, toolContext, "dispatch_batch")
          ));
          await recordProgress(args.run_id, {
            phase: "batch dispatch",
            status: results.every((result) => result.dispatched) ? "completed" : "failed",
            message: `${results.filter((result) => result.dispatched).length}/${results.length} dispatched`,
          }, toolContext);
          return JSON.stringify({
            dispatched: results.filter((result) => result.dispatched).length,
            failed: results.filter((result) => !result.dispatched).length,
            results,
          }, null, 2);
        },
      }),

      cerebro_agent_task: tool({
        description: "Run a Cerebro agent in a child session, wait for its reply, record the result, and optionally update a task ledger entry. If aborted, the child_session_id is in the mailbox as a child_session_started record — use cerebro_collect_result to recover.",
        args: {
          run_id: tool.schema.string().min(1),
          task_id: tool.schema.string().optional(),
          agent: tool.schema.enum(CEREBRO_AGENTS).describe("Cerebro agent name, e.g. wolverine, nightcrawler, professor-x"),
          description: tool.schema.string().min(1),
          prompt: tool.schema.string().min(1),
          model_slot: tool.schema.enum(CEREBRO_MODEL_SLOT_KEYS).optional().describe("Cerebro role model slot override for this task"),
        },
        async execute(args, toolContext) {
          await recordProgress(args.run_id, {
            phase: "agent task",
            status: "started",
            message: `${args.agent} — ${args.description}`,
            task_id: args.task_id,
            agent: args.agent,
          }, toolContext);
          await appendJsonl(safeRuntimePath(ctx, `team-runs/${args.run_id}.mailbox.jsonl`), {
            at: now(),
            type: "dispatch_sync",
            from: "cerebro",
            to: args.agent,
            task_id: args.task_id,
            description: args.description,
          });
          try {
            if (!hasChildSessionClient(client) || typeof client.session.prompt !== "function") {
              throw new Error("OpenCode SDK client does not expose synchronous child session prompt support");
            }
            const created = await client.session.create({
              body: { parentID: toolContext.sessionID, title: `${args.agent}: ${args.description}` },
              query: { directory: toolContext.directory },
            });
            const childID = childSessionID(created);
            if (!childID) throw new Error("OpenCode SDK did not return a child session id");
            await recordProgress(args.run_id, {
              phase: "agent task",
              status: "running",
              message: `${args.agent} started`,
              task_id: args.task_id,
              agent: args.agent,
              child_session_id: childID,
            }, toolContext);
            await appendJsonl(safeRuntimePath(ctx, `team-runs/${args.run_id}.mailbox.jsonl`), {
              at: now(), type: "child_session_started", from: "cerebro", to: args.agent,
              task_id: args.task_id, child_session_id: childID, description: args.description,
            });
            const slots = modelSlots();
            const selectedModel = args.model_slot ? slots[args.model_slot] : undefined;
            const response = await client.session.prompt({
              path: { id: childID },
              query: { directory: toolContext.directory },
              body: {
                agent: args.agent,
                ...(selectedModel ? { model: parseModelID(selectedModel) } : {}),
                noReply: false,
                parts: [{ type: "text", text: args.prompt }],
              },
            });
            const output = assistantTextFromMessages([resultData(response)]);
            if (!output) throw new Error("Child session completed without assistant text output");
            const summary = await recordAgentResult(args.run_id, args.agent, childID, output, args.task_id);
            await recordProgress(args.run_id, {
              phase: "agent task",
              status: summary.status === "blocked" ? "blocked" : summary.status === "failed" ? "failed" : "completed",
              message: `${args.agent} returned ${terminalAssistantMarker(output) ?? "assistant output"}`,
              task_id: args.task_id,
              agent: args.agent,
              child_session_id: childID,
              detail: summary.summary,
            }, toolContext);
            return JSON.stringify({
              completed: true,
              child_session_id: childID,
              agent: args.agent,
              task_id: args.task_id,
              model: selectedModel || "agent-default",
              parsed: summary,
              output,
            }, null, 2);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await recordProblem(args.run_id, {
              title: `${args.agent} task failed`,
              severity: "error",
              source: "cerebro_agent_task",
              task_id: args.task_id,
              agent: args.agent,
              evidence: message,
              recommendation: "Check mailbox for a child_session_started record; collect it if present, otherwise retry or narrow the task.",
            }, toolContext).catch(() => undefined);
            await appendJsonl(safeRuntimePath(ctx, `team-runs/${args.run_id}.mailbox.jsonl`), {
              at: now(), type: "agent_failed", from: args.agent, to: "cerebro", task_id: args.task_id, description: args.description, error: message,
            });
            return JSON.stringify({
              completed: false,
              agent: args.agent,
              task_id: args.task_id,
              fallback: "Check mailbox for a child_session_started record for this task — if one exists, use cerebro_collect_result with that child_session_id to recover. Otherwise use @" + args.agent + " directly, then record the result with cerebro_mailbox_send and cerebro_task_update.",
              error: message,
            }, null, 2);
          }
        },
      }),

      cerebro_collect_result: tool({
        description: "Collect the latest assistant text from an asynchronous child session, record it, and optionally update a task ledger entry. Pass poll: true to block until a terminal marker is seen (TASK_RESULT, DESIGN_SPEC_READY, PLAN_DRAFT, REQUIREMENTS_READY, EXECUTION_COMPLETE, etc.).",
        args: {
          run_id: tool.schema.string().min(1),
          child_session_id: tool.schema.string().min(1),
          agent: tool.schema.enum(CEREBRO_AGENTS).optional(),
          task_id: tool.schema.string().optional(),
          limit: tool.schema.number().int().min(1).max(100).optional(),
          poll: tool.schema.boolean().optional(),
        },
        async execute(args, toolContext) {
          return JSON.stringify(await collectChildSessionResult(args, toolContext), null, 2);
        },
      }),

      cerebro_collect_batch_results: tool({
        description: "Collect multiple asynchronous child sessions in parallel and record each result. Use after cerebro_dispatch_batch for independent worker fan-out; poll defaults to true per item.",
        args: {
          run_id: tool.schema.string().min(1),
          results: tool.schema.array(tool.schema.object({
            child_session_id: tool.schema.string().min(1),
            agent: tool.schema.enum(CEREBRO_AGENTS).optional(),
            task_id: tool.schema.string().optional(),
            limit: tool.schema.number().int().min(1).max(100).optional(),
            poll: tool.schema.boolean().optional(),
          })).min(1).max(8),
        },
        async execute(args, toolContext) {
          await recordProgress(args.run_id, {
            phase: "batch collect",
            status: "running",
            message: `${args.results.length} child session(s)`,
          }, toolContext);
          const results = await Promise.all(args.results.map((item) =>
            collectChildSessionResult({ run_id: args.run_id, poll: true, ...item }, toolContext)
          ));
          await recordProgress(args.run_id, {
            phase: "batch collect",
            status: results.every((result) => result.collected) ? "completed" : "blocked",
            message: `${results.filter((result) => result.collected).length}/${results.length} collected`,
          }, toolContext);
          return JSON.stringify({
            collected: results.filter((result) => result.collected).length,
            pending_or_failed: results.filter((result) => !result.collected).length,
            results,
          }, null, 2);
        },
      }),

      cerebro_checkpoint: tool({
        description: "Write a durable Cerebro checkpoint to survive session compaction.",
        args: {
          run_id: tool.schema.string().min(1),
          summary: tool.schema.string().min(1),
          next: tool.schema.string().optional(),
          verification: tool.schema.string().optional(),
        },
        async execute(args) {
          const record = { at: now(), ...args };
          await appendJsonl(safeRuntimePath(ctx, `team-runs/${args.run_id}.checkpoints.jsonl`), record);
          return JSON.stringify(record, null, 2);
        },
      }),

      cerebro_clear_pending: tool({
        description: "Discard pending todos for a specific team or all teams. Use when the user chooses to reset rather than resume previous work.",
        args: {
          team_name: tool.schema.string().optional().describe("Team name to clear; omit to clear all pending todos"),
        },
        async execute(args) {
          const pendingRoot = safeRuntimePath(ctx, "pending-todos");
          const legacyPendingRoot = safeRuntimePath(ctx, ".pending-todos");
          const teamName = args.team_name?.trim();
          if (teamName) assertSafeName(teamName, "team_name");
          const [items, legacyItems] = await Promise.all([
            scanPendingTodos(pendingRoot, teamName),
            scanPendingTodos(legacyPendingRoot, teamName),
          ]);
          const total = items.length + legacyItems.length;
          if (total === 0) return JSON.stringify({ cleared: 0, message: "No pending todos to clear." });
          if (teamName) {
            const teamDir = path.join(pendingRoot, teamName);
            if (existsSync(teamDir)) await rm(teamDir, { recursive: true, force: true });
            const legacyTeamDir = path.join(legacyPendingRoot, teamName);
            if (existsSync(legacyTeamDir)) await rm(legacyTeamDir, { recursive: true, force: true });
          } else {
            if (existsSync(pendingRoot)) {
              for (const entry of await readdir(pendingRoot)) {
                await rm(path.join(pendingRoot, entry), { recursive: true, force: true });
              }
            }
            if (existsSync(legacyPendingRoot)) await rm(legacyPendingRoot, { recursive: true, force: true });
          }
          return JSON.stringify({ cleared: total, message: `Cleared ${total} pending todo item(s). Starting fresh.` });
        },
      }),

      cerebro_verify_pending: tool({
        description: "Scan .cerebro/pending-todos and report CLEAR or BLOCKED before final response.",
        args: { team_name: tool.schema.string().optional() },
        async execute(args) {
          const pendingRoot = safeRuntimePath(ctx, "pending-todos");
          const legacyPendingRoot = safeRuntimePath(ctx, ".pending-todos");
          const teamName = args.team_name?.trim();
          if (teamName) assertSafeName(teamName, "team_name");
          const items = [
            ...(await scanPendingTodos(pendingRoot, teamName)),
            ...(await scanPendingTodos(legacyPendingRoot, teamName)),
          ];
          return [items.length ? "BLOCKED" : "CLEAR", ...items.map((item) => `- ${item.line} (${item.file})`)].join("\n");
        },
      }),
    },
  };
};

export const server = CerebroPlugin;
export default CerebroPlugin;
