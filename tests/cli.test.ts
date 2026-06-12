import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseMcpArg, parseProviderArg } from "../src/cli/args.js";
import { removeOpenXmenConfig, removeOpencodeConfig, updateOpencodeConfig, writeOpenXmenConfig } from "../src/cli/config.js";
import { installSkills, uninstallSkills } from "../src/cli/runtime.js";
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

  test("backs up an existing file to .bak before overwriting", () => {
    dir = mkdtempSync(path.join(tmpdir(), "opx-cfg-"));
    writeOpenXmenConfig(dir, { providers: ["openai"], focus: "balance" }, { dryRun: false, planned });
    const bak = path.join(dir, "open-xmen.json.bak");
    // First write creates no backup (nothing existed yet).
    expect(existsSync(bak)).toBe(false);
    // A second write backs up the prior file verbatim, then writes the merged result.
    writeOpenXmenConfig(dir, { mcp_servers: ["semble"] }, { dryRun: false, planned });
    expect(JSON.parse(readFileSync(bak, "utf8"))).toEqual({ providers: ["openai"], focus: "balance" });
    expect(read(dir)).toEqual({ providers: ["openai"], focus: "balance", mcp_servers: ["semble"] });
  });

  test("dry run plans without writing", () => {
    dir = mkdtempSync(path.join(tmpdir(), "opx-cfg-"));
    writeOpenXmenConfig(dir, { providers: ["openai"], focus: "cost" }, { dryRun: true, planned });
    expect(planned.length).toBeGreaterThan(0);
    expect(() => read(dir)).toThrow();
  });
});

describe("uninstall reverse operations", () => {
  let dir: string;
  const planned: string[] = [];
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    planned.length = 0;
  });

  function readJsonc(file: string) {
    return JSON.parse(readFileSync(file, "utf8"));
  }

  test("removeOpencodeConfig strips the plugin entry and cerebro default_agent, preserving other keys", () => {
    dir = mkdtempSync(path.join(tmpdir(), "opx-uninst-"));
    const opencode = path.join(dir, "opencode.jsonc");
    // Install a plugin entry + default_agent the way a project install would.
    updateOpencodeConfig(dir, { dryRun: false, planned, defaultAgent: "cerebro" });
    // A user key that uninstall must not touch.
    const withTheme = { ...readJsonc(opencode), theme: "tokyonight" };
    writeFileSync(opencode, `${JSON.stringify(withTheme, null, 2)}\n`);

    const changed = removeOpencodeConfig(dir, { dryRun: false, planned });
    expect(changed).toBe(true);
    const after = readJsonc(opencode);
    expect(after.plugin).toBeUndefined();
    expect(after.default_agent).toBeUndefined();
    expect(after.theme).toBe("tokyonight");
    expect(after.$schema).toBe("https://opencode.ai/config.json");
  });

  test("removeOpencodeConfig is a no-op when there is nothing to remove", () => {
    dir = mkdtempSync(path.join(tmpdir(), "opx-uninst-"));
    // No opencode.jsonc at all.
    expect(removeOpencodeConfig(dir, { dryRun: false, planned })).toBe(false);
  });

  test("install then uninstall skills round-trips", () => {
    dir = mkdtempSync(path.join(tmpdir(), "opx-uninst-"));
    const installed = installSkills(dir, { dryRun: false, planned });
    expect(installed).toBeGreaterThan(0);
    expect(existsSync(path.join(dir, "skills"))).toBe(true);
    const removed = uninstallSkills(dir, { dryRun: false, planned });
    expect(removed).toBe(installed);
    // A second uninstall removes nothing.
    expect(uninstallSkills(dir, { dryRun: false, planned })).toBe(0);
  });

  test("removeOpenXmenConfig deletes the config and its .bak only with purge", () => {
    dir = mkdtempSync(path.join(tmpdir(), "opx-uninst-"));
    const cfg = path.join(dir, "open-xmen.json");
    writeOpenXmenConfig(dir, { providers: ["anthropic"], focus: "balance" }, { dryRun: false, planned });
    // A second write creates the .bak (per the backup behavior).
    writeOpenXmenConfig(dir, { mcp_servers: ["semble"] }, { dryRun: false, planned });
    expect(existsSync(cfg)).toBe(true);
    expect(existsSync(`${cfg}.bak`)).toBe(true);

    expect(removeOpenXmenConfig(dir, { dryRun: false, planned })).toBe(true);
    expect(existsSync(cfg)).toBe(false);
    expect(existsSync(`${cfg}.bak`)).toBe(false);
    // Nothing left to remove.
    expect(removeOpenXmenConfig(dir, { dryRun: false, planned })).toBe(false);
  });
});
