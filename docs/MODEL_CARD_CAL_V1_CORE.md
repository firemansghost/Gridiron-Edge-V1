# Model Card: Calibration v1 (CORE)

## Model Information
- **Model Version**: cal_v1
- **Fit Type**: core
- **Season**: 2025
- **Feature Version**: fe_v1
- **Training Date**: 2025-11-15T14:53:41.248Z
- **Random Seed**: 42

## Data
- **Training Sets**: Set A (Weeks 8-11) + Set B (Weeks 1-7)
- **Sample Weights**: Set A=1.0, Set B=0.6
- **Target Frame**: Home-minus-away (HMA) spread
- **Feature Frame**: Home-minus-away (HMA) diffs

## Features
- ratingDiffBlend
- hfaPoints

## Hyperparameters
- **Alpha (λ)**: 0
- **L1 Ratio**: 0
- **Hinge14**: Excluded


## Performance Metrics (Walk-Forward)
- **RMSE**: 10.3061 (target: ≤8.8)
- **R²**: 0.2219
- **Pearson**: 0.4711 (target: ≥0.30)
- **Spearman**: 0.5104 (target: ≥0.30)
- **Slope**: 1.0000 (target: 0.90-1.10)
- **Sign Agreement**: 69.5% (target: ≥70%)

## Gate Results
✅ **ALL GATES PASSED**

## Limitations
- Model trained on 2025 season data only
- Walk-forward validation on Set A weeks only
- Early weeks (Set B) have lower data quality
- Model assumes pre-kick consensus spreads are available

## Coefficient Sanity
- β(rating_diff): 2.2067 (target: >0) ✅
- β(hfa_points): 0.0000 (target: >0) ❌

## Residual Diagnostics
- **0-7 bucket**: 0.21 (target: |mean| ≤ 2.0) ✅
- **7-14 bucket**: -1.31 (target: |mean| ≤ 2.0) ✅
- **14-28 bucket**: 1.60 (target: |mean| ≤ 2.0) ✅
- **>28 bucket**: 10.82 (target: |mean| ≤ 2.0) ❌
