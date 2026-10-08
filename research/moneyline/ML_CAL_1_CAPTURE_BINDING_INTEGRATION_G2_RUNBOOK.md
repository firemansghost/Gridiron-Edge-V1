# ML-CAL-1 Capture ↔ Binding Integration G2 Runbook (offline)

**Status:** Offline helpers + fixture tests only.  
**Design:** `ML_CAL_1_CAPTURE_BINDING_INTEGRATION_DESIGN_V1.md` @ `5cbd989…`  
**Not:** live CLI wiring, DB observer, provider calls, merge, prospective registration, calibration.

## Purpose

`verifyBindingThenQualifyCaptureLifecycle` orchestrates:

1. Binding verify with **separately supplied** registry/lineage/archive approval anchors  
2. Derived receipt build + adapter  
3. **Compare** `trustedAcceptance.approvedReceiptDigest` to adapted digest (never copy)  
4. Recompute `ratingFingerprint` from planner `ratingsByTeamId`; require equality with `bundle.inputs.ratingFingerprint`, binding, pin, adapted claim  
5. Lineage coverage through `max(bindingSnap, obsEnd, T_capture)`  
6. Actual `qualifyLifecycleReceipt`  
7. Retain fixture provenance; **force `liveAccepted=false`**

## Local test

```bash
npx jest --runInBand --runTestsByPath \
  apps/jobs/__tests__/ml-cal-1-capture-binding-integration.test.ts
```

## Fixture packages

| Package | Role | Pins |
|---------|------|------|
| `ml-cal-1-lifecycle-binding-week5-commit` | Authentic Week 5 (unchanged) | ZIP `b0177de0…` / member `c20b789c…` / weight 0.75 |
| `ml-cal-1-capture-binding-integration-synthetic-w6` | Test-only synthetic Week 6 | See `PACKAGE_INDEX.json`; `provenance: test-only` |

Regenerate synthetic (does not touch Week 5):

```bash
node apps/jobs/__tests__/fixtures/packages/ml-cal-1-capture-binding-integration-synthetic-w6/generate-synthetic-w6-fixture.js
```

## Producer identities

Keep distinct: `lifecycleProducerSha`, `bindingObserverSha`, `captureProducerSha`.  
Do not require them to equal each other.

## Holdings

PR #243 unregistered. Do not amend #244/#245/#246. No live enablement from green tests.
