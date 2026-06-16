import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { installSkills, readSkillsVersionStamp, refreshSkillsIfStale } from "../src/cli/runtime.js";
import { runtimeAssetsByPrefix } from "../src/runtime/index.js";

const firstSkillAsset = runtimeAssetsByPrefix("skills/")[0].path;

describe("skills self-heal (refreshSkillsIfStale)", () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  test("does not bootstrap skills when none are installed (respects never-installed / uninstalled)", () => {
    dir = mkdtempSync(path.join(tmpdir(), "opx-skills-"));
    const result = refreshSkillsIfStale(dir, "9.9.9");
    expect(result.refreshed).toBe(false);
    expect(result.reason).toBe("no-existing-skills");
    expect(existsSync(path.join(dir, firstSkillAsset))).toBe(false);
  });

  test("refreshes and re-stamps when installed skills are stale", () => {
    dir = mkdtempSync(path.join(tmpdir(), "opx-skills-"));
    installSkills(dir, { dryRun: false, planned: [], version: "0.0.1" });
    expect(readSkillsVersionStamp(dir)).toBe("0.0.1");

    const result = refreshSkillsIfStale(dir, "0.0.2");
    expect(result.refreshed).toBe(true);
    expect(result.count).toBeGreaterThan(0);
    expect(readSkillsVersionStamp(dir)).toBe("0.0.2");
  });

  test("is a no-op when the stamp already matches the current version", () => {
    dir = mkdtempSync(path.join(tmpdir(), "opx-skills-"));
    installSkills(dir, { dryRun: false, planned: [], version: "1.2.3" });
    const result = refreshSkillsIfStale(dir, "1.2.3");
    expect(result.refreshed).toBe(false);
    expect(result.reason).toBe("current");
  });

  test("refreshes when skills exist but were never stamped (pre-stamp installs)", () => {
    dir = mkdtempSync(path.join(tmpdir(), "opx-skills-"));
    installSkills(dir, { dryRun: false, planned: [] }); // no version → no stamp
    expect(readSkillsVersionStamp(dir)).toBeUndefined();

    const result = refreshSkillsIfStale(dir, "1.0.0");
    expect(result.refreshed).toBe(true);
    expect(readSkillsVersionStamp(dir)).toBe("1.0.0");
  });
});
