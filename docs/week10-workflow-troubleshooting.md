# Week 10 Workflow Troubleshooting Guide

## Current Status
- ✅ Code fix deployed (commit `d215247`)
- ❌ Week 10 still shows only 39 games with odds (expected 40-50)
- ❌ 3 fixed games (Delaware, Missouri State, UNLV) still have 0 market lines
- ❌ Latest Week 10 odds timestamp: `2025-11-01 20:39:53` (before fix deployment)

## Diagnosis: Workflow Not Re-Run

The data suggests the workflow hasn't been re-run since the fix was deployed. The latest Week 10 odds are from November 1st, which is before the fix.

## Action Required

### 1. Verify Workflow Deployment
- Check GitHub Actions to confirm the workflow has access to the latest code
- Ensure `apps/jobs/dist/adapters/OddsApiAdapter.js` contains the updated `getCurrentCFBWeek()` method

### 2. Re-run Workflow Manually
1. Go to GitHub Actions
2. Find "Nightly Ingest + Ratings" workflow
3. Click "Run workflow"
4. Select Week 10 (or leave empty if it auto-calculates)
5. Click "Run workflow"

### 3. Monitor Logs for These Indicators

**✅ Success Indicators:**
```
[DEBUG] Historical check: season=2025, currentYear=2025, week=10, currentWeek=11, isHistorical=true
[ODDSAPI] Using historical data endpoint for 2025 week 10
[ODDSAPI] Calculated date range: 2025-10-29T00:00:00Z to 2025-11-02T23:59:59Z
[DEBUG] Found game: 2025-wk10-delaware-liberty for ...
```

**❌ Failure Indicators:**
```
[ODDSAPI] Using live odds endpoint for 2025 week 10  ← Wrong!
[DEBUG] Found game: 2025-wk11-...  ← Wrong week!
```

### 4. Post-Run Verification

After the workflow completes, re-run these SQL queries:

```sql
-- Should show 40-50 games (up from 39)
SELECT COUNT(DISTINCT g.id) as games_with_odds
FROM games g
WHERE g.season = 2025 AND g.week = 10
  AND EXISTS (SELECT 1 FROM market_lines ml WHERE ml.game_id = g.id);

-- Should show market_line_count > 0 for all 3
SELECT g.id, COUNT(DISTINCT ml.id) as market_line_count
FROM games g
LEFT JOIN market_lines ml ON ml.game_id = g.id
WHERE g.id IN (
  '2025-wk10-delaware-liberty',
  '2025-wk10-florida-international-missouri-state',
  '2025-wk10-new-mexico-unlv'
)
GROUP BY g.id;

-- Check latest timestamp (should be recent)
SELECT MAX(ml.timestamp) as latest_odds_time
FROM market_lines ml
INNER JOIN games g ON g.id = ml.game_id
WHERE g.season = 2025 AND g.week = 10;
```

## Potential Issues

### Issue 1: Code Not Deployed
- **Symptom**: Logs show `currentWeek=8` or still using live endpoint
- **Fix**: Ensure workflow is using the latest code from main branch

### Issue 2: Historical Endpoint Not Finding Games
- **Symptom**: Using historical endpoint but 0 games matched
- **Fix**: Check date range calculation matches actual game dates

### Issue 3: Team Matching Failures
- **Symptom**: Games exist but can't match teams from Odds API
- **Fix**: Review team matching logs for specific games

## Next Steps
1. Manually trigger the workflow for Week 10
2. Monitor the logs for success indicators
3. Verify database counts after completion
4. Report any remaining issues with specific error messages

