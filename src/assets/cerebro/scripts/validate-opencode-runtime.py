#!/usr/bin/env python3
"""Validate Cerebro OpenCode runtime files."""

import re
import json
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
    "cerebro-plan",
    "cerebro-start-work",
    "cerebro-ultrawork",
}
MODEL_PATTERN = re.compile(r"(?:openai|anthropic|minimax)/[A-Za-z0-9._/-]+")
REQUIRED_SLOTS = {
    "orchestrator": ("openai/gpt-5.5", "CEREBRO_MODEL_ORCHESTRATOR"),
    "auditor": ("openai/gpt-5.5", "CEREBRO_MODEL_AUDITOR"),
    "planner": ("openai/gpt-5.5", "CEREBRO_MODEL_PLANNER"),
    "design": ("openai/gpt-5.5", "CEREBRO_MODEL_DESIGN"),
    "analyst": ("openai/gpt-5.4", "CEREBRO_MODEL_ANALYST"),
    "workers": ("openai/gpt-5.5", "CEREBRO_MODEL_WORKERS"),
    "fast": ("openai/gpt-5.4-mini-fast", "CEREBRO_MODEL_FAST"),
    "image": ("openai/gpt-image-2", "CEREBRO_MODEL_IMAGE"),
}


def main() -> int:
    errors = []
    for path in [
        "opencode.jsonc",
        "AGENTS.md",
        ".cerebro/cerebro-identity.md",
        ".cerebro/opencode/model-routing.md",
    ]:
        if not Path(path).is_file():
            errors.append(f"missing {path}")

    if not _has_open_xmen_plugin(Path("opencode.jsonc")) and not Path(".opencode/plugins/open-xmen.ts").is_file():
        errors.append("opencode.jsonc must include open-xmen plugin entry or .opencode/plugins/open-xmen.ts bridge must exist")

    allowed_models = _configured_models(Path(".cerebro/opencode/model-routing.md"))
    routing_text = Path(".cerebro/opencode/model-routing.md").read_text(encoding="utf-8") if Path(".cerebro/opencode/model-routing.md").is_file() else ""
    for slot, (model, env) in REQUIRED_SLOTS.items():
        if f"`{slot}`" not in routing_text:
            errors.append(f"model routing missing slot {slot}")
        if model not in routing_text:
            errors.append(f"model routing missing default model {model}")
        if env not in routing_text:
            errors.append(f"model routing missing env override {env}")

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
        if "model_fallbacks:" not in text:
            errors.append(f"{path}: missing model_fallbacks")

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


def _has_open_xmen_plugin(path: Path) -> bool:
    if not path.is_file():
        return False
    text = path.read_text(encoding="utf-8")
    if '"open-xmen"' in text or "'open-xmen'" in text or ".opencode/plugins/open-xmen.ts" in text:
        return True
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return False
    plugins = data.get("plugin", []) if isinstance(data, dict) else []
    for entry in plugins:
        spec = entry[0] if isinstance(entry, list) and entry else entry
        if isinstance(spec, str) and _is_local_open_xmen_package(spec):
            return True
    return False


def _is_local_open_xmen_package(spec: str) -> bool:
    package_json = Path(spec).expanduser() / "package.json"
    if not package_json.is_file():
        return False
    try:
        data = json.loads(package_json.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return False
    return isinstance(data, dict) and data.get("name") == "open-xmen"


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
