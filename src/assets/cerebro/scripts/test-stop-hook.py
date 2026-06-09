#!/usr/bin/env python3
"""Exercise OpenCode-native Cerebro pending-todo blocking behavior."""

from pathlib import Path


TODO_FILE = Path(".cerebro/pending-todos/doctor/worker/task.txt")
PENDING_ROOT = Path(".cerebro/pending-todos")


def main() -> int:
    previous = TODO_FILE.read_bytes() if TODO_FILE.exists() else None

    TODO_FILE.parent.mkdir(parents=True, exist_ok=True)
    TODO_FILE.write_text("doctor temporary todo\n", encoding="utf-8")

    try:
        pending = _pending_items(PENDING_ROOT / "doctor")
    finally:
        if previous is None:
            TODO_FILE.unlink(missing_ok=True)
            _remove_empty_parents(TODO_FILE.parent)
        else:
            TODO_FILE.write_bytes(previous)

    if not pending:
        print("expected pending todo scan to block final response")
        return 1

    print("pending todo block decision ok")
    return 0


def _pending_items(root: Path) -> list[tuple[Path, str]]:
    items = []
    if not root.exists():
        return items
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        for line in path.read_text(errors="replace").splitlines():
            if line.strip():
                items.append((path, line.strip()))
    return items


def _remove_empty_parents(path: Path) -> None:
    current = path
    while current != PENDING_ROOT.parent and current.exists():
        try:
            current.rmdir()
        except OSError:
            break
        if current == PENDING_ROOT:
            break
        current = current.parent


if __name__ == "__main__":
    raise SystemExit(main())
