import { runtimeAssets } from "./generated-assets.js";

export { runtimeAssets } from "./generated-assets.js";
export {
  AGENT_MODEL_SLOTS,
  CEREBRO_AGENTS,
  CEREBRO_COMMANDS,
  CEREBRO_MODEL_SLOT_KEYS,
  CEREBRO_RISKS,
  CEREBRO_TASK_STATUSES,
  DEFAULT_AGENT_FALLBACKS,
  DEFAULT_MODEL_SLOTS,
  MODEL_SLOT_ENV,
  defaultModelChainForAgent,
  defaultModelForAgent,
  isCerebroModelSlot,
  modelSlots,
} from "./definitions.js";
export type { CerebroModelSlot } from "./definitions.js";

export type RuntimeAsset = {
  path: string;
  content: string;
};

export function runtimeAssetsByPrefix(prefix: string) {
  return runtimeAssets.filter((asset) => asset.path.startsWith(prefix));
}
