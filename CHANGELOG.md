# Changelog

## Unreleased

- **Minor robustness mop-up.** (1) **Parallel-write safety:** a task with no declared `files` has an
  unknown footprint, so it's no longer treated as conflict-free — it's scheduled **alone** rather than
  co-scheduled in a parallel wave where it could clobber another task's file. A task that **explicitly
  declares an empty `files: []`** (read-only scouts/research/test-only) is a positive "touches nothing"
  declaration and still **fans out** in parallel — only an *omitted* `files` is treated as unknown.
  `cerebro_task_create` now persists an explicit `[]` (previously dropped), and the planner prompt
  tells Professor X to use an empty `Files` list for read-only tasks. (2) **Bounded mutex map:** the
  per-run lock map now evicts a run's entry once its queue drains, instead of growing for the life of
  the process. (3) **Correct semver ordering:** `compareSemver` (auto-update) now ranks a release above
  a prerelease of the same core (`1.0.0` > `1.0.0-rc1`) and compares prerelease identifiers per spec,
  instead of a lexical fallback that ordered them backwards.
- **Crash-safe task ledger.** `.cerebro/team-runs/{run}.tasks.json` — the durability backbone the
  resume/claim/retry logic depends on — was written with a plain `writeFile`, so a crash mid-write
  could truncate it, and `loadTasks` threw on anything but a missing file, bricking the run. Writes
  are now atomic (temp file → `fsync` → `rename`, so the target is always a complete old-or-new
  version), `saveTasks` keeps a `.bak` of the prior ledger, and `loadTasks` falls back to that
  backup on a corrupt/partial primary instead of throwing.
- **`cerebro_verify` refuses destructive shell.** Verification commands are model-authored and run
  in a real shell *without* OpenCode's `permission.bash: ask` gate, so an injected `curl … | sh` or
  `rm -rf /` would have run unprompted. `cerebro_verify` now scans commands against a high-precision
  destructive-pattern list (root/home `rm -rf`, download-piped-to-interpreter, `dd of=/dev/…`,
  `mkfs`, fork bomb, etc.) and **refuses to run** the batch if any match, recording a blocker problem.
  Override with `OPEN_XMEN_ALLOW_UNSAFE_VERIFY=1`. Patterns are narrow enough to allow normal test
  commands (`rm -rf node_modules/.cache`, health-check `curl`).
- **De-duplicated the JSONC parser.** `stripJsonComments`/`removeTrailingCommas`/`parseJsonc` were
  copy-pasted into `cli/config.ts`, `cli/doctor.ts`, and `auto-update.ts` (three drifting copies);
  they now live in one `src/cli/jsonc.ts` (`parseJsonc` throws, `tryParseJsonc` returns `undefined`).
- **Safe parallel orchestration: tasks are claimed, and retries are deterministic.** Parallel waves
  relied on the orchestrator never re-querying mid-wave — because `cerebro_next_tasks` returned
  `pending` tasks that nothing marked in-flight, so a re-query could hand the same task out (and
  spawn it) twice. Now `cerebro_next_tasks` **claims** its batch (`pending` → `active`) under the run
  mutex, so the frontier never re-offers a task already dispatched; the first call per session first
  reconciles stale `active` claims from a crashed prior session back to `pending`. `cerebro_verify`
  on FAIL now increments `attempts` and **requeues** the task (→ `pending`, re-dispatched by the next
  wave) until it exhausts the retry budget (`MAX_VERIFY_ATTEMPTS = 3`), at which point it auto-`blocks`
  and records a blocker problem — so a failing task can't loop forever and the model no longer tracks
  retry counts by hand. New pure, unit-tested scheduler helpers: `claimTasks`, `reactivateStaleActive`,
  `applyVerificationFailure`. Cerebro/command prompts updated to spawn the whole claimed batch
  concurrently and rely on the tool-driven requeue/block.
- **Removed the dead per-task `effort` / `model_slot` surface.** Since the 0.4.0 move to the native
  `task` tool (which has no per-call model override), a task's `effort` and the `model_slot` returned
  by `cerebro_next_tasks` did nothing — yet `cerebro_task_create` still advertised that `effort`
  changed the model. Dropped `effort` (tool arg + `TaskRecord`), `model_slot` (from `cerebro_next_tasks`
  output and the `Route`/`ChainStage` routing types), and `effortModelSlot()`, plus the matching prompt
  and command-definition wording, so the model is no longer told to set a knob that has no effect.
- **Dead-field + cruft cleanup.** Removed the vestigial `child_session_id` (left over from the deleted
  child-session subsystem) and `chain_state` `TaskRecord` fields, and dropped the legacy
  `.cerebro/.pending-todos` dual-scan (only `.cerebro/pending-todos` is used now).
- **`cerebro_model_slots` now also returns the resolved per-agent models.** Output is
  `{ slots, agents }` so Cerebro can see what each agent will actually run on (per-agent override →
  preset → default), not just the role-slot defaults — closing a gap opened by the per-agent table.
