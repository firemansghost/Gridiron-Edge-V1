# 2025 Current Season Odds Ingestion - Runbook

## Overview
Pivot from 2024 Week 2 testing to **2025 current season** live odds ingestion.
Credits are precious—this guide ensures clean, efficient runs.

---

## Pre-Flight Checklist

### ✅ Prerequisites
- [x] 2024 W2 testing complete (46/49 = 94% coverage validates pipeline)
- [x] Denylist working (no `*-college` pollution)
- [x] Aliases validated (Ole Miss, Illinois, Middle Tennessee clean)
- [x] Pre-check guardrail active (fails before wasting credits)
- [x] CI validation passing (duplicate keys, index size, denylist)

### 📋 Before Running
1. **Check current week**: What week is 2025 season on? (Example: Week 8, 9, 10, etc.)
2. **Verify schedule exists**: Run query to confirm games table has 2025 current week rows
   ```sql
   SELECT COUNT(*) as game_count
   FROM games
   WHERE season = 2025 AND week = 8; -- adjust week
   ```
3. **Check credits remaining**: Log into Odds API dashboard, note current usage

---

## Workflow Configuration

### **Use Case 1: Current Week (Live Odds)**
**Best for**: Real-time odds for the active week

```yaml
Season: 2025
Weeks: 8  # ← Current week number
Markets: spreads,totals,h2h  # Add moneylines
Regions: us
Credits limit: 1200
Dry run: false  # Live write
Historical strict: false  # ← Live mode (not historical)
Enable season fallback: true
Max events: (empty)  # Process all
```

**Expected Behavior**:
- Fetches **live odds** from `/v4/sports/americanfootball_ncaaf/odds`
- No snapshot dates (uses current odds)
- Updates every time you run (latest lines)

