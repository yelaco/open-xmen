#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import readline from "node:readline";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { CEREBRO_FOCUSES, CEREBRO_PROVIDERS, OPTIONAL_MCP_SERVERS, modelSlots } from "./config/models.js";
import type { CerebroFocus, CerebroProvider } from "./config/models.js";
import { installSkills } from "./cli/runtime.js";
import { globalOpenCodeConfigDir, updateOpencodeConfig, warmOpenCodePluginCache, writeOpenXmenConfig } from "./cli/config.js";
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

async function main() {
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
  --provider <list>      Model subscription(s) you have, comma-separated (e.g. openai,anthropic) or "all"
  --focus <name>         Model focus preset: performance | balance | cost
  --mcp <list>           Optional MCP servers to enable, comma-separated (playwright,semble), "all", or "none"
  --dry-run              Print planned writes without changing files
  --no-deps              Skip OpenCode plugin cache warm-up
  -h, --help             Show this help message

On an interactive terminal, install asks for your provider and focus when
--provider/--focus are not given. Non-interactively it leaves the model
preset unchanged (defaults to OpenAI / balance).

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

async function install(args: string[]) {
  if (args.includes("--help") || args.includes("-h")) {
    printInstallHelp();
    return 0;
  }

  const unknown = args.find((arg) => {
    if (!arg.startsWith("-")) return false;
    return !["--dir", "--provider", "--focus", "--mcp", "--dry-run", "--global", "-g", "--no-deps"].includes(arg);
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

  const providerArg = valueAfter(args, "--provider");
  const providers = parseProviderArg(providerArg);
  if (args.includes("--provider") && providers.length === 0) {
    console.error(`--provider must be one or more of: ${CEREBRO_PROVIDERS.join(", ")} (comma-separated, or "both")`);
    return 1;
  }
  const focusArg = valueAfter(args, "--focus");
  if (args.includes("--focus") && !isFocus(focusArg)) {
    console.error(`--focus must be one of: ${CEREBRO_FOCUSES.join(", ")}`);
    return 1;
  }
  const mcpArg = valueAfter(args, "--mcp");
  const mcpServers = args.includes("--mcp") ? parseMcpArg(mcpArg) : undefined;
  if (args.includes("--mcp") && mcpServers === undefined) {
    console.error(`--mcp must be a comma-separated list of: ${Object.keys(OPTIONAL_MCP_SERVERS).join(", ")} (or "all"/"none")`);
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

  // Resolve the model preset and optional MCP servers: flags win; otherwise prompt on an
  // interactive terminal; otherwise leave unchanged.
  const selection = await resolvePresetSelection(
    providers,
    isFocus(focusArg) ? focusArg : undefined,
    options.dryRun,
  );
  const resolvedMcp = await resolveMcpServers(mcpServers, options.dryRun);

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

  const patch: { providers?: CerebroProvider[]; focus?: CerebroFocus; mcp_servers?: string[] } = {};
  if (selection) { patch.providers = selection.providers; patch.focus = selection.focus; }
  if (resolvedMcp !== undefined) patch.mcp_servers = resolvedMcp;
  if (Object.keys(patch).length > 0) writeOpenXmenConfig(globalConfigDir, patch, { dryRun: options.dryRun, planned });

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
  if (selection) console.log(`Model preset: ${selection.providers.join(" + ")} / ${selection.focus} (best model per agent across your subscription).`);
  if (resolvedMcp !== undefined) console.log(`MCP servers: ${resolvedMcp.length ? resolvedMcp.join(", ") : "none"}.`);
  console.log("Next: restart OpenCode, then use `/cerebro-index`, `/cerebro-plan`, or `/cerebro-ultrawork`.");
  return 0;
}

function isFocus(value: string | undefined): value is CerebroFocus {
  return value !== undefined && (CEREBRO_FOCUSES as readonly string[]).includes(value);
}

// Accepts a comma-separated list of provider ids, or the shorthand "all"/"both"
// (both = all, kept for intuition). Returns a deduped provider set. Generic over
// CEREBRO_PROVIDERS so adding a future provider needs no change here.
function parseProviderArg(value: string | undefined): CerebroProvider[] {
  if (!value) return [];
  const out: CerebroProvider[] = [];
  for (const raw of value.split(",")) {
    const token = raw.trim().toLowerCase();
    if (token === "all" || token === "both") return [...CEREBRO_PROVIDERS];
    if ((CEREBRO_PROVIDERS as readonly string[]).includes(token) && !out.includes(token as CerebroProvider)) {
      out.push(token as CerebroProvider);
    }
  }
  return out;
}

async function resolvePresetSelection(
  providers: CerebroProvider[],
  focus: CerebroFocus | undefined,
  dryRun: boolean,
): Promise<{ providers: CerebroProvider[]; focus: CerebroFocus } | undefined> {
  if (providers.length > 0 && focus) return { providers, focus };
  // Don't block non-interactive installs (CI, piped bunx); leave the preset unchanged.
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    if (providers.length > 0 || focus) console.log("Note: pass both --provider and --focus to set a preset non-interactively; leaving model preset unchanged.");
    return undefined;
  }
  if (dryRun) return providers.length > 0 && focus ? { providers, focus } : undefined;

  // Preferred path: interactive checkbox/radio selection.
  if (canInteractiveSelect()) {
    let resolvedProviders = providers;
    if (resolvedProviders.length === 0) {
      const picked = await interactiveSelect({
        title: "Which model subscription(s) do you have?",
        multiple: true,
        choices: providerChoices(),
      });
      if (picked === undefined || picked.length === 0) return undefined;
      resolvedProviders = picked as CerebroProvider[];
    }
    let resolvedFocus = focus;
    if (!resolvedFocus) {
      const picked = await interactiveSelect({
        title: "Optimize models for?",
        multiple: false,
        choices: focusChoices(),
        preselected: ["balance"],
      });
      resolvedFocus = ((picked && picked[0]) ?? "balance") as CerebroFocus;
    }
    return { providers: resolvedProviders, focus: resolvedFocus };
  }

  // Fallback: typed prompt for terminals without raw-mode support.
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    let resolvedProviders = providers;
    if (resolvedProviders.length === 0) {
      resolvedProviders = await askProviders(rl);
      if (resolvedProviders.length === 0) return undefined;
    }
    const resolvedFocus = focus ?? ((await ask(rl,
      "Optimize models for? [performance/balance/cost] (enter for balance): ",
      CEREBRO_FOCUSES,
      "balance",
    )) as CerebroFocus);
    return { providers: resolvedProviders, focus: resolvedFocus };
  } finally {
    rl.close();
  }
}

function providerChoices(): SelectChoice[] {
  const labels: Record<CerebroProvider, string> = {
    openai: "OpenAI — GPT models",
    anthropic: "Anthropic — Claude models",
  };
  return CEREBRO_PROVIDERS.map((p) => ({ value: p, label: labels[p] ?? p }));
}

function focusChoices(): SelectChoice[] {
  return [
    { value: "performance", label: "Performance", hint: "max quality, cost no object" },
    { value: "balance", label: "Balance", hint: "quality where it matters, cost-aware on high-volume" },
    { value: "cost", label: "Cost", hint: "cheapest acceptable per role" },
  ];
}

function mcpChoices(): SelectChoice[] {
  return Object.entries(OPTIONAL_MCP_SERVERS).map(([value, def]) => ({
    value,
    label: `${value} — ${def.description}`,
    hint: `needs ${def.requires} · ${def.usedBy}`,
  }));
}

// Parses --mcp: comma-separated server ids, "all", or "none" (empty selection). Returns the
// list, or undefined if any token is unknown.
function parseMcpArg(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "none" || trimmed === "") return [];
  if (trimmed === "all") return Object.keys(OPTIONAL_MCP_SERVERS);
  const out: string[] = [];
  for (const raw of value.split(",")) {
    const token = raw.trim().toLowerCase();
    if (!token) continue;
    if (!(token in OPTIONAL_MCP_SERVERS)) return undefined;
    if (!out.includes(token)) out.push(token);
  }
  return out;
}

// Flag wins; otherwise multi-select on an interactive terminal; otherwise leave unchanged.
async function resolveMcpServers(fromFlag: string[] | undefined, dryRun: boolean): Promise<string[] | undefined> {
  if (fromFlag !== undefined) return fromFlag;
  if (!canInteractiveSelect() || dryRun) return undefined;
  const picked = await interactiveSelect({
    title: "Enable optional MCP servers? (extra tools for agents — installs on demand)",
    multiple: true,
    choices: mcpChoices(),
  });
  return picked === undefined ? undefined : picked;
}

function canInteractiveSelect(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY && typeof process.stdin.setRawMode === "function");
}

