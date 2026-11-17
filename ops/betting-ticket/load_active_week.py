#!/usr/bin/env python3
"""Fail-closed official betting-ticket week loader. No database or provider access."""
import json
import sys
from pathlib import Path

CAPABILITY = "betting_ticket_active_week_2026"


def load(path):
    try:
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        raise SystemExit("official week config unreadable")
    if not isinstance(raw, dict):
        raise SystemExit("official week config must be an object")
    if raw.get("capability") != CAPABILITY:
        raise SystemExit("official week capability mismatch")
    if raw.get("season") != 2026 or isinstance(raw.get("season"), bool):
        raise SystemExit("official week season must be 2026")
    week = raw.get("week")
    if isinstance(week, bool) or not isinstance(week, int) or not 1 <= week <= 16:
        raise SystemExit("official week must be an integer from 1 to 16")
    if not isinstance(raw.get("commitAuthorized"), bool):
        raise SystemExit("commitAuthorized must be boolean")
    return raw["season"], week, raw["commitAuthorized"]


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: load_active_week.py <config>")
    season, week, commit = load(sys.argv[1])
    sys.stdout.buffer.write(
        f"{season}\n{week}\n{'true' if commit else 'false'}\n".encode("ascii")
    )


if __name__ == "__main__":
    main()
