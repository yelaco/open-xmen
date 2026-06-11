import { afterEach, describe, expect, test } from "bun:test";
import { defaultModelChainForAgent, modelSlots, resetPresetCache } from "../src/config/models.js";

function withPreset(providers: string | undefined, focus: string | undefined, fn: () => void) {
  const prevProviders = process.env.OPEN_XMEN_PROVIDERS;
  const prevFocus = process.env.OPEN_XMEN_FOCUS;
  if (providers === undefined) delete process.env.OPEN_XMEN_PROVIDERS;
  else process.env.OPEN_XMEN_PROVIDERS = providers;
  if (focus === undefined) delete process.env.OPEN_XMEN_FOCUS;
  else process.env.OPEN_XMEN_FOCUS = focus;
  resetPresetCache();
  try {
    fn();
  } finally {
    if (prevProviders === undefined) delete process.env.OPEN_XMEN_PROVIDERS;
    else process.env.OPEN_XMEN_PROVIDERS = prevProviders;
    if (prevFocus === undefined) delete process.env.OPEN_XMEN_FOCUS;
    else process.env.OPEN_XMEN_FOCUS = prevFocus;
    resetPresetCache();
  }
}

afterEach(() => resetPresetCache());

describe("model preset resolution", () => {
  test("no selection falls back to OpenAI balance defaults", () => {
    withPreset(undefined, undefined, () => {
      const slots = modelSlots();
      expect(slots.auditor).toBe("openai/gpt-5.5");
      expect(slots.fast).toBe("openai/gpt-5.4-mini-fast");
      expect(slots.image).toBe("openai/gpt-image-2");
    });
  });

  test("anthropic + performance uses Claude top tier", () => {
    withPreset("anthropic", "performance", () => {
      const slots = modelSlots();
      expect(slots.auditor).toBe("anthropic/claude-opus-4-8");
      expect(slots.planner).toBe("anthropic/claude-opus-4-8");
      expect(slots.workers).toBe("anthropic/claude-opus-4-8");
      expect(slots.fast).toBe("anthropic/claude-sonnet-4-6");
      // image is OpenAI-only regardless of provider
      expect(slots.image).toBe("openai/gpt-image-2");
    });
  });

  test("anthropic-only never selects an OpenAI model (except image)", () => {
    withPreset("anthropic", "balance", () => {
      const slots = modelSlots();
      for (const [slot, model] of Object.entries(slots)) {
        if (slot === "image") continue;
        expect(model.startsWith("anthropic/")).toBe(true);
      }
    });
  });

  test("both providers pick best-of-breed per slot (balance)", () => {
    withPreset("openai,anthropic", "balance", () => {
      const slots = modelSlots();
      expect(slots.auditor).toBe("anthropic/claude-opus-4-8"); // judgment → Claude Opus
      expect(slots.workers).toBe("openai/gpt-5.5"); // coding → GPT-5.5
      expect(slots.orchestrator).toBe("anthropic/claude-sonnet-4-6"); // high-volume balanced
    });
  });

  test("'both'/'all' shorthand expands to every provider", () => {
    withPreset("both", "performance", () => {
      expect(modelSlots().auditor).toBe("anthropic/claude-opus-4-8");
    });
  });

  test("agent fallback chain stays within owned providers under a preset", () => {
    withPreset("anthropic", "balance", () => {
      const chain = defaultModelChainForAgent("wolverine");
      expect(chain[0]).toBe("anthropic/claude-sonnet-4-6");
      expect(chain.every((m) => m.startsWith("anthropic/"))).toBe(true);
    });
  });

  test("CEREBRO_MODEL_* env overrides the preset for a slot", () => {
    const prev = process.env.CEREBRO_MODEL_WORKERS;
    process.env.CEREBRO_MODEL_WORKERS = "openai/custom-coder";
    withPreset("anthropic", "performance", () => {
      expect(modelSlots().workers).toBe("openai/custom-coder");
    });
    if (prev === undefined) delete process.env.CEREBRO_MODEL_WORKERS;
    else process.env.CEREBRO_MODEL_WORKERS = prev;
    resetPresetCache();
  });
});
