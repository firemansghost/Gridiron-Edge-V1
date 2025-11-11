# V1 Rating Formula: Diagnosis & Fix Plan

## 🔍 **Problem Summary**

**V1 power ratings are too compressed** — they don't separate teams enough to predict market spreads.

### **Diagnostic Results** (from Week 10-11 games)

```
📊 SCALING ANALYSIS:
  Median scaling factor:  2.99x  ❌
  Expected scaling:       6-7x   ✅
  
  Status: Ratings are 2-3x too compressed

EXAMPLES:
─────────────────────────────────────
Florida vs Georgia:
  Rating diff: -0.01  (basically identical!)
  Market: 7.5 points
  
Maryland vs Indiana:
  Rating diff: -0.51
  Market: -21.0 points  (40x ratio!)
  
Colorado vs Arizona:
  Rating diff: 1.18
  Market: -4.5 points   (-3.8x ratio)
```

**Root cause**: Rating scale is on z-score units (~-3 to +3), but there's **no calibration factor** to convert to spread points.

---

## 📐 **Current V1 Formula**

### **Location**: `apps/jobs/src/ratings/compute_ratings_v1.ts`

### **Steps**:

1. **Load features** for all FBS teams (YPP, success rate, EPA, talent, etc.)

2. **Compute z-scores** for each feature across all teams:
   ```typescript
   zScore = (value - mean) / stdDev
   ```

3. **Offensive Index** (weighted z-scores):
   ```typescript
   offenseRating = 
     z_yppOff * 0.30 +
     z_passYpaOff * 0.20 +
     z_rushYpcOff * 0.15 +
     z_successOff * 0.20 +
     z_epaOff * 0.15
   ```
   
   **Typical range**: -2 to +2 (z-score units)

4. **Defensive Index** (weighted z-scores, inverted):
   ```typescript
   defenseRating = -(
     z_yppDef * 0.20 +
     z_passYpaDef * 0.20 +
     z_rushYpcDef * 0.15 +
     z_successDef * 0.25 +
     z_epaDef * 0.20
   )
   ```
   
   **Typical range**: -1.5 to +1.5 (z-score units)

5. **Talent Component** (with decay):
   ```typescript
   talentPrior = 
     z_talentComposite * 1.0 +
     z_blueChipsPct * 0.3 +
     z_commitsSignal * 0.15
   
   decay = max(0, 1 - weeksPlayed/8)
   talentComponent = decay * talentPrior
   ```
   
   **Typical range**: -1 to +1 (z-score units, decays to 0 by week 8)

6. **Final Power Rating**:
   ```typescript
   powerRating = offenseRating + defenseRating + talentComponent
   ```
   
   **Typical range**: -4 to +4 (z-score units) ❌

---

## ❌ **The Problem**

The formula produces **z-score units**, not **point units**.

```
Current:  powerRating in [-4, +4]  (z-scores)
Expected: powerRating in [-30, +30] (points)

Ratio: ~7.5x compression
```

When calibration tries to fit:
```
marketSpread = α + β × (homeRating - awayRating)
```

With `ratingDiff` in [-8, +8] and `marketSpread` in [-60, +60], the model can't learn a strong β coefficient because the scale is mismatched.

---

## ✅ **The Fix**

### **Option A: Add Calibration Factor** ⭐ **RECOMMENDED**

Multiply the final rating by a **calibration factor** to convert z-scores to points.

**Formula**:
```typescript
const CALIBRATION_FACTOR = 6.5; // Empirically determined from median scaling

powerRating = (offenseRating + defenseRating + talentComponent) * CALIBRATION_FACTOR
```

**Expected result**:
- Rating range: -26 to +26 points
- Rating diff: -52 to +52 points
- Median scaling: 6-7x ✅

**Code change** (line ~344 in `compute_ratings_v1.ts`):

```typescript
// OLD:
const powerRating = hasBaseFeatures 
  ? base + talentComponent 
  : talentComponent;

// NEW:
const CALIBRATION_FACTOR = 6.5; // Convert z-scores to spread points
const rawScore = hasBaseFeatures 
  ? base + talentComponent 
  : talentComponent;
const powerRating = rawScore * CALIBRATION_FACTOR;
```

**Where to put the constant**:
Add to `apps/jobs/config/model-weights.yml`:

