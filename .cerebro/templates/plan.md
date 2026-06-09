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

### Task 1: [Name]

**Owner:** Wolverine | Storm | Cyclops | Forge consultation
**Files:** `[exact/path.ext]` (modify/create) or `None`
**What:** [Specific implementation or verification action.]
**TDD:** [Failing test to write first, or "Not applicable: [reason]".]
**Verify:** `[exact command or manual check]`
**Risk:** LOW | MEDIUM | HIGH
**Approval Gate:** None | [Gate name from Approval Gates]

## Rollback / Recovery

- [How to undo or recover if execution fails. Use "Not applicable" only for low-risk docs/config-only work.]
