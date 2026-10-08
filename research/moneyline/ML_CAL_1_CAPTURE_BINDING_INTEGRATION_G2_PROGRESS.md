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
| Current HEAD | `ff1af89e6e369cea60fd1531258cd500f68a2f1e` |

## Completed

- [x] Isolated worktree + branch from expected main
- [x] Inherited dependency commits (capture, binding, design) — clean tree, no G2 code yet
- [x] No G2 draft PR yet; no remote tracking branch

## Remaining (authorized G2)

- [ ] Pure orchestration helper `verifyBindingThenQualifyCaptureLifecycle`
- [ ] Fingerprint parity helper + tests vs binding + capture exports
- [ ] Synthetic Week ≥6 fixture package + reuse authentic Week 5 package
- [ ] Focused integration tests (anchors, digest compare, fingerprint, lineage, provenance, producers)
- [ ] Runbook + secret-free Linux CI workflow
- [ ] Local jest green; push; open separate draft PR

## Holdings

No live CLI/DB/provider/writes/dispatch/merge/prospective/calibration/2025.

## Exact next command

Implement `apps/jobs/lib/ml-cal-1-capture-binding-integration.ts` and commit.
