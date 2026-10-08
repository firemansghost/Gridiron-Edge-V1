# ML-CAL-1 G4 Observer — Fixture Runbook

**Status:** Offline fixture-first implementation. Draft PR only. Not live.  
**Branch:** `feat/ml-cal-1-lifecycle-binding-observer-g4-fixture-v1`  
**Base:** `955cb46bad0ccca40d073a10d2c0aea3adf236a2`

## Local tests (secret-free)

```bash
npx jest --runInBand --runTestsByPath \
  apps/jobs/__tests__/ml-cal-1-lifecycle-binding-observer-g4.test.ts
```

No `DATABASE_URL`, credentials, providers, or pooler preflight.

## Module

`apps/jobs/lib/ml-cal-1-lifecycle-binding-observer.ts`

- Archive prerequisites (Week ≥ 6 / weight 1 / authentic verification shape)
- Injectable `MlCal1G4ObserverTxAdapter` + mock RepeatableRead / READ ONLY / metadata
- Exact nine-column rating projection
- Decimal export + fingerprint via accepted binding helpers
- Timing / cohort / numeric checks
- Atomic sealed observation package (`sealG4ObservationPackage`)

## Holdings

No merge, live observation, G5/G6/G7/G8, registration, calibration, or 2025 access.
