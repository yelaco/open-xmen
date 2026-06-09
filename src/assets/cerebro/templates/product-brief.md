# [Product Name] — Product Brief

**Objective:** [One sentence: what is being built and for whom.]
**Mission Shape:** PRODUCT_BUILD | BOUNDED | RESEARCH_ONLY
**Risk Level:** LOW | MEDIUM | HIGH

## Objective and Target User

- **Primary user:** [Who they are.]
- **Core job-to-be-done:** [The one job this product must nail.]

## Assumptions and Non-Goals

**Assumptions** (every material choice made without explicit user input):

- [Assumption — why it is conservative/reversible.]

**Non-goals** (explicitly NOT being built):

- [Non-goal.]

## Tech Stack Decision Log

| Concern | Choice | Rationale |
|---|---|---|
| Framework | [choice] | [why — reference §6.5 defaults where applied] |
| Language | [choice] | [why] |
| Styling | [choice] | [why] |
| Database / persistence | [choice] | [why] |
| ORM | [choice] | [why] |
| Auth | [choice] | [why] |
| Testing | [choice] | [why] |

## Screens / Routes / API Surfaces

- `[route or surface]` — [purpose]

## Core User Flows

### Flow 1: [Name]

1. [Step — happy path.]
2. [Step.]

**Failure paths:** [What happens on error / invalid input / timeout.]

## Design Direction (greenfield UI)

- **Chosen direction:** [typography, color system, layout language, mood.]
- **Why it won:** [over which alternatives.]

## UX / Screen Spec

### [Screen name] (`[route]`)

- **Layout:** [description]
- **Components:** [list]
- **States:** loading / error / empty / populated — [each described]
- **Responsive:** [behavior at mobile / desktop]
- **Navigation:** [entry and exit points]

## Data Model

- **[Entity]** — [key fields, relationships]

**Migration strategy:** [approach]

## Security Model

- **Auth strategy:** [sessions/JWT, storage, expiry]
- **Input validation:** [approach, library]
- **CORS policy:** [policy]
- **Secrets:** [where they live, how they are loaded]

## Environment Variable Manifest

| Name | Purpose | Example | Required |
|---|---|---|---|
| `[VAR]` | [purpose] | `[example]` | yes/no |

## Architecture and File Ownership Map

```
[directory structure]
```

| Area | Owner |
|---|---|
| `[path]` | wolverine-1 \| wolverine-2 \| storm-ui |

## Milestones

### Milestone 1: [Name]

- **Acceptance criteria:** [concrete, measurable — not "it works correctly"]
- **Verify:** `[exact command or manual check]`

## Tests and Verification Commands

- `[command]` — [what passing means]

## Production Readiness Criteria

- [§9.5 checklist items that apply to this build.]

## Risks, Approval Gates, Rollback

- **Risks:** [risk — mitigation]
- **Approval gates:** [gate, or None]
- **Rollback / recovery:** [how to undo if execution fails]
