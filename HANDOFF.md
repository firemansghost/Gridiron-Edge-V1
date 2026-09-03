# HANDOFF — next engineering task

**Production `main`:** `9b6b97b362c52f64b2ceec2b09d2b11b4c98b663`  
**Date:** 2026-09-03

## Live season vs engineering

Keep these separated:

- **Live season operations** (Odds → Core card → scores → grading → optional TeamGameStat / lifecycle) remain manual, guarded, and unchanged by this handoff.
- **Engineering** now moves to Phase 3 Ratings page truth. That work must not run production workflows, write production DB rows, or retune Core V1.

## Completed (do not reopen)

Phase 2B Week Archive is **merged and production-proven** (PR #88). 2026 `/weeks` reads persisted Game + Official Card bets. Independent production `GET /api/weeks/archive?season=2026&week=1` returned HTTP 200 with 51 games / 50 official / 1 no-wager (North Carolina @ TCU) / 98 bets / 6–8–0.

Phase 2 (site truth 1A–2B) is **COMPLETE**.

## Exact next engineering task

**Phase 3 — Ratings Page Truthfulness.** Implementation has **not** started.

Independently verified current problem:

- `/api/ratings` correctly obtains the season-specific FBS population from `TeamMembership`, but selects only `teamId`.
- Displayed conference currently comes from stale `Team.conference`.
- Production 2026 currently returns 138 rating rows with stale conferences (examples: Texas=`Big 12`, Oregon=`Pac-12`, many current FBS teams=`Independent`).
- Rows currently expose `games=0`, `offenseRating=0`, `defenseRating=0`, `dataSource=core_v1_lifecycle`.
- The Ratings UI renders those zeros as ordinary current components.
- Power-rating values themselves are the real persisted Core V1 `TeamSeasonRating` rows with `modelVersion='v1'`.

This is a **source / provenance / presentation repair only**.

## Phase 3 must not

- Change Core V1 formulas or lifecycle policy
- Tune Candidate A (`talentZ * 3.5`) or the Balanced formula
- Activate Hybrid V2
- Write production ratings, bets, or games
- Call providers or run Odds / Scores / Grading / Lifecycle workflows