type SelectChoice = { value: string; label: string; hint?: string };

// Minimal raw-mode selector: checkbox (multiple) or radio (single). Resolves the chosen
// values, or undefined if the user aborts with Esc/Ctrl-C.
function interactiveSelect(config: { title: string; choices: SelectChoice[]; multiple: boolean; preselected?: string[] }): Promise<string[] | undefined> {
  return new Promise((resolve) => {
    const { title, choices, multiple } = config;
    const checked = new Set(config.preselected ?? []);
    let cursor = !multiple && config.preselected?.[0]
      ? Math.max(0, choices.findIndex((c) => c.value === config.preselected![0]))
      : 0;
    const out = process.stdout;
    const instructions = multiple
      ? "↑/↓ move · space toggle · a all · enter confirm · esc skip"
      : "↑/↓ move · enter select · esc skip";
    let rendered = 0;

    function render(first = false) {
      if (!first) out.write(`\x1b[${rendered}A`);
      out.write("\x1b[0J");
      out.write(`${title}\n\x1b[2m${instructions}\x1b[0m\n`);
      choices.forEach((c, i) => {
        const pointer = i === cursor ? "›" : " ";
        const mark = multiple ? (checked.has(c.value) ? "◉" : "◯") : (i === cursor ? "◉" : "◯");
        const hint = c.hint ? `  \x1b[2m${c.hint}\x1b[0m` : "";
        out.write(`${pointer} ${mark} ${c.label}${hint}\n`);
      });
      rendered = choices.length + 2;
    }

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode?.(true);
    process.stdin.resume();

    function cleanup() {
      process.stdin.setRawMode?.(false);
      process.stdin.removeListener("keypress", onKey);
      process.stdin.pause();
      out.write("\n");
    }

    function onKey(_str: string, key: { name?: string; ctrl?: boolean }) {
      if (!key) return;
      if ((key.ctrl && key.name === "c") || key.name === "escape") { cleanup(); resolve(undefined); return; }
      if (key.name === "up" || key.name === "k") { cursor = (cursor - 1 + choices.length) % choices.length; render(); return; }
      if (key.name === "down" || key.name === "j") { cursor = (cursor + 1) % choices.length; render(); return; }
      if (multiple && key.name === "space") {
        const v = choices[cursor].value;
        checked.has(v) ? checked.delete(v) : checked.add(v);
        render();
        return;
      }
      if (multiple && key.name === "a") {
        if (checked.size === choices.length) checked.clear();
        else for (const c of choices) checked.add(c.value);
        render();
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        cleanup();
        resolve(multiple ? choices.filter((c) => checked.has(c.value)).map((c) => c.value) : [choices[cursor].value]);
      }
    }

    process.stdin.on("keypress", onKey);
    render(true);
  });
}