- **Editable per-agent model mapping in `open-xmen.json` (oh-my-openagent style).** `install` now
  writes a per-agent table to an `agents` key in `~/.config/opencode/open-xmen.json` — one entry per
  agent, seeded from the preset — so each of the 13 agents is individually tunable instead of being
  collapsed onto the 8 role slots. Each entry is a model id string, or an object
  `{ model, variant?, fallback_models? }` for finer control. A non-empty entry overrides the
  focus/provider preset for that agent; removing it (or setting it empty) falls back to the preset.
  Per-agent precedence: `CEREBRO_MODEL_<SLOT>` env → legacy env → `agents.<name>` → preset →
  defaults. `open-xmen models` now prints both the role slots and the resolved per-agent mapping. A
  reconfigure (re-running `install` with a new provider/focus) refreshes the table; a plain
  re-install preserves hand edits, and a bare non-interactive install stays side-effect-free.
- **Audit via the native task tool; removed `cerebro_audit`, `cerebro_progress`, and the last of the
  child-session machinery.** Cerebro now spawns Cyclops for the final audit with the `task` tool
  (`subagent_type: cyclops`) like every other agent — so the audit is a **visible session** too — and
  reads the `AUDIT_PASSED`/`AUDIT_FAILED` verdict from the reply, recording findings via
  `cerebro_problem_report`. This removed the last consumer of the `SessionRunner`, so `sessions.ts`
  (dispatch/poll/marker machinery) is **deleted**. Also removed `cerebro_progress` /
  `cerebro_progress_read` (live status is covered by narration + visible windows; nothing read the
  progress log) and the now-dead result parsers (`parseAuditVerdict`, `summarizeTaskResult`,
  `parseGotchas`, `parseDesignSpecPath`, child-session helpers). Net: one spawning mechanism, fewer
  tools, less code; determinism still lives in `cerebro_verify` (real shell) and `cerebro_next_tasks`.
- **Autonomous runs go non-stop.** Raised the orchestrator's step budget (Cerebro `steps` 60 → 1000)
  and the worker budget (60 → 200). A full autonomous build (plan → assess → many spawn/verify
  cycles → audit → report) was exhausting Cerebro's 60-step turn limit and halting partway with
  "maximum steps reached," forcing a manual resume — the opposite of autonomous. Native task-tool
  spawning also costs fewer orchestrator steps per task (no separate collect call).
- **Fixed `doctor` failing on large configs.** `opencode debug config` truncates its piped stdout
  (it exits before the pipe drains) once the resolved config passes ~64KB, which our 13-agent
  config now does — so `doctor` (and the release smoke) read invalid JSON and reported "could not
  read resolved OpenCode config." Both now capture the output via a temp file instead of a pipe.
- **Native subagent spawning (visible windows).** Cerebro now spawns specialists with OpenCode's
  built-in `task` tool (`subagent_type` = the routed agent) instead of custom child-session
  machinery. Subagents render as **visible sessions** in the TUI (like oh-my-openagent), OpenCode
  manages completion (no more polling for a terminal marker — which could hang a run for up to 30
  minutes when a free-form scout never printed `TASK_RESULT`), and independent tasks still run in
  parallel (concurrent `task` calls). Removed the custom `cerebro_agent_task`,
  `cerebro_dispatch_agent`, `cerebro_dispatch_batch`, `cerebro_collect_result`, and
  `cerebro_collect_batch_results` tools (the SessionRunner is retained only for the Cyclops audit
  dispatch). Trade-off: the `task` tool has no per-call model parameter, so the per-task `effort`
  (low/high) hint no longer swaps the model — each agent runs on its own configured model + fallbacks.
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
- **MCP cold-start timeout.** Optional MCP servers now register with a longer startup timeout (60s
  playwright, 120s semble) so a first-run `npx`/`uvx` package download isn't killed by OpenCode's
  ~30s default. Documented pre-warming (`uv tool install "semble[mcp]"`) and `opencode mcp list` for
  status. (Wiring via the plugin `config` hook was already correct — OpenCode honors it.)
- **Sharper Intent Gate.** Cerebro now triages a natural-language request by complexity and risk and
  recommends a path (Direct / Autonomous / Collaborative) instead of asking open-endedly — deciding
  more, asking less. When it does need the user to choose, it presents the options through OpenCode's
  built-in interactive `question` tool (selectable, recommended option first) rather than a "reply
  with 1 or 2" text menu; the same selector now backs the autonomy choice, the session-resume
  prompt, and the `/cerebro-ultrawork` HIGH-risk Approve/Cancel pause. Falls back to a numbered text
  prompt when the `question` tool isn't available. (Cerebro already had `question: "allow"`.)
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
- README and docs repositioned: Open X-Men is no longer described as a Claude Code port — it is model-as-brain, engine-as-conductor.

### Removed

- The prompt-driven Cyclops-conductor execution flow (`EXECUTION_COMPLETE` / `EXECUTION_BLOCKED` contract). The engine's structured result replaces it.
