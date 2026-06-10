#!/usr/bin/env python3
"""Validate Cerebro team-run manifest template and runtime manifests."""

import json
from pathlib import Path


ALLOWED_COMMANDS = {
    "/to-me-my-x-men",
    "/cerebro-plan",
    "/cerebro-start-work",
    "/cerebro-index",
}
ALLOWED_STATUSES = {"planning", "running", "blocked", "completed", "cleaned_up"}
ALLOWED_RISKS = {"LOW", "MEDIUM", "HIGH"}
ALLOWED_AGENTS = {
    "cerebro",
    "legion",
    "cypher",
    "cyclops",
    "wolverine",
    "jean-grey",
    "storm",
    "professor-x",
    "beast",
    "emma-frost",
    "nightcrawler",
    "sage",
    "forge",
}
ALLOWED_TEAMMATE_STATUSES = {"pending", "active", "idle", "done", "blocked"}
ALLOWED_APPROVAL_STATUSES = {"pending", "approved", "rejected"}
ALLOWED_VERIFICATION_STATUSES = {"NOT RUN", "PASS", "FAIL", "BLOCKED"}
ALLOWED_TASK_STATUSES = {"pending", "active", "blocked", "done", "verified", "failed"}


def main() -> int:
    manifests = [
        Path(".cerebro/templates/team-run.json"),
        *sorted(
            path
            for path in Path(".cerebro/team-runs").glob("*.json")
            if not path.name.endswith(".tasks.json")
        ),
    ]
    task_ledgers = sorted(Path(".cerebro/team-runs").glob("*.tasks.json"))
    mailbox_logs = sorted(Path(".cerebro/team-runs").glob("*.mailbox.jsonl"))
    checkpoint_logs = sorted(Path(".cerebro/team-runs").glob("*.checkpoints.jsonl"))

    errors = []
    for path in manifests:
        errors.extend(validate_manifest(path))
    for path in task_ledgers:
        errors.extend(validate_tasks(path))
    for path in mailbox_logs:
        errors.extend(_validate_jsonl(path, _validate_mailbox_record))
    for path in checkpoint_logs:
        errors.extend(_validate_jsonl(path, _validate_checkpoint_record))

    if errors:
        for error in errors:
            print(error)
        return 1

    print(
        "team run runtime files ok "
        f"({len(manifests)} manifest(s), {len(task_ledgers)} task ledger(s), "
        f"{len(mailbox_logs)} mailbox log(s), {len(checkpoint_logs)} checkpoint log(s))"
    )
    return 0


def validate_manifest(path: Path) -> list[str]:
    data = json.loads(path.read_text())
    errors = []

    top_required = {
        "version",
        "run_id",
        "command",
        "status",
        "lead",
        "team_name",
        "objective",
        "risk_level",
        "started_at",
        "updated_at",
        "teammates",
        "ownership",
        "mailbox_decisions",
        "approvals",
        "verification",
        "cleanup",
    }
    errors.extend(_check_keys(str(path), data, top_required))

    if data.get("version") != 1:
        errors.append(f"{path}: version must be 1")
    if data.get("command") not in ALLOWED_COMMANDS:
        errors.append(f"{path}: invalid command {data.get('command')!r}")
    if data.get("status") not in ALLOWED_STATUSES:
        errors.append(f"{path}: invalid status {data.get('status')!r}")
    if data.get("lead") != "cerebro":
        errors.append(f"{path}: lead must be cerebro")
    if data.get("risk_level") not in ALLOWED_RISKS:
        errors.append(f"{path}: invalid risk_level {data.get('risk_level')!r}")
    for key in ("run_id", "team_name", "objective", "started_at", "updated_at"):
        errors.extend(_non_empty(f"{path}: {key}", data.get(key)))

    for field in ("teammates", "ownership", "mailbox_decisions", "approvals", "verification"):
        if not isinstance(data.get(field), list):
            errors.append(f"{path}: {field} must be an array")

    _validate_teammates(path, data.get("teammates", []), errors)
    _validate_ownership(path, data.get("ownership", []), errors)
    _validate_mailbox(path, data.get("mailbox_decisions", []), errors)
    _validate_approvals(path, data.get("approvals", []), errors)
    _validate_verification(path, data.get("verification", []), errors)
    _validate_cleanup(path, data.get("cleanup"), errors)

    return errors


def validate_tasks(path: Path) -> list[str]:
    data = json.loads(path.read_text())
    errors = []
    if not isinstance(data, list):
        return [f"{path}: task ledger must be an array"]

    required = {
        "id",
        "subject",
        "description",
        "owner",
        "status",
        "depends_on",
        "created_at",
        "updated_at",
        "notes",
        "verification",
    }
    for index, item in enumerate(data):
        label = f"{path}: tasks[{index}]"
        errors.extend(_check_keys(label, item, required))
        for key in ("id", "subject", "description", "owner", "created_at", "updated_at"):
            errors.extend(_non_empty(f"{label}.{key}", item.get(key) if isinstance(item, dict) else None))
        if isinstance(item, dict):
            if item.get("status") not in ALLOWED_TASK_STATUSES:
                errors.append(f"{label}.status invalid {item.get('status')!r}")
            for key in ("depends_on", "notes", "verification"):
                if not isinstance(item.get(key), list):
                    errors.append(f"{label}.{key} must be an array")
            _validate_task_verification(path, index, item.get("verification", []), errors)
    return errors


def _validate_teammates(path: Path, items: list, errors: list[str]) -> None:
    required = {"name", "agent_type", "status", "responsibility", "last_signal"}
    for index, item in enumerate(items):
        label = f"{path}: teammates[{index}]"
        errors.extend(_check_keys(label, item, required))
        errors.extend(_non_empty(f"{label}.name", item.get("name")))
        if item.get("agent_type") not in ALLOWED_AGENTS:
            errors.append(f"{label}.agent_type invalid {item.get('agent_type')!r}")
        if item.get("status") not in ALLOWED_TEAMMATE_STATUSES:
            errors.append(f"{label}.status invalid {item.get('status')!r}")


