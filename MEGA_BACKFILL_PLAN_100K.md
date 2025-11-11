# 🚀 MEGA BACKFILL PLAN - 100,000 Requests Available!

## 🎯 **Goals**

With 100,000 API requests, you can now:
1. ✅ **Complete ALL of 2025** (weeks 4-7 + any gaps)
2. ✅ **Expand 2024 coverage** (you have 377 games, get more)
3. ✅ **Multi-season validation** (train on 2024, test on 2025)
4. ✅ **Achieve academic-quality calibration** (R² 40-45%, RMSE 7-8 pts)

---

## 📊 **Current Status**

### **Season 2025** (Current Week: 12)
| Week | Games with Lines | Status |
|------|------------------|--------|
| 1 | 61 | ✅ Complete |
| 2 | 49 | ✅ Complete |
| 3 | 47 | ✅ Complete |
| 4 | 0 | ❌ **Need to backfill** |
| 5 | 0 | ❌ **Need to backfill** |
| 6 | 0 | ❌ **Need to backfill** |
| 7 | 0 | ❌ **Need to backfill** |
| 8 | 36 | ✅ Complete |
| 9 | 0 | ⚠️ Check if final |
| 10 | 50 | ✅ Complete |
| 11 | 50 | ✅ Complete |
| 12 | 0 | ⏳ In progress |

**Current**: 293 games with lines

### **Season 2024**
```
Total games: 3,747
Total lines: 12,321
Games with lines: 377 ✅
```

**Need**: Week-by-week breakdown + more weeks if available

---

## 🎯 **Execution Plan**

### **PHASE 1: Complete 2025** (Priority #1)
**Target**: Get weeks 4-7 immediately

#### **Batch 1A: Weeks 4-5**
```yaml
Workflow: Historical Odds Backfill
Season: 2025
Weeks: 4-5
Markets: spreads,totals
Regions: us
Credits limit: 1200
Dry run: false
Historical strict: true
Enable season fallback: true
Concurrency: 2
```

**Expected**: ~90-130 games
**Cost**: ~2,000-3,000 requests
**Time**: ~15-20 minutes

**Verify**:
```bash
npx tsx scripts/check-data-availability.ts
```

#### **Batch 1B: Weeks 6-7**
```yaml
Workflow: Historical Odds Backfill
Season: 2025
Weeks: 6-7
Markets: spreads,totals
Regions: us
Credits limit: 1200
Dry run: false
Historical strict: true
Enable season fallback: true
Concurrency: 2
```

**Expected**: ~90-130 games
**Cost**: ~2,000-3,000 requests
**Time**: ~15-20 minutes

**Cumulative after Phase 1**:
- **2025 games**: 470-550
- **API used**: ~4,000-6,000
- **Remaining**: ~94,000-96,000

---

### **PHASE 2: Check Week 9 + 12 Status**

#### **Week 9 Check**
```bash
# Check if games are final
npx tsx -e "const { prisma } = require('./apps/web/lib/prisma.js'); (async () => { const w9 = await prisma.game.findMany({ where: { season: 2025, week: 9 }, select: { status: true } }); console.log('Week 9 statuses:', w9.map(g => g.status).filter((v,i,a) => a.indexOf(v)===i)); await prisma.\$disconnect(); })();"
```

- **If final**: Lines already exist (5,134 lines ingested), just need games marked final
- **If not final**: Wait a few days

#### **Week 12 Check**
```bash
# Check if games are final (likely by Nov 17-18)
npx tsx -e "const { prisma } = require('./apps/web/lib/prisma.js'); (async () => { const w12 = await prisma.game.findMany({ where: { season: 2025, week: 12 }, select: { status: true } }); console.log('Week 12 statuses:', w12.map(g => g.status).filter((v,i,a) => a.indexOf(v)===i)); await prisma.\$disconnect(); })();"
```

When final:
```yaml
Workflow: Historical Odds Backfill
Season: 2025
Weeks: 12
Markets: spreads,totals
# ... same params as above
```

**Expected**: ~45 games
**Cost**: ~1,000-1,500 requests

---

### **PHASE 3: Expand 2024 Coverage**

You have **377 games from 2024** already. Let's find out which weeks and fill gaps.

