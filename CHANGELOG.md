# Changelog

## Unreleased

- **Model-driven orchestration.** Cerebro now drives the execution loop itself — spawning
  specialist subagents and narrating each step like a personal assistant — instead of firing a
  single blocking engine call. The monolithic `cerebro_execute_workflow` engine is removed and
  replaced by three tools that keep determinism where it matters: `cerebro_next_tasks` (the
  deterministic ready frontier + routing, effort-adjusted), `cerebro_verify` (runs a task's real
  shell verification commands — the only path to status `verified`), and `cerebro_audit` (the
  final Cyclops gate). The four-phase process (Intent Gate → Codebase Assessment → Smart
  Delegation → Independent Verification) lives in the Cerebro agent prompt as the source of truth;
  the optional `opx-personal-assistant` skill sharpens *how* it keeps the user informed.
- Removed the now-vestigial `.cerebro/cerebro-identity.md` — the Cerebro agent (a `mode: primary`
  default agent) is the single source of truth for Cerebro's identity and orchestration.
- Removed the `/cerebro-index` command and `.cerebro/project-context.md`. Codebase assessment is now
  on-demand inside Cerebro's Phase 2 (scout the in-scope structure with Nightcrawler/Forge or quick
  reads each run), so a separate pre-indexing step and its cached context file are no longer needed.
- Per-task **effort** override on `cerebro_task_create` (`low` / `high`): runs that task's worker on
  the cheap/fast model (`low`) or the top-reasoning model (`high`) without changing which agent
  runs it; unset keeps the category's normal model. Plans mark trivial/hard tasks via `Effort`.
- Four new optional `opx-` skills: `opx-test` and `opx-debug` (Wolverine), `opx-code-review`
  (Beast), and `opx-security-review` (Emma Frost). Those agents regain/gain `skill: allow`.
- Added a GitHub Actions CI workflow (build, typecheck, `bun test`, and a generated-assets
  freshness gate) so regressions are caught on PRs.
- Added an MIT `LICENSE` and `package.json` `license` field.
- Added `cerebro_run_report` — a consolidated end-of-run summary (task ledger, blocked/failed
  tasks, problems grouped by severity); `/cerebro-start-work` and `/cerebro-ultrawork` call it
  for the final report instead of pointing at raw run files.
- Added CLI/config unit tests (`tests/cli.test.ts`) for provider/MCP argument parsing and the
  `open-xmen.json` merge writer (the latter would have caught the earlier dropped-key bug).
- Trimmed the asset bundle to skills only: agents/commands register through the plugin and
  `.opencode/`/`.cerebro/` files are never installed, so they are no longer generated into
  `generated-assets.ts` (45 → 3 assets). Removed now-dead `runtimeAssetMap`/`runtimeAssetPaths`
  and the unused markdown generators.

## 0.3.0

The rebirth release: orchestration moves out of prompts and into the plugin runtime.

### Added

- `cerebro_execute_workflow` — a deterministic TypeScript workflow engine that owns plan execution end to end: dependency-frontier scheduling, category routing (including the Jean Grey → Wolverine → Storm visual-engineering chain), file-conflict-aware parallel batch dispatch, worker result collection, shell-based verification of each task's `Verify` commands, bounded retries (max 2 per task), live progress and problem records, and resume-from-ledger on re-invocation.
- Cyclops audit wave: when all tasks are done and verified, the engine dispatches Cyclops once as a final quality gate. Cyclops rules `AUDIT_PASSED` or `AUDIT_FAILED` with a structured JSON findings array; retriable findings re-queue their tasks for one more engine pass.
- `files` parameter on `cerebro_task_create` — declared file scopes drive parallel-batch conflict avoidance.
- Workers may report a `GOTCHAS:` section in `TASK_RESULT`; the engine harvests it into `.cerebro/notepads/{run_id}/gotchas.md` and forwards it to later workers.
- Bundled skills, installed globally to `~/.config/opencode/skills/` with an `opx-` namespace prefix so OpenCode discovers them: `opx-frontend-design` (distinctive, non-generic frontend aesthetics), `opx-git` (atomic commits + safe rebase + history archaeology), and `opx-playwright` (real-browser UI verification, preferring the Playwright MCP server with an `npx playwright` fallback). Agents with `skill: allow` use them when present and fall back otherwise: Jean Grey + Storm (design), Cerebro (git — it owns commits/history/PRs), Cyclops (playwright — it owns interactive browser verification at the audit gate; Wolverine and Storm build and write tests instead). All remain optional overlays.
- Optional MCP servers, selected at install (multi-select or `--mcp <list>`) and saved to `open-xmen.json` (`mcp_servers`): `playwright` (`@playwright/mcp`, for the opx-playwright skill) and `semble` (`semble[mcp]`, fast code search for Nightcrawler). The plugin registers enabled servers in OpenCode config at load; off by default. Editable later by re-running install or editing the file.
- Removed the `--with-runtime-files` install path. Open X-Men is plugin-only: commands and agents register through the plugin, and skills install globally. `.cerebro/` docs/templates/schemas are now repo-internal references, not shipped into projects.
- Provider model presets. `install` offers an interactive multi-select for your model subscription(s) (OpenAI / Anthropic) plus a focus (performance / balance / cost), or accepts `--provider <list>` / `--focus <name>` non-interactively. The choice is saved to `~/.config/opencode/open-xmen.json` and the plugin resolves, per slot, the best model for that agent's job across the subscriptions you own (image stays OpenAI-only). `CEREBRO_MODEL_*` env vars still override individual slots.
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
