# [Plan Name]

**Objective:** [One sentence describing the user-visible change.]
**Risk Level:** LOW | MEDIUM | HIGH

## Assumptions and Decisions

- [Decision or assumption that affects implementation.]

## Approval Gates

- [ ] None

Use explicit gates for destructive, irreversible, privileged, external mutating, production, data, auth, billing, dependency-upgrade, or git-history actions.

## Acceptance Criteria

- [ ] [Concrete pass/fail criterion.]
- [ ] [Concrete pass/fail criterion.]

## Tasks

Each task's `Category`, `Depends On`, `Files`, and `Verify` fields become machine-scheduled task records consumed by the Cerebro workflow engine. Keep them precise, not decorative: `Files` drives parallel-batch conflict avoidance and `Verify` commands are executed verbatim in a shell.

### Task 1: [Name]

**Owner:** Wolverine | Jean Grey | Storm | Forge consultation
**Category:** visual-engineering | architecture | explore | research | deep | quick
**Effort:** None | low (trivial — run on the fast/cheap model) | high (hard — run on the top-reasoning model)
**Depends On:** None | Task [number/id]
**Files:** `[exact/path.ext]` (modify/create) or `None`
**What:** [Specific implementation or verification action.]
**TDD:** [Failing test to write first, or "Not applicable: [reason]".]
**Verify:** `[exact command or manual check]`
**Risk:** LOW | MEDIUM | HIGH
**Approval Gate:** None | [Gate name from Approval Gates]

## Rollback / Recovery

- [How to undo or recover if execution fails. Use "Not applicable" only for low-risk docs/config-only work.]
