---
name: opx-test
description: Write and run focused automated tests — unit and integration — that actually exercise the change. Use when implementing a feature or fix, or when a task's verification needs real test coverage rather than assertions of correctness.
---

This skill makes testing deliberate and evidence-producing. Tests you write become Cerebro's deterministic verification (run via `cerebro_verify`), so they must genuinely fail when the code is wrong.

## Find the project's test setup first

Detect the framework and runner before writing anything: look for `vitest`/`jest`/`bun test`/`pytest`/`go test`/`cargo test` config and existing test files. Match the project's conventions — file naming, directory layout, assertion style, fixtures. Do not introduce a new framework when one exists.

## Write tests that earn their keep

- **Test behavior, not implementation.** Assert observable outcomes (return values, state, emitted events, HTTP responses), not internal calls — so refactors don't break tests spuriously.
- **Cover the real cases:** the happy path, the boundaries, the error paths, and the specific bug being fixed (write the failing test first for a fix).
- **Keep tests isolated and deterministic:** no shared mutable state, no real network/clock/randomness unless controlled. Seed or fake them.
- **One reason to fail per test.** Prefer several small, named tests over one sprawling case.
- **Verify the test fails first.** A test that passes against broken code proves nothing — confirm red, then green.

## Run and report

Run the focused suite (or the whole suite when fast) and capture the exact command + result. Pair each test file with the implementation it covers. Report the commands run and pass/fail counts in the `TESTS RUN` and `VERIFICATION` sections of your `TASK_RESULT`. If you could not run tests (missing deps, no runner), say so explicitly rather than claiming verification.
