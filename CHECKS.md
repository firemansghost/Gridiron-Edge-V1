# CHECKS

## Phase 2B — satisfied by PR #88 (keep as future regression contract)

- [x] 2026 `/weeks` uses only `GET /api/weeks/archive` (not `/api/weeks` or `/api/weeks/slate`)
- [x] 2026 does not render `SlateTable` / does not fetch live slate
- [x] Archive queries persisted `Game` by season/week and official bets by `source='strategy_run'` + `strategyTag='official_flat_100'`
- [x] No MarketLine / MatchupOutput / live pick recomputation
- [x] Full Game frame retained (including no-official-wager games)
- [x] Duplicate official game+market rows fail closed
- [x] Official bets outside the selected Game frame or with season/week mismatch fail closed (HTTP 409)
- [x] `result` / `pnl` / `clv` passed through; final + null result = Awaiting grading
- [x] Status buckets: `totalGames` vs disjoint `gamesScheduled` / `gamesFinal` / `gamesInProgress`
- [x] Week 1 production: 51 / 43 / 8 / 0 games; 50 official; 1 no-wager (UNC @ TCU); 98 bets; 6–8–0
- [x] <=2025 labeled LEGACY / RECONSTRUCTED
- [x] GET / read-only; no Bet/Game writes; no provider calls

## Phase 3 Ratings — not yet implemented

- [ ] 2026 FBS membership and conference are season-specific (`TeamMembership`)
- [ ] Displayed conference does **not** fall back to stale `Team.conference` for 2026
- [ ] Persisted `TeamSeasonRating`, `modelVersion='v1'`, remains the numerical source
- [ ] Preseason / lifecycle-zero components (`games=0`, `offenseRating=0`, `defenseRating=0` while blend weight is 0) must not be presented as meaningful in-season offense/defense/game-count evidence
- [ ] No model-formula or lifecycle-policy changes
- [ ] Read-only only (no production ratings writes, no provider calls, no workflow execution)
