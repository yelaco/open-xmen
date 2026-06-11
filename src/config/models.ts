import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const CEREBRO_MODEL_SLOT_KEYS = [
  "orchestrator",
  "auditor",
  "planner",
  "design",
  "analyst",
  "workers",
  "fast",
  "image",
] as const;

export type CerebroModelSlot = (typeof CEREBRO_MODEL_SLOT_KEYS)[number];

export const CEREBRO_PROVIDERS = ["openai", "anthropic"] as const;
export type CerebroProvider = (typeof CEREBRO_PROVIDERS)[number];

export const CEREBRO_FOCUSES = ["performance", "balance", "cost"] as const;
export type CerebroFocus = (typeof CEREBRO_FOCUSES)[number];

// Default mapping (used when no provider preset is configured): OpenAI, balance.
export const DEFAULT_MODEL_SLOTS: Record<CerebroModelSlot, string> = {
  orchestrator: "openai/gpt-5.5",
  auditor: "openai/gpt-5.5",
  planner: "openai/gpt-5.5",
  design: "openai/gpt-5.5",
  analyst: "openai/gpt-5.4",
  workers: "openai/gpt-5.5",
  fast: "openai/gpt-5.4-mini-fast",
  image: "openai/gpt-image-2",
};

// Image generation is OpenAI-only; Anthropic has no image model. The image slot always
// resolves to this (it only works if the user has OpenAI access).
const IMAGE_MODEL = "openai/gpt-image-2";

export function providerOf(model: string): CerebroProvider | undefined {
  const provider = model.split("/")[0];
  return (CEREBRO_PROVIDERS as readonly string[]).includes(provider) ? (provider as CerebroProvider) : undefined;
}

// Per focus, a cross-provider ranked preference list for each slot (best first). The installed
// preset filters each list down to the model subscriptions the user actually has and takes the
// top survivor — so with both providers you get the genuine best-of-breed per agent, and with
// one you get the best available within it. Tune these lists to change the recommendations.
export const FOCUS_SLOT_PREFERENCES: Record<CerebroFocus, Record<CerebroModelSlot, string[]>> = {
  performance: {
    orchestrator: ["anthropic/claude-opus-4-8", "openai/gpt-5.5", "anthropic/claude-sonnet-4-6"],
    auditor: ["anthropic/claude-opus-4-8", "openai/gpt-5.5", "anthropic/claude-sonnet-4-6"],
    planner: ["anthropic/claude-opus-4-8", "openai/gpt-5.5", "anthropic/claude-sonnet-4-6"],
    design: ["anthropic/claude-opus-4-8", "openai/gpt-5.5", "anthropic/claude-sonnet-4-6"],
    analyst: ["anthropic/claude-opus-4-8", "openai/gpt-5.5", "anthropic/claude-sonnet-4-6"],
    workers: ["openai/gpt-5.5", "anthropic/claude-opus-4-8", "anthropic/claude-sonnet-4-6"],
    fast: ["openai/gpt-5.4", "anthropic/claude-sonnet-4-6", "anthropic/claude-haiku-4-5"],
    image: [IMAGE_MODEL],
  },
  balance: {
    orchestrator: ["anthropic/claude-sonnet-4-6", "openai/gpt-5.5", "openai/gpt-5.4"],
    auditor: ["anthropic/claude-opus-4-8", "openai/gpt-5.5", "anthropic/claude-sonnet-4-6"],
    planner: ["anthropic/claude-opus-4-8", "openai/gpt-5.5", "anthropic/claude-sonnet-4-6"],
    design: ["anthropic/claude-opus-4-8", "openai/gpt-5.5", "anthropic/claude-sonnet-4-6"],
    analyst: ["anthropic/claude-sonnet-4-6", "openai/gpt-5.4", "openai/gpt-5.5"],
    workers: ["openai/gpt-5.5", "anthropic/claude-sonnet-4-6", "openai/gpt-5.4"],
    fast: ["openai/gpt-5.4-mini-fast", "anthropic/claude-haiku-4-5"],
    image: [IMAGE_MODEL],
  },
  cost: {
    orchestrator: ["openai/gpt-5.4", "anthropic/claude-sonnet-4-6", "anthropic/claude-haiku-4-5"],
    auditor: ["anthropic/claude-sonnet-4-6", "openai/gpt-5.4"],
    planner: ["anthropic/claude-sonnet-4-6", "openai/gpt-5.4"],
    design: ["anthropic/claude-sonnet-4-6", "openai/gpt-5.4"],
    analyst: ["openai/gpt-5.4-mini", "anthropic/claude-haiku-4-5"],
    workers: ["openai/gpt-5.4", "anthropic/claude-sonnet-4-6"],
    fast: ["openai/gpt-5.4-mini-fast", "anthropic/claude-haiku-4-5"],
    image: [IMAGE_MODEL],
  },
};

