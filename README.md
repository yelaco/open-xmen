# Open X-Men — Cerebro for OpenCode

A reusable OpenCode plugin/template that ports the original Claude Code Cerebro/X-Men workflow into the OpenCode ecosystem while preserving the parts that matter:

- `.cerebro/` runtime state
- `/cerebro-index`
- `/cerebro-plan`
- `/cerebro-start-work`
- `/to-me-my-x-men`
- Cerebro and the X-Men role names

Cerebro coordinates. OpenCode agents execute. The workflow keeps the dramatic X-Men soul, but no longer depends on Claude Code native team APIs.

---

## What Changed

The old Claude workflow used `.claude/agents`, `.claude/commands`, hooks, and native team tools such as `TeamCreate`, `TaskCreate`, `TaskUpdate`, and `SendMessage`.

The OpenCode port uses:

- `.opencode/agents/*.md` — OpenCode-native Cerebro role agents (installed into target projects)
- `.opencode/commands/*.md` — preserved Cerebro slash commands (installed into target projects)
- `open-xmen` package plugin entry — wired into `opencode.jsonc` by `open-xmen install`
- `src/index.ts` — reusable plugin implementation (hooks, tools, model-slot injection)
- Cerebro custom tools for run state, tasks, mailbox, checkpoints, model slots, and pending-todo checks
- `AGENTS.md` and `.cerebro/cerebro-identity.md` — OpenCode instruction surface when runtime files are installed

---

## Model Routing

Open X-Men uses canonical role-based model slots. Agent frontmatter, `cerebro_model_slots`, command defaults, and `.cerebro/opencode/model-routing.md` are expected to agree.

| Slot | Default model | Roles |
|---|---|---|
| `orchestrator` | `openai/gpt-5.5` | Cerebro |
| `conductor` | `openai/gpt-5.5` | Cyclops |
| `planner` | `openai/gpt-5.5` | Professor X, Beast, Forge, Emma Frost |
| `design` | `openai/gpt-5.5` | Jean Grey |
| `analyst` | `openai/gpt-5.4` | Legion, Cypher |
| `workers` | `openai/gpt-5.5` | Wolverine, Storm |
| `fast` | `openai/gpt-5.4-mini-fast` | Nightcrawler, Sage |
| `image` | `openai/gpt-image-2` | image/design asset generation only |

Override with environment variables if your available models change:

```bash
export CEREBRO_MODEL_ORCHESTRATOR="openai/gpt-5.5"
export CEREBRO_MODEL_CONDUCTOR="openai/gpt-5.5"
export CEREBRO_MODEL_PLANNER="openai/gpt-5.5"
export CEREBRO_MODEL_DESIGN="openai/gpt-5.5"
export CEREBRO_MODEL_ANALYST="openai/gpt-5.4"
export CEREBRO_MODEL_WORKERS="openai/gpt-5.5"
export CEREBRO_MODEL_FAST="openai/gpt-5.4-mini-fast"
export CEREBRO_MODEL_IMAGE="openai/gpt-image-2"
```

Legacy `CEREBRO_MODEL_FRONTIER`, `CEREBRO_MODEL_STRONG`, and `CEREBRO_MODEL_CODING` are accepted as migration fallbacks, but new setups should use role slots.

---

## Quick Start

Install Open X-Men with `bunx`. The default install is **plugin-only**: it updates your OpenCode user config and lets the package plugin register commands and agents at load time.

```bash
bunx open-xmen@latest install
opencode .
```

No setup slash command is required, and no project `.opencode/`, `.cerebro/`, or `AGENTS.md` files are written by default.

To refresh the OpenCode package cache, run the same command again:

```bash
bunx open-xmen@latest install
```

The installer rewrites the `open-xmen` plugin entry if needed and force-refreshes OpenCode's cached `open-xmen@latest` package, including stale `bun.lock` / `bun.lockb` files and `node_modules/open-xmen`.

Useful installer flags:

```bash
bunx open-xmen@latest install --global
bunx open-xmen@latest install --dir /path/to/project
bunx open-xmen@latest install --with-runtime-files --dir /path/to/project
bunx open-xmen@latest install --dry-run
bunx open-xmen@latest install --with-runtime-files --reset
bunx open-xmen@latest install --no-deps
```

- `--global` is the default and installs into the OpenCode user config.
- `--dir /path/to/project` writes only that project's `opencode.jsonc` and sets `default_agent` to `cerebro`.
- `--with-runtime-files` is legacy/opt-in and writes managed `.opencode/`, `.cerebro/`, and `AGENTS.md` files into the selected project.
- `--reset` / `--force` only matter with `--with-runtime-files`; they refresh existing managed files.
- `--no-deps` skips the cache warm-up/refresh.

For local development of this package:

```bash
npm install
npm run build
node dist/cli.js install --dir /path/to/your/project
```

