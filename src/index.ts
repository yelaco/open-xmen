import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import type { Part, Permission } from "@opencode-ai/sdk";
import { appendFile, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { CEREBRO_AGENTS, CEREBRO_COMMANDS, CEREBRO_RISKS, CEREBRO_TASK_STATUSES, DEFAULT_MODEL_SLOTS } from "./runtime/index.js";

const COMMANDS = new Set<string>(CEREBRO_COMMANDS);
const RISKS = [...CEREBRO_RISKS] as const;
const TASK_STATUSES = [...CEREBRO_TASK_STATUSES] as const;
const SAFE_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const SECRET_PATH_PATTERN = /(^|[/\\])\.env(\.|$|[/\\])|secret|credential|private[-_]?key/i;
const MAX_PENDING_FILES = 500;
const MAX_PENDING_FILE_BYTES = 64 * 1024;
type Risk = (typeof RISKS)[number];
type TaskStatus = (typeof TASK_STATUSES)[number];

type RuntimeContext = {
  worktree: string;
  directory: string;
};

type TaskRecord = {
  id: string;
  subject: string;
  description: string;
  owner: string;
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
  };
};

function now() {
  return new Date().toISOString().replace("+00:00", "Z");
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
  if (!existsSync(file)) return fallback;
  return JSON.parse(await readFile(file, "utf8")) as T;
}

