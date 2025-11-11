# Backfill Instructions - Weeks 1-11 (2025)

## 🎯 **Goal**

Re-populate odds data for weeks 1-11 with:
- ✅ Normalized bookmaker names (FanDuel, DraftKings, etc. instead of undefined)
- ✅ Proper pre-kick window coverage (T-60 to T+5 around kickoff)
- ✅ Per-book deduplication working correctly

---

## 🚀 **Option 1: Local Script (Recommended for Testing)**

**Prerequisites**:
- `ODDS_API_KEY` environment variable set
- Database connection configured

**Run**:
```bash
npx tsx scripts/backfill-weeks-1-11.ts
```

**What it does**:
- Builds the jobs package
- Runs ingest for each week (1-11) sequentially
- Includes rate limiting (2s delay between weeks)
- Continues even if one week fails

**Time**: ~15-30 minutes (depends on API rate limits)

---

## 🚀 **Option 2: GitHub Actions Workflow**

**Steps**:
1. Go to GitHub Actions → **"Backfill Historical Odds"** workflow
2. Click **"Run workflow"**
3. Fill in:
   - **Season**: `2025`
   - **Weeks**: `1,2,3,4,5,6,7,8,9,10,11`
   - **Enable season fallback**: Leave unchecked (or check if needed)
4. Click **"Run workflow"**

**What it does**:
- Runs the same ingest process in GitHub Actions
- Uses secrets for API keys
- Provides logs and reports

**Time**: ~20-40 minutes (includes workflow overhead)

---

## ✅ **Verification After Backfill**

### **1. Check Coverage**

```bash
npx tsx scripts/verify-backfill-coverage.ts 2025 1-11
```

**Expected output**:
- Coverage ≥80% per week
- Median books per game: 5-10
- No "Unknown" or "undefined" book names
- Sample books: FanDuel, DraftKings, Caesars, etc.

### **2. Run Calibration Audit**

```bash
npx tsx scripts/audit-calibration-data.ts 2025 1-11
```

**Pass/Fail Gates**:
- ✅ Pearson r ≥ 0.35 (P5/P5 ideally 0.45-0.55)
- ✅ OLS slope: 3-7 (rating_diff → market spread)
- ✅ R² ≥ 0.15 overall
- ✅ Pre-kick coverage ≥ 80%
- ✅ Median books: 5-10

**If gates pass**: Proceed to Phase 2.6b (Elastic Net calibration)
**If gates fail**: Fix the specific data issue before tuning the model

---

## 📊 **Acceptance Criteria**

### **Coverage**
- ✅ ≥80% of FBS games have pre-kick lines per week
- ✅ Median unique books per game: 5-10
- ✅ No "undefined" or alias book names in sample

### **Data Quality**
- ✅ Book names normalized (FanDuel, DraftKings, Caesars, etc.)
- ✅ Pre-kick window working (T-60 to T+5 around kickoff)
- ✅ Per-book deduplication working (rawCount > perBookCount)

---

## 🔍 **Troubleshooting**

### **Issue: Low coverage (<80%)**
- Check if games have `date` field populated
- Verify pre-kick window logic (T-60 to T+5)
- Check if market lines exist in the database

### **Issue: Low book count (<5)**
- Verify bookmaker normalization is working
- Check if adapters are setting `bookName` field
- Look for "Unknown" book names in sample

### **Issue: API rate limits**
- Use local script with delays (already included)
- Or run workflow with smaller week batches
- Check ODDS_API_KEY quota

---

## 📝 **Next Steps After Verification**

1. **If audit passes**:
   - Add guardrails/invariants to API route
   - Proceed to Phase 2.6b (Elastic Net calibration)

2. **If audit fails**:
   - Identify which metric missed (r, slope, R², coverage, books)
   - Fix the specific data issue
   - Re-run verification and audit
   - Do NOT proceed to model tuning until gates pass

---

**Status**: Ready to run backfill ✅

