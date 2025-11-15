# Core V1 UI Integration Verification

## Summary

Core V1 OLS model has been successfully integrated into the UI as the single source of truth for spread predictions. Totals model has been disabled for V1.

## Integration Points

### 1. Core V1 Spread Helper (`apps/web/lib/core-v1-spread.ts`)
✅ **Status: Complete**

- Single source of truth for Core V1 spread calculations
- Loads coefficients from `reports/core_coefficients_2025_fe_v1.json`
- Computes `ratingDiffBlend` from V2 and MFTR ratings
- Provides `getCoreV1SpreadFromTeams()` for easy integration
- Provides `getATSPick()` for ATS pick recommendations
- Uses HMA frame (Home Minus Away) consistently

### 2. Current Slate API (`apps/web/app/api/model/slate/route.ts`)
✅ **Status: Complete**

- Uses `getCoreV1SpreadFromTeams()` to compute model spreads
- Uses `getATSPick()` to determine ATS picks and edges
- Model spread rounded to 1 decimal place
- Totals disabled: `modelTotal`, `totalPick`, `totalEdgePts` all set to `null`
- `maxEdge` and `confidence` based solely on ATS edge
- Edge floor: 2.0 points minimum to show a pick

### 3. Game Detail API (`apps/web/app/api/game/[gameId]/route.ts`)
✅ **Status: Complete**

- `USE_CORE_V1 = true` flag enables V1 mode
- Uses `getCoreV1SpreadFromTeams()` for spread computation
- `finalImpliedSpread` set directly from Core V1 (no trust-market overlay)
- `atsEdge` computed using `computeATSEdgeHma()`
- Totals disabled: `finalImpliedTotal` set to `null`
- All TypeScript null-safety issues resolved

## Consistency Checks

### Expected Behavior

1. **Model Spread**: Should be identical between Current Slate and Game Detail page for the same game
2. **ATS Edge**: Should be identical between Current Slate and Game Detail page
3. **ATS Pick**: Should be identical between Current Slate and Game Detail page (or both show "No edge" if edge < 2.0)
4. **Totals**: Should show "unavailable" or be hidden on both pages

### Verification Steps

To verify consistency, check these specific games (when available in current slate):

1. **Air Force @ UConn**
   - Compare `modelSpread` on Current Slate vs `modelSpreadFC` on Game Detail
   - Compare `spreadPick` on Current Slate vs ATS pick on Game Detail
   - Verify totals show "unavailable"

2. **Kansas State @ Oklahoma State**
   - Same checks as above

3. **Oklahoma @ Alabama**
   - Same checks as above

### Manual Verification

1. Navigate to Current Slate page (`/weeks`)
2. Note the Model Spread, Pick (ATS), and Max Edge for a game
3. Click through to the Game Detail page for that game
4. Verify:
   - Model Spread matches (within rounding)
   - ATS Edge matches
   - ATS Pick matches (or both show "No edge")
   - Totals show "unavailable" or are hidden

## Build Status

✅ **Build Successful**: `npm run build` completes without errors

- TypeScript compilation: ✅ Pass
- Next.js build: ✅ Pass
- No linter errors: ✅ Pass

## Files Modified

1. `apps/web/lib/core-v1-spread.ts` (NEW) - Core V1 spread helper module
2. `apps/web/app/api/model/slate/route.ts` - Integrated Core V1
3. `apps/web/app/api/game/[gameId]/route.ts` - Integrated Core V1, disabled totals

## Next Steps

1. ✅ Core V1 integration complete
2. ✅ Totals disabled
3. ✅ Build successful
4. ⏳ Manual verification recommended (when games are available in current slate)

## Notes

- Core V1 uses simple OLS: `y_hma = β₀ + β_rating * ratingDiffBlend + β_hfa * hfaPoints`
- HFA points: 2.0 for home games, 0.0 for neutral
- Edge floor: 2.0 points minimum to show a pick
- Confidence tiers: A (≥4.0), B (≥3.0), C (≥2.0) based on ATS edge only



