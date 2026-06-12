// Minimal JSONC support (line/block comments + trailing commas) shared by the installer, doctor,
// and auto-update. OpenCode config is JSONC, and these were previously copy-pasted into three files;
// keep the single source here.

export function stripJsonComments(text: string): string {
  let out = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      out += ch;
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
      continue;
    }
    out += ch;
  }
  return out;
}

export function removeTrailingCommas(text: string): string {
  let out = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ",") {
      let j = i + 1;
      while (/\s/.test(text[j] || "")) j++;
      if (text[j] === "}" || text[j] === "]") continue;
    }
    out += ch;
  }
  return out;
}

// Parses JSONC, treating empty/whitespace-only input as an empty object. Throws on malformed JSON —
// callers that want a soft failure should use tryParseJsonc.
export function parseJsonc(text: string): unknown {
  const stripped = removeTrailingCommas(stripJsonComments(text)).trim();
  return stripped ? JSON.parse(stripped) : {};
}

// Parses JSONC, returning undefined on any malformed input instead of throwing.
export function tryParseJsonc(text: string): unknown {
  try {
    return JSON.parse(removeTrailingCommas(stripJsonComments(text)));
  } catch {
    return undefined;
  }
}
