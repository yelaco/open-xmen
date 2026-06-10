import { describe, expect, test } from "bun:test";
import {
  parseAuditVerdict,
  parseDesignSpecPath,
  parseGotchas,
  summarizeTaskResult,
  taskStatusFromTaskResult,
} from "../src/workflow/results.js";
import { completedTaskResult } from "./helpers.js";

describe("summarizeTaskResult", () => {
  test("parses status, summary, and files", () => {
    const summary = summarizeTaskResult(completedTaskResult("t1"));
    expect(summary.status).toBe("done");
    expect(summary.summary).toBe("did the thing");
    expect(summary.files).toContain("src/example.ts");
  });

  test("blocked and failed statuses", () => {
    expect(taskStatusFromTaskResult("STATUS: blocked")).toBe("blocked");
    expect(taskStatusFromTaskResult("STATUS: failed")).toBe("failed");
    expect(taskStatusFromTaskResult("no status here")).toBeUndefined();
  });
});

describe("parseGotchas", () => {
  test("extracts bullets from a GOTCHAS section", () => {
    const text = completedTaskResult("t1", "GOTCHAS:\n- the config loader caches aggressively\n- tests need TZ=UTC");
    expect(parseGotchas(text)).toEqual([
      "the config loader caches aggressively",
      "tests need TZ=UTC",
    ]);
  });

  test("stops at the next section header", () => {
    const text = "GOTCHAS:\n- one\nNOTES:\n- not a gotcha";
    expect(parseGotchas(text)).toEqual(["one"]);
  });

  test("tolerates a missing section and NONE", () => {
    expect(parseGotchas(completedTaskResult("t1"))).toEqual([]);
    expect(parseGotchas("GOTCHAS:\n- NONE")).toEqual([]);
  });
});

describe("parseAuditVerdict", () => {
  test("AUDIT_PASSED", () => {
    const { verdict, findings } = parseAuditVerdict("AUDIT_PASSED\nRUN_ID: r1\nNOTES:\n- NONE");
    expect(verdict).toBe("AUDIT_PASSED");
    expect(findings).toEqual([]);
  });

  test("AUDIT_FAILED with fenced JSON findings", () => {
    const text = [
      "AUDIT_FAILED",
      "RUN_ID: r1",
      "FINDINGS:",
      "```json",
      JSON.stringify([
        { severity: "critical", task_id: "task-1", criterion: "tests pass", evidence: "exit 1", recommendation: "fix the test", retriable: true },
        { severity: "minor", task_id: null, evidence: "naming", retriable: false },
      ]),
      "```",
    ].join("\n");
    const { verdict, findings } = parseAuditVerdict(text);
    expect(verdict).toBe("AUDIT_FAILED");
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({ severity: "critical", task_id: "task-1", retriable: true });
    expect(findings[1]).toMatchObject({ severity: "minor", task_id: null, retriable: false });
  });

  test("AUDIT_FAILED falls back to FINDINGS bullets when JSON is malformed", () => {
    const text = "AUDIT_FAILED\nFINDINGS:\n- broken build\n- missing test\n```json\nnot json\n```";
    const { verdict, findings } = parseAuditVerdict(text);
    expect(verdict).toBe("AUDIT_FAILED");
    expect(findings).toHaveLength(2);
    expect(findings[0].severity).toBe("major");
    expect(findings[0].retriable).toBe(false);
  });

  test("no marker yields undefined verdict", () => {
    expect(parseAuditVerdict("nothing to see").verdict).toBeUndefined();
  });
});

describe("parseDesignSpecPath", () => {
  test("finds the .cerebro spec path after the marker", () => {
    const text = "DESIGN_SPEC_READY\nSpec written to .cerebro/notepads/design/login-form.md";
    expect(parseDesignSpecPath(text)).toBe(".cerebro/notepads/design/login-form.md");
  });

  test("falls back to any markdown path", () => {
    expect(parseDesignSpecPath("DESIGN_SPEC_READY at docs/spec.md")).toBe("docs/spec.md");
  });

  test("returns undefined without the marker", () => {
    expect(parseDesignSpecPath("no spec here .cerebro/notepads/design/x.md")).toBeUndefined();
  });
});
