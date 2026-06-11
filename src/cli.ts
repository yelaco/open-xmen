#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import path from "node:path";
import { modelSlots } from "./config/models.js";
import { installSkills } from "./cli/runtime.js";
import { globalOpenCodeConfigDir, updateOpencodeConfig, warmOpenCodePluginCache } from "./cli/config.js";
import { runOpenCodeDoctor } from "./cli/doctor.js";
import { fileURLToPath } from "node:url";

type InstallOptions = {
  dryRun: boolean;
  global: boolean;
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
  --dir <path>           Project directory to add the plugin entry to instead of user OpenCode config
  -g, --global           Install into OpenCode user config (default)
  --dry-run              Print planned writes without changing files
  --no-deps              Skip OpenCode plugin cache warm-up
  -h, --help             Show this help message

Skills (e.g. opx-frontend-design) always install into the global OpenCode
config dir (~/.config/opencode/skills/), regardless of --dir.


Doctor options:
  --dir <path>    Project directory to validate (default: current directory)
  --json          Print diagnostics as JSON
  -h, --help      Show this help message

Examples:
  bunx open-xmen@latest install
  bunx open-xmen@latest install --global
  bunx open-xmen@latest install --dir /path/to/project --dry-run
  open-xmen doctor --json
`);
}

function printInstallHelp() {
  console.log(`Usage: open-xmen install [--dir <path>] [--global] [--dry-run] [--no-deps]

By default, install adds the Open X-Men plugin entry to the OpenCode user config; the plugin registers commands and agents at load time.
Use --dir to write a project-local opencode.jsonc instead.
Plugin skills always install into the global OpenCode config dir (~/.config/opencode/skills/) so OpenCode can discover them, regardless of --dir.
--global is accepted as an explicit alias for the default user-config install.
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

  const unknown = args.find((arg) => {
    if (!arg.startsWith("-")) return false;
    return !["--dir", "--dry-run", "--global", "-g", "--no-deps"].includes(arg);
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
  const explicitGlobal = args.includes("--global") || args.includes("-g");
  if (explicitGlobal && args.includes("--dir")) {
    console.error("Use either --global or --dir, not both");
    return 1;
  }
  const userConfigInstall = !args.includes("--dir");
  const globalConfigDir = globalOpenCodeConfigDir();

  const options: InstallOptions = {
    dryRun: args.includes("--dry-run"),
    global: userConfigInstall || explicitGlobal,
    skipDeps: args.includes("--no-deps"),
    target: userConfigInstall || explicitGlobal ? globalConfigDir : path.resolve(targetArg || process.cwd()),
  };
  const planned: string[] = [];

  console.log(`Open X-Men ${options.dryRun ? "dry run" : "install"}`);
  console.log(`${options.global ? "OpenCode user config" : "Target"}: ${options.target}`);
  console.log(options.global ? "Mode: user-config plugin entry only" : "Mode: project plugin entry only");

  if (!options.dryRun) mkdirSync(options.target, { recursive: true });
  else planned.push(`ensure directory ${options.target}`);

  updateOpencodeConfig(options.target, {
    dryRun: options.dryRun,
    planned,
    defaultAgent: options.global ? undefined : "cerebro",
  });

  // Skills are user-global so OpenCode can discover them regardless of where the plugin entry lives.
  const skillCount = installSkills(globalConfigDir, { dryRun: options.dryRun, planned });

  if (!options.dryRun && !options.skipDeps) warmOpenCodePluginCache(packageRoot());

  if (options.dryRun) {
    console.log("\nPlanned actions:");
    for (const action of planned) console.log(`- ${action}`);
    console.log("\nopen-xmen install: DRY RUN PASS");
    return 0;
  }

  if (options.skipDeps) console.log("Skipped OpenCode plugin cache warm-up (--no-deps)");

  console.log("open-xmen install: PASS");
  console.log(`${options.global ? "Installed in OpenCode user config" : "Installed into"} ${options.target}`);
  console.log("Commands and agents are provided by the plugin; no .opencode/ or .cerebro/ files were written.");
  console.log(`Installed ${skillCount} skill(s) into ${path.join(globalConfigDir, "skills")}.`);
  console.log("Next: restart OpenCode, then use `/cerebro-index`, `/cerebro-plan`, or `/cerebro-ultrawork`.");
  return 0;
}

function doctor(args: string[] = []) {
  if (args.includes("--help") || args.includes("-h")) {
    printDoctorHelp();
    return 0;
  }
  const json = args.includes("--json");
  const targetArg = valueAfter(args, "--dir");
  const unknown = args.find((arg) => {
    if (!arg.startsWith("-")) return false;
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
  console.log(`Mode: ${result.mode}`);
  console.log(`Agents: ${result.agents}`);
  console.log(`Commands: ${result.commands}`);
  return 0;
}

function models() {
  console.log(JSON.stringify(modelSlots(), null, 2));
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
