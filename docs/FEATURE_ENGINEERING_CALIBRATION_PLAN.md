# Feature Engineering & Calibration Plan

## Overview

Proceed with Feature Engineering (Task 11) and Calibration using all available weeks (1-11), with proper quality flags and weights based on actual coverage numbers.

---

## 1. Dataset Assembly

### Data Slices

**Set A (Core)**: Weeks 8-11, pre-kick only
- Coverage: 93.4% (199/213 games)
- Median books: 10
- Weight: 1.0
- Quality: `pre_kick`

**Set B (Extended)**: Weeks 1-7, pre-kick only
- Coverage: 18.4% (359/1,950 games)
- Median books: 11
- Weight: 0.6
- Quality: `pre_kick`

**Set C (Aux)**: Closing-fallback rows (all weeks)
- Only if `INCLUDE_CLOSING_FALLBACK=true`
- Weight: 0.25
- Quality: `closing_fallback`

### Row Metadata

Every training row must include:
- `season`: 2025
- `week`: 1-11
- `source_window`: `pre_kick` | `closing`
- `quality`: `pre_kick` | `closing_fallback`
- `books`: median unique books count
- `snapshot_window`: T-60 → T+5 (pre-kick) or closing timestamp
- `feature_version`: version string (e.g., "v1.0")
- `weight`: 1.0 (Set A), 0.6 (Set B), 0.25 (Set C)

### Artifacts

- `reports/train_rows_summary.csv`: Counts by week × quality × included/excluded
- One-liner summary: "Set A: N, Set B: M, Aux: K"

---

## 2. Feature Engineering

### 2.1 Opponent-Adjusted Nets

For each game, compute:
- **Team Off - Opponent Def** (same stat):
  - `epa_off_adj = team_epa_off - opp_epa_def`
  - `sr_off_adj = team_sr_off - opp_sr_def`
  - `explosiveness_off_adj = team_explosiveness_off - opp_explosiveness_def`
  - `ppa_off_adj = team_ppa_off - opp_ppa_def`
  - `havoc_off_adj = team_havoc_off - opp_havoc_def`

- **Opponent Off - Team Def** (pressure/weakness):
  - `epa_def_adj = opp_epa_off - team_epa_def`
  - `sr_def_adj = opp_sr_off - team_sr_def`
  - `explosiveness_def_adj = opp_explosiveness_off - team_explosiveness_def`
  - `ppa_def_adj = opp_ppa_off - team_ppa_def`
  - `havoc_def_adj = opp_havoc_off - team_havoc_def`

**Source**: CFBD `cfbd_eff_team_game` and `cfbd_ppa_team_game` tables

### 2.2 Recency EWMAs

For each team, compute exponentially weighted moving averages:

**3-game EWMA**:
- `ewma_3 = 0.6 * latest + 0.3 * prev1 + 0.1 * prev2`

**5-game EWMA**:
- `ewma_5 = 0.4 * latest + 0.3 * prev1 + 0.15 * prev2 + 0.1 * prev3 + 0.05 * prev4`

**Apply to opponent-adjusted nets**:
- `epa_off_adj_ewma3`, `epa_off_adj_ewma5`
- `sr_off_adj_ewma3`, `sr_off_adj_ewma5`
- `explosiveness_off_adj_ewma3`, `explosiveness_off_adj_ewma5`
- `ppa_off_adj_ewma3`, `ppa_off_adj_ewma5`
- (Repeat for def_adj metrics)

**Early-season blending (Weeks 1-6)**:
- Blend EWMA with priors (talent + returning production)
- Decay priors to ~0 by Week 6
- Formula: `blended = (1 - prior_weight) * ewma + prior_weight * prior`
- `prior_weight = max(0, (6 - week) / 6)`

### 2.3 Pace & Finishing

From CFBD drives data (`cfbd_drives_team_game`):
- `sec_per_play = total_time_seconds / total_plays`
- `plays_per_game = total_plays / games_played`
- `pts_per_scoring_opp = total_points / scoring_opportunities`
- `red_zone_trips_per_drive = red_zone_trips / total_drives`
- `avg_starting_field_pos = avg(starting_field_position)`

**Note**: If drives data not available, skip (mark as null).

### 2.4 Priors

From CFBD priors (`cfbd_priors_team_season`):
- `talent_composite`: 247 Composite talent score
- `talent_rank`: Talent ranking
- `returning_offense_pct`: Returning offensive production %
- `returning_defense_pct`: Returning defensive production %
- `returning_total_pct`: Returning total production %

### 2.5 Context Features

- `neutral_site`: Boolean (from `games.neutralSite`)
- `conference_game`: Boolean (from `games.conferenceGame`)
- `rest_delta`: Days of rest difference (home_rest - away_rest)
- `bye_week`: Boolean (team had bye week before this game)

### 2.6 Feature Hygiene

**Winsorization**:
- Winsorize extremes at 1st/99th percentile
- Log winsorization rate per feature

**Standardization**:
- Standardize all features to mean=0, std=1
- Use training set statistics (Set A) for standardization

**Zero-variance check**:
- Drop features with zero variance
- Log dropped features

