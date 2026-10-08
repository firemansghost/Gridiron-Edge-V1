# ML-CAL-1 G3 progress

**Branch:** `feat/ml-cal-1-capture-binding-g3-fixture-v1`  
**Worktree:** `Gridiron-Edge-V1-ml-cal-1-g3`  
**Head:** `e13bfe34c44eeb7ec6f263dfa0b35ceb90f27bdf`  
**Prior reviewed head:** `62b73d795ea467a46d0c8baf87841587bd88501f`  
**PR:** https://github.com/firemansghost/Gridiron-Edge-V1/pull/248  
**Updated:** 2026-10-08 (America/Chicago)

## F1-A full G2 replay delivered

- [x] Removed partial capture-helper checklist evaluator
- [x] `evaluateBindingEvidenceAcceptance` calls `verifyBindingThenQualifyCaptureLifecycle` on retained evidence + sealed inputs
- [x] Complete trust record retained in `evidence.replay`
- [x] Reader fails closed when full-replay evaluator unavailable
- [x] Regressions: invalid ZIP, empty pin, wrong week, superseding lineage, stale rating hash, unknown integration schema
- [x] Local G3 15/15; Capture V1 128; G2+lifecycle 63
- [x] Pushed for independent re-review

## Holdings

F1-B remains closed for offline fixture scope. No merge/live/registration/calibration/2025.
