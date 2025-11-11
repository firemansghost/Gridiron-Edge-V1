# 📊 Gridiron Edge: Data Ingestion Workflow Guide

## 🎯 **Purpose**
This guide provides a comprehensive plan for ingesting more market line data to improve calibration quality for Season 2025.

---

## 📋 **Current Data Status** (as of November 11, 2025)

### **Available Data**
| Week | Games with Lines | Total Lines | Status |
|------|------------------|-------------|--------|
| 1 | 61 | 2,486 | ✅ Complete |
| 2 | 49 | 2,012 | ✅ Complete |
| 3 | 47 | 1,992 | ✅ Complete |
| 4 | 0 | 0 | ❌ Missing |
| 5 | 0 | 0 | ❌ Missing |
| 6 | 0 | 0 | ❌ Missing |
| 7 | 0 | 0 | ❌ Missing |
| 8 | 36 | 12,027 | ✅ Complete |
| 9 | 0 | 0 | ⚠️ Lines exist but games not final |
| 10 | 50 | 3,333 | ✅ Complete |
| 11 | 50 | 2,166 | ✅ Complete |
| 12 | 0 | 0 | ⚠️ Games in progress |

**Total**: 293 games with lines, ~13,537 total lines

### **Calibration Results with Current Data**
```
R²: 1.4% ❌  (Target: 35-40%)
RMSE: 15.93 pts ❌  (Target: 8-9 pts)
β₁ (rating_diff): 0.50 ❌  (Target: 6-7)
```

**Conclusion**: Need 4-5x more data, especially P5_P5 matchups.

---

## 🔧 **Available Workflows**

### **1. Historical Odds Backfill** ⭐ **PRIMARY TOOL**
**File**: `.github/workflows/backfill-odds-historical.yml`

**Purpose**: Fetch historical odds for completed weeks from The Odds API.

**Inputs**:
- `season`: Year (2025)
- `weeks`: Week range (e.g., "4-7" or "4,5,6,7")
- `markets`: `spreads,totals` (always)
- `regions`: `us` (always)
- `credits_limit`: Max API requests (default 1200)
- `dry_run`: `false` for real ingestion
- `historical_strict`: `true` to prevent duplicate ingestion
- `enable_season_fallback`: `true` to handle API quirks

**Cost**: ~20-30 requests per game = ~600-1,200 requests per week

**When to Use**: 
- ✅ After games are final
- ✅ When you need bulk historical data
- ✅ On API reset (15th of each month)

---

### **2. Nightly Ingest**
**File**: `.github/workflows/nightly-ingest.yml`

**Purpose**: Daily ingestion of schedules, odds, weather, and ratings for the CURRENT week only.

**Schedule**: Runs automatically at 2 AM, 10 AM, 2 PM, 6 PM UTC

**Inputs**:
- `dry_run`: `false` for real ingestion
- `force_full`: `true` to override cache

**Cost**: ~50-150 requests per run

**When to Use**:
- ✅ For live current-week data
- ❌ NOT for historical weeks (use Historical Backfill instead)

---

### **3. Manual Script (Last Resort)**
**File**: `apps/jobs/backfill-odds-oddsapi.js`

**Purpose**: One-off manual ingestion for specific games/weeks.

**Usage**:
```bash
ODDS_API_KEY=xxx SEASON=2025 WEEK=4 node apps/jobs/backfill-odds-oddsapi.js
```

**When to Use**:
- ✅ Debug specific games
- ✅ Test ingestion logic
- ❌ NOT for bulk ingestion (too slow, no error handling)

---

## 🚀 **NOVEMBER 15TH EXECUTION PLAN**

### **API Quota**
- Current (Nov 11): 16,351 / 20,000 (81.8%)
- **Reset (Nov 15)**: 0 / 20,000 ✅
- **Available after reset**: 20,000 fresh requests

---

### **Step 1: Backfill Weeks 4-7** ⭐ **HIGH PRIORITY**

**Goal**: Add ~200-250 more games

**Workflow**: Historical Odds Backfill

**Parameters**:
```yaml
Season: 2025
Weeks: 4-7
Markets: spreads,totals
Regions: us
Credits limit: 1200
Dry run: false
Historical strict: true
Enable season fallback: true
Concurrency: 2
```

