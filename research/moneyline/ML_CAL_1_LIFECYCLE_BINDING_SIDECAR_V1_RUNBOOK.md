# ML-CAL-1 Lifecycle Binding Sidecar V1 — Offline Runbook

**Status:** Offline implementation (fixture / pure helpers).  
**Not:** live observer, capture CLI wiring, merge, dispatch, DB access, calibration, or PR #244 amendment.

## Purpose

Verify a later TeamSeasonRating observation against an immutable lifecycle COMMIT archive without trusting sidecar self-declarations. Live qualification additionally requires:

1. External lineage attestation bytes bound to `approvedLineageAttestationDigest` + inventory anchor, with `checkedThroughTime` coverage
2. Registry document bytes bound to `approvedRegistryDocumentDigest` (external approval anchor) and field-equal to the supplied pin
3. Recomputed full-weight eligibility (`completedThroughWeek >= 6`, weight `1`, prospective week strict)
4. Non-fixture provenance (`mode=binding_observation`, `readMode=repeatable_read_readonly`, non-fixture registry id)

`liveQualifying` may be true for synthetic gates in offline tests; `liveAccepted` remains false whenever fixture/test-only provenance is retained.

## Module

`apps/jobs/lib/ml-cal-1-lifecycle-binding.ts`

| Helper | Role |
|--------|------|
| `verifyLifecycleBindingSidecar` | Fail-closed offline verifier |
| `reconstructRawRatingRow` / `exportRatingInput` / `buildRatingFingerprint` | Capture-compatible rating identity |
| `buildDerivedReceiptEnvelope` | Derived core bytes + `coreDigest` outside hashed core |
| `adaptDerivedReceiptToCaptureLifecycleInput` | Capture claim body → `receiptBytes` → digest → claims |

## Fixture provenance (test-only)

Package: `apps/jobs/__tests__/fixtures/packages/ml-cal-1-lifecycle-binding-week5-commit/`

| File | SHA-256 |
|------|---------|
| `archive.zip` | `b0177de089237876c2e258fb97d84af3803ef7d1e7402cae853670ee8a6cd316` |
| `core-v1-lifecycle-2026-through-week-5-COMMIT.json` | `c20b789ce45b58362a23b2ab2a69184fda2a39377c99d58db6268376b79a2e1e` |

Source run: `37336589699` / artifact `11356512878` / producer `ee436b910177bbf2120b9ab6bf2551197d739129`.

These bytes prove archive integrity and Week 5 / weight `0.75` **non**-eligibility for full-weight. They are **not** live-accepted capture evidence.

## Local validation

```bash
npx jest --runInBand --runTestsByPath apps/jobs/__tests__/ml-cal-1-lifecycle-binding.test.ts
```

## Holdings

- Do not wire into live capture / `qualifyLifecycleReceipt` in this PR
- Do not amend PR #244 or PR #243
- Do not treat green fixture tests as independent production acceptance
- Week ≥ 6 genuine evidence + approved binding remain required for live research readiness

## Next integration (separate PR)

1. Capture path loads registry pin + sidecar + archive + lineage attestation
2. `verifyLifecycleBindingSidecar` → liveQualifying
3. Build derived envelope → `adaptDerivedReceiptToCaptureLifecycleInput`
4. Pass adapted claims into existing `qualifyLifecycleReceipt`
