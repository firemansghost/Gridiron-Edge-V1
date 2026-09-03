# STATUS — Gridiron Edge 2026 site truth

**Production `main`:** `9b6b97b362c52f64b2ceec2b09d2b11b4c98b663`  
**Updated:** 2026-09-03  
**Season:** 2026 active (manual guarded production)

Operator current-state companion to `SEASON_STATUS.md` (live Week 1 / Week 2 operational holds, model authorization, and guarded workflows live there and remain in force).

## Phase status

| Phase | Result | PR |
|------|--------|----|
| 1A Production-write containment | **COMPLETE** | #84 |
| 1B Official Card persisted-Bet truth | **COMPLETE** | #85 |
| 1C Current Slate live/dynamic truth labeling | **COMPLETE** | #86 |
| 2A Week Review + Season Review persisted-Bet truth | **COMPLETE** | #87 |
| 2B Week Archive / Browse Weeks persisted-history truth | **COMPLETE** | #88 |
| **Phase 2** | **COMPLETE** | — |
| **Phase 3 Ratings Page Truthfulness** | **NEXT** — not started | — |

Phase 2B is **not** next. It merged as `9b6b97b362c52f64b2ceec2b09d2b11b4c98b663` and was independently production-verified.

## Phase 2B production verification (PR #88)

`GET /api/weeks/archive?season=2026&week=1` after the merged Vercel deployment: HTTP **200**.

| Metric | Value |
|--------|--------|
| totalGames | 51 |
| gamesScheduled | 43 |
| gamesFinal | 8 |
| gamesInProgress | 0 |
| officialGames | 50 |
| gamesWithoutOfficialWager | 1 |
| no-wager game | North Carolina @ TCU |
| totalBets | 98 |
| spread / moneyline / totals | 50 / 48 / 0 |
| graded / pending | 14 / 84 |
| record | 6–8–0 |
| gradedStake | $1,400 |
| totalPnL | -223.76842105263165 |
| ROI | -0.15983458646616547 |
| hit rate | 0.42857142857142855 |

2026 `/weeks` is Week Archive: persisted `Game` + locked `official_flat_100` / `strategy_run` Bet rows. It is not a live slate.

## Next engineering priority

**Phase 3 — Ratings Page Truthfulness** (source / provenance / presentation only).

Do not start Phase 3 in a docs PR. No Core V1 formula or lifecycle policy change is authorized.

## Live operational holds (unchanged)

- Effective production spread model: **Core V1** (`official_flat_100`)
- **Hybrid V2 held**
- Recurring production schedules: **not authorized** (`scheduleReactivationRecommended=0`)
- Core V1 lifecycle weight remains **0** through completed Week **2**
- Canonical 2026 writes remain guarded GitHub Actions only
