# Phase 2.1: Talent Gap Feature Implementation

## Overview
Added talent gap feature (247 Composite) to the model pipeline for calibration. This provides magnitude signal missing from z-scores.

## Implementation Details

### Data Source
- **Table**: `team_season_talent` (existing)
- **Field**: `talentComposite` (247 Composite index)
- **Primary Key**: `(season, team_id)`

### Feature Calculation
1. **Load talent data** for both home and away teams
2. **Calculate raw difference**: `talent_diff = talent_home - talent_away`
3. **Normalize to 0-mean, unit variance** within season:
   - Compute mean and std of all team talent composites for the season
   - Normalize each team's talent: `z = (talent - mean) / std`
   - Difference of normalized values: `talent_diff_z = z_home - z_away`

### API Response
Added to `model_view.features.talent`:
```typescript
{
  home: number | null,           // Raw home team talent composite
  away: number | null,          // Raw away team talent composite
  diff: number | null,          // Raw difference (home - away)
  diff_z: number | null,        // Normalized difference (0-mean, unit variance)
  normalized_mean: number | null, // League mean for normalization
  normalized_std: number | null,   // League std for normalization
  note: 'Talent gap from 247 Composite (Phase 2.1)'
}
```

### FCS Imputation (TODO)
Currently, missing talent data (FCS teams) is set to `null`. Future enhancement:
- Impute to G5 p10 (10th percentile of G5 teams)
- This will be handled in the calibration script

### Files Modified
- `apps/web/app/api/game/[gameId]/route.ts`:
  - Added talent data loading (lines ~475-492)
  - Added normalization logic (lines ~502-534)
  - Added to `model_view.features` (lines ~1976-1990)

### Acceptance Criteria
- ✅ API adds `talent_diff`, `talent_home`, `talent_away` to `model_view.features`
- ✅ Normalization computed within season (0-mean, unit variance)
- ✅ Null handling for missing talent data (FCS teams)
- ⏳ Unit test for FCS null handling (pending)
- ⏳ Documentation in METHODOLOGY.md (pending)

### Next Steps
1. Add unit test for null handling (FCS teams)
2. Update METHODOLOGY.md with talent gap explanation
3. Implement FCS imputation (G5 p10)
4. Proceed to Phase 2.2 (Matchup Class)

