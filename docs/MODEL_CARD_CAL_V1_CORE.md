# Model Card: Calibration v1 (CORE)

## Model Information
- **Model Version**: cal_v1
- **Fit Type**: core
- **Season**: 2025
- **Feature Version**: fe_v1
- **Training Date**: 2025-11-13T23:29:33.968Z
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

## Hyperparameters
- **Alpha (λ)**: 0.0001
- **L1 Ratio**: 0
- **Hinge14**: Excluded
- **Post-hoc Calibration Head**: ŷ* = -1.1098 + -0.0698 * ŷ

## Performance Metrics (Walk-Forward)
- **RMSE**: 14.6541 (target: ≤8.8)
- **R²**: -0.4920
- **Pearson**: 0.0417 (target: ≥0.30)
- **Spearman**: 0.0659 (target: ≥0.30)
- **Slope**: 1.0000 (target: 0.90-1.10)
- **Sign Agreement**: 52.6% (target: ≥70%)

## Gate Results
❌ **GATES FAILED**

## Limitations
- Model trained on 2025 season data only
- Walk-forward validation on Set A weeks only
- Early weeks (Set B) have lower data quality
- Model assumes pre-kick consensus spreads are available

## Coefficient Sanity
- β(rating_diff): 0.7657 (target: >0) ✅
- β(hfa_points): 0.0631 (target: >0) ✅

## Residual Diagnostics
- **0-7 bucket**: -0.12 (target: |mean| ≤ 2.0) ✅
- **7-14 bucket**: -0.05 (target: |mean| ≤ 2.0) ✅
- **14-28 bucket**: -2.47 (target: |mean| ≤ 2.0) ❌
- **>28 bucket**: 9.06 (target: |mean| ≤ 2.0) ❌
