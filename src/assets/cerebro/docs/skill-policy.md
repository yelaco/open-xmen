# Skill Policy

Cerebro ships skills only as optional overlays — the base workflow never requires one. `open-xmen install` writes the plugin's skills into the global OpenCode config dir (`~/.config/opencode/skills/<name>/SKILL.md`), where OpenCode discovers them automatically. Plugin skills are namespaced with an `opx-` prefix so they group together and never collide with your own.

## Bundled Skills

- **`opx-frontend-design`** — distinctive, production-grade frontend aesthetics that avoid generic "AI slop." Jean Grey draws on it when shaping a design spec's aesthetic direction; Storm draws on it when implementing the visual layer (typography, color, motion, backgrounds).
- **`opx-git`** — disciplined Git: atomic commits in the repo's own style, safe rebase/squash (never rewrite pushed history or force-push without approval), and history archaeology (blame/pickaxe/bisect). Cerebro owns Git workflow (commits, history, PRs); workers focus on code and tests.
- **`opx-playwright`** — real-browser automation and UI verification (rendering, interactions, responsive, accessibility, login flows, link health). Prefers the Playwright MCP server when available, else `npx playwright`. **Cyclops owns interactive browser verification** at the audit gate; Wolverine and Storm build and write tests, they do not eyeball in a browser themselves.
- **`opx-test`** — focused, behavior-driven unit/integration tests that become Cerebro's deterministic verification via `cerebro_verify` (Wolverine).
- **`opx-personal-assistant`** — Cerebro's interaction/reporting playbook: how to narrate each phase and keep the user informed while orchestrating (Cerebro). The orchestration process itself lives in the Cerebro agent prompt.
- **`opx-debug`** — reproduce-first, root-cause debugging with a regression test that proves the fix (Wolverine).
- **`opx-code-review`** — evidence-backed correctness/reuse review with file:line findings (Beast).
- **`opx-security-review`** — exploitable-vulnerability review with severity for high-risk work (Emma Frost).

All are optional: agents with `skill: allow` use them when present and fall back to their base prompts when absent — Jean Grey + Storm (design), Cerebro (git), Cyclops (playwright), Wolverine (test, debug), Beast (code-review), Emma Frost (security-review).

## Optional MCP Servers

`open-xmen install` can enable optional MCP servers (multi-select, or `--mcp <list>`). The choice is saved to `open-xmen.json` (`mcp_servers`) and the plugin registers them in OpenCode config at load — off by default so nothing extra runs unless you opt in:

- **`playwright`** (`npx @playwright/mcp`) — structured browser tools for the `opx-playwright` skill (Cyclops's audit-gate UI verification).
- **`semble`** (`uvx --from "semble[mcp]" semble`) — fast code search used by Nightcrawler; returns only relevant chunks (~98% fewer tokens than grep+read).

Re-run install (or edit `open-xmen.json`) to change the set later.

**First launch can be slow.** Both servers fetch and build their package on the first run (`npx` / `uvx` cold start), so the plugin registers them with a longer startup timeout (60s for playwright, 120s for semble) — the default ~30s kills the server mid-download. To skip the wait, or if your network throttles npm/PyPI, pre-warm the cache once: `npx @playwright/mcp@latest --help` and `uv tool install "semble[mcp]"`. Check status anytime with `opencode mcp list`; a server stuck on a download or network error shows there as `failed`.

## Rules

- Skills are never required for the base workflow.
- Agents may use a relevant available skill when it improves implementation, research, or verification.
- If a skill is unavailable, agents continue with normal repo tools.
- Project-local instructions, `.cerebro` contracts, approval gates, todo discipline, model routing, and result envelopes override skill advice.
- Skills must not bypass approval gates or weaken verification requirements.
- If skill availability changes what could be verified, report that limitation in `TASK_RESULT` or the final report.

## Good Uses

- Jean Grey and Storm use the `opx-frontend-design` skill to commit to a bold, intentional aesthetic for UI work.
- Storm uses an available browser or accessibility skill to verify UI behavior.
- Wolverine uses an available language or test skill to run a focused suite.
- Sage uses an available docs skill to fetch more precise API references.

## Bad Uses

- A task fails only because an optional skill is missing.
- A skill-generated instruction overrides `.cerebro/templates/plan.md`.
- A skill bypasses a required approval gate.
- A worker omits the required `TASK_RESULT` envelope because a skill returned another format.
