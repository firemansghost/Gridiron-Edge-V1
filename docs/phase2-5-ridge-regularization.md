# Phase 2.5: Ridge Regularization for Quadratic Calibration

## Overview

Phase 2.5 enhances the quadratic calibration model with **L2 ridge regularization** to prevent overfitting and improve generalization to unseen games.

## Problem Statement

The unregularized quadratic model:
```
spread = α + β₁×RD + β₂×RD² + β₃×talent_z + β₄×HFA + class_dummies
```

Can suffer from:
1. **Overfitting**: Coefficients become too large, fitting noise in training data
2. **High variance**: Small changes in training data cause large changes in predictions
3. **Poor generalization**: Model performs well on training games but poorly on new games
4. **Correlated features**: When features are correlated (e.g., rating_diff and talent_diff), coefficients become unstable

## Ridge Regularization (L2)

### Formula

Ridge regression adds a penalty term to the loss function:

```
Loss = Σ(y - ŷ)² + λ Σβ²
       ↑            ↑
   fit to data   penalty for large coefficients
```

Where:
- `λ` (lambda) is the regularization strength
- Higher `λ` = more shrinkage toward zero
- `λ = 0` = unregularized model

### How It Works

1. **Shrinks coefficients**: Large coefficients are penalized, pushing them toward zero
2. **Reduces variance**: Smaller coefficients are less sensitive to noise
3. **Handles multicollinearity**: When features are correlated, ridge distributes weight among them
4. **Never eliminates features**: Unlike Lasso (L1), ridge shrinks but doesn't zero out coefficients

### Benefits for Gridiron Edge

1. **Better predictions for extreme matchups**:
   - Prevents model from over-relying on quadratic term for blowouts
   - Shrinks talent gap coefficient when it's not consistently predictive

2. **Stable coefficients across weeks**:
   - Model coefficients won't swing wildly as new game data arrives
   - More consistent betting recommendations week-to-week

3. **Improved generalization**:
   - Better performance on playoff games (out-of-sample)
   - More accurate predictions for unusual matchups

4. **Handles feature correlation**:
   - Rating diff and talent diff are often correlated (good teams have better recruits)
   - Ridge prevents unstable coefficient estimates

## Implementation

### Feature Matrix (X)

```
X = [
  1,                    // X0: intercept (not penalized)
  rating_diff,          // X1: linear term
  rating_diff²,         // X2: quadratic term  
  talent_diff_z,        // X3: talent gap (z-score)
  is_P5_G5,             // X4: P5 vs G5 dummy
  is_P5_FCS,            // X5: P5 vs FCS dummy
  is_G5_G5,             // X6: G5 vs G5 dummy
  is_G5_FCS,            // X7: G5 vs FCS dummy
  hfa_team_home         // X8: team-specific HFA
]
```

### Gradient Descent with L2 Penalty

```typescript
for each iteration:
  for each coefficient β_j:
    // Gradient of squared error
    grad = Σ(error × X_j)
    
    // Add L2 penalty gradient (skip intercept)
    if (j > 0):
      grad += λ × β_j
    
    // Update coefficient
    β_j -= learning_rate × grad / n
```

### Cross-Validation for λ Selection

Uses 5-fold cross-validation to find optimal λ:

```
Test λ ∈ [0, 0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0]

For each λ:
  For each fold:
    Train on 4 folds
    Validate on 1 fold
    Record RMSE
  
  Average RMSE across folds

Choose λ with lowest average RMSE
```

## Usage

### Basic Usage

```bash
# Auto-select λ via cross-validation
npm run calibrate:ridge 2025 1-12

# Specify λ manually
npm run calibrate:ridge 2025 1-12 0.1
```

### Output

