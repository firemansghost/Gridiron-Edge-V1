# Audit Findings: Power Ratings & Model Performance

## Executive Summary

**Status: 🚨 CRITICAL ISSUES FOUND**

The model is fundamentally flawed and currently unprofitable. Three major issues identified:

1. **Power ratings don't match documented formula** - Database values are wrong
2. **Even correct formula is inadequate** - Predictions are wildly inaccurate for large favorites
3. **Model performs WORSE with large edges** - Opposite of what we want

---

## 1. Power Rating Calculation Audit

### Formula Documentation
```
powerRating = Σ (weight × zscore)
```
Weights:
- successOff: 0.20, successDef: 0.25
- epaOff: 0.15, epaDef: 0.20
- yppOff: 0.30, yppDef: 0.20

### Ohio State @ Purdue Example

#### Actual Stats (2025):
| Metric | Ohio State | Purdue | Winner |
|--------|-----------|--------|--------|
| EPA Off | 0.386 | 0.138 | Ohio State ⭐ |
| EPA Def | -0.039 | 0.201 | Ohio State ⭐ |
| YPP Off | 7.18 | 5.67 | Ohio State ⭐ |
| YPP Def | 3.75 | 6.19 | Ohio State ⭐ |
| Success Off | 56% | 44.7% | Ohio State ⭐ |
| Success Def | 35.6% | 43.8% | Ohio State ⭐ |

Ohio State is **elite across every single metric**. Purdue is **mediocre to poor** across the board.

#### Power Ratings:

| Team | Calculated (Correct Formula) | Database | Match? |
|------|------------------------------|----------|--------|
| **Ohio State** | **+2.64** | +2.00 | ❌ |
| **Purdue** | **-0.53** | +0.12 | ❌ |

**FINDING**: Database power ratings don't match the documented formula.

#### Model Spread Predictions:

