# Week 10 Odds Ingestion - Fix Summary & Verification Guide

## 🐛 Bug Fixed

### **Problem Identified**
The workflow requested Week 10 odds but fetched **Week 11 games** instead. All 30 matched games were Week 11:
- `2025-wk11-miami-oh-ohio`
- `2025-wk11-georgia-mississippi-state`
- `2025-wk11-lsu-alabama`
- etc.

### **Root Cause**
The `getCurrentCFBWeek()` method in `OddsApiAdapter.ts` was **hardcoded to return week 8**:
```typescript
private getCurrentCFBWeek(): number {
  return 8; // Hardcoded!
}
```

This caused:
- Week 10 request: `isHistorical = (2025 === 2025 && 10 < 8)` = `false`
- System used **live endpoint** instead of historical
- Live endpoint returns all upcoming games (Week 11)
- Historical endpoint was never called for Week 10

### **Fix Applied**
Changed `getCurrentCFBWeek()` to query the database and find the actual current week based on game dates closest to now. This ensures:
- ✅ Past weeks (like Week 10) correctly use historical endpoint
- ✅ Current week (Week 11) correctly uses live endpoint
- ✅ Dynamic week determination based on actual game dates

**Commit**: `d215247`

---

## ✅ What Should Happen Now

### **Expected Workflow Behavior**

1. **Week Detection**
   ```
   [DEBUG] Historical check: season=2025, currentYear=2025, week=10, currentWeek=11, isHistorical=true
   ```
   - Should show `currentWeek=11` (from database query)
   - Should show `isHistorical=true` (Week 10 < Week 11)

2. **Endpoint Selection**
   ```
   [ODDSAPI] Using historical data endpoint for 2025 week 10
   ```
   - Should use **historical endpoint**, not live endpoint

3. **Date Range Calculation**
   ```
   [ODDSAPI] Calculated date range: 2025-10-29T00:00:00Z to 2025-11-02T23:59:59Z
   ```
   - Should calculate proper date range for Week 10 games

4. **Games Matched**
   - Should match Week 10 games (not Week 11)
   - Should include the previously missing 8 FBS games:
     - ✅ UTEP @ Kennesaw State
     - ✅ Marshall @ Coastal Carolina
     - ✅ Army @ Air Force
     - ✅ East Carolina @ Temple
     - ✅ New Mexico State @ Western Kentucky
     - ✅ Indiana @ Maryland
     - ✅ Wake Forest @ Florida State
     - ✅ Washington State @ Oregon State

5. **Team Matching**
   - Delaware, Missouri State, UNLV should now match correctly (after denylist/alias fixes)
   - Other teams should match via existing aliases

---

## 📋 What to Look For in Logs

### **✅ Success Indicators**

1. **Correct Week Detection**
   ```
   [DEBUG] Historical check: season=2025, currentYear=2025, week=10, currentWeek=11, isHistorical=true
   ```
   - `currentWeek` should be **11** (not 8)
   - `isHistorical` should be **true**

2. **Historical Endpoint Used**
   ```
   [ODDSAPI] Using historical data endpoint for 2025 week 10
   [ODDSAPI] Calculated date range: [start] to [end]
   ```
   - Should see "historical data endpoint" (not "live odds endpoint")

3. **Week 10 Games Matched**
   ```
   [DEBUG] Found game: 2025-wk10-delaware-liberty for ...
   [DEBUG] Found game: 2025-wk10-army-air-force for ...
   ```
   - Game IDs should start with `2025-wk10-` (not `2025-wk11-`)

4. **No FK Errors for Fixed Teams**
   - Should NOT see:
     ```
     [TEAM_RESOLVER] FK ERROR: Alias "Delaware Blue Hens" -> "delaware" but team ID doesn't exist in database
     [TEAM_RESOLVER] FK ERROR: Alias "Missouri State Bears" -> "missouri-state" but team ID doesn't exist in database
     ```

5. **Higher Match Rate**
   - Previous run: 30 games matched (but wrong week)
   - Expected: 40-50 games matched for Week 10

### **⚠️ Potential Issues to Watch For**

1. **Still Using Live Endpoint**
   ```
   [ODDSAPI] Using live odds endpoint for 2025 week 10  ❌
   ```
   - If you see this, the week calculation might still be wrong
   - Check if `currentWeek` is being calculated correctly

