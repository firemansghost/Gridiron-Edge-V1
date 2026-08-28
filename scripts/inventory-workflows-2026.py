#!/usr/bin/env python3
"""Pure static inventory of .github/workflows (no network, no DB, no PyYAML)."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WF_DIR = ROOT / ".github" / "workflows"

TRIGGER_KEYS = [
    "workflow_dispatch",
    "schedule",
    "push",
    "pull_request",
    "workflow_run",
    "repository_dispatch",
    "release",
    "workflow_call",
]


def read_text(path: Path) -> str:
    raw = path.read_bytes()
    if raw.startswith(b"\xff\xfe") or raw.startswith(b"\xfe\xff"):
        return raw.decode("utf-16")
    return raw.decode("utf-8")


def extract_name(text: str, fallback: str) -> str:
    m = re.search(r"(?m)^name:\s*(.+)$", text)
    if not m:
        return fallback
    return m.group(1).strip().strip("\"'")


def extract_triggers(text: str) -> tuple[list[str], list[str]]:
    triggers: list[str] = []
    # Top-level on: block — detect keys as lines under on: until next top-level key
    on_match = re.search(r"(?ms)^on:\s*\n((?:  .*\n)+)", text)
    on_block = on_match.group(1) if on_match else text
    for key in TRIGGER_KEYS:
        if re.search(rf"(?m)^\s{{2}}{key}\s*:", on_block) or re.search(
            rf"(?m)^\s{{2}}-\s*{key}\b", on_block
        ):
            triggers.append(key)
        elif re.search(rf"(?m)^on:\s*\n\s*{key}\s*:", text):
            if key not in triggers:
                triggers.append(key)
    # Also allow inline `on: push` style
    inline = re.search(r"(?m)^on:\s*\[([^\]]+)\]", text)
    if inline:
        for part in inline.group(1).split(","):
            k = part.strip().strip("\"'")
            if k in TRIGGER_KEYS and k not in triggers:
                triggers.append(k)
    crons = re.findall(r"cron:\s*['\"]([^'\"]+)['\"]", text)
    if crons and "schedule" not in triggers:
        triggers.append("schedule")
    return triggers, crons


def main() -> None:
    rows = []
    for p in sorted(WF_DIR.glob("*.yml")) + sorted(WF_DIR.glob("*.yaml")):
        text = read_text(p)
        triggers, crons = extract_triggers(text)
        rows.append(
            {
                "file": p.name,
                "name": extract_name(text, p.stem),
                "triggers": triggers,
                "crons": crons,
                "has_active_schedule_yaml": "schedule" in triggers,
                "hardcoded_years": sorted(
                    set(re.findall(r"(?<![\w-])(202[0-9])(?![\w-])", text))
                ),
                "secrets": sorted(set(re.findall(r"secrets\.([A-Z0-9_]+)", text))),
                "scripts": sorted(
                    set(
                        re.findall(
                            r"(?:npx tsx |node |npm run )([A-Za-z0-9_./@-]+)",
                            text,
                        )
                    )
                ),
                "mentions_odds": bool(
                    re.search(r"odds|ODDS|MarketLine|oddsapi|SGO", text, re.I)
                ),
                "mentions_ratings": bool(
                    re.search(r"ratings|seed-ratings|compute_ratings", text, re.I)
                ),
                "mentions_bets": bool(
                    re.search(r"\bbet\b|sync-.*bet|grade-bets", text, re.I)
                ),
                "inputs_in_shell": bool(re.search(r"\$\{\{\s*inputs\.", text)),
                "continue_on_error": "continue-on-error" in text,
                "mock": bool(re.search(r"\bmock\b", text, re.I)),
                "github_env": "GITHUB_ENV" in text,
                "encoding_note": "utf-16"
                if p.read_bytes()[:2] in (b"\xff\xfe", b"\xfe\xff")
                else "utf-8",
            }
        )

    out = {
        "count": len(rows),
        "scheduled_count": sum(1 for r in rows if r["has_active_schedule_yaml"]),
        "workflows": rows,
    }
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
