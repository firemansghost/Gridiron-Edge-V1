# Calibration Diagnostic Summary

## Status: Frame Fixed, Signal Weak, Compression High

**Date**: 2025-01-29  
**Issue**: Model compression and weak signal preventing gate passage

---

## ✅ Fixed Issues

1. **Target Frame Normalization Bug** ✅
   - **Problem**: Normalizing to favorite-centric before median computation lost sign information
   - **Fix**: Compute median on raw spreads (preserve sign), then transform to HMA
   - **Result**: Target frame now correct - 53% negative (away favorites), 47% positive (home favorites)

2. **Variance Ratio Gate** ✅
   - **Added**: Raw variance ratio check (0.6-1.2) before calibration head
   - **Behavior**: Calibration head only applied if raw variance ratio is acceptable
   - **Result**: Prevents calibration head from hiding compression issues

---

## ❌ Current Issues

### 1. Extremely Weak Raw Signal
- **Raw Pearson**: 0.01 (target: ≥0.30)
- **Raw Spearman**: 0.03 (target: ≥0.30)
- **std(rating_diff) / std(target)**: 0.335 (very low)
- **Implication**: `ratingDiffV2` has very little predictive power on its own

### 2. Model Compression (Low Variance Ratio)
- **Raw variance ratio**: 0.37-0.71 (target: 0.6-1.2)
- **After calibration head**: 0.01-0.06 (crushed)
- **Implication**: Model is over-regularized or features are collinear

### 3. High RMSE
- **Core**: 14.65-15.49 (target: ≤8.8)
- **Extended**: 12.93-13.32 (target: ≤9.0)
- **Implication**: Model is not capturing enough signal

### 4. Negative β(rating_diff) in Extended
- **Extended β(rating_diff)**: -0.42 to -0.57 (target: >0)
- **Implication**: Feature alignment issue or collinearity with extended features

### 5. Low Sign Agreement
- **Core**: 49-53% (target: ≥70%)
- **Extended**: 53% (target: ≥70%)
- **Implication**: Model predictions don't align with market direction

---

## 🔍 Root Cause Analysis

### Hypothesis 1: V2 Ratings Scale Mismatch
- **Evidence**: `std(rating_diff) = 5.13` vs `std(target) = 15.33` (ratio 0.335)
- **Possible cause**: V2 ratings are on a different scale than spreads
- **Check**: Verify V2 rating distribution and scaling

### Hypothesis 2: Over-Regularization
- **Evidence**: Even with `alpha=0.0001` (very low), variance ratio is still 0.37-0.71
- **Possible cause**: Features are highly collinear, causing Elastic Net to shrink coefficients
- **Check**: Feature correlation matrix, consider dropping collinear features

### Hypothesis 3: Calibration Head Misuse
- **Evidence**: Calibration head slope is negative (-0.07 to -0.03), crushing variance
- **Possible cause**: Head is trying to fix a fundamentally broken model
- **Fix**: Don't apply calibration head if raw variance ratio < 0.6 (already implemented)

### Hypothesis 4: Extended Feature Collinearity
- **Evidence**: Extended model has negative β(rating_diff) despite positive in Core
- **Possible cause**: Extended features (opponent-adjusted nets, EWMAs) are collinear with ratingDiffV2
- **Check**: Feature correlation matrix, consider feature selection

---

## 📋 Next Steps (Priority Order)

### Step 1: Verify V2 Rating Scale
```bash
# Check V2 rating distribution
npx tsx scripts/verify-target-frame.ts --season 2025 --featureVersion fe_v1
```

**Action**: If V2 ratings are on wrong scale, check calibration_factor in database (should be 6.5 per memory).

### Step 2: Feature Correlation Analysis
- Compute correlation matrix for all features
- Identify highly collinear features (|corr| > 0.8)
- Drop or combine collinear features

### Step 3: Try Pure Ridge (l1_ratio=0.0)
- Current grid includes l1_ratio=0.0, but try with even lower alpha
- Test alpha range: [0.00001, 0.00005, 0.0001, 0.0002, 0.0005]
- Goal: Preserve variance while preventing overfitting

### Step 4: Feature Selection for Extended
- If Extended has negative β(rating_diff), drop most collinear extended features
- Start with minimal extended set: just `offAdjSr`, `defAdjSr`, `offAdjEpa`, `defAdjEpa`
- Add features incrementally, checking β(rating_diff) stays positive

### Step 5: Check for Data Leakage
- Verify EWMAs are strictly prior games (no current game)
- Verify opponent-adjusted nets use season-to-date (not current game)
- Check that features are computed at pre-kick time

---

## 📊 Current Metrics (Best Run)

### Core (Weighted, hinge14)
- **RMSE**: 14.65 (target: ≤8.8) ❌
- **Slope**: 1.00 (target: 0.90-1.10) ✅
- **Sign agreement**: 52.6% (target: ≥70%) ❌
- **Pearson**: 0.04 (target: ≥0.30) ❌
- **Spearman**: 0.07 (target: ≥0.30) ❌
- **β(rating_diff)**: 0.77 (target: >0) ✅
- **β(hfa_points)**: 2.1-3.1 (target: >0) ✅
- **Raw variance ratio**: 0.71 (target: 0.6-1.2) ⚠️ (barely passes)
- **Calibrated variance ratio**: 0.64 (target: 0.6-1.2) ⚠️ (barely passes)

### Extended (Weighted, hinge14)
- **RMSE**: 12.93 (target: ≤9.0) ❌
- **Slope**: 1.00 (target: 0.90-1.10) ✅
- **Sign agreement**: 53.1% (target: ≥70%) ❌
- **Pearson**: 0.05 (target: ≥0.30) ❌
- **Spearman**: 0.00 (target: ≥0.30) ❌
- **β(rating_diff)**: -0.51 (target: >0) ❌ **CRITICAL**
- **Raw variance ratio**: 0.91 (target: 0.6-1.2) ✅
- **Calibrated variance ratio**: 0.83 (target: 0.6-1.2) ✅

---

## 🎯 Immediate Action Items

1. **Verify V2 rating scale** - Check if calibration_factor=6.5 is correct
2. **Feature correlation analysis** - Identify collinear features
3. **Fix Extended β(rating_diff)** - Drop collinear extended features until β > 0
4. **Try ultra-low alpha** - Test alpha < 0.0001 to preserve variance
5. **Check data leakage** - Verify EWMAs and opponent-adjusted nets are leak-free

---

## 📝 Notes

- Frame is now correct (53% negative targets)
- Raw signal is extremely weak (Pearson 0.01) - this is the core problem
- Calibration head is correctly skipping when variance ratio is out of range
- Extended model has better variance ratio (0.91) but negative β(rating_diff) - collinearity issue

