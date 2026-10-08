# ML-CAL-1 Capture↔Binding Integration G2 — Progress Note

**Branch:** `feat/ml-cal-1-capture-binding-integration-g2-v1`  
**Worktree:** `Gridiron-Edge-V1-ml-cal-1-g2`  
**Updated:** 2026-10-08 (America/Chicago)

## Ancestry

| Layer | Identity |
|-------|----------|
| Base / expected main | `c37b5d367a364398d479c52844466aa4fd3306c2` |
| Deps: PR #244 capture | local `c0d5ed5` ≡ tip `fc88bc705a0dac0597a068c7c929c28676f51f20` |
| Deps: PR #245 binding | local `d4e707e` ≡ tip `881c219d83c0250f4a60546e7f904e5fa49dd697` |
| Deps: PR #246 design | local `ff1af89` ≡ tip `5cbd98954fdb0d59fc7bccb870816c8e7e4bd97c` |

## Completed

- [x] Isolated worktree + branch from expected main
- [x] Inherited dependency commits (capture, binding, design)
- [x] Pure orchestration helper `verifyBindingThenQualifyCaptureLifecycle`
- [x] Fingerprint parity helpers + tests vs binding + capture exports
- [x] Synthetic Week 6 fixture package + authentic Week 5 unchanged
- [x] Focused integration tests (15 local PASS)
- [x] Runbook + secret-free Linux CI workflow
- [ ] Push + open separate draft PR
- [ ] Observe CI result

## Local test result (2026-10-08)

```
npx jest --runInBand --runTestsByPath \
  apps/jobs/__tests__/ml-cal-1-capture-binding-integration.test.ts
→ Test Suites: 1 passed; Tests: 15 passed
```

## Fixture digests

Week 5 (authentic, unchanged):
- ZIP `b0177de089237876c2e258fb97d84af3803ef7d1e7402cae853670ee8a6cd316`
- member `c20b789ce45b58362a23b2ab2a69184fda2a39377c99d58db6268376b79a2e1e`

Synthetic W6 (test-only) — see PACKAGE_INDEX.json:
- archive.zip `fc477ffdb0b3f306816988e988442f8f708304c94bbe1a6b4c336b93c8fa5d97`
- member `2dcbfe96023bf1273ff4a385aeaa3297afb99a9b3d2da80d5f87dd8e09024dab`
- PROVENANCE.json `20498aab6b41def6eb0b13aee9a60ecb84883df4aca86ae4657f0fe9f0f5bb50`

## Exact next command

```
git push -u origin HEAD
gh pr create --draft ...
```

## Holdings

No live CLI/DB/provider/writes/dispatch/merge/prospective/calibration/2025.
Green tests ≠ independent acceptance.
