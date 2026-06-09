#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DEFAULT_MODEL_SLOTS } from "./runtime/index.js";
import { resolveTarget, TARGET_IDS, type TargetID } from "./targets/index.js";

type InstallOptions = {
  dryRun: boolean;
  force: boolean;
  reset: boolean;
  skipDeps: boolean;
  target: string;
  emitter: TargetID;
};

type JsonObject = { [key: string]: JsonValue };
type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) return install([]);
  if (command === "install") return install(args.slice(1));
  if (command === "doctor") return doctor(args.slice(1));
  if (command === "models") return models();
  if (command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }

  console.error(`Unknown command: ${command}`);
  console.error("Run `open-xmen --help` for usage information.");
  return 1;
}

function printHelp() {
  console.log(`Open X-Men installer

Usage:
  open-xmen [install] [OPTIONS]
  open-xmen doctor [OPTIONS]
  open-xmen models

Install options:
  --dir <path>    Project directory to install into (default: current directory)
  --dry-run       Print planned writes without changing files
  --reset         Refresh managed runtime/template files and replace existing Open X-Men blocks
  --force         Alias for overwrite behavior used by --reset
  --no-deps       Skip OpenCode plugin cache warm-up
  -h, --help      Show this help message

Doctor options:
  --dir <path>    Project directory to validate (default: current directory)
  --json          Print diagnostics as JSON
  -h, --help      Show this help message

Examples:
  bunx open-xmen@latest install
  bunx open-xmen@latest install --dir /path/to/project --dry-run
  bunx open-xmen@latest install --reset --no-deps
  open-xmen doctor --json
`);
}

function printInstallHelp() {
  console.log(`Usage: open-xmen install [--dir <path>] [--dry-run] [--reset] [--force] [--no-deps]

By default, existing runtime/template files are skipped. Use --reset or --force to refresh them.
opencode.jsonc is updated atomically and an opencode.jsonc.bak backup is created when replacing an existing config.`);
}

function printDoctorHelp() {
  console.log("Usage: open-xmen doctor [--dir <path>] [--json]");
}

function install(args: string[]) {
  if (args.includes("--help") || args.includes("-h")) {
    printInstallHelp();
    return 0;
  }

  const unknown = args.find((arg, index) => {
    if (!arg.startsWith("-")) return false;
    if (args[index - 1] === "--dir") return false;
    if (args[index - 1] === "--target") return false;
    return !["--dir", "--target", "--dry-run", "--force", "--reset", "--no-deps"].includes(arg);
  });
  if (unknown) {
    console.error(`Unknown install option: ${unknown}`);
    return 1;
  }

  const targetArg = valueAfter(args, "--dir");
  const emitterArg = valueAfter(args, "--target") || "opencode";
  if (args.includes("--dir") && !targetArg) {
    console.error("Missing value for --dir");
    return 1;
  }
  if (args.includes("--target") && !valueAfter(args, "--target")) {
    console.error("Missing value for --target");
    return 1;
  }
  if (!TARGET_IDS.includes(emitterArg as TargetID)) {
    console.error(`Unsupported target: ${emitterArg}`);
    return 1;
  }

  const options: InstallOptions = {
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
    reset: args.includes("--reset"),
    skipDeps: args.includes("--no-deps"),
    target: path.resolve(targetArg || process.cwd()),
    emitter: emitterArg as TargetID,
  };
  const overwrite = options.force || options.reset;
  const planned: string[] = [];
  const adapter = resolveTarget(options.emitter);

  console.log(`Open X-Men ${options.dryRun ? "dry run" : "install"}`);
  console.log(`Target: ${options.target}`);
  console.log(`Emitter: ${options.emitter}`);
  if (overwrite) console.log("Mode: refresh existing managed files (--reset/--force)");
  else console.log("Mode: safe install (existing files are skipped)");

  if (!options.dryRun) mkdirSync(options.target, { recursive: true });
  else planned.push(`ensure directory ${options.target}`);

  adapter.install({
    targetDir: options.target,
    dryRun: options.dryRun,
    overwrite,
    skipDeps: options.skipDeps,
    planned,
  });

  if (options.dryRun) {
    console.log("\nPlanned actions:");
    for (const action of planned) console.log(`- ${action}`);
    console.log("\nopen-xmen install: DRY RUN PASS");
    return 0;
  }

  if (options.skipDeps && options.emitter === "opencode") console.log("Skipped OpenCode plugin cache warm-up (--no-deps)");

  console.log("open-xmen install: PASS");
  console.log(`Installed into ${options.target}`);
  if (options.emitter === "opencode") console.log("Next: run `opencode .`, then use `/cerebro-index`, `/cerebro-plan`, or `/to-me-my-x-men`.");
  return 0;
}

function doctor(args: string[] = []) {
  if (args.includes("--help") || args.includes("-h")) {
    printDoctorHelp();
    return 0;
  }
  const json = args.includes("--json");
  const targetArg = valueAfter(args, "--dir");
  const emitterArg = valueAfter(args, "--target") || "opencode";
  const unknown = args.find((arg, index) => {
    if (!arg.startsWith("-")) return false;
    if (args[index - 1] === "--dir") return false;
    if (args[index - 1] === "--target") return false;
    return !["--dir", "--target", "--json"].includes(arg);
  });
  if (unknown) {
    if (json) console.log(JSON.stringify({ ok: false, error: `Unknown doctor option: ${unknown}` }, null, 2));
    else console.error(`Unknown doctor option: ${unknown}`);
    return 1;
  }
  if (args.includes("--dir") && !targetArg) {
    if (json) console.log(JSON.stringify({ ok: false, error: "Missing value for --dir" }, null, 2));
    else console.error("Missing value for --dir");
    return 1;
  }
  if (args.includes("--target") && !valueAfter(args, "--target")) {
    if (json) console.log(JSON.stringify({ ok: false, error: "Missing value for --target" }, null, 2));
    else console.error("Missing value for --target");
    return 1;
  }
  if (!TARGET_IDS.includes(emitterArg as TargetID)) {
    if (json) console.log(JSON.stringify({ ok: false, error: `Unsupported target: ${emitterArg}` }, null, 2));
    else console.error(`Unsupported target: ${emitterArg}`);
    return 1;
  }

  const cwd = path.resolve(targetArg || process.cwd());
  const result = resolveTarget(emitterArg as TargetID).doctor(cwd);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }

  if (!result.ok) {
    console.error("Cerebro OpenCode doctor: FAIL");
    for (const error of result.errors) console.error(`- ${error}`);
    return 1;
  }

  console.log("Cerebro OpenCode doctor: PASS");
  console.log(`Agents: ${result.agents}`);
  console.log(`Commands: ${result.commands}`);
  return 0;
}

function models() {
  console.log(JSON.stringify({
    frontier: process.env.CEREBRO_MODEL_FRONTIER || DEFAULT_MODEL_SLOTS.frontier,
    strong: process.env.CEREBRO_MODEL_STRONG || DEFAULT_MODEL_SLOTS.strong,
    coding: process.env.CEREBRO_MODEL_CODING || DEFAULT_MODEL_SLOTS.coding,
    spark: process.env.CEREBRO_MODEL_SPARK || DEFAULT_MODEL_SLOTS.spark,
    fast: process.env.CEREBRO_MODEL_FAST || DEFAULT_MODEL_SLOTS.fast,
    image: process.env.CEREBRO_MODEL_IMAGE || DEFAULT_MODEL_SLOTS.image,
  }, null, 2));
  return 0;
}

function valueAfter(args: string[], flag: string) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

process.exitCode = main();