#### **Step 3A: Analyze 2024 Coverage**

**SQL Query** (run in Supabase):
```sql
SELECT 
  g.week,
  COUNT(DISTINCT ml."gameId") as games_with_lines,
  COUNT(*) as total_lines,
  MIN(ml."insertedAt") as earliest_insert
FROM "MarketLine" ml
JOIN "Game" g ON ml."gameId" = g.id
WHERE g.season = 2024
  AND ml."lineType" IN ('spread', 'total')
GROUP BY g.week
ORDER BY g.week;
```

#### **Step 3B: Strategic 2024 Backfill**

**Option A: Late-Season Elite Games (Recommended)**

Focus on weeks 10-14 (conference championships, rivalry games, playoff implications):

```yaml
Workflow: Historical Odds Backfill
Season: 2024
Weeks: 10-14
Markets: spreads,totals
Regions: us
Credits limit: 2400
Dry run: false
Historical strict: true
Enable season fallback: true
Concurrency: 2
```

**Expected**: ~200-250 more games
**Cost**: ~5,000-7,000 requests
**Why**: Late season = best P5_P5 matchups, stakes matter, form established

**Option B: Full Season 2024**

If you want comprehensive 2024 coverage:

```yaml
# Batch 3B1: Weeks 1-5
Season: 2024, Weeks: 1-5
Expected: ~250 games, Cost: ~6,000 requests

# Batch 3B2: Weeks 6-9
Season: 2024, Weeks: 6-9
Expected: ~200 games, Cost: ~5,000 requests

# Batch 3B3: Weeks 10-14
Season: 2024, Weeks: 10-14
Expected: ~250 games, Cost: ~6,000 requests
```

**Total**: ~700 more games, ~17,000 requests

**Cumulative after Full 2024**:
- **2024 games**: 377 → 1,000-1,100
- **2025 games**: 500-550
- **Total dataset**: 1,500-1,650 games ✅
- **API used**: ~22,000-30,000
- **Remaining**: ~70,000-78,000

---

## 📊 **Calibration Timeline**

### **After Phase 1 (2025 weeks 4-7)**
```bash
npm run calibrate:ridge 2025 1-11
```

**Expected**:
- Games: 500-550
- R²: 30-40%
- RMSE: 8-10 pts
- β₁: 5-7
- **Status**: ✅ **Production-ready!**

### **After Phase 3 (+ 2024 data)**
```bash
# Train on 2024, test on 2025 for validation
npm run calibrate:ridge 2024 1-14

# Combined model
npm run calibrate:ridge 2024-2025 1-14,1-11
```

**Expected**:
- Games: 1,500-1,650
- R²: 40-45%
- RMSE: 7-8 pts
- β₁: 6.5-7.5
- **Status**: ✅ **Academic-quality!**

---

## 🎯 **Recommended Execution Order**

### **TODAY (November 11)**

1. ✅ **Phase 1A**: Backfill 2025 weeks 4-5 (~20 min, ~3K requests)
2. ✅ **Phase 1B**: Backfill 2025 weeks 6-7 (~20 min, ~3K requests)
3. ✅ **Calibration**: Run on 2025 weeks 1-11 (~5 min)
4. ✅ **Verify**: R² ≥ 30%, RMSE ≤ 10 pts → **Production-ready!**

**Total time**: ~45 minutes
**API used**: ~6,000 / 100,000 (6%)

### **AFTER 2025 Production Deploy (Optional)**

5. ⏳ **Phase 2**: Check week 9 + 12 status (wait for final)
6. 📊 **Phase 3A**: Analyze 2024 coverage (SQL query)
7. 🎯 **Phase 3B**: Strategic 2024 backfill (late season or full)
8. 🔬 **Validation**: Train/test split across seasons

**Total time**: ~1-2 hours
**API used**: ~15,000-25,000 / 100,000 (15-25%)

---

## 💰 **Cost Breakdown**

