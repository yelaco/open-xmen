# Open X-Men — Cerebro for OpenCode

Model-as-conductor, determinism-in-tools. Open X-Men gives OpenCode a complete planning-and-execution system: **Cerebro orchestrates** — it spawns X-Men specialist agents, drives the work step by step, and narrates everything to you like a personal assistant — while the hard guarantees live in deterministic tools: scheduling/routing, real-shell verification, and a final Cyclops audit.

**No LLM decides whether your tests passed. `cerebro_verify` ran them.**

---

## Architecture

```text
Cerebro (primary agent — drives the loop, narrates every step)
  Phase 1 Intent Gate         → restate & confirm what you meant
  Phase 2 Codebase Assessment → map architecture before touching a line
  Phase 3 Smart Delegation    → loop, narrating each step:
        cerebro_next_tasks  → deterministic ready batch + routing (agent, chain)
        spawn specialists   → native task tool (visible sessions, parallel)
        cerebro_verify      → real shell PASS/FAIL  ← the only path to "verified"
        retry on FAIL or mark blocked; repeat until nothing is ready
  Phase 4 Independent Verif.  → spawn Cyclops (task tool) for the audit → cerebro_run_report
  Session Continuity          → ledger + boulder.json; resume from where you stopped
```

Three principles:

- **The model conducts.** Cerebro spawns specialists and drives the loop, reporting each decision, finding, and result — never a black box.
- **Determinism lives in tools.** `cerebro_next_tasks` schedules deterministically (no invented ordering) and `cerebro_verify` runs real shell checks (the only path to `verified`); the final Cyclops audit is an independent read-only gate.
- **The auditor signs off.** Cyclops independently cross-checks the finished run before it can be declared complete.

Everything that matters is preserved: `.cerebro/` runtime state, the four slash commands, and the X-Men role names.

---

## Model Routing

Open X-Men uses canonical role-based model slots. Each agent runs on the slot that fits its work.

**Provider presets.** `install` asks which model subscription(s) you have (OpenAI, Anthropic, or both — a multi-select) and a focus (**performance / balance / cost**), then picks **the best model per agent across the subscriptions you own**: with both providers you get genuine best-of-breed (Claude Opus for the auditor/planner/design, GPT-5.5 for coding), and with one you get the best available within it. The choice is saved to `~/.config/opencode/open-xmen.json` and read by the plugin at load. Image generation is OpenAI-only, so the image slot always uses `openai/gpt-image-2`.

The default mapping (no preset configured — OpenAI / balance baseline):

| Slot | Default model | Roles |
|---|---|---|
| `orchestrator` | `openai/gpt-5.5` | Cerebro |
| `auditor` | `openai/gpt-5.5` | Cyclops |
| `planner` | `openai/gpt-5.5` | Professor X, Beast, Forge, Emma Frost |
| `design` | `openai/gpt-5.5` | Jean Grey |
| `analyst` | `openai/gpt-5.4` | Legion, Cypher |
| `workers` | `openai/gpt-5.5` | Wolverine, Storm |
| `fast` | `openai/gpt-5.4-mini-fast` | Nightcrawler, Sage |
| `image` | `openai/gpt-image-2` | image/design asset generation only |

Set the preset non-interactively with flags (skips the prompt): `open-xmen install --provider anthropic --focus balance` or `--provider openai,anthropic --focus performance` (`--provider all` selects every provider).

Override an individual slot with environment variables (these win over the preset):

```bash
export CEREBRO_MODEL_ORCHESTRATOR="openai/gpt-5.5"
export CEREBRO_MODEL_AUDITOR="openai/gpt-5.5"
export CEREBRO_MODEL_PLANNER="openai/gpt-5.5"
export CEREBRO_MODEL_DESIGN="openai/gpt-5.5"
export CEREBRO_MODEL_ANALYST="openai/gpt-5.4"
export CEREBRO_MODEL_WORKERS="openai/gpt-5.5"
export CEREBRO_MODEL_FAST="openai/gpt-5.4-mini-fast"
export CEREBRO_MODEL_IMAGE="openai/gpt-image-2"
```

