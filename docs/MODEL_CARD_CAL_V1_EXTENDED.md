# Model Card: Calibration v1 (EXTENDED)

## Model Information
- **Model Version**: cal_v1
- **Fit Type**: extended
- **Season**: 2025
- **Feature Version**: fe_v1
- **Training Date**: 2025-11-13T23:44:42.385Z
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
- **Alpha (λ)**: 0.0001
- **L1 Ratio**: 0
- **Hinge14**: Excluded
- **Post-hoc Calibration Head**: ŷ* = -1.3143 + -0.0665 * ŷ

## Performance Metrics (Walk-Forward)
- **RMSE**: 12.9254 (target: ≤9.0)
- **R²**: -0.8098
- **Pearson**: 0.0525 (target: ≥0.30)
- **Spearman**: 0.0003 (target: ≥0.30)
- **Slope**: 1.0000 (target: 0.90-1.10)
- **Sign Agreement**: 53.1% (target: ≥70%)

## Gate Results
❌ **GATES FAILED**

## Limitations
- Model trained on 2025 season data only
- Walk-forward validation on Set A weeks only
- Early weeks (Set B) have lower data quality
- Model assumes pre-kick consensus spreads are available

## Coefficient Sanity
- β(rating_diff): -0.5116 (target: >0) ❌
- β(hfa_points): 0.6525 (target: >0) ✅

## Residual Diagnostics
- **0-7 bucket**: -0.13 (target: |mean| ≤ 2.0) ✅
- **7-14 bucket**: 0.34 (target: |mean| ≤ 2.0) ✅
- **14-28 bucket**: -1.60 (target: |mean| ≤ 2.0) ✅
- **>28 bucket**: 8.98 (target: |mean| ≤ 2.0) ❌
