import { runtimeAssets } from "./generated-assets.js";

export { runtimeAssets } from "./generated-assets.js";
export { CEREBRO_AGENTS, CEREBRO_COMMANDS, CEREBRO_RISKS, CEREBRO_TASK_STATUSES, DEFAULT_MODEL_SLOTS } from "./definitions.js";

export type RuntimeAsset = {
  path: string;
  content: string;
};

export function runtimeAssetMap() {
  return new Map(runtimeAssets.map((asset) => [asset.path, asset.content]));
}

export function runtimeAssetPaths() {
  return runtimeAssets.map((asset) => asset.path);
}

export function runtimeAssetsByPrefix(prefix: string) {
  return runtimeAssets.filter((asset) => asset.path.startsWith(prefix));
}
