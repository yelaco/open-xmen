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
    auto_upgrade = auto_upgrade_status()

    missing = [str(path) for path, status in instruction_status.items() if status == "MISSING"]
    status = {
        "ok": not missing and plugin_status == "PRESENT",
        "instructions": {str(path): value for path, value in instruction_status.items()},
        "plugin_bridge": plugin_status,
        "auto_upgrade": auto_upgrade,
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
    print("auto-upgrade status      - " + str(auto_upgrade.get("status", "unknown")))
    if "current_version" in auto_upgrade:
        print("current package version  - " + str(auto_upgrade["current_version"]))
    if "latest_version" in auto_upgrade:
        print("latest package version   - " + str(auto_upgrade["latest_version"]))
    if "detail" in auto_upgrade:
        print("auto-upgrade detail      - " + str(auto_upgrade["detail"]))
    return 0 if not missing and plugin_status == "PRESENT" else 1


def instruction_files_status() -> dict[Path, str]:
    return {path: ("PRESENT" if path.is_file() else "MISSING") for path in OPENCODE_INSTRUCTIONS}


def auto_upgrade_status() -> dict[str, object]:
    status_path = Path(".cerebro/auto-upgrade.json")
    if not status_path.exists():
        return {"status": "not yet checked"}
    try:
        status = json.loads(status_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"status": "invalid"}
    if isinstance(status, dict):
        return status
    return {"status": "invalid"}


if __name__ == "__main__":
    raise SystemExit(main())