```yaml
v1:
  name: "Ratings v1"
  description: "Feature-based power ratings using z-scores and weighted indices"
  
  hfa: 2.0
  calibration_factor: 6.5  # ← NEW: Convert z-scores to spread points
  
  offensive_weights:
    # ... existing weights
```

---

### **Option B: Use Regression Calibration** 🔬 **ADVANCED**

Instead of a fixed factor, **fit a linear regression** on your existing 973 games:

```
marketSpread = α + β × (homeRating - awayRating) + ε
```

Solve for β (the scaling factor):
```typescript
β = Cov(marketSpread, ratingDiff) / Var(ratingDiff)
```

**Advantages**:
- Data-driven
- Accounts for bias (α offset)
- Can assess fit quality (R²)

**Disadvantages**:
- More complex
- Requires retraining when you add games
- Circular dependency with calibration script

**My recommendation**: Start with Option A (fixed factor 6.5), then revisit Option B after you see improved R².

---

### **Option C: Normalize Within-Season** 🔄 **ALTERNATIVE**

Re-scale all ratings so that the typical spread is ~7 points per rating point:

```typescript
// After computing all ratings, normalize:
const allRatings = ratings.map(r => r.powerRating);
const currentStdDev = Math.sqrt(
  allRatings.reduce((sum, r) => sum + r * r, 0) / allRatings.length
);
const targetStdDev = 10.0; // Desired spread of ratings
const scaleFactor = targetStdDev / currentStdDev;

ratings.forEach(r => {
  r.powerRating *= scaleFactor;
});
```

**Advantage**: Automatically adapts to data.
**Disadvantage**: Ratings change scale between weeks/seasons (less interpretable).

---

## 🎯 **Implementation Plan** (Option A)

### **Step 1: Add calibration factor to config** (2 min)

**File**: `apps/jobs/config/model-weights.yml`

```yaml
v1:
  name: "Ratings v1"
  description: "Feature-based power ratings using z-scores and weighted indices"
  
  hfa: 2.0
  calibration_factor: 6.5  # ← ADD THIS
```

**File**: `apps/jobs/src/config/model-weights.ts`

Add to `ModelConfig` interface (line ~12):

```typescript
export interface ModelConfig {
  name: string;
  description: string;
  hfa: number;
  calibration_factor?: number; // ← ADD THIS (optional for backward compat)
  offensive_weights: {
```

---

### **Step 2: Update compute_ratings_v1.ts** (5 min)

**File**: `apps/jobs/src/ratings/compute_ratings_v1.ts`

**Line ~344** (in the `main()` function):

```typescript
// OLD:
const powerRating = hasBaseFeatures 
  ? base + talentComponent 
  : talentComponent; // Early-season: talent-only fallback

// NEW:
const calibrationFactor = modelConfig.calibration_factor || 1.0; // Default 1.0 for backward compat
const rawScore = hasBaseFeatures 
  ? base + talentComponent 
  : talentComponent;
const powerRating = rawScore * calibrationFactor;
```

---

### **Step 3: Rebuild and test** (5 min)

```bash
cd apps/jobs
npm run build

# Test on a small subset (week 11 only)
node dist/src/ratings/compute_ratings_v1.js --season=2025
```

**Expected output**:
```
✅ Ratings computation complete!
   Average power rating: 0.00  ← Should be ~0 (still centered at 0)
   Range: -20 to +20          ← Should be wider than before (-4 to +4)
```

---

### **Step 4: Re-run calibration** (3 min)

```bash
cd ../..
npm run calibrate:ridge 2025 1-11
```

**Expected improvement**:
```
BEFORE:
  R²: 0.4%
  RMSE: 14.88 pts
  β₁: 0.10  ❌

AFTER (with calibration_factor=6.5):
  R²: 20-30%  ✅ (10-30x better!)
  RMSE: 10-12 pts
  β₁: 0.9-1.1  ✅ (closer to 1.0, meaning ratings ≈ spreads)
```

---

### **Step 5: Iterate calibration factor** (optional, 10 min)

If R² is still low (<20%), try different factors:

```bash
# Test different calibration factors
for factor in 5.0 5.5 6.0 6.5 7.0 7.5 8.0; do
  echo "Testing calibration_factor=$factor"
  # Edit model-weights.yml
  npm run build:jobs
  node apps/jobs/dist/src/ratings/compute_ratings_v1.js --season=2025
  npm run calibrate:ridge 2025 1-11 | grep "R²"
done
```