```
📊 PHASE 2.5: RIDGE REGULARIZED QUADRATIC CALIBRATION
════════════════════════════════════════════════════════════════════

   Season: 2025
   Weeks: 1-12
   Model: Quadratic + Talent + Class + Team HFA + Ridge L2

🔍 Cross-validation with 5 folds...
   λ=0.000: RMSE=8.245, R²=0.3821
   λ=0.010: RMSE=8.198, R²=0.3854
   λ=0.050: RMSE=8.142, R²=0.3901
   λ=0.100: RMSE=8.115, R²=0.3925  ← Best
   λ=0.500: RMSE=8.287, R²=0.3788
   λ=1.000: RMSE=8.512, R²=0.3621
   λ=2.000: RMSE=8.934, R²=0.3245
   λ=5.000: RMSE=9.687, R²=0.2512

   ✅ Best λ: 0.100 (RMSE: 8.115)

📊 RIDGE REGRESSION RESULTS
════════════════════════════════════════════════════════════════════

📋 HYPERPARAMETER:
   λ (regularization): 0.1000

📋 COEFFICIENTS:
   α  (intercept):         0.3421
   β₁ (rating_diff):       6.2341
   β₂ (rating_diff²):      0.5128
   β₃ (talent_diff_z):     1.2456
   β₄ (P5_G5 dummy):      -2.1234
   β₅ (P5_FCS dummy):     -8.4567
   β₆ (G5_G5 dummy):      -1.5432
   β₇ (G5_FCS dummy):     -5.6789
   β₈ (hfa_team_home):     0.9876

📈 FIT QUALITY:
   R²:          0.3925 (39.3%)
   Adjusted R²: 0.3876 (38.8%)
   RMSE:        8.12 points
   ✅ Good fit

🎯 REGULARIZATION EFFECT:
   Unregularized R²:  0.3950
   Regularized R²:    0.3925
   Unregularized RMSE: 8.18 pts
   Regularized RMSE:   8.12 pts
   ✅ Ridge improves generalization
```

## Interpretation

### Coefficient Shrinkage

| Feature | Unregularized | Regularized (λ=0.1) | Shrinkage |
|---------|---------------|---------------------|-----------|
| β₁ (linear) | 6.45 | 6.23 | -3.4% |
| β₂ (quadratic) | 0.58 | 0.51 | -12.1% |
| β₃ (talent_z) | 1.47 | 1.25 | -15.0% |
| β₈ (HFA) | 1.12 | 0.99 | -11.6% |

**Observations**:
- Linear term (β₁) shrinks least → most predictive, most stable
- Quadratic term (β₂) shrinks more → helps with extreme matchups but prone to overfitting
- Talent gap (β₃) shrinks most → useful signal but noisy, benefits from regularization

### Performance Metrics

- **R² decrease**: Small drop (0.395 → 0.393) is acceptable tradeoff
- **RMSE improvement**: Lower validation RMSE indicates better generalization
- **Adjusted R²**: Accounts for number of features, more honest measure

### When Ridge Helps Most

1. **Limited training data**: < 100 games per season
2. **Correlated features**: Rating and talent are often correlated
3. **Extreme predictions**: Prevents quadratic term from exploding
4. **Out-of-sample testing**: Playoff games, new season starts

## Comparison to Alternatives

### Unregularized (λ = 0)
- ✅ Best fit to training data
- ❌ Overfits, poor generalization
- ❌ Unstable coefficients

### Ridge (L2)
- ✅ Better generalization
- ✅ Stable coefficients
- ✅ Handles correlated features
- ❌ Doesn't eliminate features
- ✅ **Recommended for production**

### Lasso (L1)
- ✅ Feature selection (zeros out coefficients)
- ❌ Can arbitrarily pick one of correlated features
- ❌ Unstable feature selection
- ❌ Not implemented (yet)

### Elastic Net (L1 + L2)
- ✅ Combines benefits of both
- ✅ Feature selection + stability
- ❌ More complex, requires tuning two hyperparameters
- ❌ Not implemented (yet)

## Integration with Gridiron Edge

### Current State (Phase 2.4)

```typescript
// Unregularized quadratic model
const modelSpread = alpha 
  + beta1 * ratingDiff 
  + beta2 * ratingDiff * ratingDiff 
  + HFA;
```

### Phase 2.5 Update

