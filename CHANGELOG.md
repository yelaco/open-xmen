# Changelog

## 0.3.0

The rebirth release: orchestration moves out of prompts and into the plugin runtime.

### Added

- `cerebro_execute_workflow` — a deterministic TypeScript workflow engine that owns plan execution end to end: dependency-frontier scheduling, category routing (including the Jean Grey → Wolverine → Storm visual-engineering chain), file-conflict-aware parallel batch dispatch, worker result collection, shell-based verification of each task's `Verify` commands, bounded retries (max 2 per task), live progress and problem records, and resume-from-ledger on re-invocation.
- Cyclops audit wave: when all tasks are done and verified, the engine dispatches Cyclops once as a final quality gate. Cyclops rules `AUDIT_PASSED` or `AUDIT_FAILED` with a structured JSON findings array; retriable findings re-queue their tasks for one more engine pass.
- `files` parameter on `cerebro_task_create` — declared file scopes drive parallel-batch conflict avoidance.
- Workers may report a `GOTCHAS:` section in `TASK_RESULT`; the engine harvests it into `.cerebro/notepads/{run_id}/gotchas.md` and forwards it to later workers.
- Bundled `frontend-design` skill (`.opencode/skills/frontend-design/SKILL.md`, installed with `--with-runtime-files`) for distinctive, non-generic frontend aesthetics. Jean Grey and Storm have `skill: allow` and reference it for UI work; it remains an optional overlay.
- `bun test` suite covering the scheduler, router, verifier, result parsers, and engine loop.

### Changed

- **Cyclops is reborn as the final Auditor.** It no longer conducts execution as a child session; the workflow engine owns routing, batching, verification, and retries. Cyclops is read-only with inspection bash.
- `/cerebro-start-work` and `/cerebro-ultrawork` now create task records and call `cerebro_execute_workflow` instead of dispatching Cyclops as a conductor.
- Renamed `/to-me-my-x-men` to `/cerebro-ultrawork`; the command now opens with the "To me, my X-Men!" catchphrase when it starts working.
- Cerebro confirms the workflow (and, for builds, an Autonomous vs Collaborative choice) before running anything when a request arrives in natural conversation; direct slash commands are honored without a prompt.
- The `conductor` model slot is renamed to `auditor`. `CEREBRO_MODEL_CONDUCTOR` is still honored as a legacy fallback; new setups should use `CEREBRO_MODEL_AUDITOR`.
- `cerebro_dispatch_agent`, `cerebro_dispatch_batch`, `cerebro_collect_result`, and `cerebro_collect_batch_results` are demoted to low-level recovery/consultation tools.
- README and docs repositioned: Open X-Men is no longer described as a Claude Code port — it is model-as-brain, engine-as-conductor.

### Removed

- The prompt-driven Cyclops-conductor execution flow (`EXECUTION_COMPLETE` / `EXECUTION_BLOCKED` contract). The engine's structured result replaces it.