| Phase | Task | Games Added | API Cost | Cumulative |
|-------|------|-------------|----------|------------|
| **1A** | 2025 weeks 4-5 | 90-130 | 2,000-3,000 | ~3,000 |
| **1B** | 2025 weeks 6-7 | 90-130 | 2,000-3,000 | ~6,000 |
| **2** | 2025 week 12 | 45 | 1,000-1,500 | ~7,500 |
| **3** | 2024 weeks 10-14 | 200-250 | 5,000-7,000 | ~14,000 |
| **Bonus** | 2024 full season | 600-700 | 12,000-17,000 | ~30,000 |

**Total (Recommended Path)**: ~14,000 / 100,000 (14%)
**Total (Full Backfill)**: ~30,000 / 100,000 (30%)

**Remaining for live tracking**: 70,000-86,000 requests ✅

---

## ✅ **Success Metrics**

### **Phase 1 Complete (Production-Ready)**
```
✅ Games: 500-550
✅ R²: 30-40%
✅ RMSE: 8-10 pts
✅ β₁: 5-7
✅ Coverage: All 2025 weeks 1-11
```

### **Phase 3 Complete (Academic-Quality)**
```
✅ Games: 1,500+
✅ R²: 40-45%
✅ RMSE: 7-8 pts
✅ β₁: 6.5-7.5
✅ Coverage: Full 2024 + 2025
✅ Validation: Train/test across seasons
```

---

## 🚀 **Quick Start (RIGHT NOW)**

### **Step 1: Backfill 2025 Weeks 4-5**

1. Go to: https://github.com/firemansghost/Gridiron-Edge-V1/actions/workflows/backfill-odds-historical.yml
2. Click "Run workflow"
3. Enter:
   - Season: `2025`
   - Weeks: `4-5`
   - Markets: `spreads,totals`
   - Regions: `us`
   - Credits limit: `1200`
   - Dry run: `false`
   - Historical strict: `true`
   - Enable season fallback: `true`
   - Concurrency: `2`
4. Click "Run workflow"
5. Wait ~20 minutes

### **Step 2: Verify**

```bash
cd C:\Users\Bobby\gridiron-edge-v1\Gridiron-Edge-V1
npx tsx scripts/check-data-availability.ts
```

Should show:
```
Week 4: 300 games, 50-70 with lines (17-23%)
Week 5: 266 games, 40-60 with lines (15-23%)
```

### **Step 3: Repeat for Weeks 6-7**

Same as Step 1, but:
- Weeks: `6-7`

### **Step 4: Run Calibration**

```bash
npm run calibrate:ridge 2025 1-11
```

Expected output:
```
✅ 500-550 games collected
R²: 30-40%
RMSE: 8-10 points
β₁: 5-7
✅ Production-ready!
```

---

## 📋 **Verification Commands**

### **Check Current Data**
```bash
npx tsx scripts/check-data-availability.ts
```

### **Check Specific Week**
```sql
-- Run in Supabase SQL Editor
SELECT 
  COUNT(DISTINCT ml."gameId") as games_with_lines,
  COUNT(*) as total_lines,
  MIN(ml."insertedAt") as earliest_insert,
  MAX(ml."insertedAt") as latest_insert
FROM "MarketLine" ml
JOIN "Game" g ON ml."gameId" = g.id
WHERE g.season = 2025 
  AND g.week = 4  -- Change week number
  AND ml."lineType" IN ('spread', 'total');
```

### **Check 2024 Week Breakdown**
```sql
-- Run in Supabase SQL Editor
SELECT 
  g.week,
  COUNT(DISTINCT ml."gameId") as games_with_lines,
  COUNT(*) as total_lines
FROM "MarketLine" ml
JOIN "Game" g ON ml."gameId" = g.id
WHERE g.season = 2024
GROUP BY g.week
ORDER BY g.week;
```

---

## 🎉 **Bottom Line**

With **100,000 requests**, you can:

✅ **Complete 2025** (weeks 4-7) → **Production-ready model TODAY**
✅ **Expand 2024** (strategic or full) → **Academic-quality validation**
✅ **Keep 70K+ buffer** for live tracking through playoffs

**Recommended**: Start with Phase 1 (2025 weeks 4-7) RIGHT NOW. Get to production-ready in ~45 minutes. Then decide if you want to add 2024 for validation.

---

**Ready to start?** Run the workflows for weeks 4-5 now! 🚀

