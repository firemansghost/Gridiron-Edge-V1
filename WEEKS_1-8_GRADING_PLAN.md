# Weeks 1-8 Grading Plan

## Current Status

### ✅ Week 9 Status
- **9 ungraded bets** - Games don't have scores yet (waiting for games to finish)

### ❌ Weeks 1-8 Issue
**Problem**: Weeks 1-8 have:
- ✅ Games with scores (181-298 games per week)
- ✅ Market lines (spread/total) for 47-61 games per week
- ❌ **NO matchup outputs** (model predictions)

**Impact**: Without matchup outputs, we cannot generate official picks because:
- The `sync-official-picks-to-bets.ts` script requires matchup outputs to compute model spreads/totals
- Matchup outputs contain the model's predictions (impliedSpread, impliedTotal) needed to determine if there's an edge

## Solution Options

### Option 1: Generate Matchup Outputs (Recommended)
**Process**: Run the model/ratings computation to generate matchup outputs for weeks 1-8

**Steps**:
1. Check if team ratings exist for 2025 season
2. If ratings exist, generate matchup outputs using `seed-ratings.ts` or similar
3. Once matchup outputs exist, run `sync-official-picks-to-bets.ts` for weeks 1-8
4. Then grade each week

**Command to check ratings**:
```sql
SELECT COUNT(*) as rating_count, model_version
FROM team_season_ratings
WHERE season = 2025
GROUP BY model_version;
```

### Option 2: Use Historical/Backfilled Data
If matchup outputs were generated at the time but not saved, we might need to:
- Re-run the model computation for those weeks
- Use historical ratings from that point in time

### Option 3: Manual/Alternative Approach
If generating matchup outputs is not feasible, we could:
- Grade existing bets only (weeks 9-12)
- Skip weeks 1-8 for now
- Focus on current/future weeks going forward

## Recommended Next Steps

1. **Check if ratings exist for 2025**:
   ```sql
   SELECT COUNT(*) FROM team_season_ratings WHERE season = 2025;
   ```

2. **If ratings exist**, check the `seed-ratings.ts` script to see how to generate matchup outputs for specific weeks

3. **If ratings don't exist**, we need to:
   - Run the ratings computation for 2025 season
   - Then generate matchup outputs
   - Then sync picks to bets
   - Then grade

## Files to Review

- `apps/jobs/seed-ratings.ts` - Contains matchup output generation logic
- `apps/web/scripts/sync-official-picks-to-bets.ts` - Requires matchup outputs to work
- `apps/jobs/src/ratings/compute_ratings_v1.ts` - Ratings computation

## Current Data Summary

| Week | Games w/ Scores | Market Lines | Matchup Outputs | Can Generate Picks? |
|------|----------------|--------------|------------------|---------------------|
| 1    | 181            | 61           | 0                | ❌                  |
| 2    | 298            | 49           | 0                | ❌                  |
| 3    | 265            | 47           | 0                | ❌                  |
| 4    | 278            | 49           | 0                | ❌                  |
| 5    | 249            | 52           | 0                | ❌                  |
| 6    | 271            | 50           | 0                | ❌                  |
| 7    | 268            | 55           | 0                | ❌                  |
| 8    | 58             | 58           | 0                | ❌                  |




