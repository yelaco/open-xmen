# Cerebro Project Context

**Indexed At:** [timestamp]
**Repository:** [name or path]

## Stack

- Language/runtime:
- Frameworks:
- Package manager:
- Test framework:
- Build system:

## Entrypoints

- Plugin/source:
- CLI/scripts:
- OpenCode agents:
- OpenCode commands:
- Runtime state:
- Configuration:

## Commands

- Install:
- Test:
- Focused test:
- Lint:
- Typecheck:
- Build:
- Run/dev:

## Architecture

- [Major subsystem] - [purpose and relevant files]
- [Major subsystem] - [purpose and relevant files]
- `.opencode/` - active OpenCode agents, commands, and plugin bridge when this is an OpenCode/Cerebro project
- `.cerebro/` - plans, run manifests, task ledgers, mailbox logs, checkpoints, notepads, and validators

## Conventions

- File organization:
- Naming:
- Error handling:
- Testing:
- Model routing:
- UI/styling:

## Risky Areas

- [Area] - [why risky and what to verify]

## Agent Notes

- Prefer:
- Avoid:
- Open questions:

## Read First

1. `AGENTS.md` - repository-level operating rules, if present
2. The Cerebro agent prompt (the default primary agent) - Cerebro's identity, orchestration process, and role routing
3. `.cerebro/opencode/model-routing.md` - OpenCode model slots, if present
