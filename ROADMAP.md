# ROADMAP — 2026 site-truth program

**Production `main`:** `9b6b97b362c52f64b2ceec2b09d2b11b4c98b663`  
**Updated:** 2026-09-03

This is the 2026 Official Card / review / archive / ratings truth roadmap. Historical product-skeleton notes remain in `docs/roadmap.md` and are not current production state.

## Complete

| Phase | Status |
|------|--------|
| 1A Production-write containment | COMPLETE (PR #84) |
| 1B Official Card persisted-Bet truth | COMPLETE (PR #85) |
| 1C Current Slate live/dynamic labeling | COMPLETE (PR #86) |
| 2A Week Review + Season Review persisted-Bet truth | COMPLETE (PR #87) |
| **2B Week Archive / Browse Weeks persisted-history truth** | **COMPLETE (PR #88)** |

Phase 2B is not the next phase.

## Active / next

**Phase 3 — Ratings Page Truthfulness** (not started).

Preserved contract:

- Displayed 2026 conference from `TeamMembership.conference` (season-specific), not stale `Team.conference`
- Persisted Core V1 `TeamSeasonRating` `modelVersion='v1'` remains the numerical source
- Preseason Core V1 baseline labeling while lifecycle weight is zero
- Explain W3–W6 lifecycle (0.00 through completed W2; 0.25 at W3; 0.50 at W4; 0.75 at W5; 1.00 at W6+)
- Hide or mark unavailable misleading Games / Offense / Defense zero components that are not in-season evidence
- **No model tuning**, no lifecycle-policy change, no Hybrid activation

## Later (not authorized by this closeout)

Live season operations stay on the guarded Week 1 / Week 2 path in `SEASON_STATUS.md`. Hybrid V2 remains held.
