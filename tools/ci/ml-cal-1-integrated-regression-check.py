#!/usr/bin/env python3
"""Permanent ML-CAL-1 integrated regression checker.

Historical library pins are constants. Current source pins live in the
versioned contract. Safety invariants are enforced in this file and cannot
be switched off by a contract edit.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path


VERSION_1_IDENTITY_SHA256 = (
    "570374d81a866127d8017d146e173555df5318854d5944e197680cd74e921edb"
)
FORBIDDEN_INTEGRATED_DIGEST = (
    "a3a86d5b181032c6dc7ad555ee0958c80d819b169af200162fd18f8da776568b"
)
LIB = "apps/jobs/lib/ml-cal-1-g4-phase-a-retention-setup.ts"
W5_TEST = "apps/jobs/__tests__/ml-cal-1-g4-windows-path-identity.test.ts"
LAUNCHER_BIN = "tools/windows-g4-fs-inspect/bin/WindowsG4FsInspect.exe"
HISTORICAL = (
    (
        "257",
        "5ca8aa36e848e1bfc6839575dc65006feeca0621",
        "37edc14ff5a60c270beebe75751a586bdc5a514a",
        75444,
        "11134072792752f1034c1e8f4bd1217e803b231d689e427f18b0e7284d0f97ff",
    ),
    (
        "258",
        "9ce55f11f43156ba1ceb08dc57b88c48d9f9043a",
        "a82ce78206236343d59bbeacc9db3e0b2041af90",
        89980,
        "8c7b3fc99263d2f37332002ba0e46cd5f13fd24afb1693383ad427c552762d86",
    ),
    (
        "259",
        "c7ac939c666777290ab0980713b282c584f47e1e",
        "95b104abc73009c1979e237734c47f9a41d24d76",
        91345,
        "40bdf5702607f912143136ddc950f3fe17c376c839521736dc23dbc96659542e",
    ),
)
PASSIVE = (
    LIB,
    "apps/jobs/run-ml-cal-1-g4-phase-a-retention-setup.ts",
    "apps/jobs/lib/ml-cal-1-g4-phase-a-json-command.ts",
    "apps/jobs/run-ml-cal-1-g4-phase-a-json-command.ts",
    "apps/jobs/lib/ml-cal-1-g4-windows-path-identity.ts",
)
REQUIRED_PIN_PATHS = (
    "apps/jobs/__tests__/ml-cal-1-capture-binding-g3.test.ts",
    "apps/jobs/__tests__/ml-cal-1-capture-binding-integration.test.ts",
    "apps/jobs/__tests__/ml-cal-1-g4-phase-a-json-command.test.ts",
    "apps/jobs/__tests__/ml-cal-1-g4-phase-a-retention-setup.test.ts",
    "apps/jobs/__tests__/ml-cal-1-g4-phase-a-w4-conflict-gate.test.ts",
    "apps/jobs/__tests__/ml-cal-1-g4-pooler-preflight-fixture.test.ts",
    "apps/jobs/__tests__/ml-cal-1-g4-pooler-preflight-live-runner.test.ts",
    "apps/jobs/__tests__/ml-cal-1-g4-pooler-preflight-real-adapter.test.ts",
    "apps/jobs/__tests__/ml-cal-1-g4-windows-path-identity.test.ts",
    "apps/jobs/__tests__/ml-cal-1-lifecycle-binding-observer-g4.test.ts",
    "apps/jobs/__tests__/ml-cal-1-lifecycle-binding.test.ts",
    "apps/jobs/lib/ml-cal-1-g4-phase-a-json-command.ts",
    "apps/jobs/lib/ml-cal-1-g4-phase-a-retention-setup.ts",
    "apps/jobs/lib/ml-cal-1-g4-pooler-preflight-fixture.ts",
    "apps/jobs/lib/ml-cal-1-g4-pooler-preflight-live-reader.ts",
    "apps/jobs/lib/ml-cal-1-g4-pooler-preflight-live-runner.ts",
    "apps/jobs/lib/ml-cal-1-g4-pooler-preflight-real-adapter.ts",
    "apps/jobs/lib/ml-cal-1-g4-windows-path-identity.ts",
    "apps/jobs/run-ml-cal-1-g4-phase-a-json-command.ts",
    "apps/jobs/run-ml-cal-1-g4-phase-a-retention-setup.ts",
    "apps/jobs/run-ml-cal-1-g4-pooler-preflight-live.ts",
    "package-lock.json",
    "package.json",
    "tools/windows-g4-fs-inspect/.gitignore",
    "tools/windows-g4-fs-inspect/Program.cs",
    "tools/windows-g4-fs-inspect/WindowsG4FsInspect.csproj",
    "tools/windows-g4-fs-inspect/reviewed-artifacts/.gitignore",
    "tools/windows-g4-fs-inspect/reviewed-artifacts/WindowsG4FsInspect-9fc710026f177525994126673f084274e94d17615ec136a72b60d3e7a558c9b5.exe",
)
SUITES = (
    ("apps/jobs/__tests__/ml-cal-1-g4-phase-a-retention-setup.test.ts", 29),
    ("apps/jobs/__tests__/ml-cal-1-g4-phase-a-json-command.test.ts", 33),
    ("apps/jobs/__tests__/ml-cal-1-g4-phase-a-w4-conflict-gate.test.ts", 25),
    ("apps/jobs/__tests__/ml-cal-1-g4-windows-path-identity.test.ts", 39),
    ("apps/jobs/__tests__/ml-cal-1-g4-pooler-preflight-live-runner.test.ts", 37),
    ("apps/jobs/__tests__/ml-cal-1-g4-pooler-preflight-real-adapter.test.ts", 21),
    ("apps/jobs/__tests__/ml-cal-1-g4-pooler-preflight-fixture.test.ts", 34),
    ("apps/jobs/__tests__/ml-cal-1-lifecycle-binding.test.ts", 43),
    ("apps/jobs/__tests__/ml-cal-1-capture-binding-integration.test.ts", 20),
    ("apps/jobs/__tests__/ml-cal-1-capture-binding-g3.test.ts", 16),
    ("apps/jobs/__tests__/ml-cal-1-lifecycle-binding-observer-g4.test.ts", 57),
    ("apps/jobs/__tests__/ml-cal-1-capture.test.ts", 128),
    ("apps/jobs/__tests__/ml-cal-1-trusted-retrieval-lineage-g5-pre.test.ts", 71),
    ("apps/jobs/__tests__/betting-ticket-odds-refresh-v1.test.ts", 10),
    ("apps/jobs/__tests__/generic-shadow-t30-active-week-2026.test.ts", 7),
    ("apps/jobs/__tests__/generic-shadow-t30-automation-v1-scheduled-workflow.test.ts", 8),
    ("apps/jobs/__tests__/grade-bets-2026-workflow.test.ts", 7),
    ("apps/jobs/__tests__/live-odds-2026.test.ts", 30),
)
W5_CASES = (
    ("W5 helper pin + frozen caps", "records frozen caps and pin constants"),
    ("W5 helper pin + frozen caps", "verifies disposable helper pin when binary present"),
    ("PASS evidence gate", "rejects PASS with reasons / missing identity / malformed segments"),
    ("PASS evidence gate", 'rejects impossible all-"x" PASS and REFUSE_ALIAS segment PASS'),
    ("PASS evidence gate", "async+sync launchers refuse independently reproduced impossible PASS payloads"),
    ("PASS evidence gate", "async launcher refuses incomplete PASS JSON"),
    ("PASS evidence gate", "buildW5HelperEnv strips ambient G4_W5_TEST_* unless handshake enabled"),
    ("PASS evidence gate", "strips lowercase, mixed-case, and duplicate-case G4_W5_TEST_* variants"),
    ("PASS evidence gate", "async+sync launchers strip casing variants from spawn env"),
    ("W5 async launcher refusal surfaces (mocked spawn)", "does not pass maxBuffer into spawn options"),
    ("W5 async launcher refusal surfaces (mocked spawn)", "stdout/stderr overflow refuse"),
    ("W5 async launcher refusal surfaces (mocked spawn)", "timeout settles even when kill does not close"),
    ("W5 async launcher refusal surfaces (mocked spawn)", "stdin error settles"),
    ("W5 async launcher refusal surfaces (mocked spawn)", "schema/binding/nonzero refuse"),
    ("W5 async launcher refusal surfaces (mocked spawn)", "exact-cap complete PASS evidence accepted"),
    ("W5 sync launcher path (actual sync contract)", "pin mismatch does not spawnSync"),
    ("W5 sync launcher path (actual sync contract)", "schema mismatch / incomplete PASS refuse on sync path"),
    ("W5 sync launcher path (actual sync contract)", "sync timeout refuse"),
    ("W5 sync launcher path (actual sync contract)", "sync combined ceiling allows independent stream sizes under each cap"),
    ("W5 sync launcher path (actual sync contract)", "sync ENOBUFS / maxBuffer overflow refuse"),
    ("W5 sync launcher path (actual sync contract)", "sync stdout over dedicated cap refuse after collection"),
    ("W5 sync launcher path (actual sync contract)", "sync uses maxBuffer = stdoutCap + stderrCap"),
    ("Operator W5-only always BLOCKED (library/CLI/JSON)", "W5 PASS stub still leaves operator setup BLOCKED with zero mutation"),
    ("Operator W5-only always BLOCKED (library/CLI/JSON)", "W5 non-PASS: no clock, no user-root mutation"),
    ("Operator W5-only always BLOCKED (library/CLI/JSON)", "disabled: zero W5, clock, mutation"),
    ("Operator W5-only always BLOCKED (library/CLI/JSON)", "W4 refusal: no W5 inspect"),
    ("Operator W5-only always BLOCKED (library/CLI/JSON)", "temp mode skips W5 and can succeed"),
    ("Operator W5-only always BLOCKED (library/CLI/JSON)", "CLI/JSON operator BLOCKED"),
    ("unmocked non-Windows platform refusal", "refuses before spawn when the host platform is not win32"),
    ("Native W5 disposable Windows readback", "ordinary existing path PASS"),
    ("Native W5 disposable Windows readback", "missing leaf/ancestor BLOCKED"),
    ("Native W5 disposable Windows readback", "long / Unicode names"),
    ("Native W5 disposable Windows readback", "junction alias segment REFUSE (pre-existing)"),
    ("Native W5 disposable Windows readback", "dir symlink UNVERIFIED without privilege"),
    ("Native W5 disposable Windows readback", "controlled normal-directory parent swap via explicit handshake"),
    ("Native W5 disposable Windows readback", "controlled junction replacement during inspection via explicit handshake"),
    ("Native W5 disposable Windows readback", "ordinary inspection with ambient casing-variant G4_W5_TEST_* writes no handshake files"),
    ("Native W5 disposable Windows readback", "case-sensitive parent UNVERIFIED without privileged fixture"),
    ("Positive mutation recorder control", "temp success records mutations"),
)
LINUX_COUNTERS = (0, 28, 10, 10)
LINUX_REASONS = {
    "helper exe absent or non-Windows": 1,
    "native helper unavailable": 8,
    "case-sensitive directory fixture requires privileged fsutil; not elevated in this task": 1,
}
DOC_EXACT = frozenset(
    {"README.md", "SEASON_STATUS.md", "WORKFLOW_DISABLE_REPORT.md"}
)
DOC_PREFIXES = ("docs/", ".cursor/rules/")
OUTPUT_LIMIT = 65536
NAME_LIMIT = 512
ANCESTOR_LIMIT = 1024
MESSAGE_LIMIT = 4000
ASSERTION_PRINT_LIMIT = 40
MESSAGE_PRINT_LIMIT = 3
LOG_SCAN_LIMIT = 1_000_000
EXIT_RESERVE = len("\ndiagnostic_step_exit=1\n")
FOOTER_RESERVE = 4608
COV_LINE = re.compile(
    r"^\s*\[W5 coverage\] native=(\d+) mocked=(\d+) skipped=(\d+) unverified=(\d+)\s*$"
)
WARN_LINE = re.compile(r"^\s*\[W5\] SKIPPED/UNVERIFIED:\s*(.*?)\s*$")
SOURCE_SECRETISH = re.compile(
    r"(?i)(api[_-]?key\s*[:=]\s*\S+|password\s*[:=]\s*\S+|bearer\s+[a-z0-9._-]{8,}|"
    r"ghp_[A-Za-z0-9]+|(DATABASE_URL|DIRECT_URL)\s*[:=]\s*\S+)"
)
DIAGNOSTIC_SECRETISH = (
    (
        re.compile(r"(?i)(?<![A-Za-z0-9_])authorization\s*[:=]\s*\S+(?:\s+\S+)?"),
        "authorization=[REDACTED]",
    ),
    (
        re.compile(r"(?i)([a-z][a-z0-9+.-]*://)[^\s/@:]+:[^\s/@]+@"),
        r"\1[REDACTED]@",
    ),
    (
        re.compile(
            r"(?i)(?<![A-Za-z0-9_])(DATABASE_URL|DIRECT_URL|SUPABASE_DB_URL|SHADOW_DATABASE_URL)\s*[:=]\s*\S+"
        ),
        r"\1=[REDACTED]",
    ),
    (
        re.compile(
            r"(?i)(?<![A-Za-z0-9_])("
            r"access[_-]?token|refresh[_-]?token|session[_-]?token|auth[_-]?token|"
            r"client[_-]?secret|private[_-]?key|api[_-]?key|password|passwd|"
            r"credentials|credential|token|secret"
            r")\s*[:=]\s*\S+"
        ),
        r"\1=[REDACTED]",
    ),
    (re.compile(r"(?i)bearer\s+\S+"), "bearer [REDACTED]"),
    (re.compile(r"github_pat_[A-Za-z0-9_]+"), "[REDACTED]"),
    (re.compile(r"(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]+"), "[REDACTED]"),
)


def git_bytes(repo, spec):
    proc = subprocess.run(
        ["git", "-C", repo, "cat-file", "blob", spec],
        capture_output=True,
    )
    if proc.returncode != 0:
        return None
    return proc.stdout


def git_text(repo, args):
    proc = subprocess.run(
        ["git", "-C", repo, *args],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        return None
    return proc.stdout.strip()


def git_type(repo, rev):
    return git_text(repo, ["cat-file", "-t", rev])


def assess_historical_blob(data, oid, size, digest, actual_oid, label):
    if data is None or actual_oid is None:
        return [f"historical_object_missing {label}"]
    errors = []
    actual_digest = hashlib.sha256(data).hexdigest()
    if actual_digest == FORBIDDEN_INTEGRATED_DIGEST:
        errors.append(f"historical_{label}_substituted_integrated_digest")
    if actual_oid != oid or len(data) != size or actual_digest != digest:
        errors.append(f"historical_pin_mismatch {label}")
    return errors


def verify_historical(repo):
    errors = []
    for label, commit, oid, size, digest in HISTORICAL:
        if git_type(repo, commit) != "commit":
            errors.append(f"historical_object_missing {label}")
            continue
        spec = f"{commit}:{LIB}"
        errors.extend(
            assess_historical_blob(
                git_bytes(repo, spec),
                oid,
                size,
                digest,
                git_text(repo, ["rev-parse", spec]),
                label,
            )
        )
    return errors


def default_contract_path():
    return Path(__file__).with_name("ml-cal-1-integrated-regression-contract-v1.json")


def load_contract(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def contract_shape_errors(contract):
    errors = []
    if not isinstance(contract, dict):
        return ["contract_malformed"]
    if contract.get("inventory_contract_version") != 1:
        errors.append("inventory_contract_version_unsupported")
    if contract.get("identity_sha256") != VERSION_1_IDENTITY_SHA256:
        errors.append("contract_identity_reference_mismatch")
    pins = contract.get("pins")
    if not isinstance(pins, dict):
        errors.append("contract_pins_missing")
        return errors
    present = set(pins)
    required = set(REQUIRED_PIN_PATHS)
    for path in sorted(required - present):
        errors.append(f"contract_pin_missing {path}")
    for path in sorted(present - required):
        errors.append(f"contract_pin_unexpected {path}")
    for path, pin in pins.items():
        if not isinstance(pin, dict):
            errors.append(f"contract_pin_malformed {path}")
            continue
        if not isinstance(pin.get("oid"), str) or not isinstance(pin.get("sha256"), str):
            errors.append(f"contract_pin_malformed {path}")
        if not isinstance(pin.get("size"), int):
            errors.append(f"contract_pin_malformed {path}")
    return errors


def verify_pins(repo, contract, rev):
    errors = []
    pins = contract.get("pins")
    if not isinstance(pins, dict):
        return ["contract_pins_missing"]
    for path in REQUIRED_PIN_PATHS:
        pin = pins.get(path)
        if not isinstance(pin, dict):
            continue
        spec = f"{rev}:{path}"
        data = git_bytes(repo, spec)
        actual = git_text(repo, ["rev-parse", spec])
        if data is None or actual is None:
            errors.append(f"current_pin_drift {path}")
            continue
        digest = hashlib.sha256(data).hexdigest()
        if actual != pin.get("oid") or len(data) != pin.get("size") or digest != pin.get("sha256"):
            errors.append(f"current_pin_drift {path}")
    return errors


def launcher_errors(repo, revs):
    errors = []
    seen = set()
    for rev in revs:
        if not rev or rev in seen:
            continue
        seen.add(rev)
        proc = subprocess.run(
            ["git", "-C", repo, "cat-file", "-e", f"{rev}:{LAUNCHER_BIN}"],
            capture_output=True,
        )
        if proc.returncode == 0:
            errors.append(f"launcher_bin_present_in_source_head {rev}")
    return errors


def safety_errors(repo, rev):
    errors = []
    library = git_bytes(repo, f"{rev}:{LIB}")
    if library is None:
        errors.append("missing_source_blob integrated_library")
    else:
        text = library.decode("utf-8")
        if "operator_mode_refused_in_this_build" not in text:
            errors.append("operator_refusal_missing")
        if "evaluateOperatorWindowsGatesAfterW4" in text:
            errors.append("operator_gate_call_present")
        if "scanPhaseAW4PreMutationConflicts" not in text:
            errors.append("w4_pre_mutation_scan_missing")
        for flag in ("liveAccepted: false", "approved: false", "deployedPoolerProof: false"):
            if flag not in text:
                errors.append(f"approval_flag_missing {flag}")
        if "ML_CAL_1_G4_PHASE_A_DESIGN_SHA256" not in text:
            errors.append("design_constant_missing")
    w5 = git_bytes(repo, f"{rev}:{W5_TEST}")
    if w5 is None:
        errors.append("missing_source_blob w5_tests")
    else:
        w5_text = w5.decode("utf-8")
        if "operator_mode_refused_in_this_build" not in w5_text:
            errors.append("w5_operator_refusal_assertion_missing")
        if "w4_pre_mutation_conflict" not in w5_text:
            errors.append("w5_temp_w4_conflict_assertion_missing")
    for rel in PASSIVE:
        data = git_bytes(repo, f"{rev}:{rel}")
        if data is None:
            errors.append(f"missing_source_blob {rel}")
            continue
        text = data.decode("utf-8")
        if (
            "new PrismaClient" in text
            or "process.env.DATABASE_URL" in text
            or "process.env.DIRECT_URL" in text
        ):
            errors.append(f"passive_violation {rel}")
        if SOURCE_SECRETISH.search(text):
            errors.append(f"secretish {rel}")
    return errors


def verify_candidate(repo, contract, rev, head=""):
    errors = contract_shape_errors(contract)
    errors.extend(verify_pins(repo, contract, rev))
    errors.extend(safety_errors(repo, rev))
    errors.extend(launcher_errors(repo, [rev, head]))
    return errors


def normalize_rel(path):
    return str(path).replace("\\", "/").lstrip("./")


def is_documentation_only(path):
    rel = normalize_rel(path)
    if rel in DOC_EXACT:
        return True
    return any(rel.startswith(prefix) for prefix in DOC_PREFIXES)


def scope_decision(paths):
    if paths is None:
        return "run", "diff_unavailable"
    if len(paths) == 0:
        return "run", "diff_empty"
    if all(is_documentation_only(path) for path in paths):
        return "skip", "documentation_only"
    return "run", "relevant_paths"


def changed_paths(repo, base, head):
    if not base or not head:
        return None
    for args in (
        ["diff", "--name-only", f"{base}...{head}"],
        ["diff", "--name-only", base, head],
    ):
        proc = subprocess.run(
            ["git", "-C", repo, *args],
            capture_output=True,
            text=True,
        )
        if proc.returncode == 0:
            return [normalize_rel(line) for line in proc.stdout.splitlines() if line.strip()]
    return None


def suite_path_from_result(result):
    raw = result.get("name") or result.get("testFilePath") or ""
    norm = normalize_rel(raw)
    marker = "apps/jobs/__tests__/"
    index = norm.find(marker)
    if index < 0:
        return None
    return norm[index:]


def identity_sort_key(item):
    return (
        item["suite_path"].encode("utf-8"),
        tuple(part.encode("utf-8") for part in item["ancestorTitles"]),
        item["title"].encode("utf-8"),
    )


def canonical_identity_payload(identities):
    ordered = sorted(identities, key=identity_sort_key)
    encoded = json.dumps(ordered, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if encoded.startswith(b"\xef\xbb\xbf") or encoded.endswith(b"\n"):
        raise RuntimeError("canonical identity payload must not carry a BOM or trailing newline")
    return encoded


def identity_sha256(identities):
    return hashlib.sha256(canonical_identity_payload(identities)).hexdigest()


def collect_identities(data):
    errors = []
    identities = []
    if not isinstance(data, dict):
        return identities, ["jest_json_malformed shape"]
    results = data.get("testResults")
    if not isinstance(results, list):
        return identities, ["jest_test_results_not_list"]
    for result in results:
        if not isinstance(result, dict):
            errors.append("jest_result_malformed")
            continue
        suite = suite_path_from_result(result)
        if suite is None:
            errors.append(f"suite_path_unrecognized {result.get('name')}")
            continue
        rows = result.get("assertionResults")
        if not isinstance(rows, list):
            errors.append(f"assertions_missing {suite}")
            continue
        for row in rows:
            if not isinstance(row, dict):
                errors.append(f"assertion_identity_malformed {suite}")
                continue
            ancestors = row.get("ancestorTitles")
            title = row.get("title")
            if not isinstance(ancestors, list) or not all(isinstance(item, str) for item in ancestors):
                errors.append(f"assertion_identity_malformed {suite}")
                continue
            if not isinstance(title, str) or title == "":
                errors.append(f"assertion_title_missing {suite}")
                continue
            if len(ancestors) == 0:
                errors.append(f"assertion_ancestors_missing {suite} {title}")
                continue
            identities.append(
                {"suite_path": suite, "ancestorTitles": list(ancestors), "title": title}
            )
    keys = [(item["suite_path"], tuple(item["ancestorTitles"]), item["title"]) for item in identities]
    counts = Counter(keys)
    for key, count in counts.items():
        if count != 1:
            errors.append(f"assertion_identity_duplicate {key[0]} {key[2]} x{count}")
    return identities, errors


def classify_data(data, log_text):
    errors = []
    digest = None
    count = None
    if not isinstance(data, dict):
        return ["jest_json_malformed shape"], digest, count
    for key in (
        "numFailedTestSuites",
        "numFailedTests",
        "numPassedTestSuites",
        "numPassedTests",
        "numPendingTestSuites",
        "numPendingTests",
        "numTodoTests",
        "numTotalTestSuites",
        "numTotalTests",
        "testResults",
    ):
        if key not in data:
            errors.append(f"jest_field_missing {key}")
    if errors:
        return errors, digest, count
    if data["numTotalTestSuites"] != 18 or data["numPassedTestSuites"] != 18:
        errors.append(
            f"suite_count total={data['numTotalTestSuites']} passed={data['numPassedTestSuites']}"
        )
    if data["numFailedTestSuites"] != 0 or data["numFailedTests"] != 0:
        errors.append("failed_tests_present")
    if data["numPendingTests"] != 0 or data["numPendingTestSuites"] != 0 or data["numTodoTests"] != 0:
        errors.append("pending_or_todo_present")
    if data["numPassedTests"] != 615 or data["numTotalTests"] != 615:
        errors.append(
            f"assertion_count passed={data['numPassedTests']} total={data['numTotalTests']}"
        )
    identities, identity_errors = collect_identities(data)
    errors.extend(identity_errors)
    if identities and not any(error.startswith("assertion_identity_duplicate") for error in identity_errors):
        digest = identity_sha256(identities)
        count = len(identities)
        if digest != VERSION_1_IDENTITY_SHA256 or count != 615:
            errors.append(
                f"identity_sha256_mismatch observed={digest} count={count}"
            )
    elif not identities:
        errors.append("identity_sha256_mismatch observed=UNAVAILABLE count=0")
    matched = {rel: [] for rel, _expected in SUITES}
    results = data.get("testResults")
    if isinstance(results, list):
        for result in results:
            if not isinstance(result, dict):
                continue
            suite = suite_path_from_result(result)
            if suite not in matched:
                errors.append(f"unexpected_suite {suite}")
                continue
            matched[suite].append(result)
            if result.get("status") != "passed":
                errors.append(f"suite_not_passed {suite} {result.get('status')}")
    for rel, expected in SUITES:
        hits = matched[rel]
        if len(hits) != 1:
            errors.append(f"suite_membership {rel} count={len(hits)}")
            continue
        rows = hits[0].get("assertionResults")
        if not isinstance(rows, list):
            errors.append(f"assertions_missing {rel}")
            continue
        if len(rows) != expected:
            errors.append(f"assertion_count {rel} {len(rows)} != {expected}")
        if rel.endswith("ml-cal-1-g4-windows-path-identity.test.ts"):
            actual_cases = []
            for row in rows:
                ancestors = row.get("ancestorTitles")
                title = row.get("title")
                if isinstance(ancestors, list) and ancestors and isinstance(title, str):
                    actual_cases.append((ancestors[-1], title))
            if actual_cases != list(W5_CASES):
                errors.append("w5_case_inventory_mismatch")
    errors.extend(coverage_errors(log_text))
    return errors, digest, count


def coverage_errors(log_text):
    errors = []
    cov_hits = []
    for line in log_text.splitlines():
        if not line.lstrip().startswith("[W5 coverage]"):
            continue
        match = COV_LINE.fullmatch(line)
        if match is None:
            errors.append(f"coverage_line_malformed {line.strip()}")
            continue
        cov_hits.append(tuple(int(part) for part in match.groups()))
    if len(cov_hits) != 1:
        errors.append(f"coverage_line_count {len(cov_hits)}")
        return errors
    native, mocked, skipped, unverified = cov_hits[0]
    if native != 0:
        errors.append(f"native_coverage_reported_as_pass native={native}")
    if (native, mocked, skipped, unverified) != LINUX_COUNTERS:
        errors.append(
            "linux_counters expected native=0 mocked=28 skipped=10 unverified=10 "
            f"actual native={native} mocked={mocked} skipped={skipped} unverified={unverified}"
        )
    reasons = []
    for line in log_text.splitlines():
        if not line.lstrip().startswith("[W5] SKIPPED/UNVERIFIED:"):
            continue
        match = WARN_LINE.fullmatch(line)
        if match is None:
            errors.append(f"unavailable_reason_malformed {line.strip()}")
            continue
        reasons.append(match.group(1))
    if skipped != unverified:
        errors.append(f"counter_inconsistent skipped={skipped} unverified={unverified}")
    if len(reasons) != unverified:
        errors.append(f"reason_multiplicity warnings={len(reasons)} unverified={unverified}")
    if Counter(reasons) != Counter(LINUX_REASONS):
        errors.append(f"linux_reasons actual={dict(Counter(reasons))}")
    return errors


def sanitize(text):
    value = str(text)
    for pattern, replacement in DIAGNOSTIC_SECRETISH:
        value = pattern.sub(replacement, value)
    return value


def bound_text(text, limit):
    value = sanitize(text)
    if len(value) <= limit:
        return value
    return value[:limit] + f"\n[truncated after {limit} characters]"


def bound_line(text, limit):
    value = sanitize(text).replace("\r", " ").replace("\n", " ")
    if len(value) <= limit:
        return value
    return value[:limit] + f" [truncated after {limit} characters]"


class Budget:
    def __init__(self):
        self.lines = []
        self.size = 0
        self.stopped = False
        self.omitted = 0

    def _addition(self, piece):
        return len(piece) + (1 if self.lines else 0)

    def add(self, text):
        piece = str(text)
        if self.stopped:
            self.omitted += 1
            return False
        if self.size + self._addition(piece) + FOOTER_RESERVE > OUTPUT_LIMIT:
            self.stopped = True
            self.omitted += 1
            return False
        self.lines.append(piece)
        self.size += self._addition(piece)
        return True

    def add_final(self, text):
        piece = str(text)
        if self.size + self._addition(piece) + EXIT_RESERVE > OUTPUT_LIMIT:
            self.stopped = True
            self.omitted += 1
            return False
        self.lines.append(piece)
        self.size += self._addition(piece)
        return True


def bound_ancestors(items):
    if not isinstance(items, list):
        return bound_line(items, ANCESTOR_LIMIT)
    parts = []
    used = 0
    omitted = 0
    for index, item in enumerate(items):
        full = sanitize(item).replace("\r", " ").replace("\n", " ")
        piece = full if len(full) <= NAME_LIMIT else full[:NAME_LIMIT] + f" [truncated after {NAME_LIMIT} characters]"
        extra = len(piece) if not parts else len(" > ") + len(piece)
        if used + extra > ANCESTOR_LIMIT:
            omitted = len(items) - index
            break
        parts.append(piece)
        used += extra
    text = " > ".join(parts)
    if omitted:
        text += f" [truncated after {ANCESTOR_LIMIT} characters; omitted_ancestors={omitted}]"
    return text


def finish(budget, extra):
    for line in extra:
        budget.add_final(line)
    if budget.stopped:
        omitted = budget.omitted
        budget.add_final("diagnostic_output_truncated=true")
        budget.add_final(f"omitted_diagnostic_records={omitted}")
    return budget.lines


def coverage_summary(path):
    log_path = Path(path)
    if not log_path.is_file():
        return ["coverage_summary_unavailable reason=log_missing"]
    try:
        with log_path.open("rb") as handle:
            data = handle.read(LOG_SCAN_LIMIT)
            more = handle.read(1)
    except OSError as exc:
        return [f"coverage_summary_unavailable reason=log_unreadable {exc.__class__.__name__}"]
    lines = ["coverage_scan_bounded"] if more else []
    found = 0
    for line in data.decode("utf-8", errors="replace").splitlines():
        if not line.lstrip().startswith("[W5 coverage]"):
            continue
        lines.append(bound_line(line.strip(), NAME_LIMIT))
        found += 1
        if found >= 5:
            lines.append("additional_coverage_lines_omitted=true")
            break
    if found == 0:
        lines.append("coverage_summary_absent")
    return lines


def diagnose(json_path, log_path):
    budget = Budget()
    budget.add("underlying_job_remains_failed=true")
    path = Path(json_path)
    extra = ["diagnostic_step_exit=1"]
    if not path.is_file():
        budget.add("diagnostics=UNAVAILABLE reason=jest_json_missing")
        return 1, "\n".join(finish(budget, extra)) + "\n"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        budget.add(f"diagnostics=UNAVAILABLE reason=jest_json_malformed {exc.__class__.__name__}")
        return 1, "\n".join(finish(budget, extra)) + "\n"
    if not isinstance(data, dict):
        budget.add("diagnostics=UNAVAILABLE reason=jest_json_malformed shape")
        return 1, "\n".join(finish(budget, extra)) + "\n"
    failed_assertions = 0
    printed = 0
    results = data.get("testResults")
    if not isinstance(results, list):
        results = []
    for result in results:
        rows = result.get("assertionResults") if isinstance(result, dict) else None
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict) or row.get("status") == "passed":
                continue
            failed_assertions += 1
            if printed >= ASSERTION_PRINT_LIMIT:
                continue
            messages = row.get("failureMessages") if isinstance(row.get("failureMessages"), list) else []
            shown = []
            for item in messages:
                if len(shown) >= MESSAGE_PRINT_LIMIT:
                    shown.append("additional_failure_messages_omitted")
                    break
                shown.append(bound_line(item, MESSAGE_LIMIT))
            line = (
                f"status={bound_line(row.get('status', ''), NAME_LIMIT)} "
                f"ancestors={bound_ancestors(row.get('ancestorTitles'))} "
                f"title={bound_line(row.get('title', ''), NAME_LIMIT)} "
                f"messages={' | '.join(shown)}"
            )
            if budget.add(line):
                printed += 1
    omitted = failed_assertions - min(printed, ASSERTION_PRINT_LIMIT)
    if failed_assertions > ASSERTION_PRINT_LIMIT:
        omitted = failed_assertions - ASSERTION_PRINT_LIMIT
    report = [f"diagnostics=REPORTED failed_assertions={failed_assertions}"]
    if omitted > 0:
        report.append(f"additional_failed_assertions_omitted={omitted}")
    if failed_assertions == 0:
        report.append("job_failure_outside_jest_assertions=true")
    report.extend(coverage_summary(log_path))
    report.extend(extra)
    return 1, "\n".join(finish(budget, report)) + "\n"


def write_github_output(decision):
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(f"decision={decision}\n")


def command_scope(args):
    paths = changed_paths(args.repo, args.base, args.head)
    decision, reason = scope_decision(paths)
    if decision == "skip":
        print("regression=SKIPPED reason=documentation_only")
    else:
        print(f"regression=RUN reason={reason}")
    write_github_output(decision)
    return 0


def command_provenance(args):
    errors = verify_historical(args.repo)
    for error in errors:
        print(f"historical_error {error}")
    if errors:
        print("historical_provenance=FAIL")
        return 1
    print("historical_provenance=PASS")
    return 0


def command_candidate(args):
    contract = load_contract(args.contract)
    errors = verify_candidate(args.repo, contract, args.rev, args.head)
    for error in errors:
        print(f"candidate_error {error}")
    if errors:
        print("candidate_verification=FAIL")
        return 1
    print("candidate_verification=PASS")
    return 0


def command_classify(args):
    json_path = Path(args.json)
    log_path = Path(args.log)
    if not json_path.is_file():
        print("classification=FAIL")
        print("identity_contract_version=1")
        print("identity_count=0")
        print("identity_sha256=UNAVAILABLE")
        print("jest_json_missing")
        return 1
    try:
        data = json.loads(json_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print("classification=FAIL")
        print("identity_contract_version=1")
        print("identity_count=0")
        print("identity_sha256=UNAVAILABLE")
        print(f"jest_json_malformed {exc.__class__.__name__}")
        return 1
    log_text = log_path.read_text(encoding="utf-8", errors="replace") if log_path.is_file() else ""
    if not log_path.is_file():
        errors = ["jest_log_missing"]
        extra, digest, count = classify_data(data, "")
        errors.extend(extra)
    else:
        errors, digest, count = classify_data(data, log_text)
    print("classification=" + ("PASS" if not errors else "FAIL"))
    print("identity_contract_version=1")
    print(f"identity_count={count if count is not None else 0}")
    print(f"identity_sha256={digest if digest is not None else 'UNAVAILABLE'}")
    for error in errors:
        print(f"classification_error {error}")
    if not errors:
        print("linux_counters native=0 mocked=28 skipped=10 unverified=10")
        print("native_pass_not_claimed=true")
        return 0
    return 1


def command_diagnose(args):
    code, text = diagnose(args.json, args.log)
    sys.stdout.write(text)
    return code


def build_parser():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    scope = sub.add_parser("scope")
    scope.add_argument("--repo", required=True)
    scope.add_argument("--base", required=True)
    scope.add_argument("--head", required=True)
    scope.set_defaults(func=command_scope)
    provenance = sub.add_parser("provenance")
    provenance.add_argument("--repo", required=True)
    provenance.set_defaults(func=command_provenance)
    candidate = sub.add_parser("candidate")
    candidate.add_argument("--repo", required=True)
    candidate.add_argument("--rev", default="HEAD")
    candidate.add_argument("--head", default="")
    candidate.add_argument("--contract", default=str(default_contract_path()))
    candidate.set_defaults(func=command_candidate)
    classify = sub.add_parser("classify")
    classify.add_argument("--json", required=True)
    classify.add_argument("--log", required=True)
    classify.set_defaults(func=command_classify)
    diagnostic = sub.add_parser("diagnose")
    diagnostic.add_argument("--json", required=True)
    diagnostic.add_argument("--log", required=True)
    diagnostic.set_defaults(func=command_diagnose)
    return parser


def main(argv):
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
