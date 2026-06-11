# Cerebro Agentic Workflow

This is the operational workflow for the OpenCode-native Cerebro runtime.

## Runtime Architecture

```mermaid
flowchart TB
    User["User Request"] --> Gate["Cerebro Intent Gate"]
    Gate -->|"index repo"| Index["Project Index"]
    Gate -->|"simple"| Direct["Direct Response"]
    Gate -->|"complex / risky"| Planning

    subgraph Planning["Planning Layer"]
        LC["Legion + Cypher\n(product-shaped work only)"] --> PX["Professor X\nDraft Plan"]
        PX --> Beast["Beast\nGap Review"]
        Beast --> EF["Emma Frost\n(HIGH risk only)"]
    end

    Planning --> Plan[".cerebro/plans/*.md\n+ cerebro_task_create records"]
    Plan --> Loop

    subgraph Loop["Cerebro-driven delegation loop (narrated each step)"]
        Frontier["cerebro_next_tasks\n(deterministic frontier + routing)"] --> Dispatch["Cerebro spawns specialists\n(cerebro_agent_task / dispatch_batch)"]
        Dispatch --> WJ["visual-engineering:\nJean Grey→Wolverine→Storm"]
        Dispatch --> FG["architecture: Forge"]
        Dispatch --> NC["explore: Nightcrawler"]
        Dispatch --> SG["research: Sage"]
        Dispatch --> WV["deep/quick/default:\nWolverine"]
        WJ & FG & NC & SG & WV --> Verify["cerebro_verify\n(real shell PASS/FAIL →\nonly path to verified)"]
        Verify -->|"FAIL (≤2 retries)"| Frontier
        Verify -->|"all tasks verified"| Audit["cerebro_audit — Cyclops\ndiff + evidence + criteria"]
    end

    Audit -->|"AUDIT_PASSED"| State[".cerebro/boulder.json\n+ team ledgers + notepads"]
    Audit -->|"AUDIT_FAILED"| Findings["Findings → problem records\n+ Cerebro re-queues tasks"] --> Loop
    Loop -->|"blocked"| Gate
    State --> Result["Verified, Audited Result"]
    Index --> Context[".cerebro/project-context.md"]
```

## Commands

| Command | Purpose |
|---|---|
| `/cerebro-ultrawork [task]` | Autonomous execution for clear tasks (opens with the "To me, my X-Men!" catchphrase); asks before using Cerebro's own judgment on unclear product-shaped prompts. |
| `/cerebro-index` | Build or refresh repository context. |
| `/cerebro-plan [task]` | Interview-first planning with Professor X. |
| `/cerebro-start-work` | Execute or resume the latest Cerebro plan. |

## State Files

| Path | Owner | Purpose |
|---|---|---|
| `.cerebro/schemas/boulder.schema.json` | Cerebro | Required shape for resumable execution state. |
| `.cerebro/scripts/check-agent-teams-enabled.py` | Cerebro | Legacy compatibility check for Claude Code agent-team settings; not part of the active OpenCode runtime. |
| `.cerebro/scripts/setup-status.py` | Cerebro | Reusable installation status helper. |
| `.cerebro/scripts/test-stop-hook.py` | Cerebro | Legacy compatibility check for Claude Stop-hook blocking behavior; active OpenCode runs use `cerebro_verify_pending`. |
| `.cerebro/scripts/validate-agent-frontmatter.py` | Cerebro | Reusable doctor check for OpenCode agent frontmatter. |
| `.cerebro/scripts/validate-opencode-runtime.py` | Cerebro | Authoritative OpenCode runtime validator for config, plugin bridge, commands, agents, and model routing. |
| `.cerebro/scripts/validate-boulder.py` | Cerebro | Reusable doctor check for `.cerebro/boulder.json`. |
| `.cerebro/scripts/validate-team-runs.py` | Cerebro | Reusable doctor check for the team-run template and manifests. |
| `.cerebro/templates/plan.md` | Professor X | Canonical plan schema. |
| `.cerebro/templates/project-context.md` | Cerebro | Canonical repository index schema. |
| `.cerebro/project-context.md` | Cerebro | Indexed stack, commands, conventions, entrypoints, and risks. |
| `.cerebro/plans/*.md` | Professor X | Approved implementation plans. |
| `.cerebro/boulder.json` | Cerebro | Business-level execution checkpoint: active plan, overall status, approvals, verification history, and decisions. Task progress lives in `.cerebro/team-runs/{run-id}.tasks.json`. |
| `.cerebro/team-runs/{run-id}.json` | Cerebro | Run manifest for command, team name, teammates, approvals, mailbox decisions, verification, and cleanup. |
| `.cerebro/team-runs/{run-id}.tasks.json` | Cerebro | OpenCode-managed task ledger updated by `cerebro_task_create/list/update` and `cerebro_verify`; task records created from plans must include category, dependencies, files, and verification commands. |
| `.cerebro/team-runs/{run-id}.mailbox.jsonl` | Cerebro team | Mailbox log written by `cerebro_mailbox_send`, `cerebro_agent_task`, `cerebro_dispatch_agent`, `cerebro_dispatch_batch`, `cerebro_collect_result`, and `cerebro_collect_batch_results`; read by `cerebro_mailbox_read`. |
| `.cerebro/team-runs/{run-id}.progress.jsonl` | Cerebro team | User-visible progress events and low-frequency heartbeats emitted while blocking collection is still running. |
| `.cerebro/team-runs/{run-id}.problems.jsonl` | Cerebro team | Structured problem list for blockers, failed verification, runtime gaps, weak evidence, and workflow UX issues discovered during the run. |
| `.cerebro/team-runs/{run-id}.checkpoints.jsonl` | Cerebro team | Durable checkpoints written by `cerebro_checkpoint`. |
| `.cerebro/notepads/{plan}/conventions.md` | Cerebro | Coding patterns, naming, file structure, UI patterns. |
| `.cerebro/notepads/{plan}/commands.md` | Cerebro | Useful install/test/lint/build/dev commands. |
| `.cerebro/notepads/{plan}/decisions.md` | Cerebro | Approval decisions and architectural decisions. |
| `.cerebro/notepads/{plan}/gotchas.md` | Cerebro | Worker-reported GOTCHAS harvested from TASK_RESULT blocks and forwarded to later workers. |
| `.cerebro/notepads/{plan}/failures.md` | Cerebro | Failed verification attempts and exact command output (`cerebro_verify`). |
| `.cerebro/notepads/{plan}/verification.md` | Cerebro | Verification commands run, results, and pass/fail history (`cerebro_verify`). |
| `.cerebro/notepads/{plan}/issues.md` | Cerebro | Blockers, deferred work, unresolved risks. |
| `.cerebro/pending-todos/{team}/{agent}/{task-id}.txt` | Wolverine / Storm | Task-scoped worker todos checked by `cerebro_verify_pending`. |
| `.cerebro/.pending-todos` | Wolverine / Storm | Legacy worker todo file kept for backward compatibility with old runs. |

## Package Updates

Open X-Men is package-managed and plugin-only. To refresh the plugin package/config cache and re-install the global skills: `bunx open-xmen@latest install`. No project runtime files are written.

## Skills

Skills are optional overlays. They may improve task-specific execution or verification, but the base workflow must continue without them. `.cerebro` contracts, approval gates, and result envelopes stay authoritative when a skill gives conflicting advice.
