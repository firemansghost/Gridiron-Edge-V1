# DECISIONS

## Phase 2B persisted-history contract (implemented and production-verified)

- 2026 Browse Weeks / Week Archive truth is persisted `Game` rows for the selected week **plus** locked Official Card bets (`strategyTag='official_flat_100'`, `source='strategy_run'`).
- The archive includes every persisted Game in the week frame, including games with no official wager.
- Duplicate official rows for the same game+market fail closed.
- Official bets outside the selected Game frame, or with season/week inconsistency, fail closed (HTTP 409).
- `result`, `pnl`, and `clv` are historical records and are not recalculated from today's model or `MarketLine`.
- Seasons through 2025, if shown, remain **LEGACY / RECONSTRUCTED** and are not Official Card records.
- Status buckets are disjoint: `totalGames` = frame size; `gamesScheduled` / `gamesFinal` / `gamesInProgress` follow `Game.status`.

## Phase 3 Ratings (authorized scope)

- Phase 3 remains **presentation / source repair only**.
- 2026 displayed conference for Ratings **must** be `TeamMembership.conference` (season-specific). Do not fall back to stale `Team.conference` for 2026.
- Persisted Core V1 `TeamSeasonRating` values with `modelVersion='v1'` remain the numerical source of power ratings.
- No formula tuning, lifecycle-weight change, Hybrid activation, or ratings rewrite belongs in Phase 3.

## Canonical Core V1 lifecycle (unchanged; not a Phase 3 lever)

- completedThroughWeek <=2 → 0.00
- completedThroughWeek 3 → 0.25
- completedThroughWeek 4 → 0.50
- completedThroughWeek 5 → 0.75
- completedThroughWeek >=6 → 1.00
- Candidate A remains `talentZ * 3.5`
- Balanced formula remains unchanged
