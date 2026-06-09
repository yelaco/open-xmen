# Cerebro OpenCode Model Routing

GPT-5.5 is used for agents that require deep reasoning: Cerebro (orchestrator), Professor X (planner), Beast (gap analyst), Forge (architecture), Emma Frost (validator), Jean Grey (design), Wolverine (implementation), Storm (visual), Cyclops (execution conductor). GPT-5.4 handles product/analyst work; mini handles fast retrieval.

## Primary Model Table

| Slot | Model | Variant | Agents |
|---|---|---|---|
| `orchestrator` | `openai/gpt-5.5` | medium | Cerebro |
| `conductor` | `openai/gpt-5.5` | medium | Cyclops — execution layer conductor |
| `planner` | `openai/gpt-5.5` | high | Professor X, Beast, Forge, Emma Frost |
| `design` | `openai/gpt-5.5` | high | Jean Grey |
| `analyst` | `openai/gpt-5.4` | high | Legion, Cypher |
| `workers` | `openai/gpt-5.5` | medium | Wolverine, Storm — implementation quality matters |
| `fast` | `openai/gpt-5.4-mini-fast` | none | Nightcrawler, Sage |
| `image` | `openai/gpt-image-2` | — | Image/design asset generation only |

## Multi-Model Fallback Chains

Each agent carries a fallback chain in `options.model_fallbacks`. If the primary model is unavailable, OpenCode tries fallbacks in order. Intelligence is in the system, not any single model.

| Agent | Primary | Fallbacks |
|---|---|---|
| Cerebro | `openai/gpt-5.5` | `anthropic/claude-sonnet-4-6` |
| Cyclops | `openai/gpt-5.5` | `anthropic/claude-sonnet-4-6` |
| Professor X | `openai/gpt-5.5` | `anthropic/claude-opus-4-8` |
| Beast | `openai/gpt-5.5` | `anthropic/claude-opus-4-8` |
| Forge | `openai/gpt-5.5` | `anthropic/claude-opus-4-8` |
| Emma Frost | `openai/gpt-5.5` | `anthropic/claude-opus-4-8` |
| Jean Grey | `openai/gpt-5.5` | `anthropic/claude-opus-4-8` |
| Wolverine | `openai/gpt-5.5` | `anthropic/claude-sonnet-4-6`, `minimax/minimax-m3` |
| Storm | `openai/gpt-5.5` | `anthropic/claude-sonnet-4-6` |
| Legion | `openai/gpt-5.4` | `anthropic/claude-sonnet-4-6`, `anthropic/claude-opus-4-8` |
| Cypher | `openai/gpt-5.4` | `anthropic/claude-sonnet-4-6`, `anthropic/claude-opus-4-8` |
| Nightcrawler | `openai/gpt-5.4-mini-fast` | `openai/gpt-5.4-mini` |
| Sage | `openai/gpt-5.4-mini-fast` | `openai/gpt-5.4-mini` |

## Environment Overrides

- `CEREBRO_MODEL_ORCHESTRATOR` (override Cerebro's model)
- `CEREBRO_MODEL_CONDUCTOR` (override Cyclops's model)
- `CEREBRO_MODEL_PLANNER`
- `CEREBRO_MODEL_ANALYST`
- `CEREBRO_MODEL_FAST`
- `CEREBRO_MODEL_IMAGE`

## Routing Policy

Route to `planner` (gpt-5.5 high) for any task where output quality gates downstream work — planning, gap review, architecture decisions, design specs, and final validation. Use `orchestrator`/`conductor` (gpt-5.5 medium) for Cerebro and Cyclops; medium variant keeps orchestration responsive. Use `workers` (gpt-5.5 medium) for implementation — quality matters but full high-variant reasoning is not needed on every line. Use `fast` (mini none) for pure retrieval and search.
