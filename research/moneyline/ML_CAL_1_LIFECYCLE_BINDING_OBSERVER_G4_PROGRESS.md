# ML-CAL-1 G4 Observer Implementation — Progress / Recovery

**Date:** October 8, 2026 (America/Chicago).  
**Branch:** `feat/ml-cal-1-lifecycle-binding-observer-g4-fixture-v1`  
**Worktree:** `Gridiron-Edge-V1-ml-cal-1-g4`  
**Base / HEAD start:** `955cb46bad0ccca40d073a10d2c0aea3adf236a2`  
**Scope:** Offline fixture-first observer implementation + draft PR only. No merge, live DB, providers, pooler preflight, registration, calibration, or 2025.

---

## Design acceptance correspondence (source-binding)

| Artifact | SHA-256 | Role |
|----------|---------|------|
| On-disk design (implementation pin) | `53d8906c2caa3b68658c6596d74f28e1ec2367fa026991013dadb210aca922bc` | Exact bytes copied from G3 authoring worktree into this branch |
| On-disk recovery | `f8ba7a4f673f7bf5603bb14f0d40adc23a0eeea2937e74af1e5de64888a6adce` | Same source family |
| Acceptance report (`G4_OBSERVER_DESIGN_ACCEPTANCE_20261008.md`) | `eedfba94395baa5ef11ffc51c89d03526a97d370fb7612e48b9287dd71ada691` | Copied from Downloads acceptance |
| Acceptance-reviewed upload digest | `e61ffd3cb7563fea1d616969df64d760bfe7e931cf654074ab2e9f5146dc3215` | Content acceptance pin (escaped Markdown upload; bytes differ from on-disk design) |

**Correspondence statement:** Acceptance PASS is pinned to the reviewed upload content/digest (`e61ffd3c…`). The on-disk design file (`53d8906c…`) is the Cursor original that received the F3 timing correction; its **normative content** matches the accepted specification (F1–F4 closed, including unconditional DB timing bounds and mandatory archive chronology). Digests differ because the upload contained escaped Markdown / HTML entities / extra blank lines — **not** because the specification text was silently rewritten. Implementation uses the on-disk design file as the working specification and records both digests so reviewers can reconcile without relabeling hashes.

---

## Milestone log

| ID | Milestone | Status | Notes |
|----|-----------|--------|-------|
| M0 | Read acceptance + design; record correspondence | **DONE** | Digests above |
| M1 | Isolated worktree/branch from G3 tip | **DONE** | `feat/ml-cal-1-lifecycle-binding-observer-g4-fixture-v1` @ `955cb46…` |
| M2 | Archive prerequisites + injectable TX adapter | **DONE** | `evaluateG4ArchivePrerequisites`, `createMockRepeatableReadAdapter` |
| M3 | Decimal/fingerprint/timing/cohort/numeric + atomic package | **DONE** | `runG4ObserverAttempt`, `sealG4ObservationPackage` |
| M4 | Full fixture matrix + secret-free local tests | **DONE** | `ml-cal-1-lifecycle-binding-observer-g4.test.ts` (local green) |
| M5 | Draft PR + report SHAs/results/hashes; stop | **IN PROGRESS** | |

---

## Local test evidence

```text
npx jest --runInBand --runTestsByPath apps/jobs/__tests__/ml-cal-1-lifecycle-binding-observer-g4.test.ts
→ PASS (41 tests expected after N10/N16/N25/N28 additions)
```

CI: secret-free via existing jobs jest project `testMatch` — no new secrets.

## Fixture packages (retrievable in repo)

| Path | Purpose | SHA-256 |
|------|---------|---------|
| `.../week5-commit/archive.zip` | Authentic Week 5 negative ZIP | `b0177de089237876c2e258fb97d84af3803ef7d1e7402cae853670ee8a6cd316` |
| `.../week5-commit/core-v1-lifecycle-2026-through-week-5-COMMIT.json` | Week 5 report member | `c20b789ce45b58362a23b2ab2a69184fda2a39377c99d58db6268376b79a2e1e` |
| `.../synthetic-w6/archive.zip` | Synthetic Week 6 ZIP | `fc477ffdb0b3f306816988e988442f8f708304c94bbe1a6b4c336b93c8fa5d97` |
| `.../synthetic-w6/core-v1-lifecycle-2026-through-week-6-COMMIT.json` | Synthetic Week 6 report | `2dcbfe96023bf1273ff4a385aeaa3297afb99a9b3d2da80d5f87dd8e09024dab` |

Local sealed observation packages are produced under OS temp during tests (atomic seal + no-overwrite verified); they are not committed (contain full 138-row sidecars generated at test time).

## Holdings

Live readiness **BLOCKED**. No DB connection, credentials, providers, pooler preflight, live workflow, merge, registration, calibration, or 2025 access in this PR. G5–G8 deferred. #243 unregistered. Accepted PRs #244–#248/main not amended.
