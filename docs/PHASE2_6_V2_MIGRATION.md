# Phase 2.6: Migrate to V2 Ratings (SoS + Shrinkage)

## 🎯 **Objective**

Migrate from V1 ratings to **V2 ratings** which include:
- **Strength of Schedule (SoS) adjustments** - Normalizes features by opponent strength
- **Shrinkage regularization** - Stabilizes early-season volatility
- **Enhanced HFA** - Conference and distance-based (fallback to v1 default)

**Goal**: Improve R² from current 0.5-1.3% to **20-30%+** by accounting for schedule difficulty.

---

## 📊 **Current State**

### **V1 Ratings** (Current)
```
R²: 0.5% (2025), 1.3% (2024)
RMSE: 14.78 pts (2025), 14.25 pts (2024)
β₁: -0.0078 to -0.0374 (very small)
Status: ❌ Poor predictive power
```

### **V2 Ratings** (Available, Not Yet Used)
- ✅ Code exists: `apps/jobs/src/ratings/compute_ratings_v2.ts`
- ✅ Workflow exists: `.github/workflows/ratings-v2.yml`
- ✅ Features: SoS adjustments, shrinkage, enhanced HFA
- ❌ Not computed yet for 2024/2025
- ❌ Not used in API/calibration

---

## 🔍 **Why V2 Should Help**

### **Problem with V1**

V1 ratings don't account for **schedule difficulty**:
- Team A beats weak opponents → looks great
- Team B beats strong opponents → looks average
- But Team B is actually better!

**Example**:
```
Team A: 5-0 vs G5 teams (avg opponent rating: -1.5)
Team B: 4-1 vs P5 teams (avg opponent rating: +1.5)

V1 sees: Team A rating = +2.0, Team B rating = +1.5
Reality: Team B is better (harder schedule)
```

### **How V2 Fixes This**

**SoS Adjustments**:
1. For each team, identify all opponents played
2. Get opponent defensive/offensive ratings
3. Calculate average opponent strength
4. Adjust offensive features based on opponent defensive strength
5. Adjust defensive features based on opponent offensive strength
6. **Iterative**: Recompute ratings with adjusted features (3 iterations)

**Result**: Teams with harder schedules get boosted ratings, teams with easier schedules get reduced ratings.

---

## 📋 **Implementation Plan**

### **Step 1: Compute V2 Ratings** (15 min)

**For 2024**:
```bash
# Via GitHub Actions workflow
# OR locally:
npm run build:jobs
node apps/jobs/dist/src/ratings/compute_ratings_v2.js --season=2024
```

**For 2025**:
```bash
node apps/jobs/dist/src/ratings/compute_ratings_v2.js --season=2025
```

**Expected**:
- 132 teams (2024), 136 teams (2025)
- Ratings stored with `modelVersion='v2'`
- SoS adjustments applied iteratively
- Shrinkage regularization applied

---

### **Step 2: Update Calibration Script** (10 min)

**File**: `scripts/calibrate-model-ridge.ts`

**Change**: Read v2 ratings instead of v1

```typescript
// OLD (line ~372):
const ratings = await prisma.teamSeasonRating.findMany({
  where: { season, teamId: { in: gameTeamIds }, modelVersion: 'v1' }
});

// NEW:
const ratings = await prisma.teamSeasonRating.findMany({
  where: { season, teamId: { in: gameTeamIds }, modelVersion: 'v2' }
});
```

---

### **Step 3: Test Calibration with V2** (5 min)

```bash
npm run calibrate:ridge 2025 1-11
npm run calibrate:ridge 2024 1-14
```

**Expected Improvement**:
```
V1: R² = 0.5-1.3%
V2: R² = 15-25% (target)
```

**Why**: SoS adjustments should make rating differences more predictive of spreads.

---

### **Step 4: Update API to Use V2** (20 min)

**File**: `apps/web/app/api/game/[gameId]/route.ts`

**Change**: Read v2 ratings for model calculations

**Locations to update**:
1. Rating lookups (home/away team ratings)
2. Model spread calculations
3. Any references to `modelVersion='v1'`

**Search for**:
```typescript
modelVersion: 'v1'
```

**Replace with**:
```typescript
modelVersion: 'v2'
```

---

### **Step 5: Verify & Test** (10 min)

1. **Check API response**: Verify ratings are v2
2. **Check game pages**: Verify spreads/picks use v2
3. **Run canary script**: Ensure no regressions
4. **Compare predictions**: V2 should be more accurate

---

## 🎯 **Success Criteria**

### **Minimum Viable**
- ✅ V2 ratings computed for both seasons
- ✅ Calibration uses v2 ratings
- ✅ R² improves to **≥10%** (2x improvement)
- ✅ API uses v2 ratings

### **Production Ready**
- ✅ R² ≥ **20%** (4x improvement)
- ✅ RMSE ≤ **12 pts** (down from 14.78)
- ✅ β₁ coefficient ≥ **0.5** (10x improvement)
- ✅ All game pages render correctly

---

