# Agent Mapping

This runtime uses X-Men names for OpenCode specialist prompts. The names are part of the workflow's soul; prompt content can evolve, but role boundaries stay explicit.

| Agent | Role | Write boundary |
|---|---|---|
| Cerebro | Main orchestrator and intent gate | Runtime coordination, tasks, mailbox, checkpoints |
| Professor X | Strategic planner and interviewer | `.cerebro/plans/` only |
| Beast | Gap analyst and plan critic | Read-only |
| Emma Frost | Plan validator | Read-only |
| Cyclops | Execution coordinator | Runtime state and notepads |
| Wolverine | General implementation and tests | Codebase, excluding `.cerebro/plans/` |
| Forge | Architecture consultant | Read-only |
| Nightcrawler | Codebase traversal and pattern search | Read-only |
| Sage | Documentation and knowledge retrieval | Read-only |
| Storm | Frontend and visual engineering | UI/frontend files |

## Runtime Files

```text
.opencode/
├── agents/
│   ├── cerebro.md
│   ├── legion.md
│   ├── cypher.md
│   ├── professor-x.md
│   ├── cyclops.md
│   ├── wolverine.md
│   ├── storm.md
│   ├── forge.md
│   ├── nightcrawler.md
│   ├── sage.md
│   ├── beast.md
│   └── emma-frost.md
├── commands/
│   ├── cerebro-plan.md
│   ├── cerebro-start-work.md
│   ├── cerebro-reset.md
│   ├── cerebro-doctor.md
│   ├── cerebro-index.md
│   └── to-me-my-x-men.md
└── plugins/

.cerebro/
├── schemas/
├── scripts/
├── templates/
├── project-context.md
├── plans/
├── notepads/
├── team-runs/
└── pending-todos/
```
