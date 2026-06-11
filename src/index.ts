import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import type { Permission } from "@opencode-ai/sdk";
import { lstat, readFile, readdir, rm } from "node:fs/promises";
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
import { CEREBRO_MODEL_SLOT_KEYS, MODEL_SLOT_ENV, OPTIONAL_MCP_SERVERS, enabledMcpServers, modelSlots } from "./config/models.js";
import { scheduleOpenXmenAutoUpdate, shouldRunAutoUpdateForEvent } from "./auto-update.js";
import type { TaskRecord, TaskStatus } from "./workflow/types.js";
import {
  appendJsonl,
  createTaskMutex,
  loadTasks,
  mailboxFile,
  manifestFile,
  now,
  problemsFile,
  progressFile,
  readJson,
  safeRuntimePath,
  saveTasks,
  slug,
  writeJson,
} from "./workflow/fs.js";
import {
  assistantTextFromMessages,
  childSessionID,
  hasChildSessionClient,
  isRecord,
  parseModelID,
  resultData,
  terminalAssistantMarker,
} from "./workflow/results.js";
import { createEventRecorder } from "./workflow/events.js";
import { createSessionRunner } from "./workflow/sessions.js";
import { executeWorkflow } from "./workflow/engine.js";
import { runVerificationCommands } from "./workflow/verify.js";
import { summarizeLedger } from "./workflow/scheduler.js";