def _validate_ownership(path: Path, items: list, errors: list[str]) -> None:
    required = {"path", "owner", "reviewer", "notes"}
    for index, item in enumerate(items):
        label = f"{path}: ownership[{index}]"
        errors.extend(_check_keys(label, item, required))
        errors.extend(_non_empty(f"{label}.path", item.get("path")))
        errors.extend(_non_empty(f"{label}.owner", item.get("owner")))


def _validate_mailbox(path: Path, items: list, errors: list[str]) -> None:
    required = {"at", "from", "to", "decision", "notes"}
    for index, item in enumerate(items):
        label = f"{path}: mailbox_decisions[{index}]"
        errors.extend(_check_keys(label, item, required))
        for key in ("at", "from", "to", "decision"):
            errors.extend(_non_empty(f"{label}.{key}", item.get(key)))


def _validate_approvals(path: Path, items: list, errors: list[str]) -> None:
    required = {"gate", "status", "decided_at", "notes"}
    for index, item in enumerate(items):
        label = f"{path}: approvals[{index}]"
        errors.extend(_check_keys(label, item, required))
        errors.extend(_non_empty(f"{label}.gate", item.get("gate")))
        if item.get("status") not in ALLOWED_APPROVAL_STATUSES:
            errors.append(f"{label}.status invalid {item.get('status')!r}")


def _validate_verification(path: Path, items: list, errors: list[str]) -> None:
    required = {"command", "status", "by", "notes"}
    for index, item in enumerate(items):
        label = f"{path}: verification[{index}]"
        errors.extend(_check_keys(label, item, required))
        errors.extend(_non_empty(f"{label}.command", item.get("command")))
        errors.extend(_non_empty(f"{label}.by", item.get("by")))
        if item.get("status") not in ALLOWED_VERIFICATION_STATUSES:
            errors.append(f"{label}.status invalid {item.get('status')!r}")


def _validate_task_verification(path: Path, task_index: int, items: list, errors: list[str]) -> None:
    if not isinstance(items, list):
        return
    required = {"at", "result"}
    allowed = required | {"command", "notes"}
    for index, item in enumerate(items):
        label = f"{path}: tasks[{task_index}].verification[{index}]"
        errors.extend(_check_required_keys(label, item, required, allowed))
        if isinstance(item, dict):
            errors.extend(_non_empty(f"{label}.at", item.get("at")))
            if item.get("result") not in ALLOWED_VERIFICATION_STATUSES:
                errors.append(f"{label}.result invalid {item.get('result')!r}")


def _validate_jsonl(path: Path, validator) -> list[str]:
    errors = []
    for line_number, line in enumerate(path.read_text().splitlines(), start=1):
        if not line.strip():
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError as exc:
            errors.append(f"{path}:{line_number}: invalid JSON: {exc.msg}")
            continue
        errors.extend(validator(path, line_number, record))
    return errors


def _validate_mailbox_record(path: Path, line_number: int, item: object) -> list[str]:
    label = f"{path}:{line_number}"
    if not isinstance(item, dict):
        return [f"{label}: mailbox record must be an object"]

    common_required = {"at", "from", "to", "type"}
    if item.get("type") == "dispatch":
        required = common_required | {"description"}
        allowed = required
    else:
        required = common_required | {"run_id", "body"}
        allowed = required | {"decision"}
    errors = _check_required_keys(label, item, required, allowed)
    for key in sorted(required):
        errors.extend(_non_empty(f"{label}.{key}", item.get(key)))
    return errors


def _validate_checkpoint_record(path: Path, line_number: int, item: object) -> list[str]:
    label = f"{path}:{line_number}"
    required = {"at", "run_id", "summary"}
    allowed = required | {"next", "verification"}
    errors = _check_required_keys(label, item, required, allowed)
    if isinstance(item, dict):
        for key in sorted(required):
            errors.extend(_non_empty(f"{label}.{key}", item.get(key)))
    return errors


def _validate_cleanup(path: Path, cleanup: object, errors: list[str]) -> None:
    required = {"team_stopped", "pending_todos_clear", "notes"}
    label = f"{path}: cleanup"
    if not isinstance(cleanup, dict):
        errors.append(f"{label} must be an object")
        return
    errors.extend(_check_keys(label, cleanup, required))
    for key in ("team_stopped", "pending_todos_clear"):
        if not isinstance(cleanup.get(key), bool):
            errors.append(f"{label}.{key} must be a boolean")


def _check_keys(label: str, item: object, required: set[str]) -> list[str]:
    if not isinstance(item, dict):
        return [f"{label}: must be an object"]
    errors = []
    missing = sorted(required - set(item))
    extra = sorted(set(item) - required)
    if missing:
        errors.append(f"{label}: missing {missing}")
    if extra:
        errors.append(f"{label}: unexpected {extra}")
    return errors


def _check_required_keys(label: str, item: object, required: set[str], allowed: set[str]) -> list[str]:
    if not isinstance(item, dict):
        return [f"{label}: must be an object"]
    errors = []
    missing = sorted(required - set(item))
    extra = sorted(set(item) - allowed)
    if missing:
        errors.append(f"{label}: missing {missing}")
    if extra:
        errors.append(f"{label}: unexpected {extra}")
    return errors


def _non_empty(label: str, value: object) -> list[str]:
    return [] if isinstance(value, str) and value else [f"{label}: must be a non-empty string"]


if __name__ == "__main__":
    raise SystemExit(main())
