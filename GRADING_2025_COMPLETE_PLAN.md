# Complete 2025 Season Grading Plan

## ✅ Completed Tasks

### Week 9 - Fixed
- **Issue**: 9 ungraded bets for "Alabama State @ Alabama A M" game
- **Solution**: Sync scores via CFBD, then re-grade
- **Status**: In progress

### Weeks 10-12 - Complete ✅
- **Week 10**: 43 bets - All graded (24W, 19L)
- **Week 11**: 45 bets - All graded (28W, 17L)
- **Week 12**: 53 bets - All graded (25W, 28L)

## 📋 Todo List

### Phase 1: Complete Week 9 (Priority 1)
- [x] Check Week 9 ungraded bets
- [x] Identify missing scores (Alabama State @ Alabama A M)
- [ ] Sync Week 9 scores via CFBD
- [ ] Re-grade Week 9
- [ ] Verify all Week 9 bets are graded

### Phase 2: Generate Matchup Outputs for Weeks 1-8 (Priority 2)
- [ ] Check if team ratings exist for 2025 (SQL query)
- [ ] Create script to generate matchup outputs (`generate-matchup-outputs.ts` ✅)
- [ ] Test script on Week 1
- [ ] Generate matchup outputs for Weeks 1-4
- [ ] Generate matchup outputs for Weeks 5-8

### Phase 3: Create Official Bets for Weeks 1-4 (Priority 3)
- [ ] Verify matchup outputs exist for Weeks 1-4
- [ ] Sync official picks to bets for Week 1
- [ ] Sync official picks to bets for Week 2
- [ ] Sync official picks to bets for Week 3
- [ ] Sync official picks to bets for Week 4
- [ ] Grade Week 1
- [ ] Grade Week 2
- [ ] Grade Week 3
- [ ] Grade Week 4

### Phase 4: Create Official Bets for Weeks 5-8 (Priority 4)
- [ ] Verify matchup outputs exist for Weeks 5-8
- [ ] Sync official picks to bets for Week 5
- [ ] Sync official picks to bets for Week 6
- [ ] Sync official picks to bets for Week 7
- [ ] Sync official picks to bets for Week 8
- [ ] Grade Week 5
- [ ] Grade Week 6
- [ ] Grade Week 7
- [ ] Grade Week 8

## 🔧 Commands Reference

### Week 9
```bash
# Sync scores
node apps/jobs/dist/src/cfbd-game-results.js --season 2025 --weeks 9

# Grade
npx tsx apps/web/scripts/run-grading-for-week.ts 2025 9

# Check status
npx tsx apps/web/scripts/debug-week-grading.ts 2025 9
```

### Generate Matchup Outputs
```bash
# Check if ratings exist (SQL in Supabase)
SELECT COUNT(*) FROM team_season_ratings WHERE season = 2025 AND model_version = 'v1';

# Generate for Weeks 1-4
npx tsx apps/web/scripts/generate-matchup-outputs.ts 2025 1 4

# Generate for Weeks 5-8
npx tsx apps/web/scripts/generate-matchup-outputs.ts 2025 5 8
```

### Sync Official Picks to Bets
```bash
# Weeks 1-4
npx tsx apps/web/scripts/sync-official-picks-to-bets.ts 2025 1
npx tsx apps/web/scripts/sync-official-picks-to-bets.ts 2025 2
npx tsx apps/web/scripts/sync-official-picks-to-bets.ts 2025 3
npx tsx apps/web/scripts/sync-official-picks-to-bets.ts 2025 4

# Weeks 5-8
npx tsx apps/web/scripts/sync-official-picks-to-bets.ts 2025 5
npx tsx apps/web/scripts/sync-official-picks-to-bets.ts 2025 6
npx tsx apps/web/scripts/sync-official-picks-to-bets.ts 2025 7
npx tsx apps/web/scripts/sync-official-picks-to-bets.ts 2025 8
```

### Grade Weeks
```bash
# Grade individual weeks
npx tsx apps/web/scripts/run-grading-for-week.ts 2025 1
# ... etc for weeks 2-8

# Check status
npx tsx apps/web/scripts/debug-week-grading.ts 2025 1
```

## 📊 SQL Queries for Supabase

### Check Team Ratings
```sql
SELECT COUNT(*) as rating_count, model_version
FROM team_season_ratings
WHERE season = 2025
GROUP BY model_version;
```

### Check Matchup Outputs
```sql
SELECT 
  week,
  COUNT(*) as matchup_outputs
FROM matchup_outputs
WHERE season = 2025
  AND model_version = 'v0.0.1'
GROUP BY week
ORDER BY week;
```

### Check Grading Status
```sql
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

## 🎯 Success Criteria

- [ ] Week 9: All 27 bets graded
- [ ] Weeks 1-4: Matchup outputs generated, official bets created, all graded
- [ ] Weeks 5-8: Matchup outputs generated, official bets created, all graded
- [ ] All weeks 1-12 have complete grading data

## 📝 Notes

- **Week 9 Issue**: All 9 ungraded bets are for the same game (Alabama State @ Alabama A M). Game status is still "scheduled" - may need manual score entry or CFBD sync.
- **Matchup Outputs**: The `generate-matchup-outputs.ts` script uses team_season_ratings (v1) or power_ratings (v0.0.1) to compute implied lines.
- **Alternative Backfill**: If ratings don't exist, we may need to run the full ratings computation pipeline first.




