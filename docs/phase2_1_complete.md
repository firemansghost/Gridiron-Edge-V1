# Phase 2.1: Talent Gap Feature - COMPLETE ✅

## Summary
Phase 2.1 is fully implemented with FCS imputation, stability guards, unit tests, documentation, and calibration wiring.

## Implementation Checklist

### ✅ 1. FCS Handling + Imputation
- **Raw values**: `talent_home_raw`, `talent_away_raw` loaded from database
- **G5 p10 calculation**: Computed per season, capped at 5th-25th percentile band
- **Imputation logic**: `talent_used = talent_raw ?? g5_p10`
- **Diagnostics**: `imputation.home` and `imputation.away` flags ('none' | 'g5_p10')

### ✅ 2. Z-score Stability Guard
- **Threshold**: `season_std < 0.1` → disable z-score
- **Behavior**: Sets `talent_diff_z = 0` and flags `talent_z_disabled: true`
- **Rationale**: Prevents coefficient explosion in low-variance seasons

### ✅ 3. Unit Tests
- **Location**: `apps/jobs/__tests__/talent-gap.test.ts`
- **Coverage**:
  - D1 vs D1 with both raw present → `*_used == *_raw`, `imputation:'none'`
  - P5 vs FCS (missing away) → `away_used = g5_p10`, `imputation:'g5_p10'`
  - Season with low variance (std=0.05) → `talent_z_disabled:true`, `diff_z=0`
  - Regression hygiene: `diff === home_used - away_used` (within 1e-6)
  - G5 p10 capping at 5th-25th percentile band

### ✅ 4. Documentation
- **Location**: `docs/METHODOLOGY.md` (Section 2.1)
- **Content**:
  - Data source (247 Composite)
  - Feature calculation steps
  - FCS imputation rule
  - Season-scoped normalization
  - Why `diff_z` exists (coefficient comparability)
  - API response structure

### ✅ 5. Calibration Script Wiring
- **Location**: `scripts/calibrate-model-quadratic.ts`
- **Features**:
  - Loads talent data for all games
  - Calculates G5 p10 for imputation
  - Computes `talentDiff` and `talentDiffZ` per game
  - **Pearson correlation**: Prints `r(talent_diff vs market_spread)`
  - **CSV header**: Includes `talentDiff` and `talentDiffZ` columns

### ✅ 6. Canary Script Updates
- **Location**: `scripts/check_canaries.ts`
- **New assertions**:
  - `model_view.features.talent` exists
  - `home_used`, `away_used`, `diff`, `diff_z` numeric (or `diff_z===0` when disabled)
  - Season diagnostics present (`season_mean`, `season_std`)
  - Imputation flags valid
  - Sanity: `diff === home_used - away_used` (within 1e-6)
  - If raw present → `imputation:'none'`

## API Response Structure

```typescript
model_view.features.talent: {
  home_raw: number | null,
  away_raw: number | null,
  home_used: number | null,      // Raw or imputed
  away_used: number | null,       // Raw or imputed
  diff: number | null,             // home_used - away_used
  diff_z: number | null,           // Normalized (0-mean, unit variance)
  season_mean: number | null,
  season_std: number | null,
  imputation: {
    home: 'none' | 'g5_p10',
    away: 'none' | 'g5_p10'
  },
  talent_z_disabled: boolean
}
```

## Acceptance Criteria Met

- ✅ All 5 canaries pass with new talent assertions
- ✅ Unit tests green (FCS and low-variance cases)
- ✅ Methodology updated
- ✅ Calibration scripts print talent correlation without crashing on FCS games

## Next Steps

Phase 2.1 is complete. Ready to proceed to **Phase 2.2: Matchup Class Feature**.

