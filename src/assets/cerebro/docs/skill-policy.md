# Skill Policy

Cerebro ships without required skills. Skills can be added later as optional overlays.

## Rules

- Skills are never required for the base workflow.
- Agents may use a relevant available skill when it improves implementation, research, or verification.
- If a skill is unavailable, agents continue with normal repo tools.
- Project-local instructions, `.cerebro` contracts, approval gates, todo discipline, model/effort routing, and result envelopes override skill advice.
- Skills must not bypass approval gates or weaken verification requirements.
- If skill availability changes what could be verified, report that limitation in `TASK_RESULT` or the final report.

## Good Uses

- Storm uses an available browser or accessibility skill to verify UI behavior.
- Wolverine uses an available language or test skill to run a focused suite.
- Sage uses an available docs skill to fetch more precise API references.

## Bad Uses

- A task fails only because an optional skill is missing.
- A skill-generated instruction overrides `.cerebro/templates/plan.md`.
- A skill bypasses a required approval gate.
- A worker omits the required `TASK_RESULT` envelope because a skill returned another format.