export const MODEL_SLOT_ENV: Record<CerebroModelSlot, string> = {
  orchestrator: "CEREBRO_MODEL_ORCHESTRATOR",
  auditor: "CEREBRO_MODEL_AUDITOR",
  planner: "CEREBRO_MODEL_PLANNER",
  design: "CEREBRO_MODEL_DESIGN",
  analyst: "CEREBRO_MODEL_ANALYST",
  workers: "CEREBRO_MODEL_WORKERS",
  fast: "CEREBRO_MODEL_FAST",
  image: "CEREBRO_MODEL_IMAGE",
};

const LEGACY_MODEL_SLOT_ENV: Partial<Record<CerebroModelSlot, string[]>> = {
  orchestrator: ["CEREBRO_MODEL_FRONTIER"],
  // CEREBRO_MODEL_CONDUCTOR is the pre-0.3.0 name for this slot; still honored.
  auditor: ["CEREBRO_MODEL_CONDUCTOR", "CEREBRO_MODEL_FRONTIER"],
  planner: ["CEREBRO_MODEL_FRONTIER", "CEREBRO_MODEL_STRONG"],
  design: ["CEREBRO_MODEL_FRONTIER"],
  analyst: ["CEREBRO_MODEL_STRONG"],
  workers: ["CEREBRO_MODEL_CODING"],
  fast: ["CEREBRO_MODEL_FAST"],
  image: ["CEREBRO_MODEL_IMAGE"],
};

export const AGENT_MODEL_SLOTS = {
  cerebro: "orchestrator",
  cyclops: "auditor",
  "professor-x": "planner",
  beast: "planner",
  forge: "planner",
  "emma-frost": "planner",
  "jean-grey": "design",
  legion: "analyst",
  cypher: "analyst",
  wolverine: "workers",
  storm: "workers",
  nightcrawler: "fast",
  sage: "fast",
} as const satisfies Record<string, CerebroModelSlot>;

// Cross-provider fallbacks, used only when NO provider preset is active (legacy default behavior).
export const DEFAULT_AGENT_FALLBACKS: Partial<Record<keyof typeof AGENT_MODEL_SLOTS, string[]>> = {
  cerebro: ["anthropic/claude-sonnet-4-6"],
  cyclops: ["anthropic/claude-opus-4-8"],
  "professor-x": ["anthropic/claude-opus-4-8"],
  beast: ["anthropic/claude-opus-4-8"],
  forge: ["anthropic/claude-opus-4-8"],
  "emma-frost": ["anthropic/claude-opus-4-8"],
  "jean-grey": ["anthropic/claude-opus-4-8"],
  legion: ["anthropic/claude-sonnet-4-6", "anthropic/claude-opus-4-8"],
  cypher: ["anthropic/claude-sonnet-4-6", "anthropic/claude-opus-4-8"],
  wolverine: ["anthropic/claude-sonnet-4-6", "minimax/minimax-m3"],
  storm: ["anthropic/claude-sonnet-4-6"],
  nightcrawler: ["openai/gpt-5.4-mini"],
  sage: ["openai/gpt-5.4-mini"],
};

// ─── Provider preset selection (persisted by `open-xmen install`) ─────────────