Legacy `CEREBRO_MODEL_FRONTIER`, `CEREBRO_MODEL_STRONG`, `CEREBRO_MODEL_CODING`, and the pre-0.3.0 `CEREBRO_MODEL_CONDUCTOR` are accepted as migration fallbacks, but new setups should use role slots.

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
bunx open-xmen@latest install --dry-run
bunx open-xmen@latest install --no-deps
```

- `--global` is the default and installs the plugin entry into the OpenCode user config.
- `--dir /path/to/project` writes only that project's `opencode.jsonc` and sets `default_agent` to `cerebro`.
- `--dry-run` prints planned writes without changing anything.
- `--no-deps` skips the cache warm-up/refresh.

Open X-Men is **plugin-only**: commands and agents register through the plugin at load time — no `.opencode/` or `.cerebro/` files are written into your project. The plugin's skills (e.g. `opx-frontend-design`) always install into the global OpenCode config dir (`~/.config/opencode/skills/`), regardless of `--dir`, so OpenCode can discover them.

For local development of this package:

```bash
npm install
npm run build
node dist/cli.js install --dir /path/to/your/project
```

Then run the Cerebro workflow command you need inside OpenCode:

```text
/cerebro-plan add a REST API for user authentication
/cerebro-start-work
```

For autonomous best-effort mode:

```text
/cerebro-ultrawork build the feature described in the current issue
```

---

## CLI

```bash
open-xmen [install] [--dir <path>] [--global] [--dry-run] [--no-deps]
open-xmen doctor [--dir <path>] [--json]
open-xmen models
```

- No subcommand defaults to `install`, matching `bunx open-xmen@latest install` behavior.
- Re-running `install` refreshes the OpenCode package cache and re-installs the plugin's global skills to the current package version.
- `--dry-run` prints planned writes and does not mutate anything.
- `opencode.jsonc` writes are atomic via `opencode.jsonc.tmp` and create `opencode.jsonc.bak` before replacing an existing config.
- `doctor --json` returns script-friendly diagnostics.

## Commands

| Command | What it does |
|---|---|
| `/cerebro-plan [task]` | Interview-first planning with Professor X, Beast, and Emma Frost validation. |
| `/cerebro-start-work` | Execute or resume the latest plan — Cerebro drives the delegation loop with deterministic verification, then a final Cyclops audit. |
| `/cerebro-ultrawork [task]` | Autonomous full-team mode (opens with the "To me, my X-Men!" catchphrase) with Legion + Cypher intent consult and final Legion acceptance — Cerebro-orchestrated, Cyclops-audited. |

---

## Team

| Agent | Role | Default model |
|---|---|---|
| Cerebro | Main OpenCode primary agent / team lead | `openai/gpt-5.5` |
| Legion | Customer / product-owner proxy | `openai/gpt-5.4` |
| Cypher | Requirements analyst | `openai/gpt-5.4` |
| Professor X | Strategic planner | `openai/gpt-5.5` |
| Cyclops | Final audit gatekeeper — reviews diffs, evidence, and acceptance criteria after Cerebro finishes orchestrating | `openai/gpt-5.5` |
| Wolverine | Implementation worker (code, tests, scripts) | `openai/gpt-5.5` |
| Jean Grey | Design strategist (component specs, UX flows) | `openai/gpt-5.5` |
| Storm | Visual engineering (CSS, styling, accessibility) | `openai/gpt-5.5` |
| Forge | Architecture consultant | `openai/gpt-5.5` |
| Nightcrawler | Read-only codebase search | `openai/gpt-5.4-mini-fast` |
| Sage | Docs/API research | `openai/gpt-5.4-mini-fast` |
| Beast | Gap analysis and critique | `openai/gpt-5.5` |
| Emma Frost | Strict validation | `openai/gpt-5.5` |

---

## Skills

Open X-Men ships optional skills as an overlay. `install` writes them into the global OpenCode config dir so OpenCode discovers them automatically; they are namespaced with an `opx-` prefix to group together and avoid collisions:

```text
~/.config/opencode/skills/
└── opx-frontend-design/
    └── SKILL.md   # distinctive, production-grade frontend aesthetics
```

Skills are optional: if one is absent, the agents that reference it fall back to their base prompts. `.cerebro/` runtime *state* (plans, team-runs, notepads, pending-todos) is created on demand by the plugin's tools at runtime — it is never installed up front.

---

## Validation

```bash
npm run build
npx tsc -p tsconfig.json --noEmit
npm run test
npm run verify:release
```

`npm run verify:release` builds the package, packs it with `npm pack --json --ignore-scripts`, checks the packaged runtime file set exactly, rejects forbidden paths such as dev-only plugin bridges or secret-like files, installs the tarball into a clean temp package, smoke-tests user-config install, project plugin-only install, runtime-file install, command/agent resolution through `opencode debug config`, plugin command/agent registration, cache-refreshing `open-xmen install`, and `open-xmen doctor`.

Use `bunx open-xmen@latest install` for safe package/config refreshes outside OpenCode, and `bunx open-xmen@latest doctor [--dir <path>]` for diagnostics.
