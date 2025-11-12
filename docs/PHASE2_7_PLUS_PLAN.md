# Phase 2.7+ Remediation & Feature Expansion Plan

## Executive Summary

Recent audits show our V2 ratings produce near-zero or heavily compressed values for some teams (e.g., Delaware), collapsing predictive signal. At the same time, our feature set is too thin compared to what the betting market actually prices (efficiency, explosiveness, finishing drives, pace, etc.). Result: weak slope, low correlations, and poor sign agreement.

**Root Causes Identified:**
- Membership filtering used non-existent `subdivision` field instead of `level` (fbs/fcs)
- V2 ratings computing to 0.0 for many teams (silent zeroing bug)
- Feature set too skinny (rating_diff alone insufficient)
- Pre-kick consensus and per-book dedupe not consistently enforced

## Order of Operations

### Phase 1: Stop the Bleed (V2 Bugfix & Invariants)
1. Fix membership filtering (`level` not `subdivision`)
2. Instrument V2 compute pipeline with stage stats
3. Add non-zero sanity gates
4. Audit for silent zeroing

### Phase 2: Data Coverage (Odds Consensus)
5. Add odds consensus coverage gates
6. Verify historical backfill meets gates

### Phase 3: Feature Expansion (CFBD Ingest)
7. Design CFBD schema
8. Ingest advanced efficiency stats
9. Ingest PPA metrics
10. Ingest drives data
11. Ingest priors (talent + returning production)
12. Build team mapping layer

### Phase 4: Feature Engineering
13. Compute opponent-adjusted nets
14. Build recency-weighted form
15. Extract pace & finishing features
16. Apply safety & hygiene (winsorization, standardization)
17. Materialize feature store

### Phase 5: Calibration
18. Implement Ridge/Elastic Net with walk-forward validation
19. Apply calibration gates
20. Generate calibration reports

### Phase 6: Guardrails & Tests
21. Unit tests (consensus, membership, variance)
22. Integration tests (feature completeness, calibration gates)
23. Version integrity tests
24. Re-run forensic audit

## Detailed Task Breakdown

### 1. Stop the Bleed: V2 Ratings Bugfix & Invariants

**Goal**: Ensure V2 produces non-trivial, correctly scaled ratings before any calibration.

#### Tasks

1. **Fix membership filtering**
   - Replace all `subdivision` checks with `level` field (values: `fbs`/`fcs`)
   - Add invariant at load time: "% rows with valid FBS status ≥ 95%"
   - Hard-fail with diagnostic print if invariant fails

2. **Instrument V2 compute pipeline**
   - After each stage (raw baseline → SoS → shrinkage → calibration factor → persistence), log per-team distribution stats:
     - Count, mean, std, min, max, % zeros
   - Persist to `reports/v2_stage_stats.csv`

3. **Non-zero sanity gates**
   - **Gate A**: "Stddev of team ratings after shrinkage ≥ 2.0" (tune if needed)
   - **Gate B**: "No more than 2% of teams exactly 0.0 after final stage"
   - If gate fails, dump top 10 offenders and abort run

4. **Check for silent zeroing**
   - Audit full flow for stages that could collapse to zero:
     - Bad null-handling
     - Misapplied SoS multiplier
     - Rounding/clamping
     - Default DB values
     - Writing to wrong modelVersion
   - Add assertions around write step:
     - Version we computed = version we upserted
     - Re-read same version to confirm variance didn't vanish

**Acceptance Criteria:**
- Ratings variance looks healthy (non-trivial stddev)
- No mass zeros
- Reproducible, version-correct read-after-write
- Membership filter validated against corrected `level` field

### 2. Data Coverage: Odds Consensus

**Goal**: Guarantee the target (market spread) is well-formed and stable.

#### Tasks

1. **Consensus rules** (already partially in place):
   - Favorite-centric spreads only
   - Deduplicate per book; pre-kick window T-60 to T+5
   - Reject price leaks and <2 unique books
   - Record both `rawCount` and `perBookCount`

2. **Coverage gates for training rows:**
   - Pre-kick coverage ≥ 80%
   - Median unique books per game ≥ 5
   - If week fails, tag it and exclude from training by default

**Acceptance Criteria:**
- Per-game consensus metadata present and correct
- Training set meets coverage gates and logs "pass/fail" per week

### 3. Enrich Inputs: CFBD Feature Ingest

**Goal**: Feed the model features that markets actually price.

#### Sources to Ingest (season + game level)

1. **Advanced efficiency** (offense & defense):
   - EPA, success rate, explosiveness (isoPPP)
   - Run/pass splits, early/late downs
   - Field position, points per opportunity
   - Havoc, line yards, stuff rate, power success
   - **Why**: These drive spreads; rating-diff alone won't cut it

2. **PPA metrics** (team & game):
   - Clean way to build rolling form without full play-by-play
   - **Why**: Recency-weighted performance is what the market reacts to

3. **Drives** (game):
   - Pace (plays/min, sec/snap)
   - Finishing drives (points per scoring opp)
   - Average starting field position
   - Red-zone trips per drive
   - **Why**: Captures tempo & finishing—key for both spreads and totals

4. **Priors**:
   - Team talent (247 Composite) + returning production (off/def)
   - **Why**: Stabilizes early weeks until in-season form takes over

5. **Weather** (game):
   - Keep for totals and to de-noise outliers
   - **Why**: Sanity check; not primary for spreads, but good for robustness

#### Schema/Join Notes

