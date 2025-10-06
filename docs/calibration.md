# Power Rating Calibration

## Feature Engineering

### Statistical Features
**Offensive Metrics**:
- Points per game (z-scored)
- Yards per game (z-scored)
- Turnover margin (z-scored)
- Third down conversion rate (z-scored)

**Defensive Metrics**:
- Points allowed per game (z-scored, inverted)
- Yards allowed per game (z-scored, inverted)
- Sacks per game (z-scored)
- Interceptions per game (z-scored)

**Special Teams**:
- Field goal percentage (z-scored)
- Punt return average (z-scored)
- Kick return average (z-scored)

### Opponent Adjustment
**Strength of Schedule Calculation**:
- Calculate each team's average opponent rating
- Weight recent games more heavily (exponential decay)
- Adjust for home/away splits
- Account for conference strength

**Recursive Adjustment**:
- Initial ratings based on raw statistics
- Recalculate with opponent-adjusted stats
- Iterate until convergence (max 10 iterations)
- Final ratings normalized to mean=0, std=1

## Rating to Spread Mapping

### Power Rating Delta
- Calculate difference between team ratings
- Apply home field advantage (typically 2-3 points)
- Account for rest advantages (bye weeks, short weeks)

### Spread Conversion
- Linear mapping: spread = rating_diff * 2.5 + HFA
- Validate against historical accuracy
- Adjust multiplier based on model performance
- Confidence intervals based on rating uncertainty

### Total Calculation
- Offensive rating + Defensive rating (opponent)
- Pace adjustment for team tempo
- Weather factors (temperature, wind, precipitation)
- Historical total accuracy validation

## Confidence Tiers

### Tier A (High Confidence)
- Rating difference > 1.5 standard deviations
- Strong historical performance (>70% accuracy)
- Recent form supports rating
- No major injuries or suspensions

### Tier B (Medium Confidence)
- Rating difference 1.0-1.5 standard deviations
- Good historical performance (60-70% accuracy)
- Some uncertainty in recent form
- Minor injury concerns

### Tier C (Low Confidence)
- Rating difference < 1.0 standard deviations
- Moderate historical performance (50-60% accuracy)
- High uncertainty in recent form
- Major injury or suspension concerns

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

## Home Field Advantage

### Conference-Specific HFA
- SEC: 3.2 points average
- Big Ten: 2.8 points average
- ACC: 2.5 points average
- Pac-12: 2.3 points average
- Group of 5: 2.0 points average

### Situational Adjustments
- Rivalry games: +0.5 points
- Night games: +0.3 points
- Weather games: Variable based on conditions
- Travel distance: -0.1 points per 100 miles

### Dynamic HFA
- Adjust based on recent home performance
- Account for crowd size and energy
- Weather impact on home advantage
- Conference strength correlation
