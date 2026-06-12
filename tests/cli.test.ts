import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseMcpArg, parseProviderArg } from "../src/cli/args.js";
import { writeOpenXmenConfig } from "../src/cli/config.js";
import { CEREBRO_PROVIDERS, OPTIONAL_MCP_SERVERS } from "../src/config/models.js";

describe("parseProviderArg", () => {
  test("single and multiple providers", () => {
    expect(parseProviderArg("openai")).toEqual(["openai"]);
    expect(parseProviderArg("openai,anthropic")).toEqual(["openai", "anthropic"]);
    expect(parseProviderArg(" openai , anthropic ")).toEqual(["openai", "anthropic"]);
  });

  test("'all' and 'both' expand to every provider", () => {
    expect(parseProviderArg("all").sort()).toEqual([...CEREBRO_PROVIDERS].sort());
    expect(parseProviderArg("both").sort()).toEqual([...CEREBRO_PROVIDERS].sort());
  });

  test("dedupes and drops unknown tokens", () => {
    expect(parseProviderArg("anthropic,openai,anthropic")).toEqual(["anthropic", "openai"]);
    expect(parseProviderArg("openai,nope")).toEqual(["openai"]);
    expect(parseProviderArg("nope")).toEqual([]);
  });

  test("empty / undefined yields no providers", () => {
    expect(parseProviderArg(undefined)).toEqual([]);
    expect(parseProviderArg("")).toEqual([]);
  });
});

describe("parseMcpArg", () => {
  test("undefined stays undefined (flag absent); none/empty is an explicit empty set", () => {
    expect(parseMcpArg(undefined)).toBeUndefined();
    expect(parseMcpArg("none")).toEqual([]);
    expect(parseMcpArg("")).toEqual([]);
  });

  test("all expands; named servers parse and dedupe", () => {
    expect((parseMcpArg("all") ?? []).sort()).toEqual(Object.keys(OPTIONAL_MCP_SERVERS).sort());
    expect(parseMcpArg("semble")).toEqual(["semble"]);
    expect(parseMcpArg("playwright,semble")).toEqual(["playwright", "semble"]);
    expect(parseMcpArg("semble,semble")).toEqual(["semble"]);
  });

  test("any unknown token rejects the whole list (undefined)", () => {
    expect(parseMcpArg("semble,bogus")).toBeUndefined();
    expect(parseMcpArg("bogus")).toBeUndefined();
  });
});

describe("writeOpenXmenConfig", () => {
  let dir: string;
  const planned: string[] = [];
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    planned.length = 0;
  });

  function read(d: string) {
    return JSON.parse(readFileSync(path.join(d, "open-xmen.json"), "utf8"));
  }

  test("writes the patch fields", () => {
    dir = mkdtempSync(path.join(tmpdir(), "opx-cfg-"));
    writeOpenXmenConfig(dir, { providers: ["anthropic"], focus: "performance" }, { dryRun: false, planned });
    expect(read(dir)).toEqual({ providers: ["anthropic"], focus: "performance" });
  });

  test("merges into an existing file without clobbering other keys", () => {
    dir = mkdtempSync(path.join(tmpdir(), "opx-cfg-"));
    writeOpenXmenConfig(dir, { providers: ["openai"], focus: "balance" }, { dryRun: false, planned });
    // A later, independent run that only sets mcp_servers must preserve providers/focus.
    writeOpenXmenConfig(dir, { mcp_servers: ["semble"] }, { dryRun: false, planned });
    expect(read(dir)).toEqual({ providers: ["openai"], focus: "balance", mcp_servers: ["semble"] });
  });

  test("writes and merges the editable per-agent table", () => {
    dir = mkdtempSync(path.join(tmpdir(), "opx-cfg-"));
    writeOpenXmenConfig(dir, { providers: ["anthropic"], focus: "performance", agents: { wolverine: "anthropic/claude-opus-4-8" } }, { dryRun: false, planned });
    expect(read(dir).agents).toEqual({ wolverine: "anthropic/claude-opus-4-8" });
    // A later run that only sets mcp_servers must preserve the agents table.
    writeOpenXmenConfig(dir, { mcp_servers: ["semble"] }, { dryRun: false, planned });
    expect(read(dir).agents).toEqual({ wolverine: "anthropic/claude-opus-4-8" });
  });

  test("dry run plans without writing", () => {
    dir = mkdtempSync(path.join(tmpdir(), "opx-cfg-"));
    writeOpenXmenConfig(dir, { providers: ["openai"], focus: "cost" }, { dryRun: true, planned });
    expect(planned.length).toBeGreaterThan(0);
    expect(() => read(dir)).toThrow();
  });
});
