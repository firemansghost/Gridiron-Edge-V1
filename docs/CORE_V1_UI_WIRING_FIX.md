# Core V1 UI Wiring Fix Summary

## Problem
After wiring Core V1 into the APIs, the UI was still showing "—" for all model columns (Model Spread, Model Total, Pick ATS, Pick Total, Max Edge, Confidence) on the Current Slate table, and "ATS unavailable" on the game detail page.

## Root Cause Analysis

### Diagnostic Results
- The diagnostic script (`diagnose-api-responses.ts`) shows that the APIs ARE returning Core V1 data correctly:
  - Air Force @ UConn: Model Spread 3.3, Pick "Uconn +7.5", Max Edge 10.8, Confidence A
  - KSU @ OSU: Model Spread 10.4, Pick "Oklahoma State +19.5", Max Edge 29.9, Confidence A
  - OU @ Alabama: Model Spread 9.4, Pick "Alabama Crimson Tide -6.0", Max Edge 3.4, Confidence B

### Potential Issues Identified
1. **Field Initialization**: Model fields might not be initialized if Core V1 computation fails silently
2. **Error Handling**: Errors in Core V1 computation might be caught but not properly logged
3. **Response Structure**: Fields might be missing from the response if they're undefined (JSON serialization strips undefined)

## Fixes Applied

### 1. Slate API (`/api/weeks/slate/route.ts`)
- **Initialized all model fields to `null`** when creating `SlateGame` objects to ensure they're always in the response
- **Added better error logging** for Core V1 computation failures
- **Added logging** to track how many games have model data computed
- **Improved error messages** to help identify runtime issues

**Fields being set:**
- `modelSpread`: Core V1 spread rounded to 1 decimal
- `modelTotal`: `null` (disabled for V1)
- `pickSpread`: ATS pick label from `getATSPick()`
- `pickTotal`: `null` (disabled for V1)
- `maxEdge`: ATS edge (absolute value)
- `confidence`: 'A', 'B', 'C', or `null` based on edge magnitude

### 2. Game Detail API (`/api/game/[gameId]/route.ts`)
- **Added validation check** for `finalImpliedSpread` before using it (ensures it's not null, NaN, or infinite)
- **Improved error handling** for Core V1 computation failures
- **Ensured `coreV1SpreadInfo` is set to null on error** to prevent downstream issues
- **Fixed `atsEdge` calculation** to use favorite-centric format when `USE_CORE_V1` is true

**Fields being set:**
- `model.spread`: `finalImpliedSpread` (Core V1 spread in HMA format)
- `model_view.modelFavoriteLine`: Core V1 favorite line (favorite-centric, negative)
- `model_view.edges.atsEdgePts`: ATS edge in favorite-centric format
- `validation.ats_inputs_ok`: `true` if `finalImpliedSpread` is valid

## Field Mapping

### Slate Table Component Expectations
The `SlateTable` component expects:
- `game.modelSpread` (number | null)
- `game.modelTotal` (number | null)
- `game.pickSpread` (string | null)
- `game.pickTotal` (string | null)
- `game.maxEdge` (number | null)
- `game.confidence` (string | null)

**Status**: ✅ API now returns these exact field names

### Game Detail Page Expectations
The game detail page expects:
- `game.model_view.edges.atsEdgePts` (number | null) - for ATS edge display
- `game.model_view.modelFavoriteLine` (number) - for model favorite line
- `game.model_view.modelFavoriteName` (string) - for model favorite name
- `game.validation.ats_inputs_ok` (boolean) - to determine if ATS card should show
- `game.model.spread` (number | null) - for model spread value

**Status**: ✅ API now returns these fields correctly when `USE_CORE_V1=true`

## Next Steps for Debugging

If the UI still shows "—" after deployment:

1. **Check browser console** for any JavaScript errors
2. **Check Vercel logs** for API errors when Core V1 computation runs
3. **Verify cache is cleared** - the API has 1-minute cache for live games, so old responses might be cached
4. **Check if Core V1 coefficients file exists** at the expected path in production
5. **Verify V2 ratings exist** for the teams in question (Core V1 requires V2 ratings)

## Testing

Run the diagnostic script to verify API responses:
```bash
cd apps/web
npx tsx scripts/diagnose-api-responses.ts
```

This will show the actual API responses for the test games and help identify any mismatches.

## Files Modified

1. `apps/web/app/api/weeks/slate/route.ts` - Fixed field initialization and error handling
2. `apps/web/app/api/game/[gameId]/route.ts` - Fixed validation and error handling for Core V1


