#!/usr/bin/env python3
"""Validate Cerebro boulder execution state using the local schema contract."""

import json
from pathlib import Path


STATE_PATH = Path(".cerebro/boulder.json")
SCHEMA_PATH = Path(".cerebro/schemas/boulder.schema.json")


def main() -> int:
    if not SCHEMA_PATH.exists():
        print("missing schema")
        return 1
    if not STATE_PATH.exists():
        print("no active boulder state")
        return 0

    state = json.loads(STATE_PATH.read_text())
    errors = []

    allowed_top = {
        "version",
        "active_plan",
        "plan_name",
        "status",
        "risk_level",
        "team_name",
        "started_at",
        "updated_at",
        "approval_gates",
        "verification_history",
        "decisions",
    }
    missing = sorted(allowed_top - set(state))
    extra = sorted(set(state) - allowed_top)
    if missing:
        errors.append(f"missing top-level fields: {missing}")
    if extra:
        errors.append(f"unexpected top-level fields: {extra}")

    if state.get("version") != 2:
        errors.append(f"version must be 2, got {state.get('version')!r}")
    if state.get("status") not in {"not_started", "in_progress", "blocked", "completed"}:
        errors.append(f"invalid status: {state.get('status')!r}")
    if state.get("risk_level") not in {"LOW", "MEDIUM", "HIGH"}:
        errors.append(f"invalid risk_level: {state.get('risk_level')!r}")

    if not isinstance(state.get("approval_gates"), list):
        errors.append("approval_gates must be an array")
    else:
        gate_required = {"name", "status", "decided_at", "decision_by", "notes"}
        for index, gate in enumerate(state["approval_gates"]):
            if not isinstance(gate, dict):
                errors.append(f"approval_gates[{index}] must be an object")
                continue
            errors.extend(_check_keys(f"approval_gates[{index}]", gate, gate_required))
            if gate.get("status") not in {"pending", "approved", "rejected"}:
                errors.append(f"approval_gates[{index}] invalid status {gate.get('status')!r}")

    if not isinstance(state.get("verification_history"), list):
        errors.append("verification_history must be an array")
    else:
        verify_required = {"command", "result", "verified_at", "notes"}
        for index, item in enumerate(state["verification_history"]):
            if not isinstance(item, dict):
                errors.append(f"verification_history[{index}] must be an object")
                continue
            errors.extend(_check_keys(f"verification_history[{index}]", item, verify_required))
            if item.get("result") not in {"PASS", "FAIL", "BLOCKED"}:
                errors.append(f"verification_history[{index}] invalid result {item.get('result')!r}")

    if not isinstance(state.get("decisions"), list):
        errors.append("decisions must be an array")
    else:
        decision_required = {"at", "topic", "decision", "rationale"}
        for index, item in enumerate(state["decisions"]):
            if not isinstance(item, dict):
                errors.append(f"decisions[{index}] must be an object")
                continue
            errors.extend(_check_keys(f"decisions[{index}]", item, decision_required))

    if errors:
        for error in errors:
            print(error)
        return 1

    print("boulder state schema ok")
    return 0


def _check_keys(label: str, item: dict, required: set[str]) -> list[str]:
    errors = []
    missing = sorted(required - set(item))
    extra = sorted(set(item) - required)
    if missing:
        errors.append(f"{label} missing {missing}")
    if extra:
        errors.append(f"{label} unexpected {extra}")
    return errors


if __name__ == "__main__":
    raise SystemExit(main())
