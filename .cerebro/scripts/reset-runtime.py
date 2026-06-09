#!/usr/bin/env python3
"""Scan, reset, and verify Cerebro runtime state."""

import argparse
import shutil
from pathlib import Path


RUNTIME = {
    "boulder.json": Path(".cerebro/boulder.json"),
    ".pending-todos": Path(".cerebro/.pending-todos"),
    "pending-todos/": Path(".cerebro/pending-todos"),
    "plans/": Path(".cerebro/plans"),
    "notepads/": Path(".cerebro/notepads"),
    "team-runs/": Path(".cerebro/team-runs"),
}
TARGETS = list(RUNTIME.values())
STUB_DIRS = [
    Path(".cerebro/plans"),
    Path(".cerebro/notepads"),
    Path(".cerebro/team-runs"),
]
EMPTY_DIRS = [
    *STUB_DIRS,
    Path(".cerebro/pending-todos"),
]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("scan")
    reset_parser = subparsers.add_parser("reset")
    reset_parser.add_argument("--confirm", required=True)
    subparsers.add_parser("verify")
    args = parser.parse_args()

    if args.command == "scan":
        scan()
        return 0
    if args.command == "reset":
        if args.confirm != "YES":
            print("Reset aborted. No files were changed.")
            return 1
        reset()
        return 0
    if args.command == "verify":
        return verify()
    raise AssertionError(args.command)


def scan() -> None:
    for label, path in RUNTIME.items():
        if not path.exists():
            print(f"  {label:<20} absent - nothing to remove")
            continue
        if path.is_file():
            print(f"  {label:<20} FILE  {path.stat().st_size} bytes")
            continue
        items = [item for item in path.rglob("*") if item.is_file() and item.name != ".gitkeep"]
        print(f"  {label:<20} DIR   {len(items)} runtime file(s)")


def reset() -> None:
    removed = []
    skipped = []
    for path in TARGETS:
        if not path.exists():
            skipped.append(str(path))
            continue
        if path.is_file():
            path.unlink()
        else:
            shutil.rmtree(path)
        removed.append(str(path))

    for path in EMPTY_DIRS:
        path.mkdir(parents=True, exist_ok=True)
    for path in STUB_DIRS:
        (path / ".gitkeep").touch()

    print("Removed:")
    for path in removed:
        print(f"  {path}")
    if skipped:
        print("Skipped (absent):")
        for path in skipped:
            print(f"  {path}")


def verify() -> int:
    checks = {
        "boulder.json absent": not Path(".cerebro/boulder.json").exists(),
        ".pending-todos absent": not Path(".cerebro/.pending-todos").exists(),
        "pending-todos/ absent or empty": _absent_or_has_only_gitkeep(Path(".cerebro/pending-todos")),
        "plans/ clean": _has_only_gitkeep_or_less(Path(".cerebro/plans")),
        "notepads/ clean": _has_only_gitkeep_or_less(Path(".cerebro/notepads")),
        "team-runs/ clean": _has_only_gitkeep_or_less(Path(".cerebro/team-runs")),
    }

    all_pass = True
    for label, ok in checks.items():
        status = "PASS" if ok else "FAIL"
        if not ok:
            all_pass = False
        print(f"  {status}  {label}")

    if not all_pass:
        return 1
    print("Runtime clean.")
    return 0


def _has_only_gitkeep_or_less(path: Path) -> bool:
    if not path.is_dir():
        return False
    return all(item.name == ".gitkeep" for item in path.iterdir())


def _absent_or_has_only_gitkeep(path: Path) -> bool:
    return not path.exists() or _has_only_gitkeep_or_less(path)


if __name__ == "__main__":
    raise SystemExit(main())
