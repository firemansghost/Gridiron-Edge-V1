# Gridiron Edge Methodology

## Full Pipeline: Power Ratings → Model Predictions → Betting Picks

### 1. Power Ratings Calculation

#### Formula
Power ratings are computed as a **weighted z-score sum** of key statistics:

```
powerRating = Σ (weight_i × zscore_i)
```

Where:
- `zscore_i` = how many standard deviations the team is above/below average for stat i
- Weights are:
  - **successOff**: 0.20 (offensive success rate - % of plays gaining "expected" yards)
  - **successDef**: 0.25 (defensive success rate - lower is better)
  - **epaOff**: 0.15 (offensive EPA - expected points added per play)
  - **epaDef**: 0.20 (defensive EPA - lower is better)
  - **yppOff**: 0.30 (offensive yards per play)
  - **yppDef**: 0.20 (defensive yards per play - lower is better)

Total weight = 1.30 (intentionally > 1.0 to amplify differences)

#### Top Factors Display
The "Top Factors" section shows: `contribution = weight × zscore`

Example for Ohio State:
- `successOff = 0.446` means: `0.20 × 2.23` (2.23 std devs above average)
- `epaDef = 0.320` means: `0.20 × -1.60` (1.60 std devs better than average defense)

### 2. Model Spread Prediction

#### Formula
```
modelSpread = homePowerRating - awayPowerRating + HFA
```

Where:
- `HFA` (Home Field Advantage) = **2.0 points** (constant)
- For neutral site games: HFA = 0

**Sign Convention**: Negative = home team favored, Positive = away team favored

#### Example (Ohio State @ Purdue)
- Ohio State power: +15.0
- Purdue power: -12.0
- HFA: +2.0 (Purdue is home)
- **Model Spread**: -12.0 - 15.0 + 2.0 = **-25.0** (Purdue favored by 25, which seems wrong!)

**🚨 PROBLEM IDENTIFIED**: The model is showing Purdue as favored when Ohio State should be favored by ~27 points. This suggests the power rating calculation or sign convention is incorrect.

### 2.1. Talent Gap Feature (Phase 2.1)

#### Overview
The talent gap feature adds magnitude signal missing from z-scores by incorporating 247 Composite recruiting rankings. This provides a measure of raw talent difference between teams that complements performance-based power ratings.

