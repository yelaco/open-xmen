---
name: opx-debug
description: Reproduce-first debugging — isolate a failure with a minimal repro, find the root cause with evidence, fix it, and prove the fix. Use when something is broken, flaky, or behaving unexpectedly.
---

This skill enforces disciplined debugging: never guess-and-patch. Find the actual cause, then fix it.

## Procedure

1. **Reproduce first.** Get a reliable, minimal reproduction before changing anything — exact steps, inputs, environment, and the precise error/stack trace. If it's flaky, run it enough times to characterize the failure rate. A bug you can't reproduce, you can't confirm fixed.
2. **Locate, don't guess.** Bisect the surface: add targeted instrumentation (logs/asserts at boundaries), use `git bisect` to find the introducing commit, and use code search (the `semble` MCP if available) or grep to trace the data/control flow. Form a hypothesis and test it before editing.
3. **Find the root cause, not the symptom.** Ask why the bad state arose, not just where it surfaced. Fix the cause; a symptom patch that leaves the cause is a regression waiting to happen.
4. **Fix minimally.** Make the smallest change that addresses the root cause. Avoid drive-by refactors in a debugging change.
5. **Prove it.** Add a regression test (via the `opx-test` skill) that fails before the fix and passes after. Re-run the original reproduction to confirm it's resolved, and remove any temporary instrumentation.

## Report

In your `TASK_RESULT`, state the reproduction, the root cause (with file:line evidence), the fix, and the regression test + command that proves it. Note any remaining risk or related issues under `ISSUES`.