Then run the Cerebro workflow command you need inside OpenCode:

```text
/cerebro-index
/cerebro-plan add a REST API for user authentication
/cerebro-start-work
```

For autonomous best-effort mode:

```text
/to-me-my-x-men build the feature described in the current issue
```

---

## CLI

```bash
open-xmen [install] [--dir <path>] [--dry-run] [--reset] [--force] [--no-deps]
open-xmen update [--dir <path>] [--dry-run]
open-xmen doctor [--dir <path>] [--json]
open-xmen models
```

- No subcommand defaults to `install`, matching `bunx open-xmen@latest install` behavior.
- `update` refreshes all managed runtime and template files to the current package version. Recommended after `bunx open-xmen@latest` fetches a new version.
- `--dry-run` prints planned writes and does not mutate the target project.
- `--reset` / `--force` refresh existing managed files; without them, existing files are skipped.
- `opencode.jsonc` writes are atomic via `opencode.jsonc.tmp` and create `opencode.jsonc.bak` before replacing an existing config.
- `doctor --json` returns script-friendly diagnostics.

## Commands

| Command | What it does |
|---|---|
| `/cerebro-index` | Build `.cerebro/project-context.md` using Nightcrawler, Sage, Forge, and Beast. |
| `/cerebro-plan [task]` | Interview-first planning with Professor X, Beast, and Emma Frost validation. |
| `/cerebro-start-work` | Execute or resume the latest Cerebro plan through Cyclops coordination. |
| `/to-me-my-x-men [task]` | Autonomous full-team mode with Legion + Cypher intent consult and final Legion acceptance. |

---

## Team

| Agent | Role | Default model |
|---|---|---|
| Cerebro | Main OpenCode primary agent / team lead | `openai/gpt-5.5` |
| Legion | Customer / product-owner proxy | `openai/gpt-5.4` |
| Cypher | Requirements analyst | `openai/gpt-5.4` |
| Professor X | Strategic planner | `openai/gpt-5.5` |
| Cyclops | Execution layer conductor | `openai/gpt-5.5` |
| Wolverine | Implementation worker (code, tests, scripts) | `openai/gpt-5.5` |
| Jean Grey | Design strategist (component specs, UX flows) | `openai/gpt-5.5` |
| Storm | Visual engineering (CSS, styling, accessibility) | `openai/gpt-5.5` |
| Forge | Architecture consultant | `openai/gpt-5.5` |
| Nightcrawler | Read-only codebase search | `openai/gpt-5.4-mini-fast` |
| Sage | Docs/API research | `openai/gpt-5.4-mini-fast` |
| Beast | Gap analysis and critique | `openai/gpt-5.5` |
| Emma Frost | Strict validation | `openai/gpt-5.5` |

---

## Runtime Files

Runtime files are optional legacy managed files. The package plugin provides commands and agents without them. Use them only if you intentionally want repo-local markdown/runtime assets:

```bash
bunx open-xmen@latest install --dir /path/to/project --with-runtime-files
bunx open-xmen@latest install --dir /path/to/project --with-runtime-files --reset
```

```text
.cerebro/
├── cerebro-identity.md          # OpenCode Cerebro orchestration brain
├── opencode/model-routing.md    # model slots and routing policy
├── project-context.md           # repository index from /cerebro-index
├── plans/                       # approved plans
├── notepads/                    # customer visions, requirements, drafts, reviews, learnings
├── team-runs/                   # manifests, task state, mailbox logs, checkpoints, events
├── pending-todos/               # worker task todos
├── boulder.json                 # execution checkpoint
├── docs/                        # workflow, orchestration, and agent guides
├── integrations/                # optional integration configs (e.g. semble)
├── schemas/                     # state schemas (boulder, team-run)
├── templates/                   # plan/context/run templates
└── scripts/                     # validators and maintenance helpers

.opencode/
├── agents/*.md                  # role agent definitions (cerebro, cyclops, wolverine, …)
└── commands/*.md                # slash command definitions
```

---

## Validation

```bash
npm run build
npx tsc -p tsconfig.json --noEmit
npm run doctor
python3 .cerebro/scripts/validate-opencode-runtime.py
python3 .cerebro/scripts/validate-team-runs.py
npm run verify:release
```

`npm run verify:release` builds the package, packs it with `npm pack --json --ignore-scripts`, checks the packaged runtime file set exactly, rejects forbidden paths such as dev-only plugin bridges or secret-like files, installs the tarball into a clean temp package, smoke-tests user-config install, project plugin-only install, runtime-file install, command/agent resolution through `opencode debug config`, plugin command/agent registration, cache-refreshing `open-xmen install`, and `open-xmen doctor`.

Use `bunx open-xmen@latest install` for safe package/config refreshes outside OpenCode, and `bunx open-xmen@latest doctor [--dir <path>]` for diagnostics.