export type PresetSelection = { providers: CerebroProvider[]; focus: CerebroFocus };

function isProvider(value: unknown): value is CerebroProvider {
  return typeof value === "string" && (CEREBRO_PROVIDERS as readonly string[]).includes(value);
}

function isFocus(value: unknown): value is CerebroFocus {
  return typeof value === "string" && (CEREBRO_FOCUSES as readonly string[]).includes(value);
}

function parseProviders(value: unknown): CerebroProvider[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const out: CerebroProvider[] = [];
  for (const entry of raw) {
    const trimmed = typeof entry === "string" ? entry.trim().toLowerCase() : entry;
    if (trimmed === "both") return [...CEREBRO_PROVIDERS];
    if (isProvider(trimmed) && !out.includes(trimmed)) out.push(trimmed);
  }
  return out;
}

export function openXmenConfigDir(): string | undefined {
  if (process.env.OPENCODE_CONFIG_DIR) return path.resolve(process.env.OPENCODE_CONFIG_DIR);
  const configHome = process.env.XDG_CONFIG_HOME || (process.env.HOME ? path.join(process.env.HOME, ".config") : undefined);
  return configHome ? path.join(configHome, "opencode") : undefined;
}

export function presetFilePath(configDir = openXmenConfigDir()): string | undefined {
  return configDir ? path.join(configDir, "open-xmen.json") : undefined;
}

let cachedRawConfig: Record<string, unknown> | null | undefined;

// Reads ~/.config/opencode/open-xmen.json once (cached). Returns the parsed object or null.
function readOpenXmenConfigFile(): Record<string, unknown> | null {
  if (cachedRawConfig !== undefined) return cachedRawConfig;
  const file = presetFilePath();
  if (file && existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      cachedRawConfig = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
      cachedRawConfig = null;
    }
  } else {
    cachedRawConfig = null;
  }
  return cachedRawConfig;
}

let cachedSelection: PresetSelection | null | undefined;

// Env (OPEN_XMEN_PROVIDERS/OPEN_XMEN_FOCUS) wins over the config file; default focus is "balance".
export function loadPresetSelection(): PresetSelection | null {
  if (cachedSelection !== undefined) return cachedSelection;
  const envProviders = parseProviders(process.env.OPEN_XMEN_PROVIDERS ?? process.env.OPEN_XMEN_PROVIDER);
  if (envProviders.length > 0) {
    const envFocus = process.env.OPEN_XMEN_FOCUS;
    cachedSelection = { providers: envProviders, focus: isFocus(envFocus) ? envFocus : "balance" };
    return cachedSelection;
  }
  const raw = readOpenXmenConfigFile();
  if (raw) {
    const providers = parseProviders(raw.providers ?? raw.provider);
    if (providers.length > 0) {
      cachedSelection = { providers, focus: isFocus(raw.focus) ? raw.focus : "balance" };
      return cachedSelection;
    }
  }
  cachedSelection = null;
  return cachedSelection;
}

// Optional MCP servers the installer can register into OpenCode config. Extensible — add an
// entry here (and the plugin registers it when enabled). `requires` is informational for the
// install prompt (the runtime that must be available to launch it).
export const OPTIONAL_MCP_SERVERS: Record<string, { command: string[]; description: string; requires: string; usedBy: string }> = {
  playwright: {
    command: ["npx", "@playwright/mcp@latest"],
    description: "Browser automation & UI verification",
    requires: "npx",
    usedBy: "opx-playwright skill (Cyclops audit gate)",
  },
  semble: {
    command: ["uvx", "--from", "semble[mcp]", "semble"],
    description: "Fast code search — ~98% fewer tokens than grep+read",
    requires: "uvx (uv)",
    usedBy: "Nightcrawler",
  },
};

export type OptionalMcpServer = keyof typeof OPTIONAL_MCP_SERVERS;

function isKnownMcpServer(name: string): name is OptionalMcpServer {
  return Object.prototype.hasOwnProperty.call(OPTIONAL_MCP_SERVERS, name);
}

