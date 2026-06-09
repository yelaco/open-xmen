# Semble — Semantic Code Search

Semble is installed as an MCP server. The following teammates should prefer it over grep for natural-language and conceptual queries: **Nightcrawler**, **Wolverine**, and **Forge**.

## MCP Tools

- `mcp__semble__search(query, repo)` — natural-language or identifier search; `repo` is a local path or git URL; defaults to the current working directory.
- `mcp__semble__find_related(file_path, line, repo)` — find chunks semantically similar to the code at a given file location.

## When to Use Semble

- Conceptual / natural-language queries → `mcp__semble__search`
- "Find code similar to X" → `mcp__semble__find_related`
- Exhaustive exact-string or regex matching → use `grep` (semble is not a text matcher)

## Per-Teammate Guidance

**Nightcrawler** — primary user. Prefer semble for all conceptual queries; fall back to grep only for exact-string or regex matching.

**Wolverine** — use `mcp__semble__search` before implementing to find existing patterns, conventions, and similar code to avoid duplication. Use `mcp__semble__find_related` to discover all call sites when changing an interface.

**Forge** — use `mcp__semble__search` to locate architectural examples and assess how widely a pattern is used before recommending changes. Use `mcp__semble__find_related` to find the blast radius of a design decision.

## Indexing for Repeated Searches

Index once for faster repeated queries:
```bash
semble index . -o .cerebro/semble-index
```
Pass `--index .cerebro/semble-index` to searches. Reindex if the codebase changes significantly.
