import { modelSlots } from "../config/models.js";
import { appendJsonl, mailboxFile, now, progressFile } from "./fs.js";
import {
  CHILD_SESSION_TERMINAL_MARKERS,
  assistantTextFromMessages,
  childSessionID,
  hasChildSessionClient,
  hasTerminalAssistantMarker,
  parseModelID,
  terminalAssistantMarker,
} from "./results.js";
import type { TaskResultSummary } from "./results.js";
import { formatElapsed, setToolProgress } from "./events.js";
import type { EventRecorder } from "./events.js";
import type { RuntimeContext, ToolProgressContext } from "./types.js";

export type DispatchChildArgs = {
  run_id: string;
  task_id?: string;
  agent: string;
  description: string;
  prompt: string;
  model_slot?: string;
  no_reply?: boolean;
};

export type CollectChildArgs = {
  run_id: string;
  child_session_id: string;
  agent?: string;
  task_id?: string;
  limit?: number;
  poll?: boolean;
};

export type DispatchResult = {
  dispatched: boolean;
  child_session_id?: string;
  agent: string;
  task_id?: string;
  model?: string;
  fallback?: string;
  error?: string;
};

export type CollectResult = {
  collected: boolean;
  child_session_id: string;
  agent?: string;
  task_id?: string;
  terminal_marker?: string;
  parsed?: TaskResultSummary;
  output?: string;
  timed_out?: boolean;
  terminal_markers?: readonly string[];
  message?: string;
  error?: string;
};

export type DispatchToolContext = { sessionID: string; directory: string } & ToolProgressContext;
export type CollectToolContext = { directory: string; abort?: AbortSignal } & ToolProgressContext;

export type SessionRunner = {
  dispatch(args: DispatchChildArgs, toolContext: DispatchToolContext, dispatchType?: "dispatch" | "dispatch_batch"): Promise<DispatchResult>;
  collect(args: CollectChildArgs, toolContext: CollectToolContext): Promise<CollectResult>;
};

export function createSessionRunner(client: unknown, ctx: RuntimeContext, events: EventRecorder): SessionRunner {
  const { recordProgress, recordProblem, recordAgentResult } = events;

  async function dispatch(
    args: DispatchChildArgs,
    toolContext: DispatchToolContext,
    dispatchType: "dispatch" | "dispatch_batch" = "dispatch",
  ): Promise<DispatchResult> {
    await recordProgress(args.run_id, {
      phase: dispatchType === "dispatch_batch" ? "batch dispatch" : "dispatch",
      status: "started",
      message: `${args.agent} — ${args.description}`,
      task_id: args.task_id,
      agent: args.agent,
    }, toolContext);
    await appendJsonl(mailboxFile(ctx, args.run_id), {
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
      await appendJsonl(mailboxFile(ctx, args.run_id), {
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
      await appendJsonl(mailboxFile(ctx, args.run_id), {
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

  async function collect(
    args: CollectChildArgs,
    toolContext: CollectToolContext,
  ): Promise<CollectResult> {
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
              source: "cerebro_audit",
              task_id: args.task_id,
              agent: args.agent,
              evidence: `No terminal marker after ${formatElapsed(MAX_POLL_MS)} for child session ${args.child_session_id}`,
              recommendation: "Re-run cerebro_audit, or inspect the Cyclops child session.",
            }, toolContext).catch(() => undefined);
            return {
              collected: false,
              child_session_id: args.child_session_id,
              timed_out: true,
              terminal_markers: CHILD_SESSION_TERMINAL_MARKERS,
              message: "Polling timed out after 30 minutes. Re-run cerebro_audit to retry.",
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
      await appendJsonl(mailboxFile(ctx, args.run_id), {
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

  return { dispatch, collect };
}