// Comma-separated provider selection (or "all"); prompt text is generated from CEREBRO_PROVIDERS.
async function askProviders(rl: ReturnType<typeof createInterface>): Promise<CerebroProvider[]> {
  const prompt = `Which model subscription(s) do you have? Comma-separated from [${CEREBRO_PROVIDERS.join(", ")}] or "all" (enter to skip): `;
  for (let attempt = 0; attempt < 3; attempt++) {
    const answer = (await rl.question(prompt)).trim();
    if (!answer) return [];
    const parsed = parseProviderArg(answer);
    if (parsed.length > 0) return parsed;
    console.log(`Please enter one or more of: ${CEREBRO_PROVIDERS.join(", ")} (comma-separated) or "all".`);
  }
  return [];
}

async function ask(
  rl: ReturnType<typeof createInterface>,
  prompt: string,
  allowed: readonly string[],
  fallback?: string,
): Promise<string | undefined> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const answer = (await rl.question(prompt)).trim().toLowerCase();
    if (!answer) return fallback;
    if (allowed.includes(answer)) return answer;
    console.log(`Please enter one of: ${allowed.join(", ")}`);
  }
  return fallback;
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

main()
  .then((code) => { process.exitCode = code; })
  .catch((err) => {
    console.error(`open-xmen: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
