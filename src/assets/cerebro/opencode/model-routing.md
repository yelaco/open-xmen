# Cerebro OpenCode Model Routing

This runtime uses one canonical role-slot table. Agent frontmatter, `cerebro_model_slots`, command defaults, docs, and validators must agree with these slots.

## Provider Presets

`open-xmen install` asks which model subscription(s) you have (OpenAI, Anthropic, or both — multi-select) and a focus (**performance / balance / cost**), then writes `~/.config/opencode/open-xmen.json` (e.g. `{ "providers": ["anthropic"], "focus": "balance" }`). The plugin reads it at load and picks, **per slot, the best model for that agent's job across the subscriptions you actually own** — so with both providers you get genuine best-of-breed (e.g. Claude Opus for the auditor, GPT-5.5 for coding), and with one you get the best available within it.

Resolution order per slot: `CEREBRO_MODEL_<SLOT>` env override → legacy env → installed preset → built-in default (the table below). Image generation is OpenAI-only (Anthropic has no image model), so the image slot always resolves to `openai/gpt-image-2`.

## Default Model Table (no preset configured — OpenAI / balance baseline)

| Slot | Default model | Variant | Agents |
|---|---|---|---|
| `orchestrator` | `openai/gpt-5.5` | medium | Cerebro |
| `auditor` | `openai/gpt-5.5` | high | Cyclops |
| `planner` | `openai/gpt-5.5` | high | Professor X, Beast, Forge, Emma Frost |
| `design` | `openai/gpt-5.5` | high | Jean Grey |
| `analyst` | `openai/gpt-5.4` | high | Legion, Cypher |
| `workers` | `openai/gpt-5.5` | medium | Wolverine, Storm |
| `fast` | `openai/gpt-5.4-mini-fast` | none | Nightcrawler, Sage |
| `image` | `openai/gpt-image-2` | — | Image/design asset generation only |

## Multi-Model Fallback Chains

Each generated agent has a primary model and `options.model_fallbacks`. If the primary is unavailable, OpenCode can try fallbacks in order.

| Agent | Slot | Primary | Fallbacks |
|---|---|---|---|
| Cerebro | `orchestrator` | `openai/gpt-5.5` | `anthropic/claude-sonnet-4-6` |
| Cyclops | `auditor` | `openai/gpt-5.5` | `anthropic/claude-opus-4-8` |
| Professor X | `planner` | `openai/gpt-5.5` | `anthropic/claude-opus-4-8` |
| Beast | `planner` | `openai/gpt-5.5` | `anthropic/claude-opus-4-8` |
| Forge | `planner` | `openai/gpt-5.5` | `anthropic/claude-opus-4-8` |
| Emma Frost | `planner` | `openai/gpt-5.5` | `anthropic/claude-opus-4-8` |
| Jean Grey | `design` | `openai/gpt-5.5` | `anthropic/claude-opus-4-8` |
| Legion | `analyst` | `openai/gpt-5.4` | `anthropic/claude-sonnet-4-6`, `anthropic/claude-opus-4-8` |
| Cypher | `analyst` | `openai/gpt-5.4` | `anthropic/claude-sonnet-4-6`, `anthropic/claude-opus-4-8` |
| Wolverine | `workers` | `openai/gpt-5.5` | `anthropic/claude-sonnet-4-6`, `minimax/minimax-m3` |
| Storm | `workers` | `openai/gpt-5.5` | `anthropic/claude-sonnet-4-6` |
| Nightcrawler | `fast` | `openai/gpt-5.4-mini-fast` | `openai/gpt-5.4-mini` |
| Sage | `fast` | `openai/gpt-5.4-mini-fast` | `openai/gpt-5.4-mini` |

## Environment Overrides

Override slots with these variables. Legacy variables (`CEREBRO_MODEL_FRONTIER`, `CEREBRO_MODEL_STRONG`, `CEREBRO_MODEL_CODING`, and the pre-0.3.0 `CEREBRO_MODEL_CONDUCTOR`) are accepted only as migration fallbacks by the plugin; new installs should use the canonical names below.

- `CEREBRO_MODEL_ORCHESTRATOR`
- `CEREBRO_MODEL_AUDITOR`
- `CEREBRO_MODEL_PLANNER`
- `CEREBRO_MODEL_DESIGN`
- `CEREBRO_MODEL_ANALYST`
- `CEREBRO_MODEL_WORKERS`
- `CEREBRO_MODEL_FAST`
- `CEREBRO_MODEL_IMAGE`

## Routing Policy

Use `orchestrator` for Cerebro (it drives the delegation loop), `auditor` for the final Cyclops audit, `planner`/`design` for outputs that gate downstream quality, `analyst` for customer and requirements work, `workers` for implementation, and `fast` for bounded retrieval/search. Scheduling itself needs no model — `cerebro_next_tasks` is deterministic TypeScript.
