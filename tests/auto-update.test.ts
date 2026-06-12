import { describe, expect, test } from "bun:test";
import { compareSemver, shouldRunAutoUpdateForEvent } from "../src/auto-update.js";

const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0);

describe("compareSemver", () => {
  test("orders by major.minor.patch", () => {
    expect(sign(compareSemver("1.2.0", "1.1.9"))).toBe(1);
    expect(sign(compareSemver("0.4.1", "0.4.1"))).toBe(0);
    expect(sign(compareSemver("1.0.0", "2.0.0"))).toBe(-1);
  });

  test("a release outranks a prerelease of the same core", () => {
    expect(sign(compareSemver("1.0.0", "1.0.0-rc1"))).toBe(1);
    expect(sign(compareSemver("1.0.0-rc1", "1.0.0"))).toBe(-1);
  });

  test("orders prereleases per semver (numeric < alphanumeric, by identifier)", () => {
    expect(sign(compareSemver("1.0.0-alpha.2", "1.0.0-alpha.1"))).toBe(1);
    expect(sign(compareSemver("1.0.0-alpha.1", "1.0.0-alpha.beta"))).toBe(-1); // numeric < alphanumeric
    expect(sign(compareSemver("1.0.0-beta", "1.0.0-alpha"))).toBe(1);
    expect(sign(compareSemver("1.0.0-alpha.1", "1.0.0-alpha"))).toBe(1); // longer set ranks higher
  });

  test("ignores build metadata", () => {
    expect(sign(compareSemver("1.0.0+build.5", "1.0.0+build.9"))).toBe(0);
  });
});

describe("shouldRunAutoUpdateForEvent", () => {
  test("only runs on a top-level session.created event", () => {
    expect(shouldRunAutoUpdateForEvent({ type: "session.created" })).toBe(true);
    expect(shouldRunAutoUpdateForEvent({ type: "message.updated" })).toBe(false);
    expect(shouldRunAutoUpdateForEvent({ type: "session.created", properties: { info: { parentID: "p1" } } })).toBe(false);
  });
});