**Cost**: ~10-20 credits per run (depends on # of games with odds)

---

### **Use Case 2: Historical Backfill (Past Weeks)**
**Best for**: Backfilling 2025 weeks 2-7 (once Odds API archives them)

```yaml
Season: 2025
Weeks: 2  # Or 2,3,4 for multiple
Markets: spreads,totals
Regions: us
Credits limit: 1500
Dry run: false
Historical strict: true  # ← Historical mode
Enable season fallback: true
Max events: (empty)
```

**Important**: Odds API only archives historical snapshots **after the week concludes**.
- Week 2 snapshots → available ~1-2 weeks after Week 2 ends
- Check by running a test with `dry_run: true` first

**Cost**: ~1,200-1,500 credits per week (49 games × 2 markets × 10 credits/event)

---

## Step-by-Step: Current Week Live Odds

### **Step 1: Dry Run (Test Mapping)**
```yaml
Season: 2025
Weeks: 8  # Current week
Markets: spreads,totals,h2h
Regions: us
Credits limit: 100
Dry run: true  ← Test mode
Historical strict: false
Enable season fallback: true
Max events: 5  ← Limit for quick test
```

**What to Check**:
```
[PRECHECK] ✅ All N team names resolved to FBS slugs.
Mapped events: X / Y
COULD_NOT_RESOLVE_TEAMS: 0
RESOLVED_TEAMS_BUT_NO_GAME: Z
```

**If any teams fail to resolve**:
1. Check `[PRECHECK]` output for team names
2. Add aliases to `apps/jobs/config/team_aliases.yml`
3. Commit, push, re-run

---

### **Step 2: Small Live Write (Verify Pipeline)**
```yaml
Season: 2025
Weeks: 8
Markets: spreads,totals,h2h
Regions: us
Credits limit: 300
Dry run: false  ← LIVE WRITE
Historical strict: false
Enable season fallback: true
Max events: 10  ← Small batch
```

**What to Check**:
```
[SUMMARY] mapped_games=10 parsed_spreads=X parsed_totals=Y inserted=Z postCount=Z
Post-run market_lines count (2025,8): Z
```

**Validate in DB**:
```sql
SELECT 
  COUNT(DISTINCT game_id) as games_with_odds,
  COUNT(*) as total_lines,
  COUNT(*) FILTER (WHERE line_type = 'spread') as spreads,
  COUNT(*) FILTER (WHERE line_type = 'total') as totals,
  COUNT(*) FILTER (WHERE line_type = 'moneyline') as moneylines
FROM market_lines
WHERE season = 2025 AND week = 8 AND source = 'oddsapi';
```

---

### **Step 3: Full Current Week**
```yaml
Season: 2025
Weeks: 8
Markets: spreads,totals,h2h
Regions: us
Credits limit: 1200
Dry run: false
Historical strict: false
Enable season fallback: true
Max events: (empty)  ← All events
```

**Expected**:
- Mapped: 45-49 games (depending on schedule)
- Rows: ~1,500-2,000 (50 games × 3 markets × ~10 books)
- Credits: ~200-300 used

---

## Monitoring & Troubleshooting

### **Logs to Watch**

#### **✅ Success Indicators**
```
[INDEX] 🔗 Sources: teams-db:720 | games-slugs:14796 | static-json:132 | size=730
[INDEX] 🚫 Filtered 3 denylisted slug(s)
[ALIASES] ✅ Loaded 170 valid FBS aliases
[PRECHECK] ✅ All 98 team names resolved to FBS slugs.
Mapped events: 47 / 49
[SUMMARY] mapped_games=47 parsed_spreads=800 parsed_totals=800 inserted=1600
```

#### **⚠️ Warning Signs**
```
[PRECHECK] ⚠️  2 team name(s) could not resolve to FBS slugs:
[PRECHECK]   - "Some Team Name"
```
**Action**: Add alias, commit, re-run

```
[NO-GAME] 0 schedule rows for (away=X, home=Y, season=2025).
```
**Action**: Backfill schedule from CFBD for that week

```
RESOLVED_TEAMS_BUT_NO_GAME: X @ Y
   [ODDSAPI]   Found 0 candidate game(s) in season
```
**Action**: Check if game is in a different week or missing from schedule

---

### **Common Issues**

#### **Issue 1: "INVALID_HISTORICAL_TIMESTAMP" (422)**
**Cause**: Using `historical_strict: true` for current week or unarchived weeks
**Fix**: Set `historical_strict: false` for live odds

#### **Issue 2: High RESOLVED_TEAMS_BUT_NO_GAME count**
**Cause**: Schedule not backfilled for that week
**Fix**: Run CFBD schedule ingest first
```bash
npm run ingest -- cfbd --season 2025 --weeks 8 --data-type schedules
```

#### **Issue 3: Duplicate key errors on re-runs**
**Cause**: Market lines already exist for that week
**Fix**: This is **normal**! `skipDuplicates: true` handles it
- Logs show: `inserted=0` but `postCount=1600` (existing rows)
- To refresh, delete old rows first (careful!)

#### **Issue 4: Zero rows inserted but no errors**
**Cause**: All lines already exist (dedup working)
**Fix**: Check `postCount` in logs—if > 0, you're good

---

## Cost Management

### **Credits per Run (Estimates)**

| Scenario | Games | Markets | Credits |
|----------|-------|---------|---------|
| Dry run (5 events) | 5 | 2 | 0 |
| Small test (10 events) | 10 | 3 | ~100 |
| Current week (50 games) | 50 | 3 | ~200-400 |
| Historical week (49 games) | 49 | 2 | ~1,200-1,500 |

**Formula**: `credits ≈ events × markets × 10`

### **Budget Strategy**
- **Monthly limit**: 10,000 credits (standard plan)
- **Current week**: Run 1-2x per week (~400-800 credits)
- **Historical backfill**: 1 week per month (~1,500 credits)
- **Reserve**: Keep 2,000 credits for debugging/testing

---

## Validation Queries

### **A) Week Coverage**
```sql
SELECT 
  COUNT(DISTINCT g.id) as total_games,
  COUNT(DISTINCT CASE WHEN ml.id IS NOT NULL THEN g.id END) as games_with_odds,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN ml.id IS NOT NULL THEN g.id END) / COUNT(DISTINCT g.id), 1) as coverage_pct
FROM games g
LEFT JOIN market_lines ml ON g.id = ml.game_id AND ml.source = 'oddsapi'
WHERE g.season = 2025 AND g.week = 8;
```

### **B) Market Breakdown**
```sql
SELECT 
  line_type,
  COUNT(*) as line_count,
  COUNT(DISTINCT book_name) as book_count,
  MIN(timestamp) as earliest,
  MAX(timestamp) as latest
FROM market_lines
WHERE season = 2025 AND week = 8 AND source = 'oddsapi'
GROUP BY line_type;
```

### **C) Top Books**
```sql
SELECT 
  book_name,
  COUNT(*) as line_count,
  COUNT(DISTINCT game_id) as game_count
FROM market_lines
WHERE season = 2025 AND week = 8 AND source = 'oddsapi'
GROUP BY book_name
ORDER BY line_count DESC
LIMIT 10;
```

---

## Quick Reference

### **Run Checklist**
- [ ] Verify current week number
- [ ] Confirm schedule exists in `games` table
- [ ] Check credits remaining
- [ ] Dry run first (`max_events: 5`)
- [ ] Small write test (`max_events: 10`)
- [ ] Full run (no `max_events`)
- [ ] Validate with SQL queries
- [ ] Check artifacts for unmatched events

### **Key Files**
- Workflow: `.github/workflows/backfill-odds-historical.yml`
- Aliases: `apps/jobs/config/team_aliases.yml`
- Denylist: `apps/jobs/config/denylist.ts`
- Adapter: `apps/jobs/adapters/OddsApiAdapter.ts`
- CLI: `apps/jobs/ingest-minimal.ts`

### **Useful Commands**
```bash
# Compile jobs
npm run build:jobs

# Test locally (dry run)
node apps/jobs/dist/ingest-minimal.js oddsapi \
  --season 2025 --weeks 8 \
  --markets spreads,totals,h2h \
  --regions us \
  --dry-run=true \
  --historical=false \
  --max-events 5

# Check DB connection
psql $DATABASE_URL -c "SELECT COUNT(*) FROM games WHERE season=2025 AND week=8;"
```

---

## Success Criteria

### **Per Run**
- ✅ `[PRECHECK] ✅ All team names resolved`
- ✅ `mapped_games ≥ 45` (90%+ coverage)
- ✅ `COULD_NOT_RESOLVE_TEAMS: 0`
- ✅ `inserted > 0` or `postCount > 0`
- ✅ SQL coverage ≥ 90%

### **Season Long**
- ✅ Weekly runs complete without errors
- ✅ All weeks have ≥ 90% odds coverage
- ✅ Credit usage stays under monthly budget
- ✅ No regressions (duplicate keys, denylisted aliases, etc.)

---

## Notes
- **Live odds change constantly**: Re-running the same week updates to latest lines
- **Historical is immutable**: Once archived, historical snapshots don't change
- **Season fallback helps**: ±8d window catches date drifts and schedule quirks
- **Pre-check saves credits**: Always validates team resolution before API calls

Ready to pivot! 🚀

