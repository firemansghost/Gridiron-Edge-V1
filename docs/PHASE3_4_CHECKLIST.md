# Phase 3/4 Checklist: Data Signal Fix

**Mission**: Fix the data signal by (1) locking in clean market targets, (2) ingesting richer CFBD features, (3) engineering opponent-adjusted/recency features, and (4) only then re-running calibration with acceptance gates.

**Status**: Phase 3 mostly complete, Phase 4 is next.

---

## ✅ COMPLETED TASKS (1-8)

### ✅ Task 1: Odds Pipeline Fixes
- [x] Bookmaker normalization (trim, case-fold, alias mapping)
- [x] Scheduled date fixes (use `game.date` for pre-kick window)
- [x] Per-book deduplication in ingest pipeline
- [x] Pre-kick window enforcement (T-60 → T+5)

### ✅ Task 2: Historical Odds Backfill
- [x] Backfill Weeks 1-11 for 2025
- [x] GitHub Actions workflow created
- [x] Gate checks implemented (pre-kick ≥80%, median books ≥5)

### ✅ Task 3: CFBD Database Schema
- [x] Created 9 CFBD tables (team_map, games, eff_team_season, eff_team_game, priors, drives, weather, ppa_season, ppa_game)
- [x] Applied migrations to Supabase

### ✅ Task 4: CFBD Team Mapping
- [x] Team mapper with alias support
- [x] Zero unresolved mappings for FBS teams
- [x] Mismatch reporting

### ✅ Task 5: CFBD Season Stats Ingest
- [x] Advanced efficiency stats (season-level)
- [x] Priors (talent + returning production)
- [x] **Status**: 136/136 teams (100%) ✅

### ✅ Task 6: CFBD Game Stats Ingest
- [x] Advanced efficiency stats (game-level)
- [x] **Status**: 1066/1066 stats for weeks 1-11 (100%) ✅
- [x] GitHub Actions workflow with matrix strategy
- [x] Gate checks (FBS-only, ≥95% completeness)

### ✅ Task 7: Season Stats Backfill Integration
- [x] Integrated into CFBD workflow (runs once per workflow)
- [x] Fixed havoc field extraction (object → decimal)
- [x] Idempotent (safe to re-run)

### ✅ Task 8: Gate Check Fixes
- [x] Fixed gates to only count FBS games (not FCS/D2/D3)
- [x] Increased workflow timeout (60 → 90 minutes)
- [x] All gates passing for weeks 1-11

---

## 🎯 IN PROGRESS / NEXT TASKS (9-15)

### ⚠️ Task 9: Odds Coverage Verification (Phase 2 Finish)
**Status**: NEEDS VERIFICATION

**What to do**:
- [ ] Run `scripts/phase2-consensus-coverage.ts` for weeks 1-11
- [ ] Verify `reports/consensus_coverage_by_week.csv` shows:
  - Pre-kick coverage ≥ 80% overall
  - Median unique books ≥ 5
  - Zero "0.0" spreads
- [ ] Check invariants (favorite-centric spread < 0; total > 0; ML fav < 0 / dog > 0)

**Gates**:
- Pre-kick coverage ≥ 80% overall
- Median unique books ≥ 5
- Zero "0.0" spreads after normalization/dedupe

**Output**: `reports/consensus_coverage_by_week.csv`

---

### ⏭️ Task 10: Optional CFBD Endpoints (Drives, Weather, PPA)
**Status**: NOT STARTED (Optional - can skip if not needed for Phase 4)

**What to do** (if needed):
- [ ] Ingest drives data (pace & finishing metrics)
- [ ] Ingest weather data (temperature, wind, precip)
- [ ] Ingest PPA (Points per Attempt) if needed for recency features

**Note**: These are optional. Phase 4 can proceed with existing data (efficiency stats + priors).

---

### 🎯 Task 11: Feature Engineering - Opponent-Adjusted Nets (Phase 4)
**Status**: NEXT STEP

**What to do**:
1. For each FBS game, compute opponent-adjusted nets:
   - `off_epa_adj = team_off_epa - opp_def_epa`
   - `off_sr_adj = team_off_sr - opp_def_sr`
   - `off_explosiveness_adj = team_off_isoPPP - opp_def_isoPPP`
   - `off_havoc_adj = team_off_havoc - opp_def_havoc`
   - (Repeat for defense: `def_epa_adj = team_def_epa - opp_off_epa`, etc.)

2. Store in new table or add columns to `cfbd_eff_team_game`:
   - `off_epa_adj`, `off_sr_adj`, `off_explosiveness_adj`, `off_havoc_adj`
   - `def_epa_adj`, `def_sr_adj`, `def_explosiveness_adj`, `def_havoc_adj`

**Gates**:
- Opp-adjusted nets present for ≥ 90% FBS team-games
- No nulls where both team and opponent stats exist

**Output**: Database columns/table with opponent-adjusted features

---

