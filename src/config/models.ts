export const DEFAULT_MODEL_SLOTS = {
  frontier: "openai/gpt-5.4",
  strong: "openai/gpt-5.4",
  coding: "openai/gpt-5.3-codex",
  spark: "openai/gpt-5.3-codex-spark",
  fast: "openai/gpt-5.4-mini",
  image: "openai/gpt-image-2",
} as const;

export function modelSlots() {
  return {
    frontier: process.env.CEREBRO_MODEL_FRONTIER || DEFAULT_MODEL_SLOTS.frontier,
    strong: process.env.CEREBRO_MODEL_STRONG || DEFAULT_MODEL_SLOTS.strong,
    coding: process.env.CEREBRO_MODEL_CODING || DEFAULT_MODEL_SLOTS.coding,
    spark: process.env.CEREBRO_MODEL_SPARK || DEFAULT_MODEL_SLOTS.spark,
    fast: process.env.CEREBRO_MODEL_FAST || DEFAULT_MODEL_SLOTS.fast,
    image: process.env.CEREBRO_MODEL_IMAGE || DEFAULT_MODEL_SLOTS.image,
  };
}
