# ML-CAL-1 Capture↔Binding Integration G2 — Progress Note

**Branch:** `feat/ml-cal-1-capture-binding-integration-g2-v1`  
**Worktree:** `Gridiron-Edge-V1-ml-cal-1-g2`  
**Draft PR:** https://github.com/firemansghost/Gridiron-Edge-V1/pull/247  
**Reviewed head (pre-repair):** `80bc7e194055c70111bd249eadbd9f92078cb010`  
**Updated:** 2026-10-08 (America/Chicago)

## Recovery

Clean tree at reviewed head except this note. F1–F4 had not been implemented.

## Repairs (local, pending push/CI)

- [x] F1 capture timestamp validated before lineage max
- [x] F2 qualifier only after all gates; live mode rejected; no nested qualified/liveAccepted on failure
- [x] F3 trust scope + prospective week agreement in fixture mode
- [x] F4 exported-row hash/identity/cohort checks before fingerprint trust
- [x] Regressions + required PACKAGE_INDEX
- [x] Local jest: 20 passed
- [ ] Commit, push, observe G2 CI

## Local test

```
npx jest --runInBand --runTestsByPath \
  apps/jobs/__tests__/ml-cal-1-capture-binding-integration.test.ts
→ 20 passed
```

## Next

Commit and push to existing PR #247. Observe workflow `Test ML-CAL-1 Capture-Binding Integration G2`.

Acceptance remains pending independent re-review.
