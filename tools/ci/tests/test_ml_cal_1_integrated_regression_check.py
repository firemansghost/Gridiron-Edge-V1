"""Offline acceptance tests for the permanent integrated regression checker."""

import hashlib
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
CHECKER_PATH = ROOT / "tools" / "ci" / "ml-cal-1-integrated-regression-check.py"
SPEC = importlib.util.spec_from_file_location("ml_cal_1_integrated_regression_check", CHECKER_PATH)
checker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(checker)

FROZEN_DIGEST = "570374d81a866127d8017d146e173555df5318854d5944e197680cd74e921edb"
LIB = checker.LIB


def git(repo, *args, check=True):
    proc = subprocess.run(
        ["git", "-C", repo, *args],
        capture_output=True,
        text=True,
    )
    if check and proc.returncode != 0:
        raise AssertionError(proc.stderr or proc.stdout)
    return proc


def commit_file(repo, path, content):
    destination = Path(repo) / path
    destination.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(content, bytes):
        destination.write_bytes(content)
    else:
        destination.write_bytes(content.encode("utf-8"))
    git(repo, "add", "--", path)
    git(
        repo,
        "-c",
        "user.name=regression-test",
        "-c",
        "user.email=regression-test@example.invalid",
        "commit",
        "-m",
        "fixture",
    )


def init_repo():
    directory = tempfile.TemporaryDirectory()
    git(directory.name, "init", "-q")
    return directory


def accepted_log():
    lines = ["[W5 coverage] native=0 mocked=28 skipped=10 unverified=10"]
    lines.append("[W5] SKIPPED/UNVERIFIED: helper exe absent or non-Windows")
    lines.extend(["[W5] SKIPPED/UNVERIFIED: native helper unavailable"] * 8)
    lines.append(
        "[W5] SKIPPED/UNVERIFIED: case-sensitive directory fixture requires privileged fsutil; not elevated in this task"
    )
    return "\n".join(lines) + "\n"