#### Data Source
- **Table**: `team_season_talent` (247 Composite index)
- **Field**: `talentComposite` (numeric value representing team's overall talent level)
- **Primary Key**: `(season, team_id)`

#### Feature Calculation
1. **Load raw talent values**: `talent_home_raw`, `talent_away_raw` from database
2. **FCS Imputation**: If either team is missing talent data (FCS teams):
   - Calculate G5 10th percentile (`g5_p10`) for the season
   - Cap `g5_p10` at 5th-25th percentile band to avoid freak seasons
   - Impute missing values: `talent_used = talent_raw ?? g5_p10`
3. **Calculate difference**: `talent_diff = talent_home_used - talent_away_used`
4. **Normalize to 0-mean, unit variance** within season:
   - Compute mean and std of all team talent composites for the season
   - Normalize each team's talent: `z = (talent - mean) / std`
   - Difference of normalized values: `talent_diff_z = z_home - z_away`

#### Stability Guard
If `season_std < 0.1` (tiny variance), set `talent_diff_z = 0` and flag `talent_z_disabled: true`. This prevents coefficient explosion in low-variance seasons.

#### Why `diff_z` Exists
Normalized differences (`diff_z`) ensure coefficient comparability across seasons. Raw talent values can vary significantly between seasons (e.g., 2020 vs 2024), so z-scores make the feature scale-invariant for regression models.

#### API Response
Exposed in `model_view.features.talent`:
```typescript
{
  home_raw: number | null,        // Raw home team talent composite
  away_raw: number | null,        // Raw away team talent composite
  home_used: number | null,       // Home talent (raw or imputed)
  away_used: number | null,       // Away talent (raw or imputed)
  diff: number | null,             // Raw difference (home_used - away_used)
  diff_z: number | null,           // Normalized difference (0-mean, unit variance)
  season_mean: number | null,      // League mean for normalization
  season_std: number | null,       // League std for normalization
  imputation: {
    home: 'none' | 'g5_p10',      // Imputation method for home team
    away: 'none' | 'g5_p10'        // Imputation method for away team
  },
  talent_z_disabled: boolean       // True if z-score disabled due to low variance
}
```

### 2.2. Matchup Class Feature (Phase 2.2)

#### Overview
Matchup class explains blowout contexts—a P5 vs FCS game has different magnitude dynamics than a P5 vs P5 game. The regression needs different intercepts/slopes across classes to model spread magnitude properly.

#### Classification Rules (Season-Aware)
1. **Source teams from `team_membership.level`** for that season
2. **Map to tiers**:
   - **P5**: ACC, Big Ten (B1G), Big 12, SEC, Pac-12 (and any season-specific P5 adds)
   - **G5**: AAC, MWC, Sun Belt, MAC, C-USA, independent G5 teams
   - **FCS**: FCS + transitional year schools not yet FBS (season-specific)
   - **Independents**: Notre Dame = P5; others = G5 unless season metadata says otherwise

3. **Produce matchup_class** ∈ {P5_P5, P5_G5, P5_FCS, G5_G5, G5_FCS}

#### Why Coefficients Differ by Class
- **P5 vs P5**: Competitive games, smaller spreads, tighter variance
- **P5 vs G5**: Moderate blowouts, larger spreads than P5-P5
- **P5 vs FCS**: Extreme blowouts, very large spreads (often 30+ points)
- **G5 vs G5**: Similar to P5-P5 but with different talent baseline
- **G5 vs FCS**: Moderate blowouts, smaller than P5-FCS

Each class needs its own intercept and potentially different slopes for rating differences, as the same rating gap produces different spreads in different contexts.

#### API Response
Exposed in `model_view.features.matchup_class`:
```typescript
{
  class: 'P5_P5' | 'P5_G5' | 'P5_FCS' | 'G5_G5' | 'G5_FCS',
  home_tier: 'P5' | 'G5' | 'FCS',
  away_tier: 'P5' | 'G5' | 'FCS',
  home_conference: string | null,
  away_conference: string | null,
  season: number
}
```

Also in `diagnostics.matchup_class_source`:
```typescript
{
  home: { teamId, season, level, conference, tier },
  away: { teamId, season, level, conference, tier },
  matchup_class: string
}
```

#### Calibration Usage
In regression, create one-hot dummies with P5_P5 as baseline:
- `isP5_G5`: 1 if matchup is P5 vs G5, else 0
- `isP5_FCS`: 1 if matchup is P5 vs FCS, else 0
- `isG5_G5`: 1 if matchup is G5 vs G5, else 0
- `isG5_FCS`: 1 if matchup is G5 vs FCS, else 0

This allows the model to learn different intercepts and slopes for each matchup class.

### 2.3. Team-Specific HFA (Home Field Advantage) (Phase 2.3)

#### Overview
Team-specific HFA replaces the flat 2.0-point home field advantage with per-team, per-season values computed from historical game residuals. This captures real, persistent team effects (e.g., Death Valley ≠ a sleepy MAC stadium) and adds explanatory power to the spread model.

#### Computation Method
1. **Universe**: Regular-season FBS games only; exclude bowls, CFP, neutral sites, FCS opponents
2. **Expected margin**: `expected_margin = rating_home - rating_away + league_mean_HFA`
3. **Observed margin**: `final_margin = points_home - points_away`
4. **Game residual**: `residual = final_margin - expected_margin`
5. **HFA_raw (per team-season)**:
   - For home games: mean of `residual`
   - For away games: mean of `-residual` (flipped to measure "home boost")
   - Combined as weighted average by game counts

#### Empirical-Bayes Shrinkage
To prevent low-sample teams from swinging wild:
- **League mean**: Median of all teams' HFA_raw for the season
- **Prior strength**: `k = 8` (tunable)
- **Shrinkage weight**: `w = n_total / (n_total + k)`
- **HFA_shrunk**: `w × HFA_raw + (1 - w) × league_mean_HFA`
- **Caps**: Clamp result to `[0.5, 5.0]` pts
- **Low-sample rescue**: If `n_total < 4`, set `w = min(w, 0.4)`
- **No valid games**: Use `league_mean_HFA` directly

#### Guardrails
- **Outlier detection**: If `|HFA_raw| > 8` → flag `hfa_outlier: true` and cap
- **Low sample**: If `n_total < 2` → flag `hfa_low_sample: true`
- **Bounds**: Always clamp to `[0.5, 5.0]` pts
- **Neutral site**: HFA = 0 (no home advantage)

#### API Response
Exposed in `model_view.features.hfa`:
```typescript
{
  used: number,              // HFA used in model (0 for neutral, team-specific for home, 2.0 fallback)
  raw: number | null,        // Raw HFA before shrinkage
  shrink_w: number | null,   // Shrinkage weight (0-1)
  n_home: number,            // Number of home games used
  n_away: number,             // Number of away games used
  league_mean: number,        // League median HFA for this season
  capped: boolean,            // True if HFA was capped to [0.5, 5.0]
  low_sample: boolean,        // True if n_total < 4
  outlier: boolean,           // True if |hfa_raw| > 8
  neutral_site: boolean      // True if game is at neutral site
}
```

Also in `diagnostics.hfa_source`:
```typescript
{
  teamId, season, used, raw, shrink_w, n_home, n_away, league_mean,
  neutral_site, flags: { capped, low_sample, outlier }
}
```

#### Calibration Usage
In regression, add `hfa_team_home` as a feature:
```
market_spread ≈ α + β₁×Δrating + β₂×(Δrating)² + β₃×talent_diff_z + class_dummies + β₄×hfa_team_home
```

Expected: `β₄` should be positive ~1-3, indicating that each point of HFA adds roughly 1-3 points to the spread.

#### UI Display
- **Home Edge chip**: Shows `Home Edge: {hfa.used.toFixed(1)} pts` next to home team name
- **Tooltip**: Shows raw value, sample counts, shrinkage weight, league mean
- **Neutral site**: Shows `Neutral site — HFA = 0` instead of Home Edge chip

### 3. Model Total Prediction

#### Formula
```
modelTotal = (homePpp × homePace) + (awayPpp × awayPace)
```

Where:
- `Ppp` (Points Per Play) = `max(0.3, min(0.8, 7 × epaOff))` or fallback from yppOff
- `Pace` = plays per game (typically 70-80)
  - If stored as < 10, it's converted from seconds/play to plays/game

#### Current Slate vs. Matchup Page
- **Current Slate**: Always computes using the formula above
- **Matchup Page**: Tries to use `matchupOutputs.impliedTotal` first, falls back to computed if invalid

**🚨 INCONSISTENCY**: The two pages may show different totals if matchupOutputs exists.

### 4. Betting Picks

#### ATS (Against The Spread) Pick
1. Compare `modelSpread` vs `marketSpread`
2. Edge = `|modelSpread - marketSpread|`
3. Pick the side favored by the model at the market number
4. **Grade**: A (≥4.0 pts), B (≥2.5 pts), C (≥1.5 pts)

#### Total (Over/Under) Pick
1. Compare `modelTotal` vs `marketTotal`
2. Edge = `|modelTotal - marketTotal|`
3. Pick Over if `modelTotal > marketTotal`, else Under
4. **Grade**: A (≥4.0 pts), B (≥2.0 pts), C (≥1.5 pts)

#### Moneyline Pick
1. Convert model spread to win probability: `prob = normcdf(spread / 28)` (using stdDev=14)
2. Convert to fair moneyline odds
3. Compare model probability vs market implied probability
4. **Value** = `(modelProb - marketProb) × 100`
5. **Restrictions**:
   - Super longshots (> +2000): Never recommend
   - Extreme longshots (+1000 to +2000): Require > 25% value
   - Moderate longshots (+500 to +1000): Require > 10% value
6. **Grade**: A (≥4.0%), B (≥2.5%), C (≥1.5%)

### 5. Confidence Score

```
maxEdge = max(atsEdge, ouEdge)
```

- **A**: maxEdge ≥ 4.0 points
- **B**: maxEdge ≥ 3.0 points  
- **C**: maxEdge ≥ 2.0 points
- **None**: maxEdge < 2.0 points

---

## Known Issues & Questions

### 1. **Power Rating Formula Validation**
- Are the weights optimal? (successOff: 0.20, successDef: 0.25, epaOff: 0.15, epaDef: 0.20, yppOff: 0.30, yppDef: 0.20)
- Total weight = 1.30 (intentionally > 1.0?)
- Should we use different weights or additional stats?

### 2. **Home Field Advantage**
- Current HFA = 2.0 points (constant for all teams)
- Should this vary by team? (e.g., LSU Death Valley vs. smaller programs)

### 3. **Pace/Total Calculation**
- Current formula: `(homePpp × homePace) + (awayPpp × awayPace)`
- Pace values in database are sometimes < 1.0 (wrong units)
- Should we use possessions instead of plays?

### 4. **Moneyline Probability Conversion**
- Current: `prob = 0.5 + (spread / 28) × 0.5` with stdDev=14
- Is 14 points the correct standard deviation for CFB?
- Should this vary by game quality (e.g., FCS vs. P5)?

### 5. **Inconsistency Between Pages**
- Current Slate uses computed values
- Matchup page uses `matchupOutputs.impliedSpread/Total` when available
- These can differ significantly

### 6. **Testing Framework**
- Need backtest infrastructure to validate picks against historical results
- Need to track: win rate, ROI, edge accuracy, calibration
- Should track by grade (A/B/C) and bet type (ATS/OU/ML)

---

## Next Steps

### Immediate Fixes
1. ✅ Fix blank moneyline card (show message when no pick)
2. ✅ Fix ATS description contradiction
3. ✅ Show both teams' moneylines in betting lines section

### Methodology Improvements
4. **Audit power rating calculation** - verify the formula and weights
5. **Validate HFA** - check if 2.0 points is correct
6. **Fix pace units** - ensure all pace values are in correct units
7. **Standardize model sources** - use one source (computed vs. matchupOutputs)

### Testing & Validation
8. **Create backtest framework** - test picks against past seasons
9. **Track performance metrics** - win rate, ROI, edge accuracy
10. **Calibrate probability estimates** - ensure 60% picks win 60% of the time

---

## How to Test Betting Picks

### 1. Backtest Framework
```sql
-- Get all games with picks and outcomes
SELECT 
  game.id,
  game.homeScore - game.awayScore AS actualMargin,
  matchup.modelSpread,
  matchup.marketSpread,
  matchup.pickSpread,
  -- Did the pick win?
  CASE 
    WHEN matchup.pickSpread LIKE '%Home%' AND actualMargin > marketSpread THEN 1
    WHEN matchup.pickSpread LIKE '%Away%' AND actualMargin < marketSpread THEN 1
    ELSE 0
  END AS pickWon
FROM games game
LEFT JOIN matchup_outputs matchup ON game.id = matchup.gameId
WHERE game.status = 'final' AND matchup.pickSpread IS NOT NULL
```

### 2. Key Metrics
- **Win Rate**: % of picks that won
- **ROI**: Return on investment (assuming -110 odds)
- **Edge Accuracy**: How close was `modelSpread - marketSpread` to actual margin?
- **Calibration**: Do 60% probability picks win 60% of the time?

### 3. By Grade
Track separately for Grade A, B, C picks:
- Grade A should have highest win rate
- Grade A should have highest ROI
- If not, adjust grade thresholds

### 4. Sample Size
- Need at least 100 bets per category for statistical significance
- Current season (2025 Week 11) is too small
- Need to backtest on 2024, 2023, 2022 seasons


