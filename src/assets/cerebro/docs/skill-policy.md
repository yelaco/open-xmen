# Skill Policy

Cerebro ships skills only as optional overlays — the base workflow never requires one. Installed with `--with-runtime-files`, skills land under `.opencode/skills/<name>/SKILL.md` and OpenCode discovers them automatically.

## Bundled Skills

- **`frontend-design`** — distinctive, production-grade frontend aesthetics that avoid generic "AI slop." Jean Grey draws on it when shaping a design spec's aesthetic direction; Storm draws on it when implementing the visual layer (typography, color, motion, backgrounds). Both agents have `skill: allow`. Still optional: if the skill is absent, both fall back to their base prompts.

## Rules

- Skills are never required for the base workflow.
- Agents may use a relevant available skill when it improves implementation, research, or verification.
- If a skill is unavailable, agents continue with normal repo tools.
- Project-local instructions, `.cerebro` contracts, approval gates, todo discipline, model/effort routing, and result envelopes override skill advice.
- Skills must not bypass approval gates or weaken verification requirements.
- If skill availability changes what could be verified, report that limitation in `TASK_RESULT` or the final report.

## Good Uses

- Jean Grey and Storm use the `frontend-design` skill to commit to a bold, intentional aesthetic for UI work.
- Storm uses an available browser or accessibility skill to verify UI behavior.
- Wolverine uses an available language or test skill to run a focused suite.
- Sage uses an available docs skill to fetch more precise API references.

## Bad Uses

- A task fails only because an optional skill is missing.
- A skill-generated instruction overrides `.cerebro/templates/plan.md`.
- A skill bypasses a required approval gate.
- A worker omits the required `TASK_RESULT` envelope because a skill returned another format.
