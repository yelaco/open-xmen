import { describe, expect, test } from "bun:test";
import { runVerificationCommands } from "../src/workflow/verify.js";

const opts = { cwd: process.cwd(), timeoutMs: 10_000 };

describe("runVerificationCommands", () => {
  test("passing command yields PASS", async () => {
    const outcome = await runVerificationCommands(["true"], opts);
    expect(outcome.result).toBe("PASS");
    expect(outcome.commands).toHaveLength(1);
    expect(outcome.commands[0]).toMatchObject({ exitCode: 0, pass: true, timedOut: false });
  });

  test("failing command yields FAIL with exit code and stops the sequence", async () => {
    const outcome = await runVerificationCommands(["false", "true"], opts);
    expect(outcome.result).toBe("FAIL");
    expect(outcome.commands).toHaveLength(1);
    expect(outcome.commands[0].exitCode).toBe(1);
    expect(outcome.failureOutput).toContain("exit code 1");
  });

  test("captures stdout", async () => {
    const outcome = await runVerificationCommands(["echo hello-engine"], opts);
    expect(outcome.commands[0].stdout).toContain("hello-engine");
  });

  test("failure output includes command output tail", async () => {
    const outcome = await runVerificationCommands(["echo broken-thing >&2; exit 3"], opts);
    expect(outcome.result).toBe("FAIL");
    expect(outcome.failureOutput).toContain("broken-thing");
    expect(outcome.failureOutput).toContain("exit code 3");
  });

  test("timeout kills the command and marks timedOut", async () => {
    const outcome = await runVerificationCommands(["sleep 5"], { ...opts, timeoutMs: 300 });
    expect(outcome.result).toBe("FAIL");
    expect(outcome.commands[0].timedOut).toBe(true);
    expect(outcome.failureOutput).toContain("timed out");
  }, 10_000);

  test("abort signal cancels", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);
    const outcome = await runVerificationCommands(["sleep 5"], { ...opts, signal: controller.signal });
    expect(outcome.result).toBe("FAIL");
    expect(outcome.commands[0].pass).toBe(false);
  }, 10_000);

  test("aborted before start fails fast without running", async () => {
    const controller = new AbortController();
    controller.abort();
    const outcome = await runVerificationCommands(["true"], { ...opts, signal: controller.signal });
    expect(outcome.result).toBe("FAIL");
    expect(outcome.commands).toHaveLength(0);
  });
});