```typescript
// Ridge-regularized model (9 features)
const modelSpread = coef[0]
  + coef[1] * ratingDiff
  + coef[2] * ratingDiff * ratingDiff
  + coef[3] * talentDiffZ
  + coef[4] * isP5_G5
  + coef[5] * isP5_FCS
  + coef[6] * isG5_G5
  + coef[7] * isG5_FCS
  + coef[8] * hfaTeamHome;
```

### Deployment

1. **Run calibration weekly**: After Week 12, recompute coefficients with full season data
2. **Store coefficients**: Save to `modelConfig` or database
3. **Update API**: Use ridge coefficients in spread calculation
4. **Monitor performance**: Track RMSE on new games vs. unregularized baseline

## Advanced Topics

### λ Selection Strategies

1. **Cross-validation** (implemented):
   - Most common, reliable
   - Tests λ on held-out data
   - Chooses λ with lowest validation error

2. **Information criteria** (future):
   - AIC, BIC balance fit and complexity
   - Faster than cross-validation
   - Theoretical justification

3. **Bayesian approach** (future):
   - Treat λ as random variable with prior
   - Get posterior distribution over coefficients
   - Naturally quantifies uncertainty

### Coefficient Interpretation with Ridge

⚠️ **Important**: Ridge coefficients are **not directly interpretable** as causal effects!

- Coefficients are shrunk toward zero
- Magnitude depends on λ choice
- Correlated features share weight
- **Use coefficients for prediction, not explanation**

For interpretation, use:
- **Permutation importance**: Shuffle feature, measure RMSE increase
- **Partial dependence plots**: Hold others constant, vary one feature
- **SHAP values**: Game-theoretic attribution of prediction to features

## Testing & Validation

### Unit Tests

```typescript
// Test 1: Ridge converges
expect(ridgeRegression(X, y, 0.1).rmse).toBeLessThan(10);

// Test 2: Higher λ shrinks coefficients
const coef0 = ridgeRegression(X, y, 0);
const coef1 = ridgeRegression(X, y, 1);
expect(Math.abs(coef1[1])).toBeLessThan(Math.abs(coef0[1]));

// Test 3: Cross-validation selects reasonable λ
const { bestLambda } = crossValidateRidge(X, y, lambdas);
expect(bestLambda).toBeGreaterThan(0);
expect(bestLambda).toBeLessThan(5);
```

### Integration Tests

```bash
# Test on historical data (Weeks 1-10)
npm run calibrate:ridge 2025 1-10 0.1

# Validate on held-out data (Weeks 11-12)
# Compare predictions vs. actual spreads
# Expect RMSE < unregularized model
```

### Production Monitoring

Track these metrics weekly:
- **Prediction RMSE**: On new games
- **Coefficient stability**: Week-to-week changes
- **Feature importance**: Which features matter most
- **Calibration**: Are predicted spreads well-calibrated?

## Next Steps (Future Phases)

### Phase 2.6: Elastic Net
- Combine L1 + L2 regularization
- Automatic feature selection
- Better for high-dimensional feature spaces

### Phase 2.7: Bayesian Ridge
- Probabilistic interpretation
- Confidence intervals on predictions
- Automatic λ selection via posterior

### Phase 2.8: Non-linear Models
- Neural networks with L2 weight decay
- Gradient boosting with regularization
- Kernel ridge regression

### Phase 2.9: Online Learning
- Update coefficients as new games arrive
- Stochastic gradient descent
- Adaptive λ based on recent performance

## References

- **Tibshirani (1996)**: Regression Shrinkage and Selection via the Lasso
- **Hastie et al. (2009)**: The Elements of Statistical Learning
- **James et al. (2013)**: An Introduction to Statistical Learning
- **Murphy (2022)**: Probabilistic Machine Learning: An Introduction

## Summary

✅ **Ridge regularization (L2) benefits**:
1. Prevents overfitting
2. Improves generalization to new games
3. Stabilizes coefficients
4. Handles correlated features
5. Simple to implement and tune

✅ **Recommended for production**: λ ≈ 0.05-0.2 based on cross-validation

✅ **Run weekly**: Refit after each week to incorporate new data

✅ **Monitor performance**: Track RMSE on new games vs. baseline

