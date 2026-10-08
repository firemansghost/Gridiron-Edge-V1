# ML-CAL-1 G3 fixture-first capture/binding wiring

**Status:** Fixture path only. Not live capture.  
**Depends on accepted G2:** `05f63e9d19192b2418c21acf24f7c967706f70f9`

## What it does

`planFixtureCaptureWithBindingIntegration` runs the capture planner and, after the forecast-used `ratingsByTeamId` and `snapshotReferenceTime` exist, calls `verifyBindingThenQualifyCaptureLifecycle`.

- Approval anchors and `trustedAcceptance` are supplied separately.
- The planner does not copy `approvedReceiptDigest` from the adapted digest.
- A rejected integration sets `lifecycle` to null and does not call `qualifyLifecycleReceipt` as a fallback.
- `lifecycleMode: 'live'` is rejected before any database read.
- Outer and nested `liveAccepted` stay false.
- Successful **and** rejected captures seal versioned `binding-integration-evidence.json` (manifested) with producer identities, provenance, as-of, lineage, fingerprints, approval anchors, rejection reasons, and exact verification bytes (archive/report embedded base64 plus sidecar/registry/lineage/pin).
- `bindingEvidenceAccepted` requires full accepted binding/G2 replay (`verifyBindingThenQualifyCaptureLifecycle`) against retained evidence bytes + sealed capture inputs via `evaluateBindingEvidenceAcceptance` / `readCaptureTerminalResultWithBindingReplay`. Stored `ok` / `qualified` flags and byte integrity alone never grant acceptance; missing replay evaluator fails closed.
- External approval anchors stay distinct fields compared to byte digests (not self-approved by hashing alone).
- A copied sealed package remains independently verifiable after the original temporary binding-fixture directory is removed.

Market freshness and the pre-kickoff publication deadline are unchanged.

## Local test

```bash
npx jest --runInBand --runTestsByPath \
  apps/jobs/__tests__/ml-cal-1-capture-binding-g3.test.ts
```

The success case seals artifacts with `writeCaptureArtifactsAtomic` and checks them with `readCaptureTerminalResult`, including the manifested evidence member.

Authentic Week 5 bytes stay at ZIP `b0177de0…316` and member `c20b789c…1e` (weight 0.75).

## Holdings

No live observer, provider call, business write, merge, prospective registration, or calibration.
