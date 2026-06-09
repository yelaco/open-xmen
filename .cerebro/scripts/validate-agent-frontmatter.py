#!/usr/bin/env python3
"""Validate OpenCode agent frontmatter for the active Cerebro runtime."""

from pathlib import Path


REQUIRED_AGENTS = {
    "cerebro",
    "legion",
    "cypher",
    "professor-x",
    "cyclops",
    "wolverine",
    "storm",
    "forge",
    "nightcrawler",
    "sage",
    "beast",
    "emma-frost",
}
REQUIRED_KEYS = {"description", "mode", "model", "permission"}
VALID_MODES = {"primary", "subagent"}


def main() -> int:
    failed = []
    seen = set()
    agent_dir = Path(".opencode/agents")

    if not agent_dir.is_dir():
        print("missing .opencode/agents")
        return 1

    for path in sorted(agent_dir.glob("*.md")):
        frontmatter, error = _frontmatter(path)
        if error:
            failed.append((str(path), error))
            continue

        name = path.stem
        seen.add(name)
        if name not in REQUIRED_AGENTS:
            failed.append((str(path), f"unexpected agent {name}"))

        missing = sorted(REQUIRED_KEYS - set(frontmatter))
        if missing:
            failed.append((str(path), f"missing {missing}"))
            continue

        if frontmatter["mode"] not in VALID_MODES:
            failed.append((str(path), f"invalid mode {frontmatter['mode']}"))
        if name == "cerebro" and frontmatter["mode"] != "primary":
            failed.append((str(path), "cerebro must use mode: primary"))
        if name != "cerebro" and frontmatter["mode"] != "subagent":
            failed.append((str(path), f"{name} must use mode: subagent"))

    missing_agents = sorted(REQUIRED_AGENTS - seen)
    if missing_agents:
        failed.append((".opencode/agents", f"missing agents {missing_agents}"))

    if failed:
        for item in failed:
            print(item)
        return 1

    print("opencode agent frontmatter ok")
    return 0


def _frontmatter(path: Path) -> tuple[dict[str, str], str | None]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        return {}, "missing frontmatter"
    end = text.find("\n---\n", 4)
    if end == -1:
        return {}, "unterminated frontmatter"

    frontmatter = {}
    for line in text[4:end].splitlines():
        if ":" in line and not line.startswith(" "):
            key, value = line.split(":", 1)
            frontmatter[key.strip()] = value.strip()
    return frontmatter, None


if __name__ == "__main__":
    raise SystemExit(main())