**Expected Result**:
- Week 4: ~50-70 games
- Week 5: ~40-60 games
- Week 6: ~45-65 games
- Week 7: ~45-65 games
- **Total**: ~200-250 games

**API Cost**: ~4,000-6,000 requests (20-30% of quota)

**Time**: ~15-25 minutes

**Verification**:
```bash
npx tsx scripts/check-data-availability.ts
```

Should show:
```
Week 4: 300 games, 50-70 with lines (17-23%)
Week 5: 266 games, 40-60 with lines (15-23%)
Week 6: 292 games, 45-65 with lines (15-22%)
Week 7: 287 games, 45-65 with lines (16-23%)
```

---

### **Step 2: Verify Week 9** 🔍

Week 9 shows 0 games in check script but has 5,134 lines in database. This is likely because games are not yet marked `status='final'`.

**Check**:
```sql
SELECT 
  status, 
  COUNT(*) as count
FROM "Game"
WHERE season = 2025 AND week = 9
GROUP BY status;
```

**If games are now final**:
```bash
npx tsx scripts/check-data-availability.ts
```

Should add ~45 games to the total.

---

### **Step 3: Wait for Week 12 to Complete** ⏳

Week 12 games are currently in progress. After all games are final (by Nov 17-18):

**Verification**:
```sql
SELECT 
  status, 
  COUNT(*) as count
FROM "Game"
WHERE season = 2025 AND week = 12
GROUP BY status;
```

When all show `status='final'`:
```bash
npx tsx scripts/check-data-availability.ts
```

Should add ~45 games to the total.

---

### **Step 4: Re-run Calibration** 🎯

**Expected New Totals**:
- Weeks 1-3: 157 games (current)
- Weeks 4-7: ~200-250 games (new)
- Weeks 8-11: 186 games (current)
- Week 12: ~45 games (when final)
- **TOTAL**: ~600-650 games ✅

**Run**:
```bash
npm run calibrate:ridge 2025 1-12
```

**Expected Results**:
```
📊 RIDGE REGRESSION RESULTS (600-650 games)

📋 HYPERPARAMETER:
   λ (regularization): 0.100-0.200

📋 COEFFICIENTS:
   α  (intercept):         ~0.3-0.8
   β₁ (rating_diff):       ~6.0-7.0  ← Key metric!
   β₂ (rating_diff²):      ~0.4-0.6
   β₃ (talent_diff_z):     ~1.0-1.5
   ...

📈 FIT QUALITY:
   R²:          0.35-0.40 (35-40%)  ← Target!
   Adjusted R²: 0.34-0.39 (34-39%)
   RMSE:        8.0-9.0 points       ← Much better!
   ✅ Good fit
```

---

## 📊 **Optional: 2024 Season Data**

### **Do You Need It?**

After weeks 4-7, you'll have **~550-600 games** from 2025. That's typically **sufficient** for production.

### **When to Add 2024 Data**

✅ **YES, add 2024 if:**
- You want **train/test split** across years for validation
- You want **robustness testing** across multiple seasons
- You have **extra API quota** (need ~8,000-12,000 requests)
- You want **academic rigor** for publication

❌ **NO, skip 2024 if:**
- Current R² and RMSE are production-ready after weeks 4-7
- API quota is limited
- Time is limited
- Same-season consistency is preferred

### **Cost Estimate for 2024 (Full Season)**

**Weeks**: 1-14 (regular season)

**Expected Games**: ~1,400-1,600 with lines

**API Cost**: ~30,000-40,000 requests ⚠️ (exceeds monthly quota)

**Alternative**: Backfill 2024 weeks 8-14 only (late season P5_P5 matchups)
- Games: ~500-600
- API Cost: ~10,000-15,000 requests
- Run in **December** after Nov 15 quota is partially used

---

## 🛠️ **Verification Scripts**

### **Check Data Availability**
```bash
npx tsx scripts/check-data-availability.ts
```

Shows games and lines by week.

### **Verify Specific Week**
```sql
-- Check week 4 ingestion
SELECT 
  COUNT(DISTINCT ml."gameId") as games_with_lines,
  COUNT(*) as total_lines,
  MIN(ml."insertedAt") as earliest_insert,
  MAX(ml."insertedAt") as latest_insert
FROM "MarketLine" ml
JOIN "Game" g ON ml."gameId" = g.id
WHERE g.season = 2025 
  AND g.week = 4
  AND ml."lineType" IN ('spread', 'total')
  AND ml."book" != 'pinnacle';
```

