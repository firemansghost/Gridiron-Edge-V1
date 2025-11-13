# Model Card: Calibration v1 (EXTENDED)

## Model Information
- **Model Version**: cal_v1
- **Fit Type**: extended
- **Season**: 2025
- **Feature Version**: fe_v1
- **Training Date**: 2025-11-13T23:04:59.481Z
- **Random Seed**: 42

## Data
- **Training Sets**: Set A (Weeks 8-11) + Set B (Weeks 1-7)
- **Sample Weights**: Set A=1.0, Set B=0.6
- **Target Frame**: Home-minus-away (HMA) spread
- **Feature Frame**: Home-minus-away (HMA) diffs

## Features
- ratingDiffV2
- hfaPoints
- neutralSite
- p5VsG5
- absRatingDiffV2
- hinge7
- hinge14
- offAdjSrDiff
- defAdjSrDiff
- offAdjExplosivenessDiff
- defAdjExplosivenessDiff
- offAdjPpaDiff
- defAdjPpaDiff
- offAdjEpaDiff
- defAdjEpaDiff
- havocFront7Diff
- havocDbDiff
- edgeSrDiff
- ewma3OffAdjEpaDiff
- ewma5OffAdjEpaDiff
- talent247Diff
- returningProdOffDiff
- returningProdDefDiff

## Hyperparameters
- **Alpha (λ)**: 0.001
- **L1 Ratio**: 0
- **Hinge14**: Excluded
- **Post-hoc Calibration Head**: ŷ* = 7.7074 + 0.2752 * ŷ

## Performance Metrics (Walk-Forward)
- **RMSE**: 7.7180 (target: ≤9.0)
- **R²**: -0.0192
- **Pearson**: 0.2006 (target: ≥0.30)
- **Spearman**: 0.1592 (target: ≥0.30)
- **Slope**: 1.0000 (target: 0.90-1.10)
- **Sign Agreement**: 100.0% (target: ≥70%)

## Gate Results
❌ **GATES FAILED**

## Limitations
- Model trained on 2025 season data only
- Walk-forward validation on Set A weeks only
- Early weeks (Set B) have lower data quality
- Model assumes pre-kick consensus spreads are available

## Coefficient Sanity
- β(rating_diff): -0.5934 (target: >0) ❌
- β(hfa_points): -2.0204 (target: >0) ❌

## Residual Diagnostics
- **0-7 bucket**: -1.55 (target: |mean| ≤ 2.0) ✅
- **7-14 bucket**: -1.24 (target: |mean| ≤ 2.0) ✅
- **14-28 bucket**: 17.94 (target: |mean| ≤ 2.0) ❌
- **>28 bucket**: 0.00 (target: |mean| ≤ 2.0) ✅
