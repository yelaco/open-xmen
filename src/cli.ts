#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DEFAULT_MODEL_SLOTS } from "./runtime/index.js";
import { installManagedAgentInstructions, installManagedRuntime } from "./cli/runtime.js";
import { updateOpencodeConfig, warmOpenCodePluginCache } from "./cli/config.js";
import { runOpenCodeDoctor } from "./cli/doctor.js";
import { fileURLToPath } from "node:url";

type InstallOptions = {
  dryRun: boolean;
  force: boolean;
  reset: boolean;
  skipDeps: boolean;
  target: string;
};

type JsonObject = { [key: string]: JsonValue };
type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) return install([]);
  if (command === "install") return install(args.slice(1));
  if (command === "update") return update(args.slice(1));
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
  open-xmen update [--dir <path>] [--dry-run]
  open-xmen doctor [OPTIONS]
  open-xmen models

Install options:
  --dir <path>    Project directory to install into (default: current directory)
  --dry-run       Print planned writes without changing files
  --reset         Refresh managed runtime/template files and replace existing Open X-Men blocks
  --force         Alias for overwrite behavior used by --reset
  --no-deps       Skip OpenCode plugin cache warm-up
  -h, --help      Show this help message

Update options:
  --dir <path>    Project directory to update (default: current directory)
  --dry-run       Print planned writes without changing files

Doctor options:
  --dir <path>    Project directory to validate (default: current directory)
  --json          Print diagnostics as JSON
  -h, --help      Show this help message

Examples:
  bunx open-xmen@latest install
  bunx open-xmen@latest install --dir /path/to/project --dry-run
  bunx open-xmen@latest update
  open-xmen doctor --json
`);
}

function printInstallHelp() {
  console.log(`Usage: open-xmen install [--dir <path>] [--dry-run] [--reset] [--force] [--no-deps]

By default, existing runtime/template files are skipped. Use --reset or --force to refresh them.
opencode.jsonc is updated atomically and an opencode.jsonc.bak backup is created when replacing an existing config.`);
}

function printUpdateHelp() {
  console.log(`Usage: open-xmen update [--dir <path>] [--dry-run]

Refreshes all managed runtime and template files to the current package version.
This is the recommended way to upgrade after \`bunx open-xmen@latest\` fetches a new version.`);
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
    return !["--dir", "--dry-run", "--force", "--reset", "--no-deps"].includes(arg);
  });
  if (unknown) {
    console.error(`Unknown install option: ${unknown}`);
    return 1;
  }

  const targetArg = valueAfter(args, "--dir");
  if (args.includes("--dir") && !targetArg) {
    console.error("Missing value for --dir");
    return 1;
  }

  const options: InstallOptions = {
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
    reset: args.includes("--reset"),
    skipDeps: args.includes("--no-deps"),
    target: path.resolve(targetArg || process.cwd()),
  };
  const overwrite = options.force || options.reset;
  const planned: string[] = [];

  console.log(`Open X-Men ${options.dryRun ? "dry run" : "install"}`);
  console.log(`Target: ${options.target}`);
  if (overwrite) console.log("Mode: refresh existing managed files (--reset/--force)");
  else console.log("Mode: safe install (existing files are skipped)");

  if (!options.dryRun) mkdirSync(options.target, { recursive: true });
  else planned.push(`ensure directory ${options.target}`);

  installManagedRuntime(options.target, { dryRun: options.dryRun, overwrite, planned });
  installManagedAgentInstructions(options.target, { dryRun: options.dryRun, overwrite, planned });
  updateOpencodeConfig(options.target, { dryRun: options.dryRun, planned });
  if (!options.dryRun && !options.skipDeps) warmOpenCodePluginCache(packageRoot());

  if (options.dryRun) {
    console.log("\nPlanned actions:");
    for (const action of planned) console.log(`- ${action}`);
    console.log("\nopen-xmen install: DRY RUN PASS");
    return 0;
  }

  if (options.skipDeps) console.log("Skipped OpenCode plugin cache warm-up (--no-deps)");

  console.log("open-xmen install: PASS");
  console.log(`Installed into ${options.target}`);
  console.log("Next: run `opencode .`, then use `/cerebro-index`, `/cerebro-plan`, or `/to-me-my-x-men`.");
  return 0;
}

function update(args: string[]) {
  if (args.includes("--help") || args.includes("-h")) {
    printUpdateHelp();
    return 0;
  }

  const unknown = args.find((arg, index) => {
    if (!arg.startsWith("-")) return false;
    if (args[index - 1] === "--dir") return false;
    return !["--dir", "--dry-run"].includes(arg);
  });
  if (unknown) {
    console.error(`Unknown update option: ${unknown}`);
    return 1;
  }

  const targetArg = valueAfter(args, "--dir");
  if (args.includes("--dir") && !targetArg) {
    console.error("Missing value for --dir");
    return 1;
  }

  const dryRun = args.includes("--dry-run");
  const target = path.resolve(targetArg || process.cwd());
  const planned: string[] = [];

  console.log(`Open X-Men ${dryRun ? "update dry run" : "update"}`);
  console.log(`Target: ${target}`);

  installManagedRuntime(target, { dryRun, overwrite: true, planned });
  installManagedAgentInstructions(target, { dryRun, overwrite: true, planned });
  updateOpencodeConfig(target, { dryRun, planned });

  if (dryRun) {
    console.log("\nPlanned actions:");
    for (const action of planned) console.log(`- ${action}`);
    console.log("\nopen-xmen update: DRY RUN PASS");
    return 0;
  }

  console.log("open-xmen update: PASS");
  console.log(`Updated managed runtime files in ${target}`);
  return 0;
}

function doctor(args: string[] = []) {
  if (args.includes("--help") || args.includes("-h")) {
    printDoctorHelp();
    return 0;
  }
  const json = args.includes("--json");
  const targetArg = valueAfter(args, "--dir");
  const unknown = args.find((arg, index) => {
    if (!arg.startsWith("-")) return false;
    if (args[index - 1] === "--dir") return false;
    return !["--dir", "--json"].includes(arg);
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

  const cwd = path.resolve(targetArg || process.cwd());
  const result = runOpenCodeDoctor(cwd);

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

function packageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function valueAfter(args: string[], flag: string) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

try {
  process.exitCode = main();
} catch (err) {
  console.error(`open-xmen: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
