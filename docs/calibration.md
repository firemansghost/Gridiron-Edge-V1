# Power Rating Calibration

## V1 Linear Ratings Contract

### Core Algorithm
**Linear Regression Model**:
- Dependent variable: Point differential
- Independent variables: Team strength features
- No non-linear transformations or interactions
- Simple, interpretable, and fast to compute

**Feature Set (V1)**:
- Points per game (offensive)
- Points allowed per game (defensive)
- Yards per game (offensive)
- Yards allowed per game (defensive)
- Turnover margin
- Third down conversion rate

### Opponent Adjustment
**Simple Strength of Schedule**:
- Calculate each team's average opponent rating
- Weight recent games more heavily (exponential decay: 0.9^weeks_ago)
- No recursive adjustment (keep it linear)
- Final ratings normalized to mean=0, std=1

**No Complex Features**:
- No EPA or success rate (not available in V1)
- No pace adjustments
- No weather factors
- No injury adjustments

## Rating to Spread Mapping

### Linear Conversion
**Simple Formula**:
```
implied_spread = (home_rating - away_rating) * 2.5 + HFA
implied_total = (home_offensive_rating + away_offensive_rating) * 1.2
```

**Constants**:
- Rating multiplier: 2.5 (validated against historical data)
- Total multiplier: 1.2 (validated against historical data)
- Home field advantage: 2.5 points (constant across all teams)

### No Advanced Adjustments
- No rest advantages
- No travel distance
- No weather factors
- No situational adjustments

## Confidence Tiers (V1)

### Tier A (High Confidence)
- Rating difference > 1.5 standard deviations
- Historical accuracy > 70%
- Recent form supports rating
- No major injuries or suspensions

### Tier B (Medium Confidence)
- Rating difference 1.0-1.5 standard deviations
- Historical accuracy 60-70%
- Some uncertainty in recent form
- Minor injury concerns

### Tier C (Low Confidence)
- Rating difference < 1.0 standard deviations
- Historical accuracy 50-60%
- High uncertainty in recent form
- Major injury or suspension concerns

## Home Field Advantage (V1)

### Constant HFA
**Fixed Value**: 2.5 points for all teams
- No conference-specific adjustments
- No situational adjustments
- No dynamic adjustments
- Simple and consistent

### No Advanced HFA
- No rivalry game adjustments
- No night game adjustments
- No weather adjustments
- No travel distance adjustments

## Anti-Leakage Measures

### Temporal Validation
- Never use future information in past predictions
- Strict train/test splits by date
- Rolling window validation for model updates
- Out-of-sample testing for all features

### Feature Selection
- Only use publicly available information
- Exclude betting market information
- Avoid features that correlate with outcomes too strongly
- Regular feature importance analysis

### Model Validation
- Walk-forward analysis for backtesting
- Cross-validation with time-based splits
- Performance degradation monitoring
- Regular model retraining schedule

## M3 Seed-Mode Assumptions

### Seed-Only Features
- **Constant HFA**: 2.0 points for all teams (no conference-specific adjustments)
- **Fixed Weights**: ypp_off=0.3, ypp_def=0.3, success_off=0.2, success_def=0.2
- **Seed-Only Z-Scores**: Computed only from seed week data (not full season)
- **Fixed Thresholds**: A≥4.0 pts, B≥3.0 pts, C≥2.0 pts edge
- **Simple Totals**: Base 45 + pace adjustment (not sophisticated)

### Spread Sign Convention (M3.5)
- **Home Minus Away**: Negative spread = home team favored
- **Model Line Format**: "Team -3.0" or "Team +3.0" (favored team with line)
- **Edge Calculation**: |Model Spread - Market Spread| points
- **Rounding**: Lines rounded to nearest 0.5 (e.g., 48.6126 → 48.5)
- **HFA Points**: 2.0 points added to home team in model calculations

### Seed Data Limitations
- **Single Week**: Only CFB 2024 Week 1 data available
- **Basic Stats**: No EPA, success rate, or advanced metrics
- **No Recruiting**: Talent index defaults to 0
- **No Weather**: No environmental factors considered
- **No Injuries**: No injury adjustments