### 🎯 Task 12: Feature Engineering - Recency EWMAs (Phase 4)
**Status**: AFTER Task 11

**What to do**:
1. For each team, compute exponentially weighted moving averages:
   - 3-game EWMA: `ewma_3 = 0.6 * latest + 0.3 * prev1 + 0.1 * prev2`
   - 5-game EWMA: `ewma_5 = 0.4 * latest + 0.3 * prev1 + 0.15 * prev2 + 0.1 * prev3 + 0.05 * prev4`

2. Apply to opponent-adjusted nets from Task 11:
   - `off_epa_adj_ewma3`, `off_epa_adj_ewma5`
   - `off_sr_adj_ewma3`, `off_sr_adj_ewma5`
   - (Repeat for all adjusted metrics)

3. Early-season blending (Weeks 1-6):
   - Blend EWMA with priors (talent + returning production)
   - Decay priors to ~0 by Week 6

**Gates**:
- EWMAs present for ≥ 90% FBS team-games (where team has ≥3 games)
- Early-season priors properly blended

**Output**: Database columns with EWMA features

---

### 🎯 Task 13: Feature Engineering - Pace & Finishing (Phase 4)
**Status**: AFTER Task 11 (if drives data ingested)

**What to do** (if drives data available):
1. Rollup pace metrics from drives:
   - `sec_per_play = total_time_seconds / total_plays`
   - `plays_per_game = total_plays / games_played`
   - `pts_per_scoring_opp = total_points / scoring_opportunities`

2. Store as team-game or team-season features

**Gates**:
- Pace/finishing rollups present for ≥ 90% FBS team-games (if drives ingested)

**Note**: Can skip if drives not ingested (Task 10).

---

### 🎯 Task 14: Feature Store Materialization (Phase 4)
**Status**: AFTER Tasks 11-13

**What to do**:
1. Create feature store table/view that joins:
   - Game info (home/away, week, date)
   - Opponent-adjusted nets (Task 11)
   - Recency EWMAs (Task 12)
   - Pace/finishing (Task 13, if available)
   - Priors (already ingested)
   - Market consensus (from odds pipeline)

2. Ensure all features are in Supabase (no CSV-only orphans)

**Gates**:
- Feature store complete for ≥ 95% FBS games (Weeks 1-11)
- All features queryable via single join

**Output**: Feature store table/view in Supabase

---

### 🎯 Task 15: Calibration - Elastic Net / Ridge (Phase 5)
**Status**: AFTER Phase 4 complete

**What to do**:
1. Load feature store for Weeks 8-11 (high-quality) and Weeks 1-11 (full)
2. Train Elastic Net with walk-forward validation:
   - Features: `rating_diff`, `rating_diff²`, `opp_adj_epa_ewma3`, `opp_adj_sr_ewma3`, `hfa`, `talent_diff_z`, matchup dummies
   - Grid search: α ∈ {0.0, 0.25, 0.5, 0.75, 1.0}, λ ∈ {0.001, 0.01, 0.05, 0.1, 0.2, 0.5, 1, 2}
   - Walk-forward: train ≤ week N, test week N+1
3. Select model by best walk-forward RMSE

**Gates** (must pass):
- Walk-forward RMSE ≤ 8.5-9.0
- Slope (pred vs market): 0.9-1.1
- Sign agreement ≥ 70%
- Pearson & Spearman ≥ 0.30
- Coefficient signs: `rating_diff > 0`, `hfa > 0`

**Output**: 
- `reports/calib_preds_setA.csv` (Weeks 8-11)
- `reports/calib_preds_setB.csv` (Weeks 1-11)
- `reports/calibration_summary.json` (coefficients, metrics, gates)

---

## 🔒 FUTURE TASKS (16-20)

### Task 16: Guardrails & Tests (Phase 6)
- [ ] Unit tests for consensus normalization/deduping
- [ ] Pipeline health tests (no zeros, version integrity)
- [ ] Forensic audit re-run with sign/corr/slope slices

### Task 17: Documentation
- [ ] Update runbook with new workflows
- [ ] Document feature engineering formulas
- [ ] Document calibration process

### Task 18: Monitoring
- [ ] Set up alerts for gate failures
- [ ] Dashboard for data completeness

### Task 19: Performance Optimization
- [ ] Optimize feature store queries
- [ ] Cache frequently accessed features

### Task 20: Production Deployment
- [ ] Deploy calibrated model to staging
- [ ] A/B test against current model
- [ ] Rollout to production

---

## 📊 Current Status Summary

**Phase 2 (Odds)**: ✅ Complete (needs verification)
**Phase 3 (CFBD Ingest)**: ✅ 95% Complete (core stats done, optional endpoints pending)
**Phase 4 (Feature Engineering)**: ⏭️ Next Step
**Phase 5 (Calibration)**: ⏳ Waiting on Phase 4
**Phase 6 (Guardrails)**: ⏳ Future

**Next Immediate Step**: Task 9 - Verify odds coverage, then Task 11 - Start feature engineering