## 📊 **Expected Results**

### **Before (V1)**
```
R²: 0.5-1.3%
RMSE: 14.25-14.78 pts
β₁: -0.0078 to -0.0374
Rating differences barely predict spreads
```

### **After (V2)**
```
R²: 15-25% (target)
RMSE: 11-13 pts (target)
β₁: 0.5-1.0 (target)
Rating differences strongly predict spreads
```

**Why V2 Should Work Better**:
- SoS adjustments normalize for schedule difficulty
- Teams with harder schedules get proper credit
- Rating differences become more meaningful
- Calibration can learn stronger coefficients

---

## 🔧 **Technical Details**

### **V2 SoS Algorithm**

```typescript
// Iterative process (3 iterations)
for (iteration = 0; iteration < 3; iteration++) {
  // 1. Compute ratings from current features
  ratings = computeRatings(features);
  
  // 2. For each team, adjust features by opponent strength
  for (team of teams) {
    opponents = getOpponents(team);
    avgOppDefense = mean(opponents.map(o => o.defenseRating));
    avgOppOffense = mean(opponents.map(o => o.offenseRating));
    
    // Adjust offensive features (harder schedule = boost)
    offensiveSoS = leagueAvgDefense - avgOppDefense;
    features.yppOff *= (1 + offensiveSoS * 0.05);
    
    // Adjust defensive features (harder schedule = boost)
    defensiveSoS = avgOppOffense - leagueAvgOffense;
    features.yppDef *= (1 + defensiveSoS * 0.05);
  }
  
  // 3. Recompute z-scores on adjusted features
  zStats = recalculateZScores(features);
}
```

### **Shrinkage Regularization**

```typescript
// Shrink toward prior (0.0) based on confidence
shrinkageFactor = baseFactor * (1 - confidence) * (1 - gamesPlayed/8);
shrunkRating = rawRating * (1 - shrinkageFactor) + prior * shrinkageFactor;
```

---

## ⚠️ **Potential Issues**

### **1. Circular Dependency**
- SoS needs opponent ratings
- Opponent ratings need SoS
- **Solution**: Iterative approach (3 iterations converges)

### **2. Early Season**
- Few games played → SoS less reliable
- **Solution**: Shrinkage regularization reduces SoS impact early

### **3. Performance**
- V2 is slower (iterative, more DB queries)
- **Solution**: Acceptable for weekly computation

### **4. Calibration Factor**
- V2 ratings may need different calibration_factor
- **Solution**: Test with current 8.0, adjust if needed

---

## 📁 **Files to Modify**

```
✅ apps/jobs/src/ratings/compute_ratings_v2.ts (already exists)
✅ scripts/calibrate-model-ridge.ts (change modelVersion to 'v2')
✅ apps/web/app/api/game/[gameId]/route.ts (change modelVersion to 'v2')
✅ .github/workflows/ratings-v2.yml (already exists)
```

---

## 🚀 **Execution Order**

1. **Compute V2 ratings** (2024 + 2025)
2. **Update calibration script** (read v2)
3. **Test calibration** (verify R² improved)
4. **Update API** (use v2 ratings)
5. **Verify UI** (game pages work)
6. **Run canary tests** (no regressions)

**Total Time**: ~60 minutes

---

## 📊 **Acceptance Tests**

### **Test 1: V2 Ratings Computed**
```bash
# Check 2024
SELECT COUNT(*) FROM team_season_ratings 
WHERE season=2024 AND model_version='v2' AND power_rating IS NOT NULL;
# Expected: 132

# Check 2025
SELECT COUNT(*) FROM team_season_ratings 
WHERE season=2025 AND model_version='v2' AND power_rating IS NOT NULL;
# Expected: 136
```

### **Test 2: Calibration Improved**
```bash
npm run calibrate:ridge 2025 1-11
# Expected: R² ≥ 10% (was 0.5%)
```

### **Test 3: API Uses V2**
```bash
# Check API response for a game
curl http://localhost:3000/api/game/2025-wk11-florida-kentucky
# Expected: model_view.ratings uses v2 ratings
```

### **Test 4: UI Renders Correctly**
- Visit game page
- Verify spreads/picks display
- Verify no errors in console

---

## 🎯 **Next Steps After Phase 2.6**

If R² improves to 20%+:
- ✅ **Phase 2.7**: Fine-tune SoS adjustment factor (currently 5%)
- ✅ **Phase 2.8**: Add recency weighting improvements
- ✅ **Phase 2.9**: Multi-season validation

If R² still low (<10%):
- ⚠️ **Investigate**: Why SoS isn't helping
- ⚠️ **Consider**: Different SoS algorithm
- ⚠️ **Consider**: Additional features (injuries, weather, etc.)

---

## 📝 **Notes**

- V2 ratings are **computationally expensive** (iterative SoS)
- Run weekly, not daily
- Keep V1 ratings as fallback
- Monitor performance impact

---

**Ready to start?** Let's compute V2 ratings and see if SoS adjustments improve predictive power! 🚀