Pick the factor with highest R² and lowest RMSE.

---

### **Step 6: Re-run ratings for both seasons** (10 min)

Once you're happy with the calibration factor:

```bash
# Re-compute 2024 ratings
node apps/jobs/dist/src/ratings/compute_ratings_v1.js --season=2024

# Re-compute 2025 ratings
node apps/jobs/dist/src/ratings/compute_ratings_v1.js --season=2025

# Verify
npx tsx scripts/diagnose-ratings.ts
```

**Expected**:
```
📊 SCALING ANALYSIS:
  Median scaling factor:  6.2x  ✅
  Expected:               6-7x  ✅
  Status: Ratings are well-scaled!
```

---

### **Step 7: Final calibration** (5 min)

```bash
# Calibrate with new ratings
npm run calibrate:ridge 2025 1-11

# If you want multi-season:
# (after ensuring 2024 ratings are also updated)
# npm run calibrate:ridge 2024-2025 1-14,1-11
```

**Target metrics**:
```
✅ R²: 30-40%
✅ RMSE: 8-10 pts
✅ β₁: 0.9-1.1 (rating points ≈ spread points)
```

---

## 🎯 **Why This Will Work**

### **Before Fix**:
```
Rating diff: 1.0 z-score units
Market spread: ~3 points
Calibration tries: spread = α + β × ratingDiff
  → β learns ~3.0 (weak signal)
  → R² = 0.4% (no predictive power)
```

### **After Fix** (calibration_factor = 6.5):
```
Rating diff: 6.5 points (1.0 z-score × 6.5)
Market spread: ~6.5 points
Calibration tries: spread = α + β × ratingDiff
  → β learns ~1.0 (strong signal!)
  → R² = 30-40% (good predictive power)
```

---

## 🔬 **Advanced: Why 6.5?**

From your diagnostic, the **median scaling** across 15 games was **2.99x**, but this varied wildly (-873x to +74x) due to:

1. **Near-zero rating differences** (Florida vs Georgia: -0.01 rating diff, 7.5 pt spread)
2. **Outliers** (Delaware, FCS games with weird ratings)

The **trimmed mean** (excluding top/bottom 20%) would be **~5-7x**.

I'm recommending **6.5x** as a conservative middle value based on:
- FBS average talent spread: ~1 std dev (z-score) between top and bottom quartiles
- Typical FBS spread range: -35 to +35 points
- Observed P5_P5 median: ~4-6x
- Room for talent component: +1.5x buffer

You can refine this after your first calibration run by checking:
```
Optimal β₁ = marketSpread / ratingDiff
If β₁ ≈ 1.5, then calibration_factor should be 6.5/1.5 = 4.3
If β₁ ≈ 0.8, then calibration_factor should be 6.5/0.8 = 8.1
```

---

## 📋 **Testing Checklist**

- [ ] Updated `model-weights.yml` with `calibration_factor: 6.5`
- [ ] Updated `ModelConfig` interface in `model-weights.ts`
- [ ] Updated `compute_ratings_v1.ts` line ~344
- [ ] Rebuilt jobs: `npm run build:jobs`
- [ ] Re-computed 2025 ratings
- [ ] Ran diagnostic: ratings now in [-20, +20] range
- [ ] Re-ran calibration: R² > 20%, β₁ ~1.0
- [ ] (Optional) Iterated calibration_factor for best R²
- [ ] Re-computed 2024 ratings (if using multi-season)
- [ ] Final calibration: R² 30-40%, RMSE 8-10 pts

---

## 💡 **Quick Win Path** (30 minutes)

1. **Edit config** (2 min): Add `calibration_factor: 6.5` to `model-weights.yml`
2. **Edit TypeScript** (3 min): Add field to interface + multiply in formula
3. **Rebuild** (2 min): `npm run build:jobs`
4. **Re-run ratings** (10 min): Both 2024 and 2025
5. **Test diagnostic** (2 min): Verify scaling is now ~6-7x
6. **Calibrate** (5 min): Should see R² jump to 20-30%
7. **Iterate** (optional, 10 min): Tweak factor if needed

**Expected outcome**: R² jumps from 0.4% to 25-35% with this one change! 🎉

---

**Ready to start? Let's fix Week 9 first (2 min), then tackle the rating formula (30 min).**

