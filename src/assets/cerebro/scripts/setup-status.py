#!/usr/bin/env python3
"""Report Cerebro OpenCode setup status."""

import argparse
import json
from pathlib import Path


OPENCODE_INSTRUCTIONS = [
    Path("AGENTS.md"),
    Path(".cerebro/cerebro-identity.md"),
    Path(".cerebro/opencode/model-routing.md"),
]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    instruction_status = instruction_files_status()
    plugin_status = "PRESENT" if _has_open_xmen_plugin() or Path(".opencode/plugins/open-xmen.ts").is_file() else "MISSING"

    missing = [str(path) for path, status in instruction_status.items() if status == "MISSING"]
    status = {
        "ok": not missing and plugin_status == "PRESENT",
        "instructions": {str(path): value for path, value in instruction_status.items()},
        "plugin_bridge": plugin_status,
    }
    if args.json:
        print(json.dumps(status, indent=2))
        return 0 if status["ok"] else 1

    if missing:
        print(f"Missing OpenCode instruction files: {', '.join(missing)}")
        print("Run `open-xmen install --reset` to restore managed runtime files.")

    print()
    for path, status in instruction_status.items():
        print(f"{str(path):24} - {status}")
    print("plugin bridge            - " + plugin_status)
    return 0 if not missing and plugin_status == "PRESENT" else 1


def instruction_files_status() -> dict[Path, str]:
    return {path: ("PRESENT" if path.is_file() else "MISSING") for path in OPENCODE_INSTRUCTIONS}


def _has_open_xmen_plugin() -> bool:
    path = Path("opencode.jsonc")
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


if __name__ == "__main__":
    raise SystemExit(main())