### Artifacts

- `reports/feature_completeness.csv`: Completeness by feature × week
- `reports/feature_store_stats.csv`: mean/std/min/max/nulls per feature
- `reports/ewma_correlation.csv`: 3-game vs 5-game EWMA correlation check

---

## 3. Calibration (Ridge/Elastic Net)

### 3.1 Model Fits

**Fit #1 (Core)**:
- Train on Set A only (Weeks 8-11, pre-kick)
- Weight: 1.0 for all rows

**Fit #2 (Core+Extended)**:
- Train on Set A + Set B with weights (1.0 and 0.6)
- Optionally add Set C (0.25) if `INCLUDE_CLOSING_FALLBACK=true`

### 3.2 Validation

**Holdout**: 10-20% stratified by week
- Ensure each week is represented in holdout
- Use time-based split (earlier weeks → train, later weeks → holdout)

### 3.3 Gates (Must Pass on Holdout)

- **Slope** (ŷ vs market): 0.90 - 1.10
- **RMSE**: ≤ 8.8 (Core) / ≤ 9.0 (Core+Extended)
- **Sign agreement**: ≥ 70%
- **Pearson r**: ≥ 0.30
- **Spearman r**: ≥ 0.30

### 3.4 Residual Analysis

**Slices**: 0-7, 7-14, 14-28, >28
- Check for systematic tilt in residuals
- Mean residual should be ~0 for each slice

### Artifacts

- `reports/calibration_core.json`: Core fit coefficients, metrics, gates
- `reports/calibration_core.csv`: Core fit data rows
- `reports/calibration_extended.json`: Extended fit coefficients, metrics, gates
- `reports/calibration_extended.csv`: Extended fit data rows
- `reports/residual_slices_core.csv`: Residual analysis for Core
- `reports/residual_slices_extended.csv`: Residual analysis for Extended
- `reports/parity_plot_core.csv`: Predicted vs actual for Core
- `reports/parity_plot_extended.csv`: Predicted vs actual for Extended

---

## 4. Reporting & Model Card

### Model Card (`reports/model_card.md`)

**Sections**:
1. **Data Windows Used**
   - Set A: Weeks 8-11, pre-kick (N rows)
   - Set B: Weeks 1-7, pre-kick (M rows)
   - Set C: Closing-fallback (K rows, if included)

2. **Feature List**
   - Opponent-adjusted nets (EPA, SR, explosiveness, PPA, havoc)
   - Recency EWMAs (3-game, 5-game)
   - Pace & finishing (if available)
   - Priors (talent, returning production)
   - Context (neutral, conference, rest, bye)

3. **Gates**
   - Slope: X (target: 0.90-1.10)
   - RMSE: X (target: ≤8.8/9.0)
   - Sign agreement: X% (target: ≥70%)
   - Pearson r: X (target: ≥0.30)
   - Spearman r: X (target: ≥0.30)

4. **Final Coefficients**
   - List all coefficients with standard errors (if available)
   - Highlight key features (rating_diff, HFA, etc.)

5. **Residual Slices**
   - Mean residual by slice (0-7, 7-14, 14-28, >28)
   - Check for systematic tilt

6. **Known Caveats**
   - Early weeks have lower coverage (18% vs 93%)
   - Drives data may be incomplete
   - Priors decay by Week 6

### Dataset Composition

- N rows by week/quality
- Median books per week
- Pre-kick share by week

---

## 5. Guardrails

### Data Quality

- Per-book dedupe: ✅
- Favorite-centric normalization: ✅
- Zero-median sanity checks: ✅
- Team-mapping sanity: ✅
- Membership sanity (no null levels): ✅

### Training Safety

- Fail fast if training batch mixes pre_kick and closing_fallback without weights
- Validate feature_version consistency
- Check for zero-variance features before training

---

## Implementation Order

1. **Dataset Assembly** (`scripts/assemble-training-datasets.ts`)
   - Build Set A, Set B, Set C
   - Add row metadata
   - Generate summary report

2. **Feature Engineering** (`scripts/engineer-features.ts`)
   - Compute opponent-adjusted nets
   - Compute recency EWMAs
   - Extract pace & finishing
   - Apply hygiene (winsorize, standardize, zero-variance check)
   - Store in feature store table

3. **Calibration** (`scripts/calibrate-model-ridge-en.ts`)
   - Fit #1 (Core)
   - Fit #2 (Core+Extended)
   - Validate gates
   - Generate residual analysis

4. **Reporting** (`scripts/generate-model-card.ts`)
   - Generate model card
   - Create dataset composition report
   - Generate parity plots

---

## Environment Variables

- `INCLUDE_CLOSING_FALLBACK`: `false` (default) | `true`
- `FEATURE_VERSION`: `v1.0` (default)
- `HOLDOUT_PCT`: `0.15` (default, 15%)

---

## Acceptance Criteria

✅ All gates pass on holdout
✅ Feature completeness ≥ 95% for Set A
✅ Zero-variance features dropped and logged
✅ Model card generated with all sections
✅ Residual slices show no systematic tilt
✅ Dataset composition report shows proper weights


