import { CEREBRO_PROVIDERS, OPTIONAL_MCP_SERVERS } from "../config/models.js";
import type { CerebroProvider } from "../config/models.js";

// Accepts a comma-separated list of provider ids, or the shorthand "all"/"both"
// (both = all, kept for intuition). Returns a deduped provider set. Generic over
// CEREBRO_PROVIDERS so adding a future provider needs no change here.
export function parseProviderArg(value: string | undefined): CerebroProvider[] {
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

// Parses --mcp: comma-separated server ids, "all", or "none" (empty selection).
// Returns the list, or undefined if any token is unknown.
export function parseMcpArg(value: string | undefined): string[] | undefined {
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