| Method | Calculation | Result | vs. Market (-29.5) |
|--------|-------------|--------|-------------------|
| **Database (Wrong)** | 0.12 - 2.00 + 2.0 | **+0.1** (Pick'em) | Off by 29.6 pts ❌ |
| **Correct Formula** | -0.53 - 2.64 + 2.0 | **+5.2** (OSU by 5.2) | Off by 24.3 pts ❌ |
| **Market** | N/A | **-29.5** (OSU by 29.5) | Baseline ✅ |

**FINDING**: Even using the CORRECT formula, the model is wildly inaccurate (off by 24 points).

---

## 2. Backtest Results (2024 Season, Weeks 1-14)

### Overall Performance

```
📊 Sample Size: 47 games (only 1.3% of games had complete data)

🤖 MODEL:
   Win Rate: 44.7% (21/47)
   ROI: -14.7% ❌ UNPROFITABLE
   Avg Error: 14.5 points
   
📊 MARKET (baseline):
   Win Rate: 31.9% (15/47)
   ROI: -39.1%
   Avg Error: 17.1 points
   
📉 MODEL vs MARKET:
   Win Rate: +12.8% (better)
   Error: -2.6 points (better)
```

**FINDING**: Model is better than market, but still unprofitable.

### 🚨 CRITICAL: Performance by Edge Size

| Edge | Games | Win Rate | ROI | Status |
|------|-------|----------|-----|--------|
| **0-3 pts** | 6 | **66.7%** | **+27.2%** | ✅ Profitable |
| **3-6 pts** | 10 | 50.0% | -4.6% | ⚠️ Break-even |
| **6-10 pts** | 6 | **66.7%** | **+27.2%** | ✅ Profitable |
| **10+ pts** | 25 | **32.0%** | **-38.9%** | ❌ **LOSING** |

**CRITICAL FINDING**: 

When the model disagrees STRONGLY with the market (10+ point edge), the model is **WRONG 68% of the time**.

This is **backwards** - we expect higher confidence with larger edges. Instead:
- ✅ Small disagreements (0-6 pts): Model is often right
- ❌ Large disagreements (10+ pts): Model is usually wrong

**This explains Ohio State @ Purdue**: Model says pick'em, market says -29.5 (29.5 pt edge). Based on backtest, the **market is probably right**.

---

## 3. Worst Predictions

Top 5 errors from 2024 backtest:

1. **Jacksonville State @ Louisville**: Off by 47.4 points
   - Model: -12.4 | Market: 28.5 | Actual: +35

2. **App State @ Clemson**: Off by 41.5 points
   - Model: 4.5 | Market: 16.5 | Actual: +46

3. **Tennessee @ NC State**: Off by 39.5 points
   - Model: -1.5 | Market: 8.5 | Actual: -41

4. **Central Michigan @ FIU**: Off by 36.5 points
   - Model: -0.5 | Market: -3.5 | Actual: +36

5. **UTSA @ Texas State**: Off by 36.2 points
   - Model: 2.8 | Market: -2.5 | Actual: +39

**PATTERN**: Most errors involve large favorites (FBS vs. smaller programs). Model consistently underestimates blowouts.

---

## Root Causes

### 1. Power Rating Formula Issues

**Problem**: Weights may not be optimal.

Current weights emphasize YPP Off (30%) heavily, but this may not translate to point differential in mismatches.

**Hypothesis**: The formula works reasonably well for evenly-matched teams but breaks down for:
- Elite vs. mediocre matchups
- P5 vs. G5/FCS matchups
- Teams with extreme talent gaps

### 2. Missing Talent/Recruiting Adjustment

Power ratings don't account for:
- **Talent Composite** (247 Sports recruiting rankings)
- **Blue Chip Ratio** (percentage of 4/5-star recruits)
- **Coach quality** (HC/coordinator experience)

**Example**: Ohio State has elite talent (top-5 recruiting), Purdue does not. This amplifies performance gaps beyond what stats show.

### 3. Home Field Advantage Too Generic

**Current**: HFA = 2.0 points (constant for all teams)

**Reality**: HFA varies widely:
- LSU Death Valley: ~4-5 pts
- Smaller programs: ~1-2 pts
- Neutral sites: 0 pts

### 4. Database Integrity Issue

**Power ratings in database don't match formula** - suggests:
- Ratings pipeline is broken or outdated
- Different formula is being used (undocumented)
- Migration/update issue

---

## Recommendations

### Immediate Actions

1. **✅ Fix Database Power Ratings**
   - Re-run ratings pipeline with documented formula
   - Verify all 2025 ratings match calculated values
   - Add integrity checks to prevent future drift

2. **✅ Flag Large-Edge Bets**
   - When edge > 10 pts, add warning: "Model strongly disagrees with market - proceed with caution"
   - Consider inverting the pick (trust the market for extreme edges)
   - Show in UI: "Market consensus is strong - model may be wrong"

3. **✅ Improve Power Rating Formula**
   - Add talent composite as a factor (weight: 0.15)
   - Adjust weights based on backtest performance
   - Test alternative formulas (see Options below)

### Formula Improvement Options

#### Option A: Add Talent Factor
```
powerRating = 
  0.15 × zscore(epaOff) +
  0.20 × zscore(epaDef) +
  0.25 × zscore(yppOff) +
  0.15 × zscore(yppDef) +
  0.15 × zscore(successOff) +
  0.20 × zscore(successDef) +
  0.15 × zscore(talentComposite)  // NEW
```

#### Option B: Use Simple Rating + Adjustments
```
baseRating = (epaOff - epaDef) × 10  // Core rating from EPA
adjustments = 
  + talentBonus (elite talent = +5 to +10 pts)
  + coachBonus (elite HC = +2 to +5 pts)
  - inconsistencyPenalty (high variance = -2 to -5 pts)
  
powerRating = baseRating + adjustments
```

#### Option C: Hybrid Model
Use existing power ratings for "confidence interval" but defer to market for extreme lines:

```
if |modelSpread - marketSpread| > 10:
  adjustedSpread = marketSpread + (modelSpread - marketSpread) × 0.25
  // Trust market 75%, model 25% for extreme disagreements
else:
  adjustedSpread = modelSpread
```

### Testing Framework

1. **Backtest on 2022-2024** (3 full seasons)
   - Need ~3,000+ games for statistical significance
   - Current backtest only has 47 games (1.3% coverage)
   - **Action**: Ingest historical power ratings for all games

2. **Track Metrics**:
   - Win rate overall
   - Win rate by edge bucket (0-3, 3-6, 6-10, 10+)
   - ROI by grade (A, B, C)
   - Calibration (do 60% prob picks win 60% of time?)

3. **Live Tracking (2025 Season)**:
   - Track all picks in real-time
   - Compare model vs. actual results weekly
   - Adjust formula between seasons based on performance

---

## Next Steps

### Phase 1: Immediate Fixes (This Week)
- ✅ Document findings (this file)
- ✅ Create audit scripts for ongoing monitoring
- ✅ Create backtest framework
- 🔲 Fix database power ratings (re-run pipeline)
- 🔲 Add "large edge" warning to UI
- 🔲 Update Ohio @ Purdue and similar games

### Phase 2: Formula Improvements (Next 2 Weeks)
- 🔲 Add talent composite to power rating formula
- 🔲 Test alternative formulas on historical data
- 🔲 Implement team-specific HFA
- 🔲 Add coach quality adjustments

### Phase 3: Comprehensive Backtest (Next Month)
- 🔲 Ingest 2022-2024 power ratings
- 🔲 Run full backtest (3,000+ games)
- 🔲 Optimize weights based on results
- 🔲 Validate formula before 2026 season

---

## Conclusion

The current power rating system is **fundamentally flawed** and produces **wildly inaccurate predictions** for games with large talent gaps (like Ohio State @ Purdue).

**Key Insights**:
1. Database ratings don't match formula (integrity issue)
2. Formula underestimates blowouts (talent gap not captured)
3. Model is WRONG when it strongly disagrees with market (10+ pt edge)

**Immediate Action**: Flag large-edge games and trust the market for extreme disagreements until formula is improved.

**Long-term Action**: Redesign power rating formula to incorporate talent, adjust for matchup quality, and validate with comprehensive backtesting.

