---
name: opx-code-review
description: Review a change for correctness bugs and reuse/simplification opportunities, with file:line evidence for every finding. Use when reviewing a diff, plan, or implementation before it ships.
---

This skill produces an evidence-backed review, not vibes. Every finding cites a concrete location and explains the consequence.

## Scope the review

Review the actual change set — `git diff` (and `git status` for untracked files) against the merge base, or the files named in the task. Read enough surrounding code to judge correctness; a diff hunk in isolation lies.

## What to look for (in priority order)

1. **Correctness bugs** — logic errors, off-by-one, wrong conditionals, unhandled error/empty/null cases, race conditions, broken invariants, resource leaks, incorrect async/await.
2. **Contract & compatibility** — changed public APIs/types, breaking changes, missing migrations, inconsistent error handling.
3. **Security-adjacent** — unvalidated input, injection, secret handling, unsafe defaults. (For high-risk auth/billing/data work, defer to a dedicated security review.)
4. **Reuse & simplification** — duplicated logic that an existing helper covers, needless complexity, dead code introduced by the change.
5. **Tests** — behavior changed without a covering test; tests that assert implementation rather than behavior.

Avoid style nits the project's linter/formatter already handles. Skip speculative "could be faster" without evidence.

## Output

Group findings by severity (blocking / should-fix / optional). Each finding: `file:line`, what's wrong, the consequence, and a concrete fix. If the change is clean, say so plainly with what you checked. When run inside a Cerebro task, fold the verdict into your result block (Beast's `GAPS FOUND` contract).