- Create or extend tables for: advanced season, advanced game, PPA season/game, drives, talent, returning production, weather
- Maintain robust team mapping layer (CFBD names ↔ internal IDs)
- Key by season, team, game_id where appropriate; enforce not-nulls on join keys
- Record source timestamps and source names for traceability

**Acceptance Criteria:**
- Each dataset ingests for 2025 weeks 1–11 (and 2024 if convenient)
- 95% of odds-eligible games have complete feature row after joins
- Team mapping produces zero "unmatched" teams in logs; any mismatches listed with remediation note

### 4. Feature Engineering

**Goal**: Build features that align with how markets price games.

#### Derivations

1. **Opponent-adjusted nets**
   - For key metrics (EPA, success, explosiveness, points per opp., run/pass splits), compute:
     - Team Off – Opponent Def (same stat)
     - Opponent Off – Team Def (pressure/weakness exposure)

2. **Recency-weighted form**
   - 3-game and 5-game exponentially weighted averages for the above
   - Early-season: blend in priors (talent + returning production), decaying to ~0 by Week 6

3. **Pace & finishing**
   - Plays per minute, seconds per snap
   - Scoring opps per drive, points per opp

4. **Safety & hygiene**
   - Winsorize feature extremes at 1–2%
   - Standardize inputs
   - Ensure zero-variance features are dropped with log

5. **HFA policy**
   - Keep HFA explicit in model (don't bake into ratings)
   - Team-specific HFA can be tracked, but model with single coefficient unless proven otherwise

**Acceptance Criteria:**
- Feature store materialized per game with complete fields
- QA report showing distributions (mean/std/min/max) and % winsorized
- No zero-variance features in final design matrix

### 5. Calibration: Ridge/Elastic Net with Walk-Forward Validation

**Goal**: Fit spreads with stable coefficients and honest validation.

#### Protocol

1. **Framing**
   - `home_minus_away` for target and `rating_diff`
   - Favorite-centric market spread aligned to same frame

2. **Model set**
   - Start with Ridge and Elastic Net
   - Grid search over λ (and α for EN)
   - Use k-fold CV nested inside walk-forward by week to avoid look-ahead

3. **Gates** (must pass)
   - Slope (pred vs market): 0.9–1.1
   - Walk-forward RMSE: ≤ 9.0 points (≤ 9.5 for early-week variants)
   - Sign agreement: ≥ 70%
   - Pearson r: ≥ 0.30 on full 1–11 set (≥ 0.35 preferred)
   - Coefficient signs: `rating_diff > 0`, `HFA > 0`
   - Quadratic may be < 0 only if RMSE materially improves and other gates pass

4. **Reporting**
   - Save coefficients, fit metrics, residual bucket means (0–7, 7–14, 14–28, >28)
   - Calibration plots
   - Emit CSV per run

**Acceptance Criteria:**
- At least one model (Ridge or EN) passes all gates on Weeks 8–11 and does not degrade materially on Weeks 1–11
- Residual bucket means are near zero and monotonicity looks sane (no huge blow-up on blowouts)

### 6. Guardrails & Tests

**Goal**: Prevent regressions and silent failures.

#### Unit/Integration Tests

- Consensus normalization (already added) + per-book dedupe
- Membership filter on `level` not `subdivision`
- V2 ratings variance tests (no mass zeros; stddev threshold)
- Feature store completeness test (≥95% coverage for training rows)
- Calibration pipeline test: fails fast if gates not met; prints clear reasons
- Read-after-write version integrity for ratings

#### Operational Backfills

- Historical odds backfill verified for 2025 Weeks 1–11
- CFBD feature backfill for same interval
- Re-run forensic audit and print red/green summary

**Acceptance Criteria:**
- All tests green on CI
- Forensic audit shows:
  - Sign agreement ≥ 70%
  - Pearson r ≥ 0.30
  - Pre-kick coverage ≥ 80%, median unique books ≥ 5

### 7. What Likely Went Wrong Before (So We Don't Repeat It)

- Filtering on non-existent membership field (`subdivision`) zeroed out eligible rows
- Shrinkage/SoS math over-compressed ratings and/or default path zeroed values on write
- Ratings were scaled or written under one version and read back under another
- Features were too skinny; `rating_diff` had nothing to "grab"
- Pre-kick and per-book consensus were not consistently enforced in earlier runs

### 8. Success Definition (What "Done" Looks Like)

- **V2 ratings**: Healthy variance, no mass zeros, version-correct
- **Training set**: ≥80% pre-kick coverage, median ≥5 unique books
- **Model**: Passes slope, RMSE, sign agreement, and correlation gates on both 8–11 and 1–11 windows
- **Residuals**: Bucket means near zero, no runaway bias on blowouts
- **CI tests**: Pin these behaviors to avoid regressions

## CFBD API Reference

Review available endpoints at: https://api.collegefootballdata.com/

Key endpoints to integrate:
- `/stats/season/advanced` - Advanced efficiency metrics
- `/ppa/games` - Points per attempt (game level)
- `/ppa/players/season` - PPA player/team aggregates
- `/drives` - Drive-level data (pace, finishing)
- `/talent` - 247 Composite talent ratings
- `/player/returning` - Returning production metrics
- `/games/weather` - Weather conditions

## Next Steps

1. Start with Phase 1 (V2 bugfix) - highest priority to stop the bleed
2. Once V2 produces healthy ratings, proceed to Phase 2 (data coverage verification)
3. Then Phase 3 (CFBD ingest) - this is the biggest lift but critical for signal
4. Phase 4 (feature engineering) transforms raw stats into model-ready features
5. Phase 5 (calibration) applies the enriched feature set
6. Phase 6 (tests) pins everything to prevent regressions

