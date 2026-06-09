#!/usr/bin/env python3
"""Validate Cerebro OpenCode runtime files."""

import re
from pathlib import Path

REQUIRED_AGENTS = {
    "cerebro",
    "legion",
    "cypher",
    "professor-x",
    "wolverine",
    "jean-grey",
    "storm",
    "cyclops",
    "forge",
    "nightcrawler",
    "sage",
    "beast",
    "emma-frost",
}
REQUIRED_COMMANDS = {
    "cerebro-index",
    "cerebro-plan",
    "cerebro-start-work",
    "cerebro-doctor",
    "to-me-my-x-men",
}
MODEL_PATTERN = re.compile(r"openai/[A-Za-z0-9._/-]+")


def main() -> int:
    errors = []
    for path in [
        "opencode.jsonc",
        "AGENTS.md",
        ".opencode/plugins/open-xmen.ts",
        ".cerebro/cerebro-identity.md",
        ".cerebro/opencode/model-routing.md",
    ]:
        if not Path(path).is_file():
            errors.append(f"missing {path}")

    allowed_models = _configured_models(Path(".cerebro/opencode/model-routing.md"))

    agent_dir = Path(".opencode/agents")
    seen_agents = {path.stem for path in agent_dir.glob("*.md")} if agent_dir.is_dir() else set()
    for name in sorted(REQUIRED_AGENTS - seen_agents):
        errors.append(f"missing .opencode/agents/{name}.md")
    for path in sorted(agent_dir.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        if not text.startswith("---\n"):
            errors.append(f"{path}: missing frontmatter")
            continue
        model = _frontmatter_value(text, "model")
        if model and model not in allowed_models:
            errors.append(f"{path}: model {model!r} is outside configured model availability")

    command_dir = Path(".opencode/commands")
    seen_commands = {path.stem for path in command_dir.glob("*.md")} if command_dir.is_dir() else set()
    for name in sorted(REQUIRED_COMMANDS - seen_commands):
        errors.append(f"missing .opencode/commands/{name}.md")
    for path in sorted(command_dir.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        if "agent: cerebro" not in text:
            errors.append(f"{path}: command must route to agent: cerebro")

    if errors:
        for error in errors:
            print(error)
        return 1
    print("opencode runtime ok")
    return 0


def _frontmatter_value(text: str, key: str) -> str | None:
    end = text.find("\n---\n", 4)
    if end == -1:
        return None
    for line in text[4:end].splitlines():
        if line.startswith(key + ":"):
            return line.split(":", 1)[1].strip()
    return None


def _configured_models(path: Path) -> set[str]:
    if not path.is_file():
        return set()
    return set(MODEL_PATTERN.findall(path.read_text(encoding="utf-8")))


if __name__ == "__main__":
    raise SystemExit(main())
