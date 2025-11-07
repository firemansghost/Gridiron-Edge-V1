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


