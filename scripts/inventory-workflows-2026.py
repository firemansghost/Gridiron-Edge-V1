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


def strip_full_line_comments(text: str) -> str:
    """Drop lines whose first non-whitespace is `#` (YAML full-line comments)."""
    out: list[str] = []
    for line in text.splitlines(keepends=True):
        if re.match(r"^\s*#", line):
            continue
        out.append(line)
    return "".join(out)


def extract_name(text: str, fallback: str) -> str:
    m = re.search(r"(?m)^name:\s*(.+)$", text)
    if not m:
        return fallback
    return m.group(1).strip().strip("\"'")


def extract_on_block(text: str) -> str:
    """
    Return the body of the top-level `on:` mapping (indented lines), or '' if
    only an inline `on: [...]` form exists.
    """
    # Full-line comments already stripped by callers for trigger detection.
    m = re.search(r"(?ms)^on:\s*\n((?:[ \t]+.*\n)*)", text)
    if m:
        return m.group(1)
    return ""


def extract_triggers(text: str) -> tuple[list[str], list[str]]:
    """
    Identify active workflow triggers and cron expressions.

    Commented YAML lines must not create triggers or crons. Cron is collected
    only from an active (uncommented) top-level `schedule:` under `on:`.
    """
    active = strip_full_line_comments(text)
    triggers: list[str] = []

    # Inline: on: [push, pull_request]
    inline = re.search(r"(?m)^on:\s*\[([^\]]+)\]", active)
    if inline:
        for part in inline.group(1).split(","):
            k = part.strip().strip("\"'")
            if k in TRIGGER_KEYS and k not in triggers:
                triggers.append(k)

    on_block = extract_on_block(active)
    if on_block:
        for key in TRIGGER_KEYS:
            # Mapping key at 2-space indent typical of GHA: `  schedule:`
            if re.search(rf"(?m)^\s{{2}}{re.escape(key)}\s*:", on_block):
                if key not in triggers:
                    triggers.append(key)

    crons: list[str] = []
    if "schedule" in triggers and on_block:
        # Only crons nested under the active schedule section of the on-block.
        sched = re.search(
            r"(?ms)^\s{2}schedule:\s*\n((?:\s{4,}.*\n)*)",
            on_block,
        )
        if sched:
            crons = re.findall(
                r"cron:\s*['\"]([^'\"]+)['\"]",
                sched.group(1),
            )

    return triggers, crons


def extract_run_shell_bodies(text: str) -> list[str]:
    """
    Collect shell source from `run:` steps only (block |/> or scalar).
    Does not include env:/with:/if:/concurrency expressions.
    """
    bodies: list[str] = []
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        # Skip full-line comments
        if re.match(r"^\s*#", line):
            i += 1
            continue

        # Block scalar: run: |  or run: >
        m_block = re.match(r"^(\s*)run:\s*([|>])[+-]?\s*(?:#.*)?$", line)
        if m_block:
            indent = len(m_block.group(1))
            i += 1
            body_lines: list[str] = []
            while i < len(lines):
                nxt = lines[i]
                if nxt.strip() == "":
                    body_lines.append(nxt)
                    i += 1
                    continue
                # Continuation must be more indented than `run:`
                lead = re.match(r"^(\s*)", nxt)
                nxt_indent = len(lead.group(1)) if lead else 0
                if nxt_indent <= indent:
                    break
                # Preserve content; strip only full-line comments inside block
                if re.match(r"^\s*#", nxt):
                    i += 1
                    continue
                body_lines.append(nxt)
                i += 1
            bodies.append("\n".join(body_lines))
            continue

        # Scalar: run: some command
        m_scalar = re.match(r"^\s*run:\s*(.+)$", line)
        if m_scalar:
            rest = m_scalar.group(1).strip()
            # Ignore accidental match of `|` / `>` already handled
            if rest not in ("|", ">", "|+", "|-", ">+", ">-") and not rest.startswith(
                ("|", ">")
            ):
                # Drop trailing inline comment after unquoted scalar (best-effort)
                bodies.append(rest)
            i += 1
            continue

        i += 1
    return bodies


def has_direct_inputs_in_run(text: str) -> bool:
    """True iff `${{ inputs.* }}` appears inside a `run:` shell body."""
    pattern = re.compile(r"\$\{\{\s*inputs\.")
    for body in extract_run_shell_bodies(text):
        if pattern.search(body):
            return True
    return False


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
                "direct_inputs_in_run": has_direct_inputs_in_run(text),
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
