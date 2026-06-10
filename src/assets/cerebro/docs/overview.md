# Cerebro OpenCode Runtime

Cerebro is an OpenCode plugin/runtime that ports the original X-Men workflow into OpenCode while preserving the role names, cinematic command style, and high verification bar. It gives one project a repeatable planning and execution system using OpenCode-native files:

- `AGENTS.md` for repository-level Cerebro/OpenCode operating rules
- `.opencode/agents/*.md` for specialist personas
- `.opencode/commands/*.md` for slash command workflows
- `.opencode/plugins/open-xmen.ts` for the local development bridge
- `src/index.ts` for custom Cerebro tools and OpenCode plugin hooks
- `.cerebro/` for plans, execution state, and accumulated learnings

Legacy `.claude/` files may exist as migration source or compatibility material, but `.opencode/` + `.cerebro/` is the active runtime. Skills are optional overlays; the base workflow does not require any skill to be installed.

## Quick Start

```text
/to-me-my-x-men add request validation to the API
/cerebro-index
/cerebro-plan redesign the authentication flow
/cerebro-start-work
```

## Working Modes

| Mode | Command | Use when |
|---|---|---|
| Direct | Ask normally | The request is simple and low-risk. |
| Index | `/cerebro-index` | Build project context for faster future work. |
| Autonomous | `/to-me-my-x-men [task]` | The task is clear and should be executed end to end. |
| Planning | `/cerebro-plan [task]` | Requirements are complex, ambiguous, high-impact, or need approval. |
| Execution | `/cerebro-start-work` | A plan exists and should be executed or resumed. |

Package updates are npm-managed. Re-run `bunx open-xmen@latest install` to refresh the plugin config/cache without writing project runtime files. Use `install --with-runtime-files --reset` only when you intentionally want to refresh legacy managed `.opencode/`, `.cerebro/`, and `AGENTS.md` files.

When `/to-me-my-x-men` receives an unclear full-product prompt, it asks only for non-inferable blockers. Otherwise Legion and Cypher document assumptions in customer/requirements notepads, Professor X promotes them into a brief or plan, and Cyclops coordinates verified execution.

## Recommended Reading

- [Cerebro Workflow](./cerebro-workflow.md)
- [Orchestration Guide](./orchestration.md)
- [Skill Policy](./skill-policy.md)
- [Agent Mapping](./agent-mapping.md)
