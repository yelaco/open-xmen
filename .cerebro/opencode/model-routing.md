# Cerebro OpenCode Model Routing

This installation is configured to prefer the user's cost-conscious OpenAI model set. GPT-5.4 is the default frontier/strong lane; GPT-5.4 Pro is intentionally not the default because it is more expensive.

| Slot | Model | Use |
|---|---|---|
| `frontier` | `openai/gpt-5.4` | Cerebro, Professor X, Cyclops, Forge, Emma Frost, high-risk escalation |
| `strong` | `openai/gpt-5.4` | Legion, Cypher, Sage, Beast, routine analysis and review |
| `legacy-frontier` | `openai/gpt-5.2` | Compatibility/fallback if GPT-5.4 is unavailable or a task needs GPT-5.2-specific behavior |
| `coding` | `openai/gpt-5.3-codex` | Wolverine and Storm implementation/UI work |
| `spark` | `openai/gpt-5.3-codex-spark` | Instant code sketches, boilerplate, test stubs, tiny low-risk diffs, first-pass generation |
| `fast` | `openai/gpt-5.4-mini` | Nightcrawler fast indexing and repetitive search |
| `image` | `openai/gpt-image-2` | Image/design asset generation only |

Environment overrides:

- `CEREBRO_MODEL_FRONTIER` (set to `openai/gpt-5.4-pro` only when you explicitly want the premium lane)
- `CEREBRO_MODEL_STRONG`
- `CEREBRO_MODEL_CODING`
- `CEREBRO_MODEL_SPARK`
- `CEREBRO_MODEL_FAST`
- `CEREBRO_MODEL_IMAGE`

Routing policy: default to best performance within the available cost-conscious models. Use full `gpt-5.3-codex` for Wolverine/Storm coding by default. Use Spark as a draft lane for instant code generation, then route non-trivial implementation, verification, and final fixes through full Codex. Use `fast` only for low-risk search/indexing. Escalate coding blockers or validation disputes to `frontier`. If `frontier` is unavailable, fall back to `strong` (`openai/gpt-5.4`) before considering legacy compatibility models.


## Spark Lane

Use `spark` when speed and creative first-pass output matter more than final confidence:

- component/function boilerplate
- first draft of a small helper
- test skeletons and fixtures
- quick patch candidates for Cyclops/Wolverine to review
- small examples or code snippets for plans/docs

Do not use Spark as the final authority for high-risk code, migrations, security-sensitive changes, broad refactors, or final verification.
