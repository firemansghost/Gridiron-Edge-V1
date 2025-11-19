# Grade All Weeks for 2025 Season - Plan

## Current Status

### ✅ Fully Graded Weeks
- **Week 10**: 43 bets (official_flat_100) - All graded (24W, 19L)
- **Week 11**: 45 bets (official_flat_100) - All graded (28W, 17L)
- **Week 12**: 53 bets (official_flat_100) - Should now be fully graded after fixing closePrice

### ⚠️ Partially Graded
- **Week 9**: 27 bets (demo_seed) - 18 graded (9W, 9L), 9 ungraded (games don't have scores yet)

### ❌ No Strategy Bets
- **Weeks 1-8**: Have game scores but NO `strategy_run` bets exist
  - Week 1: 181 games with scores
  - Week 2: 298 games with scores
  - Week 3: 265 games with scores
  - Week 4: 278 games with scores
  - Week 5: 249 games with scores
  - Week 6: 271 games with scores
  - Week 7: 268 games with scores
  - Week 8: 58 games with scores

## SQL Query for Supabase

Run this to see the full picture:

```sql
-- Check which weeks have scores and strategy_run bets
SELECT 
  g.week,
  COUNT(DISTINCT g.id) as games_with_scores,
  COUNT(DISTINCT b.id) as strategy_bets,
  COUNT(DISTINCT CASE WHEN b.result IS NULL AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL THEN b.id END) as ungraded_with_scores,
  COUNT(DISTINCT CASE WHEN b.result IS NOT NULL THEN b.id END) as graded_bets
FROM games g
LEFT JOIN bets b ON b.game_id = g.id AND b.source = 'strategy_run'
WHERE g.season = 2025
  AND g.home_score IS NOT NULL
  AND g.away_score IS NOT NULL
GROUP BY g.week
ORDER BY g.week;
```

## How to Grade All Weeks

### Option 1: Grade Existing Bets Only (Weeks 9-12)
**Status**: Almost complete!

1. ✅ **Week 10**: Fully graded
2. ✅ **Week 11**: Fully graded  
3. ✅ **Week 12**: Just fixed closePrice, should be fully graded now
4. ⚠️ **Week 9**: 9 bets waiting for game scores (games haven't finished yet)

**Action**: Re-run grading for Week 12, then wait for Week 9 games to finish.

### Option 2: Create Official Bets for Weeks 1-8
**Goal**: Generate `official_flat_100` bets for weeks 1-8, then grade them.

**Steps**:
1. Run `sync-official-picks-to-bets.ts` for weeks 1-8:
   ```bash
   npx tsx apps/web/scripts/sync-official-picks-to-bets.ts 2025 1
   npx tsx apps/web/scripts/sync-official-picks-to-bets.ts 2025 2
   # ... etc for weeks 3-8
   ```

2. Then grade each week:
   ```bash
   npx tsx apps/web/scripts/run-grading-for-week.ts 2025 1
   # ... etc
   ```

**Note**: This requires that:
   - Official picks exist in the database for those weeks
   - Games have scores (✅ they do)
   - Market lines exist for closing prices (need to verify)

### Option 3: Batch Process All Weeks
Create a script that:
1. Checks which weeks have scores + strategy_run bets
2. For each week, runs grading
3. Reports summary

## Recommended Approach

**Immediate (Today)**:
1. ✅ Verify Week 12 is now fully graded
2. ⚠️ Check Week 9 - see if those 9 games have scores now
3. 📊 Run the SQL query to get exact counts

**Short-term (This Week)**:
- If you want to grade Weeks 1-8, first check if official picks exist for those weeks
- If picks exist, sync them to bets, then grade
- If picks don't exist, you'd need to generate them first (different process)

**Long-term**:
- Set up automated grading that runs after games finish
- Consider creating a weekly job that syncs picks → creates bets → grades

## Verification Commands

```bash
# Check Week 12 status
npx tsx apps/web/scripts/debug-week-grading.ts 2025 12

# Check all gradable weeks
npx tsx apps/web/scripts/check-gradable-weeks.ts 2025

# Grade a specific week
npx tsx apps/web/scripts/run-grading-for-week.ts 2025 12
```




