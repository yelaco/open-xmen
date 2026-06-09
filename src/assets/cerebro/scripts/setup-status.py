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
    plugin_status = "PRESENT" if Path(".opencode/plugins/open-xmen.ts").is_file() else "MISSING"

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


if __name__ == "__main__":
    raise SystemExit(main())
