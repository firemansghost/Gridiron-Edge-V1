# Ratings Data Issues Diagnosis & Fixes

## Issues Identified

### Issue 1: Games Count Always Shows 0 or Incorrect Value

**Root Cause:**
- `apps/jobs/src/ratings/compute_ratings_v1.ts` line 393 sets `games: 0` with comment "Will be filled by other jobs if needed"
- The `FeatureLoader` class correctly calculates `weeksPlayed` (counts final games from Game table), but this value is never written to `TeamSeasonRating.games`
- The games field remains at 0 or whatever was set by a previous run of `baseline_from_scores.ts`

**Evidence:**
- `feature-loader.ts` line 131-140: Correctly counts games with `status: 'final'`
- `compute_ratings_v1.ts` line 393: Sets `games: 0` instead of using `features.weeksPlayed`
- `baseline_from_scores.ts` line 278: DOES populate games correctly, but only runs for baseline ratings

**Fix Applied:**
- Updated `compute_ratings_v1.ts` to include `games: features.weeksPlayed || 0` in the rating object
- Updated both `create` and `update` operations to set the `games` field from the calculated value

### Issue 2: Conference Shows "Independent" Instead of Actual Conference

**Root Cause:**
- The ratings API route (`apps/web/app/api/ratings/route.ts`) reads conference from the `Team` table (line 68)
- If `Team.conference` is null, it defaults to 'Unknown' (line 86)
- However, if the Team table has "Independent" stored, that's what gets displayed
- This suggests the CFBD team info sync either:
  1. Is not running/updating conferences
  2. Is defaulting to "Independent" when conference mapping fails
  3. Is not syncing conference data from CFBD API

**Evidence:**
- API route line 59-70: Queries Team table for conference
- API route line 86: `conference: team.conference || 'Unknown'` - but if team.conference = "Independent", that's what shows

**Fix Needed:**
- Investigate CFBD team info sync script
- Check if conference field is being populated from CFBD API
- Verify team ID mapping is correct (SDSU might be mapped incorrectly)

## Scripts Responsible

### Primary Script: `apps/jobs/src/ratings/compute_ratings_v1.ts`
- **Purpose:** Computes V1 model power ratings from team features
- **Issue:** Does not populate `games` field (now fixed)
- **How it works:**
  1. Loads FBS teams for season
  2. Uses `FeatureLoader` to get team features (which includes `weeksPlayed`)
  3. Calculates z-scores and ratings
  4. Upserts to `TeamSeasonRating` table

### Supporting Script: `apps/jobs/src/ratings/feature-loader.ts`
- **Purpose:** Loads team features with fallback hierarchy
- **Key Function:** `loadTalentFeatures()` line 131-140 counts final games
- **Returns:** `weeksPlayed` field with count of final games

### Data Source Script: `apps/jobs/src/stats/cfbd_team_season_stats.ts`
- **Purpose:** Syncs team season stats from CFBD API
- **Note:** This populates `TeamSeasonStat`, not `TeamSeasonRating`

## Diagnostic Script

Created `apps/web/scripts/diagnose-sdsu-ratings.ts` to investigate:
- Team table data (conference, name)
- TeamSeasonRating data (games count, ratings)
- Actual games in database
- TeamGameStat records
- TeamSeasonStat records

**To run:**
```bash
cd apps/web
npx tsx scripts/diagnose-sdsu-ratings.ts
```

## Next Steps

1. ✅ **Fixed:** Games count now populated from FeatureLoader.weeksPlayed
2. ⏳ **Pending:** Run diagnostic script to verify SDSU data
3. ⏳ **Pending:** Investigate conference sync - check CFBD team info sync script
4. ⏳ **Pending:** Re-run `compute_ratings_v1.ts` for season 2025 to update games counts
5. ⏳ **Pending:** Verify conference data in Team table and fix sync if needed

## Testing

After fixes:
1. Run diagnostic script to see current state
2. Re-run `compute_ratings_v1.ts --season 2025`
3. Check ratings page - games count should be correct
4. Check conference - should show actual conference, not "Independent"

