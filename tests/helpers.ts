import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { RuntimeContext, TaskRecord } from "../src/workflow/types.js";

export function makeTask(overrides: Partial<TaskRecord> & { id: string }): TaskRecord {
  return {
    subject: overrides.id,
    description: `do ${overrides.id}`,
    owner: "wolverine",
    status: "pending",
    depends_on: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    notes: [],
    verification: [],
    ...overrides,
  };
}

export function makeTestContext(): RuntimeContext {
  const dir = mkdtempSync(path.join(tmpdir(), "open-xmen-test-"));
  return { worktree: dir, directory: dir };
}