async function writeJson(file: string, data: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function appendJsonl(file: string, data: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(data)}\n`, "utf8");
}

function modelSlots() {
  return {
    frontier: process.env.CEREBRO_MODEL_FRONTIER || DEFAULT_MODEL_SLOTS.frontier,
    strong: process.env.CEREBRO_MODEL_STRONG || DEFAULT_MODEL_SLOTS.strong,
    coding: process.env.CEREBRO_MODEL_CODING || DEFAULT_MODEL_SLOTS.coding,
    spark: process.env.CEREBRO_MODEL_SPARK || DEFAULT_MODEL_SLOTS.spark,
    fast: process.env.CEREBRO_MODEL_FAST || DEFAULT_MODEL_SLOTS.fast,
    image: process.env.CEREBRO_MODEL_IMAGE || DEFAULT_MODEL_SLOTS.image,
  };
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

function taskFile(ctx: RuntimeContext, runId: string) {
  return safeRuntimePath(ctx, `team-runs/${runId}.tasks.json`);
}

function manifestFile(ctx: RuntimeContext, runId: string) {
  return safeRuntimePath(ctx, `team-runs/${runId}.json`);
}

async function loadTasks(ctx: RuntimeContext, runId: string): Promise<TaskRecord[]> {
  return readJson<TaskRecord[]>(taskFile(ctx, runId), []);
}

async function saveTasks(ctx: RuntimeContext, runId: string, tasks: TaskRecord[]) {
  await writeJson(taskFile(ctx, runId), tasks);
}

export const CerebroPlugin: Plugin = async ({ worktree, directory, client }) => {
  const ctx = { worktree, directory };
  let sessionCheckDone = false;

  return {
    async "permission.ask"(input: Permission, output) {
      const pattern = Array.isArray(input.pattern) ? input.pattern[0] : (input.pattern ?? "");
      if (pattern && isSecretPath(pattern)) {
        output.status = "deny";
        return;
      }
      if (pattern && (pattern.startsWith(".cerebro/") || pattern.includes("/.cerebro/"))) {
        output.status = "allow";
      }
    },

    async "shell.env"(_input, output) {
      const slots = modelSlots();
      output.env.CEREBRO_MODEL_FRONTIER = slots.frontier;
      output.env.CEREBRO_MODEL_STRONG = slots.strong;
      output.env.CEREBRO_MODEL_CODING = slots.coding;
      output.env.CEREBRO_MODEL_SPARK = slots.spark;
      output.env.CEREBRO_MODEL_FAST = slots.fast;
      output.env.CEREBRO_MODEL_IMAGE = slots.image;
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
      output.parts.unshift({
        id: `cerebro-command-${input.sessionID}`,
        sessionID: input.sessionID,
        messageID: `cerebro-command-${input.command}`,
        type: "text",
        text: [
          "Cerebro OpenCode runtime is active.",
          "Before acting, use the Cerebro coordination tools for run state, mailbox, checkpoints, pending-todo checks, and model-slot lookup.",
          "Runtime root: `.cerebro/`. Preserve command names and role names.",
        ].join("\n"),
        synthetic: true,
      } satisfies Part);
    },

    async "tool.execute.before"(_input, output) {
      const args = readToolArgs(output.args);
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
        async execute(args) {
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

          return JSON.stringify({ run_id: runId, manifest: `.cerebro/team-runs/${runId}.json`, tasks: `.cerebro/team-runs/${runId}.tasks.json` }, null, 2);
        },
      }),

      cerebro_task_create: tool({
        description: "Create a task record for a Cerebro run.",
        args: {
          run_id: tool.schema.string().min(1),
          subject: tool.schema.string().min(1),
          description: tool.schema.string().min(1),
          owner: tool.schema.string().min(1).describe("Cerebro role or spawned agent name"),
          depends_on: tool.schema.array(tool.schema.string()).optional(),
        },
        async execute(args) {
          const tasks = await loadTasks(ctx, args.run_id);
          const id = `task-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
          const record: TaskRecord = {
            id,
            subject: args.subject,
            description: args.description,
            owner: args.owner,
            status: "pending",
            depends_on: args.depends_on || [],
            created_at: now(),
            updated_at: now(),
            notes: [],
            verification: [],
          };
          tasks.push(record);
          await saveTasks(ctx, args.run_id, tasks);
          return JSON.stringify(record, null, 2);
        },
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
        async execute(args) {
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
          return JSON.stringify(taskRecord, null, 2);
        },
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

      cerebro_dispatch_agent: tool({
        description: "Dispatch an OpenCode child session for a Cerebro agent and record the dispatch in the mailbox. Returns child session metadata when the SDK supports it, otherwise returns a fallback instruction.",
        args: {
          run_id: tool.schema.string().min(1),
          agent: tool.schema.enum(CEREBRO_AGENTS).describe("Cerebro agent name, e.g. wolverine, nightcrawler, professor-x"),
          description: tool.schema.string().min(1),
          prompt: tool.schema.string().min(1),
          model_slot: tool.schema.enum(["frontier", "strong", "coding", "spark", "fast", "image"]).optional().describe("Cerebro model slot override for this dispatch"),
          no_reply: tool.schema.boolean().optional(),
        },
        async execute(args, toolContext) {
          await appendJsonl(safeRuntimePath(ctx, `team-runs/${args.run_id}.mailbox.jsonl`), {
            at: now(), type: "dispatch", from: "cerebro", to: args.agent, description: args.description,
          });
          try {
            if (!hasChildSessionClient(client)) throw new Error("OpenCode SDK client does not expose child session create/promptAsync methods");
            const created = await client.session.create({
              body: { parentID: toolContext.sessionID, title: `${args.agent}: ${args.description}` },
              query: { directory: toolContext.directory },
            });
            const childID = childSessionID(created);
            if (!childID) throw new Error("OpenCode SDK did not return a child session id");
            const slots = modelSlots();
            const selectedModel = args.model_slot ? slots[args.model_slot] : undefined;
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
            return JSON.stringify({ dispatched: true, child_session_id: childID, agent: args.agent, model: selectedModel || "agent-default" }, null, 2);
          } catch (error) {
            return JSON.stringify({
              dispatched: false,
              agent: args.agent,
              fallback: `Use @${args.agent} with the prompt supplied to cerebro_dispatch_agent.`,
              error: error instanceof Error ? error.message : String(error),
            }, null, 2);
          }
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
          const teamName = args.team_name?.trim();
          if (teamName) assertSafeName(teamName, "team_name");
          const items = await scanPendingTodos(pendingRoot, teamName);
          if (items.length === 0) return JSON.stringify({ cleared: 0, message: "No pending todos to clear." });
          if (teamName) {
            const teamDir = path.join(pendingRoot, teamName);
            if (existsSync(teamDir)) await rm(teamDir, { recursive: true, force: true });
          } else {
            for (const entry of await readdir(pendingRoot)) {
              await rm(path.join(pendingRoot, entry), { recursive: true, force: true });
            }
          }
          return JSON.stringify({ cleared: items.length, message: `Cleared ${items.length} pending todo item(s). Starting fresh.` });
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