### **Check All Weeks Summary**
```sql
SELECT 
  g.week,
  COUNT(DISTINCT ml."gameId") as games_with_lines,
  COUNT(*) as total_lines,
  MIN(ml."insertedAt") as earliest_insert
FROM "MarketLine" ml
JOIN "Game" g ON ml."gameId" = g.id
WHERE g.season = 2025 
  AND ml."lineType" IN ('spread', 'total')
  AND ml."book" != 'pinnacle'
GROUP BY g.week
ORDER BY g.week;
```

---

## 🎯 **Success Metrics**

### **Minimum Viable Dataset**
- ✅ Games: 400-500
- ✅ R²: 25-30%
- ✅ RMSE: 9-10 pts
- ✅ β₁: 5-6

### **Production-Ready Dataset** ⭐
- ✅ Games: 600-700
- ✅ R²: 35-40%
- ✅ RMSE: 8-9 pts
- ✅ β₁: 6-7

### **Academic-Quality Dataset**
- ✅ Games: 1,000+
- ✅ R²: 40-45%
- ✅ RMSE: 7-8 pts
- ✅ β₁: 6.5-7.5
- ✅ Multiple seasons

---

## 🚨 **Troubleshooting**

### **Workflow Fails: "Denylisted target"**
**Symptom**: Alias validation fails for teams like "Boston College"

**Fix**: Already fixed in commit `0e3609c`. FBS college exceptions now properly extracted from `denylist.ts`.

### **Workflow Runs but No Data Ingested**
**Possible Causes**:
1. **API has no data for that week** (common for weeks 4-7 in early season)
2. **Games not yet final** (check `status` field)
3. **Historical strict mode** prevented duplicate ingestion

**Check**:
```bash
# View workflow logs in GitHub Actions
# Look for "Fetching odds for week X..."
# If no games listed, API has no data for that week yet
```

### **Calibration Shows R² < 0**
**Cause**: Not enough data or power ratings not calibrated

**Fix**: Add more weeks (especially mid-late season P5_P5 games)

---

## 📅 **Timeline**

| Date | Task | Time | API Cost |
|------|------|------|----------|
| **Nov 15** | Backfill weeks 4-7 | 20-30 min | 4,000-6,000 |
| **Nov 15** | Verify week 9 status | 2 min | 0 |
| **Nov 15** | Run calibration | 5 min | 0 |
| **Nov 17** | Verify week 12 final | 2 min | 0 |
| **Nov 17** | Re-run calibration | 5 min | 0 |
| **Dec 1** | (Optional) 2024 backfill | 1-2 hrs | 10,000-15,000 |

---

## ✅ **November 15th Checklist**

### **Pre-Flight**
- [ ] Confirm API quota reset to 0/20,000
- [ ] Check week 9 game statuses
- [ ] Review workflow logs from previous runs

### **Execution**
- [ ] Run Historical Backfill for weeks 4-7
- [ ] Verify ingestion with SQL queries
- [ ] Run `check-data-availability.ts`
- [ ] Confirm total games ~500-550

### **Calibration**
- [ ] Run `npm run calibrate:ridge 2025 1-12`
- [ ] Verify R² > 30%
- [ ] Verify RMSE < 10 pts
- [ ] Verify β₁ > 5

### **Decision Point**
- [ ] If R² ≥ 35% and RMSE ≤ 9: **Production-ready!** ✅
- [ ] If R² < 30%: Consider 2024 weeks 8-14 in December

---

## 📝 **Notes**

- **Moneylines**: Still not ingesting correctly. Not critical for spread calibration, but track as known issue.
- **Totals**: Model unavailable for many games. Totals calibration is Phase 2.6 (future work).
- **API Quirks**: Season fallback enabled to handle The Odds API's inconsistent season labeling.
- **Denylist**: Now correctly handles FBS teams ending in `-college` (e.g., Boston College).

---

**Last Updated**: November 11, 2025
**Current Status**: Waiting for API reset on November 15th
**Next Action**: Backfill weeks 4-7 on November 15th
