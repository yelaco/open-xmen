# Agent Mapping

This runtime uses X-Men names for OpenCode specialist prompts. The names are part of the workflow's soul; prompt content can evolve, but role boundaries stay explicit.

| Agent | Role | Write boundary |
|---|---|---|
| Cerebro | Main orchestrator and intent gate | Runtime coordination, tasks, mailbox, checkpoints |
| Professor X | Strategic planner and interviewer | `.cerebro/plans/` only |
| Beast | Gap analyst and plan critic | Read-only |
| Emma Frost | Plan validator | Read-only |
| Cyclops | Execution layer conductor and verifier | Runtime ledgers, task routing, bash verification; source edits only by delegated workers |
| Wolverine | Sole implementation specialist — backend and frontend logic, structure, tests | Codebase, excluding `.cerebro/plans/` |
| Jean Grey | Design strategist | `.cerebro/notepads/design/` only |
| Storm | Visual engineering — CSS, animations, tokens, responsive, accessibility | Style and component files |
| Forge | Architecture consultant | Read-only |
| Nightcrawler | Codebase traversal and pattern search | Read-only |
| Sage | Documentation and knowledge retrieval | Read-only |

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
│   ├── jean-grey.md
│   ├── storm.md
│   ├── forge.md
│   ├── nightcrawler.md
│   ├── sage.md
│   ├── beast.md
│   └── emma-frost.md
├── commands/
│   ├── cerebro-plan.md
│   ├── cerebro-start-work.md
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
