# Independent RMM1 Step 2 acceptance

**Disposition: PASS — exact local artificial-only, model-free reference implementation.** This accepts Step 2 only. It is not a publication/precommit gate, real-input qualification, estimator/environment qualification, permission to spend estimator fits, or historical-performance acceptance.

The reviewer personally read the complete operative frozen specification and administrative adoption/registry, all five initial proposed files, and every revised-file difference. Frozen registry SHA256 is `09159fd46bb49fb6f063cf0ecaa123cac893d730da00ac0e93ed3aeae4a6ba60`; operative specification/adoption remain `850a7371f1bb202d08fedaaa66569fd436c7dcee54b5726af600f6a0f559d7a0` / `4167ce0faa5afccfad32cde63a31f3b82e23acca263f03363cd2b2d564dc7a4e`. All 14 freeze-packet sealed files match their existing seal (`reviewer-freeze-preservation.json`).

## Exact accepted source

| File | Bytes | SHA256 |
| --- | ---: | --- |
| rmm1_builder.py | 23747 | 80e415d38b2e5caf519e3a74a2c6327437d0e975a40fe3ce5c1aa24d09d85a68 |
| run_artificial_checks.py | 4835 | 079459756bb0719415af770cfce2d7eda6e6ee9bbede54517f3051eade52c338 |
| SOURCE_ALLOWLIST_AND_TEST_PLAN.md | 9835 | 3ebb6e3816f161afe1342385a1ca03d87ff3d54f91bc1899d90b4e65c161ad61 |
| synthetic_fixtures.py | 4075 | 751a05b9010c474e1026d4e2a3c36514135244db71782ba6295991573708deba |
| test_rmm1_builder.py | 20196 | 481656d17ea820b57ab812798049873960830dc2fe89b4b0d3ac17f4ac972718 |

These match the current five-member source-review manifest and the reviewer's actual guarded-run report. The guarded runner executes builder/fixture/test modules by compiling their exact source bytes, logs their hashes, and checks those hashes again after execution. It does not execute cached local proposal bytecode. Standard-library bytecode remains ordinary runtime input and is disclosed in the read ledger.

## Independent execution and resolved finding

The reviewer wrote and personally executed `reviewer_adversarial.py`, using only artificial in-memory records and direct compilation of the reviewed source. Final result: **15/15 PASS** (`reviewer-adversarial-results.json`). Checks include absent exact-prior Elo without later-week substitution, cross-season history exclusion, joint four-component completeness/all-six nulling, common F14/F10 whole-game fallback, literal pooled imputation/population-scale arithmetic, canonical deletion, future-transform isolation, minimum-anchored ties and full output denominators.

The reviewer separately executed the supplied guarded suite in its own fresh output directory: `artifacts/reviewer-run-01/report.json` and `tests.txt`: **38 tests, 0 failures, 0 errors, 0 skips**. The read ledger contains only proposed source, pinned freeze members, standard-library files and the run's artificial temporary registry. No blocked operation occurred. Executed-module hashes equal the accepted source hashes. Full five-file byte counts/hashes were independently recomputed.

The initial independent run found a real invalid-context bug: a date-only `2022-08-01Z` was accepted as a naive datetime. Initial results remain immutable in `reviewer-adversarial-initial-findings.json`; the preparer retained the initial source and earlier execution records. The revised parser requires an explicit normalized UTC timestamp, validates calendar/time syntax and checks an aware zero offset. Its new regression and the reviewer's original failing case now pass. The preparer's separate cached-bytecode concern was also corrected as described above. There are no outstanding material findings in this bounded prototype review.

## Frozen-rule alignment and limits

The artificial builder preserves canonical IDs and global integrity stops; absent/null static values remain unavailable, invalid present numerics remain invalid, and observed zero remains available. Exact prior-week Elo and season-relative recruiting selection are explicit. Same-season lower-week canonical histories require earlier kickoffs and all four finite components over every expected prior game before any of the six form fields is available. Original null n is rejected rather than reinterpreted as zero; no original historical record is loaded or changed.

Training-side pooled medians, impute-before-population-SD ridge transforms, zero-SD scale one, unscaled fixed indicators and venue, and individual feature/state support follow the frozen rules. F14/F10 have 141/101 columns and the same all-F14 eligibility mask; B2's diagnostic mask uses Elo alone. Joint novelty is diagnostic. Seven whole-week folds retain warmup and evaluation IDs, enforce minimum training count and strict kickoff separation, and reject undeclared subsets. Artificial B0/B1 arithmetic and stand-in candidate outputs test finite whole-population routing/metrics; they provide no estimator or scientific evidence.

The fixed 128-game fixture (96 training / 32 validation) is unchanged: 144431 bytes, SHA256 `ff53d3123c56dd836e956755e5704a32ec268877f4525cb34c8226bb4cf1a207`. Its artificial labels are unchanged: 3244 bytes, SHA256 `0ab4d6417a092539a2cbaa669c5fbe96aa867f76b98333b08816258f340c43b2`. The separate structural fixture has 170 games, 100 warmup and 70 validation games across seven blocks. These are synthetic counts, not qualification of the historical universe.

The real historical member/file allowlist remains **empty**. Artificial namespaces are documented accidental-input markers, not proof that arbitrary caller numbers are artificial. This review accepts the inspected generators and actual bounded executions, not a security guarantee for unreviewed callers. No real-source adapter, dense numerical learner integration, dependency/environment lock or raw historical reproduction is accepted here.

**Actual estimator fits: 0 synthetic, 0 research.** The global four synthetic verification fits and 66 research fits remain untouched. No provider calls, historical predictor/target reads, mixed 2025 snapshot access, database/production operations or source publication occurred. Full 2025 remains NOT_QUALIFIED and original Final Holdout V1 remains INPUT_BLOCKED. Step 3's separate exact implementation/environment/precommit/publication and bounded real-read-plan gates remain required; future estimator verification must respect the shared global four-fit cap.