const COMMANDS = new Set<string>(CEREBRO_COMMANDS);
const RISKS = [...CEREBRO_RISKS] as const;
const TASK_STATUSES = [...CEREBRO_TASK_STATUSES] as const;
const SAFE_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const SECRET_PATH_PATTERN = /(^|[/\\])\.env(\.|$|[/\\])|secret|credential|private[-_]?key/i;
const MAX_PENDING_FILES = 500;
const MAX_PENDING_FILE_BYTES = 64 * 1024;
type Risk = (typeof RISKS)[number];

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
  mcp?: Record<string, Record<string, unknown> | undefined>;
};

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

  // Register optional MCP servers the user opted into via open-xmen.json `mcp_servers`
  // (e.g. playwright for the opx-playwright skill, semble for Nightcrawler's code search).
  // Off unless enabled, so no extra processes are spawned by default.
  for (const name of enabledMcpServers()) {
    input.mcp ??= {};
    input.mcp[name] ??= {
      type: "local",
      command: OPTIONAL_MCP_SERVERS[name].command,
      enabled: true,
    };
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

export const CerebroPlugin: Plugin = async (input) => {
  const { worktree, directory, client } = input;
  const ctx = { worktree, directory };
  let sessionCheckDone = false;
  let autoUpdateScheduled = false;

  // One mutex shared by every ledger writer (tools and engine) so load→mutate→save cycles never interleave.
  const mutex = createTaskMutex();
  const events = createEventRecorder(ctx, mutex);
  const sessions = createSessionRunner(client, ctx, events);
  const { recordProgress, recordProblem, recordAgentResult } = events;

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

          if (["/cerebro-ultrawork", "/cerebro-start-work"].includes(args.command)) {
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
        description: "Create a task record for a Cerebro run. Include category, files, depends_on, and verification_commands when creating records from a plan so the workflow engine can route, batch, and verify deterministically.",
        args: {
          run_id: tool.schema.string().min(1),
          subject: tool.schema.string().min(1),
          description: tool.schema.string().min(1),
          owner: tool.schema.string().min(1).describe("Cerebro role or spawned agent name"),
          category: tool.schema.enum(["visual-engineering", "architecture", "explore", "research", "deep", "quick"]).optional(),
          effort: tool.schema.enum(["low", "high"]).optional().describe("Optional model-tier override for this task: low runs it on the cheap/fast model, high on the top-reasoning model. Omit for the category's normal model."),
          verification_commands: tool.schema.array(tool.schema.string().min(1)).optional(),
          depends_on: tool.schema.array(tool.schema.string()).optional(),
          files: tool.schema.array(tool.schema.string().min(1)).optional().describe("Repo-relative file paths this task is expected to touch; the workflow engine uses them to avoid scheduling conflicting tasks in the same parallel batch"),
        },
        execute: (args, toolContext) => mutex.serialize(args.run_id, async () => {
          const tasks = await loadTasks(ctx, args.run_id);
          const id = `task-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
          const record: TaskRecord = {
            id,
            subject: args.subject,
            description: args.description,
            owner: args.owner,
            ...(args.category ? { category: args.category } : {}),
            ...(args.effort ? { effort: args.effort } : {}),
            ...(args.verification_commands?.length ? { verification_commands: args.verification_commands } : {}),
            ...(args.files?.length ? { files: args.files } : {}),
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
        execute: (args, toolContext) => mutex.serialize(args.run_id, async () => {
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
          await appendJsonl(mailboxFile(ctx, args.run_id), record);
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
          const file = mailboxFile(ctx, args.run_id);
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

      cerebro_run_report: tool({
        description: "Build a consolidated end-of-run report for a Cerebro run: task ledger summary, blocked/failed tasks, and workflow problems grouped by severity. Use this for the final report instead of scraping the run files manually.",
        args: {
          run_id: tool.schema.string().min(1),
        },
        async execute(args) {
          const tasks = await loadTasks(ctx, args.run_id);
          const ledger = summarizeLedger(tasks);
          const manifest = await readJson<{ objective?: string; status?: string }>(manifestFile(ctx, args.run_id), {});

          const blocked = tasks
            .filter((task) => task.status === "blocked" || task.status === "failed")
            .map((task) => `- ${task.id} [${task.status}] (${task.owner}): ${task.subject}${task.notes.at(-1) ? `\n  ${task.notes.at(-1)}` : ""}`);

          const problemsPath = problemsFile(ctx, args.run_id);
          const severityRank = ["blocker", "error", "warning", "info"] as const;
          const counts: Record<string, number> = {};
          const openProblems: Array<{ severity: string; title: string; task_id?: string; recommendation?: string }> = [];
          if (existsSync(problemsPath)) {
            for (const line of (await readFile(problemsPath, "utf8")).split("\n").filter(Boolean)) {
              try {
                const p = JSON.parse(line) as { severity?: string; status?: string; title?: string; task_id?: string; recommendation?: string };
                counts[p.severity ?? "warning"] = (counts[p.severity ?? "warning"] ?? 0) + 1;
                if ((p.status ?? "open") === "open" && (p.severity === "blocker" || p.severity === "error")) {
                  openProblems.push({ severity: p.severity ?? "error", title: p.title ?? "", task_id: p.task_id, recommendation: p.recommendation });
                }
              } catch {
                // skip malformed problem line
              }
            }
          }

          const lines: string[] = [
            `# Run report: ${args.run_id}`,
            manifest.objective ? `Objective: ${manifest.objective}` : "",
            "",
            `Tasks: ${ledger.verified + ledger.done}/${ledger.total} complete (verified ${ledger.verified}, done ${ledger.done}, blocked ${ledger.blocked}, failed ${ledger.failed}, pending ${ledger.pending}, active ${ledger.active})`,
            `Problems: ${severityRank.map((s) => `${counts[s] ?? 0} ${s}`).join(", ")}`,
          ];
          if (blocked.length) lines.push("", "## Blocked / failed tasks", ...blocked);
          if (openProblems.length) {
            lines.push("", "## Open blockers & errors");
            for (const p of openProblems) {
              lines.push(`- ${p.severity}${p.task_id ? ` [${p.task_id}]` : ""}: ${p.title}${p.recommendation ? `\n  fix: ${p.recommendation}` : ""}`);
            }
          }
          if (!blocked.length && !openProblems.length) lines.push("", "No blocked tasks or open blocker/error problems. Clean run.");
          return lines.filter((l) => l !== undefined).join("\n");
        },
      }),

      cerebro_execute_workflow: tool({
        description: "Run the deterministic Cerebro workflow engine for a run: schedules the dependency frontier, routes tasks by category, dispatches/collects worker child sessions, runs each task's verification commands in a shell, retries failures, and finishes with a Cyclops audit wave. Blocks until complete/blocked. Re-invoke with the same run_id to resume — the engine skips tasks that are already done and verified.",
        args: {
          run_id: tool.schema.string().min(1),
          max_parallel: tool.schema.number().int().min(1).max(8).optional().describe("Max worker sessions per wave (default 4)"),
          max_retries: tool.schema.number().int().min(0).max(5).optional().describe("Max retries per task after the first attempt (default 2)"),
          stop_on_blocker: tool.schema.boolean().optional().describe("Stop the run when a task blocks instead of finishing the rest (default true)"),
          audit: tool.schema.boolean().optional().describe("Dispatch the final Cyclops audit wave (default true)"),
          verification_timeout_seconds: tool.schema.number().int().min(10).max(3600).optional().describe("Per-verification-command timeout (default 600)"),
          overall_timeout_minutes: tool.schema.number().int().min(5).max(720).optional().describe("Overall wall-clock budget for this invocation (default 360)"),
          plan_path: tool.schema.string().optional().describe("Repo-relative path to the active plan, passed to workers and the auditor as context"),
        },
        async execute(args, toolContext) {
          const result = await executeWorkflow(
            { ctx, sessions, verifier: runVerificationCommands, events, mutex },
            args,
            toolContext,
          );
          return {
            title: `workflow ${result.status}: ${result.tasks.verified + result.tasks.done}/${result.tasks.total} task(s) complete${result.audit ? `, audit ${result.audit.verdict}` : ""}`,
            output: JSON.stringify(result, null, 2),
            metadata: result,
          };
        },
      }),

      cerebro_dispatch_agent: tool({
        description: "Low-level: dispatch an asynchronous OpenCode child session for a Cerebro agent and record the dispatch in the mailbox. Prefer cerebro_execute_workflow for plan execution; use this for one-off fire-and-collect flows and recovery.",
        args: {
          run_id: tool.schema.string().min(1),
          agent: tool.schema.enum(CEREBRO_AGENTS).describe("Cerebro agent name, e.g. wolverine, nightcrawler, professor-x"),
          description: tool.schema.string().min(1),
          prompt: tool.schema.string().min(1),
          model_slot: tool.schema.enum(CEREBRO_MODEL_SLOT_KEYS).optional().describe("Cerebro role model slot override for this dispatch"),
          no_reply: tool.schema.boolean().optional(),
        },
        async execute(args, toolContext) {
          return JSON.stringify(await sessions.dispatch(args, toolContext), null, 2);
        },
      }),

      cerebro_dispatch_batch: tool({
        description: "Low-level: dispatch multiple independent Cerebro child sessions asynchronously in one call for parallel consultations. Prefer cerebro_execute_workflow for plan execution. Collect each child session with cerebro_collect_batch_results or cerebro_collect_result.",
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
            sessions.dispatch({ run_id: args.run_id, ...request }, toolContext, "dispatch_batch")
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
          await appendJsonl(mailboxFile(ctx, args.run_id), {
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
            await appendJsonl(mailboxFile(ctx, args.run_id), {
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
            await appendJsonl(mailboxFile(ctx, args.run_id), {
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
        description: "Low-level: collect the latest assistant text from an asynchronous child session, record it, and optionally update a task ledger entry. Pass poll: true to block until a terminal marker is seen (TASK_RESULT, DESIGN_SPEC_READY, PLAN_DRAFT, REQUIREMENTS_READY, AUDIT_PASSED, etc.). The workflow engine collects its own workers; use this for recovery and one-off dispatches.",
        args: {
          run_id: tool.schema.string().min(1),
          child_session_id: tool.schema.string().min(1),
          agent: tool.schema.enum(CEREBRO_AGENTS).optional(),
          task_id: tool.schema.string().optional(),
          limit: tool.schema.number().int().min(1).max(100).optional(),
          poll: tool.schema.boolean().optional(),
        },
        async execute(args, toolContext) {
          return JSON.stringify(await sessions.collect(args, toolContext), null, 2);
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
            sessions.collect({ run_id: args.run_id, poll: true, ...item }, toolContext)
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
