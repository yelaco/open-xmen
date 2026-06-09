#!/usr/bin/env python3
"""Legacy compatibility check for Claude Code agent-team settings.

The active OpenCode runtime uses `.opencode/` agents, Cerebro custom tools,
and child sessions instead of Claude Code experimental agent teams. Keep this
script only for repositories that still validate legacy `.claude/` material.
"""

import json
from pathlib import Path


def main() -> int:
    settings = json.loads(Path(".claude/settings.json").read_text())
    env = settings.get("env", {})
    if env.get("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS") != "1":
        print("missing CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1")
        return 1
    print("agent teams enabled")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
