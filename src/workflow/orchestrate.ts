import { findDeadlockedTasks, pickBatch, selectFrontier, summarizeLedger } from "./scheduler.js";
import type { LedgerSummary } from "./scheduler.js";
import { resolveRoute } from "./routing.js";
import type { TaskRecord } from "./types.js";

export type ReadyTask = {
  task_id: string;
  subject: string;
  /** Primary agent to spawn. For visual-engineering this is the first chain stage (jean-grey). */
  agent: string;
  /** Sequential agent chain for visual-engineering tasks (design → structure → visual), else undefined. */
  chain?: Array<{ agent: string; stage: string }>;
  /** Prior failed verification attempts. 0 = first dispatch; ≥1 = a requeued retry — drives the escalation ladder. */
  attempts: number;
};

export type NextTasks = {
  ready: ReadyTask[];
  remaining: number;
  blocked: boolean;
  deadlocked: Array<{ task_id: string; waits_on: string[] }>;
  ledger: LedgerSummary;
};

// Deterministic scheduling for the model-driven orchestrator: returns the conflict-free ready
// frontier with routing already resolved, so Cerebro spawns the right agent/model per task without
// owning the scheduling algorithm. Pure over the ledger snapshot.
export function routeReadyBatch(tasks: TaskRecord[], maxParallel = 4): NextTasks {
  const ledger = summarizeLedger(tasks);
  const frontier = selectFrontier(tasks);
  const batch = pickBatch(frontier, maxParallel);

  const ready: ReadyTask[] = batch.map((task) => {
    const route = resolveRoute(task);
    const attempts = task.attempts ?? 0;
    if (route.kind === "chain") {
      return {
        task_id: task.id,
        subject: task.subject,
        agent: route.stages[0].agent,
        chain: route.stages.map((stage) => ({ agent: stage.agent, stage: stage.name })),
        attempts,
      };
    }
    return {
      task_id: task.id,
      subject: task.subject,
      agent: route.agent,
      attempts,
    };
  });

  const remaining = ledger.pending + ledger.active;
  const deadlocked = ready.length === 0
    ? findDeadlockedTasks(tasks).map((task) => ({ task_id: task.id, waits_on: task.depends_on }))
    : [];
  const blocked = ready.length === 0 && (ledger.blocked > 0 || ledger.failed > 0 || deadlocked.length > 0);

  return { ready, remaining, blocked, deadlocked, ledger };
}