### M3 Implementation Notes
- **Linear Regression**: Simple weighted combination of z-scored features
- **No Opponent Adjustment**: Raw stats only (no SOS correction)
- **Constant Pace**: Not used in v1 calculations
- **Market Data**: Uses closing lines from seed market_lines.json
- **Model Version**: v0.0.1 for all calculations

## V1 Limitations

### Missing Features
- No EPA or success rate
- No pace adjustments
- No weather factors
- No injury adjustments
- No situational adjustments

### Simple Approach
- Linear regression only
- No non-linear transformations
- No interaction terms
- No complex feature engineering

### Future Enhancements (V2+)
- Add EPA and success rate when available
- Implement pace adjustments
- Connect to real-time injury and weather APIs
- Implement situational adjustments

## M6 Lite Adjustments (Server-Side Heuristics)

### Purpose
Apply optional injury and weather adjustments to improve model accuracy without requiring external API integrations yet. These are computed in the API layer using mock data for demonstration.

### Injury Adjustments

**Position-Based Impact (to spread):**
- **QB out**: -2.5 pts to affected team
- **QB questionable**: -1.25 pts
- **OL/DL out**: -1.0 pts
- **WR/RB out**: -0.75 pts
- **DB out**: -0.5 pts

**Rationale:**
- Quarterback is the most impactful position
- Line injuries compound (multiple injuries = cumulative effect)
- Skill position players have moderate impact
- Conservative estimates to avoid over-adjustment

### Weather Adjustments

**Wind Impact:**
- Wind ≥ 15 mph: -1.5 to -3.0 pts on total
- Favors run-heavy teams slightly (+0.5 spread adjustment)
- Formula: `-1.5 - (windMph - 15) * 0.1`, max -3.0

**Precipitation:**
- Rain: -1.0 pts to total
- Snow: -2.0 pts to total

**Temperature:**
- < 20°F: -1.5 pts to total

**Rationale:**
- High wind reduces passing efficiency, lowering scoring
- Precipitation makes ball handling and footing difficult
- Extreme cold reduces offensive efficiency
- Run-heavy teams less affected by weather

### Confidence Thresholds (M6 Tuned)

**Updated tiers based on adjusted edge:**
- **A Tier**: ≥ 3.5 pts edge
- **B Tier**: ≥ 2.5 pts edge  
- **C Tier**: ≥ 1.5 pts edge

**Changes from M3:**
- Raised A threshold from 3.0 to 3.5 (tighter threshold)
- Raised B threshold from 2.0 to 2.5
- Raised C threshold from 1.5 to 2.0

**Rationale:**
- Adjustments can amplify edge, so higher thresholds maintain quality
- More conservative A/B tier assignments
- Better ROI expectation for top-tier picks

### Usage

**API Query Parameters:**
- `?injuries=on` - Enable injury adjustments
- `?weather=on` - Enable weather adjustments
- Both can be toggled independently

**Response Fields:**
- `impliedSpreadAdj` - Adjusted spread
- `impliedTotalAdj` - Adjusted total
- `adjustments.injuryAdjPts` - Injury impact on spread
- `adjustments.weatherAdjPts` - Weather impact on spread/total
- `adjustments.totalAdjPts` - Combined adjustment
- `adjustments.breakdown` - Human-readable explanation

### Limitations

- **Mock data only**: Currently using hardcoded examples
- **No player names**: Position-based only, no specific player tracking
- **No team style detection**: Assumes balanced offense for weather adjustments
- **No venue-specific factors**: Weather applied uniformly
- **No injury clusters**: Multiple injuries on same unit not specially weighted

### Future Improvements (V3+)

- Integrate real injury reports API
- Connect to weather forecast API
- Add team offensive style detection (pass/run heavy)
- Implement venue-specific wind/weather patterns
- Track specific player impact beyond position
- Add injury cluster penalties (e.g., multiple OL out)
- Historical weather game analysis for calibration
