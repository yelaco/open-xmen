import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runtimeAssetMap, runtimeAssetsByPrefix } from "../runtime/index.js";

export type ManagedWriteOptions = {
  dryRun: boolean;
  overwrite: boolean;
  planned: string[];
};

const OPEN_XMEN_AGENT_BLOCK_START = "<!-- OPEN-XMEN:START -->";
const OPEN_XMEN_AGENT_BLOCK_END = "<!-- OPEN-XMEN:END -->";
const RUNTIME_ASSET_MAP = runtimeAssetMap();

export function installManagedRuntime(target: string, opts: ManagedWriteOptions) {
  for (const asset of runtimeAssetsByPrefix(".opencode/").concat(runtimeAssetsByPrefix(".cerebro/"))) {
    writeManagedFile(path.join(target, asset.path), asset.content, opts);
  }

  for (const dir of ["plans", "notepads", "team-runs", "pending-todos"]) {
    const targetDir = path.join(target, ".cerebro", dir);
    const gitkeep = path.join(targetDir, ".gitkeep");
    if (opts.dryRun) {
      opts.planned.push(`ensure directory ${targetDir}`);
      if (!existsSync(gitkeep)) opts.planned.push(`create ${gitkeep}`);
      continue;
    }
    mkdirSync(targetDir, { recursive: true });
    if (!existsSync(gitkeep)) writeFileSync(gitkeep, "", "utf8");
  }
}

export function installManagedAgentInstructions(target: string, opts: ManagedWriteOptions) {
  const source = requiredRuntimeAsset("AGENTS.md").trim();
  const block = `${OPEN_XMEN_AGENT_BLOCK_START}\n${source}\n${OPEN_XMEN_AGENT_BLOCK_END}`;
  const destination = path.join(target, "AGENTS.md");
  if (!existsSync(destination)) {
    if (opts.dryRun) opts.planned.push(`create ${destination}`);
    else writeFileSync(destination, `${block}\n`, "utf8");
    return;
  }

  const current = readFileSync(destination, "utf8");
  const start = current.indexOf(OPEN_XMEN_AGENT_BLOCK_START);
  const end = current.indexOf(OPEN_XMEN_AGENT_BLOCK_END);
  if (start !== -1 && end !== -1 && end > start) {
    if (!opts.overwrite) {
      opts.planned.push(`skip existing Open X-Men AGENTS.md block ${destination}`);
      return;
    }
    const next = `${current.slice(0, start)}${block}${current.slice(end + OPEN_XMEN_AGENT_BLOCK_END.length)}`;
    if (next === current || `${next}\n` === current) {
      opts.planned.push(`unchanged ${destination}`);
      return;
    }
    if (opts.dryRun) opts.planned.push(`refresh Open X-Men AGENTS.md block ${destination}`);
    else writeFileSync(destination, next.endsWith("\n") ? next : `${next}\n`, "utf8");
    return;
  }

  if (opts.dryRun) opts.planned.push(`append Open X-Men AGENTS.md block ${destination}`);
  else writeFileSync(destination, `${current.trimEnd()}\n\n${block}\n`, "utf8");
}

function requiredRuntimeAsset(assetPath: string) {
  const content = RUNTIME_ASSET_MAP.get(assetPath);
  if (typeof content !== "string") throw new Error(`Missing generated runtime asset: ${assetPath}`);
  return content;
}

function writeManagedFile(destination: string, content: string, opts: ManagedWriteOptions) {
  if (existsSync(destination) && !opts.overwrite) {
    opts.planned.push(`skip existing ${destination}`);
    return;
  }
  if (opts.dryRun) {
    opts.planned.push(`${existsSync(destination) ? "overwrite" : "write"} ${destination}`);
    return;
  }
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, content, "utf8");
}
