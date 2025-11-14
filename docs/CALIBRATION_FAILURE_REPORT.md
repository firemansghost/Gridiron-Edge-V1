# Calibration Failure Report - Core (cal_v1_core)

**Date:** 2025-01-29  
**Run:** Initial Core calibration attempt  
**Status:** ❌ **FAILED - Multiple Gates**

---

## Gate Results

| Gate | Target | Observed | Status |
|------|--------|----------|--------|
| **RMSE** | ≤ 8.8 | 14.65 | ❌ FAIL |
| **Slope** | 0.90–1.10 | 1.00 | ✅ PASS |
| **Pearson** | ≥ 0.30 | 0.0417 | ❌ FAIL |
| **Spearman** | ≥ 0.30 | 0.0659 | ❌ FAIL |
| **Sign Agreement** | ≥ 70% | 52.6% | ❌ FAIL |
| **β(rating_diff)** | > 0 | 0.766 | ✅ PASS |
| **β(hfaPoints)** | > 0 | 0.063 | ✅ PASS (weak) |
| **Residual 0-7** | \|mean\| ≤ 2.0 | -0.12 | ✅ PASS |
| **Residual 7-14** | \|mean\| ≤ 2.0 | -0.05 | ✅ PASS |
| **Residual 14-28** | \|mean\| ≤ 2.0 | -2.47 | ❌ FAIL |
| **Residual >28** | \|mean\| ≤ 2.0 | 9.06 | ❌ FAIL |

**Overall:** ❌ **ALL GATES FAILED** (`allPassed: false`)

---

## Critical Issues

### 1. Calibration Head Has Negative Slope ⚠️
- **Observed:** `slope = -0.0698`
- **Expected:** Positive slope (typically 0.90–1.10)
- **Impact:** Raw predictions are in the wrong direction
- **Root Cause:** Likely frame misalignment or blend not being used

### 2. Feature Name Mismatch
- **Observed:** Feature name is `"ratingDiffV2"` in results
- **Expected:** Should be `"ratingDiffBlend"` if blend is active
- **Impact:** Blend may not be loading/used correctly

### 3. Very Weak Correlations
- **Walk-forward Pearson:** -0.0446 (negative!)
- **Walk-forward Spearman:** -0.0487 (negative!)
- **Train Pearson:** 0.1376 (still weak)
- **Impact:** Model has no predictive signal

### 4. High RMSE
- **Walk-forward RMSE:** 17.03
- **Target:** ≤ 8.8
- **Impact:** Model predictions are far off

### 5. Missing Artifacts
- `core_metrics.csv` - ❌ Missing
- `core_variance_pre_post.csv` - ❌ Missing
- `core_10game_sanity.csv` - ❌ Missing
- **Impact:** Cannot verify variance ratio or frame alignment

---

## Diagnostic Steps Needed

### Step 1: Verify Blend is Loading
```bash
# Check if blend config exists
cat reports/rating_blend_config.json

# Check if MFTR ratings exist
ls reports/mftr_ratings_ridge.csv
```

### Step 2: Check Frame Alignment
- Sample 50 rows from training data
- Verify target = HMA (home - away)
- Verify rating_diff = home - away
- Check sign diversity (should be mixed)

### Step 3: Check Variance Ratio
- Need to generate `core_variance_pre_post.csv`
- Verify `std(ŷ_raw)/std(y)` is in [0.6, 1.2]
- If < 0.6, model is over-regularized

### Step 4: Verify HFA
- Check `β(hfaPoints) = 0.063` (very weak, should be ~2-3)
- Verify HFA not baked into ratings
- Check if HFA is being computed correctly

---

## Triage Actions (In Order)

### Action 1: Verify Blend is Active
- [ ] Check `loadMFTRAndBlend()` is being called
- [ ] Verify `mftrRatings` and `blendConfig` are not null
- [ ] Check feature name in `buildFeatureMatrix()` - should be `ratingDiffBlend`
- [ ] Re-run with logging to confirm blend is used

### Action 2: Check Frame Alignment
- [ ] Sample 50 rows, verify target and features are HMA
- [ ] Check sign diversity (≥25% negatives)
- [ ] Verify no accidental filtering of away-favorite games

### Action 3: Check Variance Ratio
- [ ] Re-run with updated code that generates `core_variance_pre_post.csv`
- [ ] If `ratio_raw < 0.6`, lower α grid
- [ ] If `ratio_raw > 1.2`, increase α

### Action 4: Verify HFA Computation
- [ ] Check `hfaPoints` values in training rows
- [ ] Verify HFA not double-counted in ratings
- [ ] Check if HFA should be stronger (β should be ~2-3)

---

## Next Steps

1. **Re-run with updated code** that generates all artifacts
2. **Add logging** to verify blend is loading and being used
3. **Verify frame alignment** with 50-row sample
4. **Check variance ratio** - if < 0.6, adjust regularization
5. **If still failing**, document root cause and stop (don't paper over)

---

## Files Generated

- ✅ `reports/cal_fit_core.json` (full report)
- ✅ `reports/residuals_core.csv` (residual buckets)
- ✅ `reports/top_outliers_core.csv` (top 20 outliers)
- ✅ `docs/MODEL_CARD_CAL_V1_CORE.md` (model card)
- ❌ `reports/core_metrics.csv` (missing - need updated code)
- ❌ `reports/core_variance_pre_post.csv` (missing - need updated code)
- ❌ `reports/core_10game_sanity.csv` (missing - need updated code)

---

## Hyperparameters Used

- **Alpha:** 0.0001 (very low - ridge-heavy)
- **L1 Ratio:** 0.0 (pure ridge)
- **Hinge14:** false
- **Weights:** true (Set A=1.0, Set B=0.6)
- **Random Seed:** 42

---

## Conclusion

The calibration failed due to:
1. **Likely blend not being used** (feature name mismatch)
2. **Very weak signal** (negative walk-forward correlations)
3. **Calibration head in wrong direction** (negative slope)
4. **High RMSE** (17.03 vs target 8.8)

**Recommendation:** Re-run with updated code that:
- Generates all required artifacts
- Logs blend loading/usage
- Verifies frame alignment
- Checks variance ratio before applying head

**DO NOT** proceed to Extended until Core passes all gates.

