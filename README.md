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

- `.opencode/agents/*.md` — OpenCode-native Cerebro role agents
- `.opencode/commands/*.md` — preserved Cerebro slash commands
- `open-xmen` package plugin entry — installed by `open-xmen install`
- `.opencode/plugins/open-xmen.ts` — local development bridge in this repository only; installed projects use the package plugin entry
- `src/index.ts` — reusable plugin implementation
- Cerebro custom tools for run state, tasks, mailbox, checkpoints, model slots, and pending-todo checks
- `AGENTS.md` and `.cerebro/cerebro-identity.md` — OpenCode instruction surface

The legacy `.claude/` files are still present as migration source/compatibility material, but the active OpenCode runtime is `.opencode/` + `.cerebro/`.

---

## Model Routing

This installation is configured for the user's cost-conscious OpenAI model set. GPT-5.4 is the default; GPT-5.4 Pro can be opted into via `CEREBRO_MODEL_FRONTIER` when the premium lane is worth the cost:

| Slot | Model | Roles |
|---|---|---|
| `frontier` | `openai/gpt-5.4` | Cerebro, Professor X, Cyclops, Forge, Emma Frost |
| `strong` | `openai/gpt-5.4` | Legion, Cypher, Sage, Beast |
| `legacy-frontier` | `openai/gpt-5.2` | Optional fallback/compatibility lane |
| `coding` | `openai/gpt-5.3-codex` | Wolverine, Storm |
| `spark` | `openai/gpt-5.3-codex-spark` | Instant code sketches, boilerplate, test stubs, tiny low-risk diffs |
| `fast` | `openai/gpt-5.4-mini` | Nightcrawler fast search/indexing |
| `image` | `openai/gpt-image-2` | image/design asset generation only |

Override with environment variables if your available models change:

```bash
export CEREBRO_MODEL_FRONTIER="openai/gpt-5.4"
export CEREBRO_MODEL_STRONG="openai/gpt-5.4"
export CEREBRO_MODEL_CODING="openai/gpt-5.3-codex"
export CEREBRO_MODEL_SPARK="openai/gpt-5.3-codex-spark"
# optional premium lane: export CEREBRO_MODEL_FRONTIER="openai/gpt-5.4-pro"
# optional legacy fallback: export CEREBRO_MODEL_FRONTIER="openai/gpt-5.2"
export CEREBRO_MODEL_FAST="openai/gpt-5.4-mini"
export CEREBRO_MODEL_IMAGE="openai/gpt-image-2"
```

---

## Quick Start

Install Open X-Men into any OpenCode project with bunx. The installer adds the published `open-xmen` package as an OpenCode plugin entry and installs the repo-local Cerebro runtime files:

```bash
cd /path/to/your/project
bunx open-xmen@latest install
opencode .
```

No setup slash command is required. Re-running the installer is safe: existing runtime/template files are skipped by default, while `opencode.jsonc` is updated atomically with an `opencode.jsonc.bak` backup when it changes. Use `--reset` or `--force` only when you want to refresh managed Open X-Men files.

Useful installer flags:

```bash
bunx open-xmen@latest install --dir /path/to/project
bunx open-xmen@latest install --dry-run
bunx open-xmen@latest install --reset
bunx open-xmen@latest install --force
bunx open-xmen@latest install --no-deps
```

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
open-xmen doctor [--dir <path>] [--json]
open-xmen models
```

- No subcommand defaults to `install`, matching `bunx open-xmen@latest install` behavior.
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
| `/cerebro-doctor` | Validate runtime health. |
| `/cerebro-reset` | Reset runtime state after confirmation. |

---

## Team

| Agent | Role | Default model |
|---|---|---|
| Cerebro | Main OpenCode primary agent / team lead | `openai/gpt-5.4` |
| Legion | Customer / product-owner proxy | `openai/gpt-5.4` |
| Cypher | Requirements analyst | `openai/gpt-5.4` |
| Professor X | Strategic planner | `openai/gpt-5.4` |
| Cyclops | Execution sequencer and verifier | `openai/gpt-5.4` |
| Wolverine | Code/test implementation | `openai/gpt-5.3-codex` |
| Storm | UI/visual implementation | `openai/gpt-5.3-codex` |
| Forge | Architecture consultant | `openai/gpt-5.4` |
| Nightcrawler | Read-only codebase search | `openai/gpt-5.4-mini` |
| Sage | Docs/API research | `openai/gpt-5.4` |
| Beast | Gap analysis and critique | `openai/gpt-5.4` |
| Emma Frost | Strict validation | `openai/gpt-5.4` |

---

## Runtime Files

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
├── schemas/                     # state schemas
├── templates/                   # plan/context/run templates
└── scripts/                     # validators and maintenance helpers
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

`npm run verify:release` builds the package, packs it with `npm pack --json --ignore-scripts`, checks the packaged runtime file set exactly, rejects forbidden paths such as dev-only plugin bridges or secret-like files, installs the tarball into a clean temp package, runs `open-xmen install --no-deps`, verifies `plugin: ["open-xmen"]`, and runs `open-xmen doctor`.

`/cerebro-doctor` runs the same class of checks from inside OpenCode.

## Auto-Upgrades

When the `open-xmen` plugin loads, it checks the npm registry for the latest package version. If a newer package is available and the plugin is running from a package-managed `node_modules/open-xmen` install, it best-effort updates that package and re-runs `open-xmen install --reset --no-deps` for the current project. Results are written to `.cerebro/auto-upgrade.json`; registry or install failures never block OpenCode startup.

Set `OPEN_XMEN_SKIP_AUTO_UPGRADE=1` or `OPEN_XMEN_AUTO_UPGRADE=0` to disable this behavior.

## Spark Lane

`gpt-5.3-codex-spark` is available as a fast draft lane. Cerebro should use it for instant code generation, boilerplate, test stubs, tiny low-risk diffs, and candidate patches. Full `gpt-5.3-codex` remains the default for Wolverine/Storm final implementation and verification.