class CheckerAcceptanceTest(unittest.TestCase):
    def test_version_1_digest_constant_is_the_frozen_reference(self):
        self.assertEqual(checker.VERSION_1_IDENTITY_SHA256, FROZEN_DIGEST)
        self.assertEqual(len(checker.W5_CASES), 39)
        self.assertEqual(sum(count for _path, count in checker.SUITES), 615)
        self.assertEqual(len(checker.SUITES), 18)

    def test_historical_provenance_passes_on_accepted_repository(self):
        errors = checker.verify_historical(ROOT)
        self.assertEqual(errors, [])

    def test_missing_historical_object_fails(self):
        directory = init_repo()
        self.addCleanup(directory.cleanup)
        commit_file(directory.name, "README.md", "fixture\n")
        errors = checker.verify_historical(directory.name)
        self.assertIn("historical_object_missing 257", errors)

    def test_substituted_historical_blob_fails(self):
        integrated = checker.git_bytes(ROOT, f"HEAD:{LIB}")
        self.assertEqual(hashlib.sha256(integrated).hexdigest(), checker.FORBIDDEN_INTEGRATED_DIGEST)
        _label, _commit, oid, size, digest = checker.HISTORICAL[0]
        errors = checker.assess_historical_blob(
            integrated,
            oid,
            size,
            digest,
            "not-the-historical-oid",
            "257",
        )
        self.assertIn("historical_257_substituted_integrated_digest", errors)
        self.assertIn("historical_pin_mismatch 257", errors)

    def test_production_source_pins_and_safety_pass(self):
        contract = checker.load_contract(checker.default_contract_path())
        errors = checker.verify_candidate(ROOT, contract, "HEAD")
        self.assertEqual(errors, [])

    def test_source_pin_drift_fails(self):
        directory = init_repo()
        self.addCleanup(directory.cleanup)
        commit_file(directory.name, LIB, "export const drifted = true;\n")
        contract = checker.load_contract(checker.default_contract_path())
        errors = checker.verify_pins(directory.name, contract, "HEAD")
        self.assertIn(f"current_pin_drift {LIB}", errors)

    def test_reviewed_pin_rotation_passes_pin_check_only(self):
        directory = init_repo()
        self.addCleanup(directory.cleanup)
        content = "export const rotated = true;\n"
        commit_file(directory.name, "package.json", content)
        data = (Path(directory.name) / "package.json").read_bytes()
        oid = checker.git_text(directory.name, ["rev-parse", "HEAD:package.json"])
        contract = checker.load_contract(checker.default_contract_path())
        contract["pins"]["package.json"] = {
            "oid": oid,
            "size": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        }
        errors = checker.verify_pins(directory.name, contract, "HEAD")
        self.assertNotIn("current_pin_drift package.json", errors)

    def test_contract_cannot_disable_operator_refusal(self):
        directory = init_repo()
        self.addCleanup(directory.cleanup)
        content = "export const operator_removed = true;\n"
        commit_file(directory.name, LIB, content)
        data = Path(directory.name, LIB).read_bytes()
        oid = checker.git_text(directory.name, ["rev-parse", f"HEAD:{LIB}"])
        contract = checker.load_contract(checker.default_contract_path())
        contract["disable_operator_refusal"] = True
        contract["pins"][LIB] = {
            "oid": oid,
            "size": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        }
        errors = checker.verify_candidate(directory.name, contract, "HEAD")
        self.assertIn("operator_refusal_missing", errors)
        self.assertNotIn(f"current_pin_drift {LIB}", errors)

    def test_launcher_presence_fails(self):
        directory = init_repo()
        self.addCleanup(directory.cleanup)
        commit_file(directory.name, checker.LAUNCHER_BIN, b"not-a-real-helper")
        errors = checker.launcher_errors(directory.name, ["HEAD"])
        self.assertTrue(any(error.startswith("launcher_bin_present_in_source_head") for error in errors))

    def test_renamed_assertion_changes_digest_without_changing_count(self):
        original = [
            {"suite_path": "apps/jobs/__tests__/example.test.ts", "ancestorTitles": ["group"], "title": "alpha"},
            {"suite_path": "apps/jobs/__tests__/example.test.ts", "ancestorTitles": ["group"], "title": "beta"},
        ]
        renamed = [
            {"suite_path": "apps/jobs/__tests__/example.test.ts", "ancestorTitles": ["group"], "title": "alpha"},
            {"suite_path": "apps/jobs/__tests__/example.test.ts", "ancestorTitles": ["group"], "title": "beta renamed"},
        ]
        self.assertEqual(len(original), len(renamed))
        self.assertNotEqual(checker.identity_sha256(original), checker.identity_sha256(renamed))

    def test_duplicate_identity_is_rejected(self):
        data = {
            "testResults": [
                {
                    "name": "apps/jobs/__tests__/example.test.ts",
                    "status": "passed",
                    "assertionResults": [
                        {"status": "passed", "ancestorTitles": ["group"], "title": "same"},
                        {"status": "passed", "ancestorTitles": ["group"], "title": "same"},
                    ],
                }
            ]
        }
        _identities, errors = checker.collect_identities(data)
        self.assertTrue(any(error.startswith("assertion_identity_duplicate") for error in errors))

    def test_missing_suite_fails_membership(self):
        data = empty_jest()
        errors, _digest, _count = checker.classify_data(data, accepted_log())
        self.assertTrue(any(error.startswith("suite_membership") for error in errors))

    def test_unexpected_suite_fails(self):
        data = empty_jest()
        data["testResults"] = [
            {
                "name": "apps/jobs/__tests__/not-in-inventory.test.ts",
                "status": "passed",
                "assertionResults": [],
            }
        ]
        errors, _digest, _count = checker.classify_data(data, accepted_log())
        self.assertTrue(any(error.startswith("unexpected_suite") for error in errors))

    def test_wrong_linux_counters_and_native_pass_fail(self):
        log = "\n".join(
            [
                "[W5 coverage] native=1 mocked=28 skipped=10 unverified=10",
                "[W5] SKIPPED/UNVERIFIED: helper exe absent or non-Windows",
                *["[W5] SKIPPED/UNVERIFIED: native helper unavailable"] * 8,
                "[W5] SKIPPED/UNVERIFIED: wrong reason",
            ]
        ) + "\n"
        errors = checker.coverage_errors(log)
        self.assertTrue(any(error.startswith("native_coverage_reported_as_pass") for error in errors))
        self.assertTrue(any(error.startswith("linux_counters") for error in errors))
        self.assertTrue(any(error.startswith("linux_reasons") for error in errors))

    def test_accepted_linux_coverage_has_no_errors(self):
        self.assertEqual(checker.coverage_errors(accepted_log()), [])

    def test_malformed_and_missing_jest_json_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            bad = Path(directory) / "bad.json"
            missing = Path(directory) / "missing.json"
            log = Path(directory) / "jest-integrated.log"
            bad.write_text("{", encoding="utf-8")
            log.write_text("", encoding="utf-8")
            code, text = checker.diagnose(bad, log)
            self.assertEqual(code, 1)
            self.assertIn("diagnostics=UNAVAILABLE reason=jest_json_malformed", text)
            self.assertNotIn("Expecting", text)
            code, text = checker.diagnose(missing, log)
            self.assertEqual(code, 1)
            self.assertIn("diagnostics=UNAVAILABLE reason=jest_json_missing", text)

    def test_diagnostic_redacts_secrets_and_bounds_failures(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "jest-integrated.json"
            log = Path(directory) / "jest-integrated.log"
            rows = []
            for index in range(50):
                rows.append(
                    {
                        "status": "failed",
                        "ancestorTitles": ["group"],
                        "title": f"case {index}",
                        "failureMessages": ["token=secretvalue ghp_abcdefghijklmnopqrstuvwxyz"],
                    }
                )
            path.write_text(
                json.dumps({"testResults": [{"name": "apps/jobs/__tests__/example.test.ts", "assertionResults": rows}]}),
                encoding="utf-8",
            )
            log.write_text(accepted_log(), encoding="utf-8")
            code, text = checker.diagnose(path, log)
            self.assertEqual(code, 1)
            self.assertNotIn("secretvalue", text)
            self.assertNotIn("ghp_abcdefghijklmnopqrstuvwxyz", text)
            self.assertIn("[REDACTED]", text)
            self.assertIn("additional_failed_assertions_omitted=10", text)
            self.assertIn("diagnostic_step_exit=1", text)
            self.assertIn("underlying_job_remains_failed=true", text)

    def test_output_budget_exhaustion_is_labeled(self):
        budget = checker.Budget()
        piece = "x" * 4000
        while budget.add(piece):
            pass
        text = "\n".join(checker.finish(budget, ["diagnostic_step_exit=1"]))
        self.assertIn("diagnostic_output_truncated=true", text)
        self.assertIn("omitted_diagnostic_records=", text)
        self.assertLessEqual(len(text.encode("utf-8")), checker.OUTPUT_LIMIT + 64)

    def test_leading_dot_paths_keep_documentation_scope(self):
        self.assertEqual(
            checker.normalize_rel("./.cursor/rules/example.md"),
            ".cursor/rules/example.md",
        )
        self.assertEqual(
            checker.normalize_rel(".\\.cursor\\rules\\example.md"),
            ".cursor/rules/example.md",
        )
        self.assertEqual(checker.normalize_rel("../docs/example.md"), "../docs/example.md")
        skips = [
            ".cursor/rules/example.md",
            "./.cursor/rules/example.md",
            "docs/example.md",
            "README.md",
        ]
        for sample in skips:
            self.assertEqual(
                checker.scope_decision([sample]),
                ("skip", "documentation_only"),
                sample,
            )
        runs = [
            ".github/workflows/example.yml",
            "apps/web/lib/core-v1-moneyline.ts",
            "../docs/example.md",
        ]
        for sample in runs:
            self.assertEqual(
                checker.scope_decision([sample]),
                ("run", "relevant_paths"),
                sample,
            )
        self.assertEqual(checker.scope_decision(None), ("run", "diff_unavailable"))

    def test_relevant_paths_run_and_documentation_skips(self):
        samples = [
            "apps/web/lib/core-v1-moneyline.ts",
            "apps/web/lib/core-v2-spread.ts",
            "apps/web/lib/data/core_v1_hfa_config.json",
            "package-lock.json",
            "package.json",
            "jest.config.js",
            "apps/jobs/tsconfig.test.json",
            ".github/workflows/grade-bets-2026-manual.yml",
            "research/generic-shadow/GENERIC_SHADOW_T30_ACTIVE_WEEK_2026.json",
            "tools/ci/ml-cal-1-integrated-regression-check.py",
        ]
        for sample in samples:
            decision, reason = checker.scope_decision([sample])
            self.assertEqual((sample, decision, reason), (sample, "run", "relevant_paths"))
        decision, reason = checker.scope_decision(["docs/example.md", "README.md"])
        self.assertEqual((decision, reason), ("skip", "documentation_only"))

    def test_unavailable_diff_runs_inventory(self):
        directory = init_repo()
        self.addCleanup(directory.cleanup)
        commit_file(directory.name, "README.md", "fixture\n")
        paths = checker.changed_paths(directory.name, "does-not-exist", "also-missing")
        self.assertIsNone(paths)
        self.assertEqual(checker.scope_decision(paths), ("run", "diff_unavailable"))
        self.assertEqual(checker.scope_decision(None), ("run", "diff_unavailable"))


def empty_jest():
    return {
        "numFailedTestSuites": 0,
        "numFailedTests": 0,
        "numPassedTestSuites": 0,
        "numPassedTests": 0,
        "numPendingTestSuites": 0,
        "numPendingTests": 0,
        "numTodoTests": 0,
        "numTotalTestSuites": 0,
        "numTotalTests": 0,
        "testResults": [],
    }


if __name__ == "__main__":
    unittest.main()
