import { spawn } from "node:child_process";

const OUTPUT_CAP_BYTES = 64 * 1024;
const FAILURE_TAIL_CAP = 4000;
export const DEFAULT_COMMAND_TIMEOUT_MS = 600_000;

export type CommandResult = {
  command: string;
  exitCode: number | null;
  pass: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
};

export type VerificationOutcome = {
  result: "PASS" | "FAIL";
  commands: CommandResult[];
  failureOutput?: string;
};

export type VerifierOptions = {
  cwd: string;
  timeoutMs: number;
  signal?: AbortSignal;
};

export type Verifier = (commands: string[], opts: VerifierOptions) => Promise<VerificationOutcome>;

function runCommand(command: string, opts: VerifierOptions): Promise<CommandResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    // node:child_process rather than Bun.spawn: identical behavior under Bun (which
    // implements the Node API), plain Node, and `bun test`.
    const child = spawn(command, { shell: true, cwd: opts.cwd });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const append = (current: string, chunk: unknown) => `${current}${String(chunk)}`.slice(-OUTPUT_CAP_BYTES);
    child.stdout?.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr?.on("data", (chunk) => { stderr = append(stderr, chunk); });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      const hardKill = setTimeout(() => child.kill("SIGKILL"), 5000);
      hardKill.unref?.();
    }, opts.timeoutMs);

    const onAbort = () => child.kill("SIGTERM");
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    const finish = (exitCode: number | null, extraStderr?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      resolve({
        command,
        exitCode,
        pass: exitCode === 0 && !timedOut && !opts.signal?.aborted,
        stdout,
        stderr: extraStderr ? append(stderr, `\n${extraStderr}`) : stderr,
        durationMs: Date.now() - started,
        timedOut,
      });
    };

    child.on("error", (error) => finish(null, error.message));
    child.on("close", (code) => finish(code));
  });
}

// Runs verification commands sequentially in a real shell, stopping at the first failure.
export const runVerificationCommands: Verifier = async (commands, opts) => {
  const results: CommandResult[] = [];
  for (const command of commands) {
    if (opts.signal?.aborted) {
      return {
        result: "FAIL",
        commands: results,
        failureOutput: `Verification aborted before running: ${command}`,
      };
    }
    const result = await runCommand(command, opts);
    results.push(result);
    if (!result.pass) {
      const combined = [result.stdout, result.stderr].filter(Boolean).join("\n");
      const reason = result.timedOut
        ? `timed out after ${Math.round(opts.timeoutMs / 1000)}s`
        : `exit code ${result.exitCode}`;
      const tail = combined.length > FAILURE_TAIL_CAP ? `…(truncated)\n${combined.slice(-FAILURE_TAIL_CAP)}` : combined;
      return {
        result: "FAIL",
        commands: results,
        failureOutput: `Command failed (${reason}): ${command}\n${tail}`.trim(),
      };
    }
  }
  return { result: "PASS", commands: results };
};