// Optional MCP server ids the user enabled (open-xmen.json `mcp_servers`, or OPEN_XMEN_MCP_SERVERS
// env as a comma list / "all"). Filtered to known servers and deduped.
export function enabledMcpServers(): OptionalMcpServer[] {
  const all = Object.keys(OPTIONAL_MCP_SERVERS) as OptionalMcpServer[];
  const env = process.env.OPEN_XMEN_MCP_SERVERS;
  let raw: unknown[];
  if (env !== undefined) {
    if (env.trim().toLowerCase() === "all") return all;
    raw = env.split(",");
  } else {
    const file = readOpenXmenConfigFile();
    raw = Array.isArray(file?.mcp_servers) ? (file!.mcp_servers as unknown[]) : [];
  }
  const out: OptionalMcpServer[] = [];
  for (const entry of raw) {
    const name = typeof entry === "string" ? entry.trim().toLowerCase() : "";
    if (name === "all") return all;
    if (isKnownMcpServer(name) && !out.includes(name)) out.push(name);
  }
  return out;
}

/** Test/CLI hook to reset the cached config after writing open-xmen.json. */
export function resetPresetCache() {
  cachedSelection = undefined;
  cachedRawConfig = undefined;
}

// Ranked preference for a slot, filtered to the user's owned providers (best survivor first).
function ownedRankedForSlot(selection: PresetSelection, slot: CerebroModelSlot): string[] {
  return FOCUS_SLOT_PREFERENCES[selection.focus][slot].filter((model) => {
    const provider = providerOf(model);
    return provider !== undefined && selection.providers.includes(provider);
  });
}

function presetModelForSlot(slot: CerebroModelSlot): string {
  const selection = loadPresetSelection();
  if (!selection) return DEFAULT_MODEL_SLOTS[slot];
  return ownedRankedForSlot(selection, slot)[0] ?? DEFAULT_MODEL_SLOTS[slot];
}

export function modelSlots(): Record<CerebroModelSlot, string> {
  return Object.fromEntries(CEREBRO_MODEL_SLOT_KEYS.map((slot) => [slot, modelForSlot(slot)])) as Record<CerebroModelSlot, string>;
}

export function defaultModelForAgent(agent: keyof typeof AGENT_MODEL_SLOTS) {
  return modelForSlot(AGENT_MODEL_SLOTS[agent]);
}

export function defaultModelChainForAgent(agent: keyof typeof AGENT_MODEL_SLOTS) {
  const slot = AGENT_MODEL_SLOTS[agent];
  const primary = modelForSlot(slot); // env-aware
  const selection = loadPresetSelection();
  if (selection) {
    // Fallbacks come from the same owned-provider ranked list, minus whatever is already primary.
    const fallbacks = ownedRankedForSlot(selection, slot).filter((model) => model !== primary);
    return [primary, ...fallbacks.slice(0, 2)];
  }
  return [primary, ...(DEFAULT_AGENT_FALLBACKS[agent] ?? [])];
}

export function isCerebroModelSlot(value: string): value is CerebroModelSlot {
  return (CEREBRO_MODEL_SLOT_KEYS as readonly string[]).includes(value);
}

// A per-task effort override remaps which slot's model a dispatch uses, without changing the
// agent: "low" runs it on the cheap/fast tier, "high" on the top-reasoning tier (the planner
// slot resolves to the strongest model in every preset). Unset keeps the route's own slot.
export function effortModelSlot(effort: "low" | "high" | undefined, routeSlot: CerebroModelSlot): CerebroModelSlot {
  if (effort === "low") return "fast";
  if (effort === "high") return "planner";
  return routeSlot;
}

function modelForSlot(slot: CerebroModelSlot) {
  const primary = process.env[MODEL_SLOT_ENV[slot]];
  if (primary) return primary;
  for (const legacyEnv of LEGACY_MODEL_SLOT_ENV[slot] ?? []) {
    const legacy = process.env[legacyEnv];
    if (legacy) return legacy;
  }
  return presetModelForSlot(slot);
}
