export const CEREBRO_MODEL_SLOT_KEYS = [
  "orchestrator",
  "conductor",
  "planner",
  "design",
  "analyst",
  "workers",
  "fast",
  "image",
] as const;

export type CerebroModelSlot = (typeof CEREBRO_MODEL_SLOT_KEYS)[number];

export const DEFAULT_MODEL_SLOTS: Record<CerebroModelSlot, string> = {
  orchestrator: "openai/gpt-5.5",
  conductor: "openai/gpt-5.5",
  planner: "openai/gpt-5.5",
  design: "openai/gpt-5.5",
  analyst: "openai/gpt-5.4",
  workers: "openai/gpt-5.5",
  fast: "openai/gpt-5.4-mini-fast",
  image: "openai/gpt-image-2",
};

export const MODEL_SLOT_ENV: Record<CerebroModelSlot, string> = {
  orchestrator: "CEREBRO_MODEL_ORCHESTRATOR",
  conductor: "CEREBRO_MODEL_CONDUCTOR",
  planner: "CEREBRO_MODEL_PLANNER",
  design: "CEREBRO_MODEL_DESIGN",
  analyst: "CEREBRO_MODEL_ANALYST",
  workers: "CEREBRO_MODEL_WORKERS",
  fast: "CEREBRO_MODEL_FAST",
  image: "CEREBRO_MODEL_IMAGE",
};

const LEGACY_MODEL_SLOT_ENV: Partial<Record<CerebroModelSlot, string[]>> = {
  orchestrator: ["CEREBRO_MODEL_FRONTIER"],
  conductor: ["CEREBRO_MODEL_FRONTIER"],
  planner: ["CEREBRO_MODEL_FRONTIER", "CEREBRO_MODEL_STRONG"],
  design: ["CEREBRO_MODEL_FRONTIER"],
  analyst: ["CEREBRO_MODEL_STRONG"],
  workers: ["CEREBRO_MODEL_CODING"],
  fast: ["CEREBRO_MODEL_FAST"],
  image: ["CEREBRO_MODEL_IMAGE"],
};

export const AGENT_MODEL_SLOTS = {
  cerebro: "orchestrator",
  cyclops: "conductor",
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

export const DEFAULT_AGENT_FALLBACKS: Partial<Record<keyof typeof AGENT_MODEL_SLOTS, string[]>> = {
  cerebro: ["anthropic/claude-sonnet-4-6"],
  cyclops: ["anthropic/claude-sonnet-4-6"],
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

export function modelSlots(): Record<CerebroModelSlot, string> {
  return Object.fromEntries(CEREBRO_MODEL_SLOT_KEYS.map((slot) => [slot, modelForSlot(slot)])) as Record<CerebroModelSlot, string>;
}

export function defaultModelForAgent(agent: keyof typeof AGENT_MODEL_SLOTS) {
  return DEFAULT_MODEL_SLOTS[AGENT_MODEL_SLOTS[agent]];
}

export function defaultModelChainForAgent(agent: keyof typeof AGENT_MODEL_SLOTS) {
  return [defaultModelForAgent(agent), ...(DEFAULT_AGENT_FALLBACKS[agent] ?? [])];
}

export function isCerebroModelSlot(value: string): value is CerebroModelSlot {
  return (CEREBRO_MODEL_SLOT_KEYS as readonly string[]).includes(value);
}

function modelForSlot(slot: CerebroModelSlot) {
  const primary = process.env[MODEL_SLOT_ENV[slot]];
  if (primary) return primary;
  for (const legacyEnv of LEGACY_MODEL_SLOT_ENV[slot] ?? []) {
    const legacy = process.env[legacyEnv];
    if (legacy) return legacy;
  }
  return DEFAULT_MODEL_SLOTS[slot];
}