2. **Wrong Week Games**
   ```
   [DEBUG] Found game: 2025-wk11-...  ❌
   ```
   - If game IDs are still Week 11, historical endpoint isn't working correctly

3. **Missing Games Still Missing**
   - If the 8 games still don't have odds after this run:
     - Check team matching logs for those specific games
     - Verify dates in database match Odds API dates
     - May need additional alias entries

4. **Date Range Errors**
   ```
   [ODDSAPI] Calculated date range: [wrong dates]
   ```
   - If date range doesn't cover Week 10 game dates, games may be missed

---

## 🔍 Verification Steps

### **After Workflow Completes**

1. **Check Database Count**
   ```sql
   -- Count Week 10 games with odds
   SELECT COUNT(DISTINCT g.id) as games_with_odds
   FROM games g
   WHERE g.season = 2025 AND g.week = 10
     AND EXISTS (SELECT 1 FROM market_lines ml WHERE ml.game_id = g.id);
   ```
   - Should be **40-50 games** (up from 39)

2. **Verify Fixed Games**
   ```sql
   -- Check if the 3 previously fixed games now have odds
   SELECT 
     g.id,
     at.name as away_team,
     ht.name as home_team,
     COUNT(DISTINCT ml.id) as market_line_count
   FROM games g
   LEFT JOIN teams at ON at.id = g.away_team_id
   LEFT JOIN teams ht ON ht.id = g.home_team_id
   LEFT JOIN market_lines ml ON ml.game_id = g.id
   WHERE g.id IN (
     '2025-wk10-delaware-liberty',
     '2025-wk10-florida-international-missouri-state',
     '2025-wk10-new-mexico-unlv'
   )
   GROUP BY g.id, at.name, ht.name;
   ```
   - All 3 should show `market_line_count > 0`

3. **Check Remaining 8 Games**
   ```sql
   -- List remaining FBS games without odds
   SELECT 
     g.id,
     at.name as away_team,
     ht.name as home_team
   FROM games g
   LEFT JOIN teams at ON at.id = g.away_team_id
   LEFT JOIN teams ht ON ht.id = g.home_team_id
   LEFT JOIN market_lines ml ON ml.game_id = g.id
   LEFT JOIN team_membership tm_home ON tm_home.team_id = g.home_team_id AND tm_home.season = 2025
   LEFT JOIN team_membership tm_away ON tm_away.team_id = g.away_team_id AND tm_away.season = 2025
   WHERE g.season = 2025 
     AND g.week = 10
     AND tm_home.season IS NOT NULL 
     AND tm_away.season IS NOT NULL
     AND ml.id IS NULL
   ORDER BY g.date;
   ```
   - Should be **0-8 games** remaining (down from 11)

4. **Verify Week Distribution**
   ```sql
   -- Check that we're not accidentally creating Week 11 market lines
   SELECT 
     ml.week,
     COUNT(DISTINCT ml.game_id) as unique_games,
     COUNT(*) as total_lines
   FROM market_lines ml
   WHERE ml.season = 2025 AND ml.week IN (10, 11)
   GROUP BY ml.week
   ORDER BY ml.week;
   ```
   - Week 10 should have market lines
   - Week 11 lines are expected (from previous live endpoint call)

---

## 📊 Expected Results

### **Before Fix**
- ❌ Week 10 request → Fetched Week 11 games
- ❌ 30 games matched (wrong week)
- ❌ 11 FBS games missing odds
- ❌ Used live endpoint for past week

### **After Fix**
- ✅ Week 10 request → Fetches Week 10 games
- ✅ 40-50 games matched (correct week)
- ✅ 0-3 FBS games missing odds (down from 11)
- ✅ Uses historical endpoint for past week

---

## 🚀 Next Steps

1. **Re-run Workflow**: Execute "Nightly Ingest + Ratings" for Week 10
2. **Monitor Logs**: Watch for the success indicators listed above
3. **Verify Database**: Run the SQL checks to confirm games have odds
4. **If Issues Persist**:
   - Review team matching logs for remaining missing games
   - Check if Odds API has those games available (may need API tier upgrade)
   - Consider adding more team aliases if name variations are causing issues

---

## 📝 Related Fixes Applied

1. **Denylist Fix**: Removed `missouri-state` and `delaware` from denylist
2. **Alias Fixes**: Added aliases for Delaware, Missouri State, UNLV, Nevada-Las Vegas
3. **Week Calculation Fix**: Dynamic current week from database (this document)

**All fixes committed and ready for workflow execution!**

