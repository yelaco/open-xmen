import type { ChildSessionClient, TaskStatus } from "./types.js";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseModelID(model: string) {
  const [providerID, ...rest] = model.split("/");
  const modelID = rest.join("/");
  if (!providerID || !modelID) throw new Error(`Invalid model id: ${model}`);
  return { providerID, modelID };
}

export function hasChildSessionClient(client: unknown): client is ChildSessionClient {
  if (!isRecord(client)) return false;
  const session = client.session;
  if (!isRecord(session)) return false;
  return typeof session.create === "function" && typeof session.promptAsync === "function";
}

export function childSessionID(result: unknown) {
  if (!isRecord(result)) return undefined;
  const data = result.data;
  if (isRecord(data) && typeof data.id === "string") return data.id;
  return typeof result.id === "string" ? result.id : undefined;
}

export function resultData(value: unknown) {
  if (isRecord(value) && "data" in value) return value.data;
  return value;
}

export function assistantTextFromMessages(result: unknown) {
  const data = resultData(result);
  const messages = Array.isArray(data) ? data : [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const entry = messages[i];
    if (!isRecord(entry)) continue;
    const info = entry.info;
    if (!isRecord(info) || info.role !== "assistant") continue;
    const parts = Array.isArray(entry.parts) ? entry.parts : [];
    const text = parts
      .filter((part) => isRecord(part) && part.type === "text" && typeof part.text === "string")
      .map((part) => String((part as { text: string }).text))
      .join("\n")
      .trim();
    if (text) return text;
    if (isRecord(info.structured) && typeof info.structured.text === "string") return info.structured.text;
  }
  return "";
}

export const CHILD_SESSION_TERMINAL_MARKERS = [
  "AUDIT_PASSED",
  "AUDIT_FAILED",
  "TASK_RESULT:",
  "DESIGN_SPEC_READY",
  "CUSTOMER_VISION_READY",
  "CUSTOMER_VERDICT:",
  "REQUIREMENTS_READY",
  "PLAN_DRAFT",
  "CLARIFY",
  "GAPS FOUND:",
  "VERDICT:",
] as const;

export function terminalAssistantMarker(text: string) {
  return CHILD_SESSION_TERMINAL_MARKERS.find((marker) => text.includes(marker));
}

export function hasTerminalAssistantMarker(text: string) {
  return Boolean(terminalAssistantMarker(text));
}

export function taskStatusFromTaskResult(text: string): TaskStatus | undefined {
  const match = text.match(/STATUS:\s*(completed|blocked|failed)/i);
  if (!match) return undefined;
  return match[1].toLowerCase() === "completed" ? "done" : (match[1].toLowerCase() as "blocked" | "failed");
}

export function summarizeTaskResult(text: string) {
  const status = taskStatusFromTaskResult(text);
  const summaryMatch = text.match(/SUMMARY:\s*(.+)/i);
  const files = [...text.matchAll(/^\s*-\s*(.+\.[A-Za-z0-9]+)\s*$/gmi)].map((match) => match[1]).slice(0, 20);
  return {
    status,
    summary: summaryMatch?.[1]?.trim() ?? "",
    files,
  };
}

export type TaskResultSummary = ReturnType<typeof summarizeTaskResult>;

const SECTION_HEADER_PATTERN = /^[A-Z][A-Z0-9 _-]*:\s*$/;

// Extracts the bullets of an optional `GOTCHAS:` section from a TASK_RESULT block.
// Tolerant of the section being absent — workers are not required to emit it.
export function parseGotchas(text: string): string[] {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^GOTCHAS:\s*$/i.test(line.trim()));
  if (start === -1) return [];
  const gotchas: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    if (SECTION_HEADER_PATTERN.test(trimmed)) break;
    if (!trimmed.startsWith("- ")) break;
    const item = trimmed.slice(2).trim();
    if (item && item.toUpperCase() !== "NONE") gotchas.push(item);
  }
  return gotchas;
}

export type AuditFinding = {
  severity: "critical" | "major" | "minor";
  task_id?: string | null;
  criterion?: string;
  evidence?: string;
  recommendation?: string;
  retriable?: boolean;
};

export type AuditVerdict = {
  verdict: "AUDIT_PASSED" | "AUDIT_FAILED" | undefined;
  findings: AuditFinding[];
};

// Parses the Cyclops auditor verdict: a line-anchored AUDIT_PASSED/AUDIT_FAILED marker,
// followed (on failure) by a fenced ```json findings array. Falls back to plain
// `FINDINGS:` bullets when the JSON fence is missing or malformed.
export function parseAuditVerdict(text: string): AuditVerdict {
  const verdict = /^AUDIT_FAILED\s*$/m.test(text)
    ? "AUDIT_FAILED" as const
    : /^AUDIT_PASSED\s*$/m.test(text)
      ? "AUDIT_PASSED" as const
      : text.includes("AUDIT_FAILED")
        ? "AUDIT_FAILED" as const
        : text.includes("AUDIT_PASSED")
          ? "AUDIT_PASSED" as const
          : undefined;
  if (verdict !== "AUDIT_FAILED") return { verdict, findings: [] };

  const fence = text.match(/```json\s*\n([\s\S]*?)\n\s*```/);
  if (fence) {
    try {
      const parsed = JSON.parse(fence[1]);
      if (Array.isArray(parsed)) {
        const findings = parsed.filter(isRecord).map((entry) => ({
          severity: (entry.severity === "critical" || entry.severity === "major" || entry.severity === "minor"
            ? entry.severity
            : "major") as AuditFinding["severity"],
          task_id: typeof entry.task_id === "string" ? entry.task_id : null,
          criterion: typeof entry.criterion === "string" ? entry.criterion : undefined,
          evidence: typeof entry.evidence === "string" ? entry.evidence : undefined,
          recommendation: typeof entry.recommendation === "string" ? entry.recommendation : undefined,
          retriable: entry.retriable === true,
        }));
        if (findings.length > 0) return { verdict, findings };
      }
    } catch {
      // fall through to bullet parsing
    }
  }

  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^FINDINGS:\s*$/i.test(line.trim()));
  const findings: AuditFinding[] = [];
  if (start !== -1) {
    for (let i = start + 1; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed || trimmed.startsWith("```")) continue;
      if (!trimmed.startsWith("- ")) break;
      findings.push({ severity: "major", task_id: null, evidence: trimmed.slice(2).trim(), retriable: false });
    }
  }
  return { verdict, findings };
}

// Finds the design spec path Jean Grey reports alongside DESIGN_SPEC_READY.
export function parseDesignSpecPath(text: string): string | undefined {
  const markerIndex = text.indexOf("DESIGN_SPEC_READY");
  if (markerIndex === -1) return undefined;
  const after = text.slice(markerIndex);
  const cerebroPath = after.match(/\.cerebro\/[^\s`"'()\[\]]+/);
  if (cerebroPath) return cerebroPath[0];
  const markdownPath = after.match(/[A-Za-z0-9_./-]+\.md\b/);
  return markdownPath?.[0];
}
