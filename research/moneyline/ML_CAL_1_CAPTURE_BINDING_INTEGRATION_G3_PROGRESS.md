# ML-CAL-1 G3 progress

**Branch:** `feat/ml-cal-1-capture-binding-g3-fixture-v1`  
**Worktree:** `Gridiron-Edge-V1-ml-cal-1-g3`  
**Inherited head:** accepted G2 `05f63e9d19192b2418c21acf24f7c967706f70f9`  
**Base main:** `c37b5d367a364398d479c52844466aa4fd3306c2`

## Completed

- [x] Fixture planner/CLI seam calls accepted G2 helper
- [x] Rejected integration keeps `lifecycle: null` (no receipt fallback)
- [x] Live binding path rejected before DB
- [x] Local suites: capture + binding + G2 + G3 = 202 passed
- [x] Draft PR #248
- [x] Observed CI on `46912098a2abc2499f4e953057256c72fee2a7fa`:
  - G3 https://github.com/firemansghost/Gridiron-Edge-V1/actions/runs/37819746988 success
  - Capture, binding, and G2 targeted workflows also success

## Local command

```bash
npx jest --runInBand --runTestsByPath \
  apps/jobs/__tests__/ml-cal-1-capture.test.ts \
  apps/jobs/__tests__/ml-cal-1-lifecycle-binding.test.ts \
  apps/jobs/__tests__/ml-cal-1-capture-binding-integration.test.ts \
  apps/jobs/__tests__/ml-cal-1-capture-binding-g3.test.ts
```

## Next

Commit, push, open draft PR, observe G3 CI.

Acceptance is not granted by green tests. Live readiness stays blocked.
