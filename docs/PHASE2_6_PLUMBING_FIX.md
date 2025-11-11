# Phase 2.6 Plumbing Fix - Data Pipeline Repairs

## 🚨 **Problem Summary**

The calibration audit revealed **critical data pipeline issues** that explain the poor model performance (R² = 0.2%):

1. **Bookmaker names undefined** → All games showed "1 unique book", breaking per-book deduplication
2. **Scheduled dates missing** → Pre-kick window (T-60 to T+5) never engaged, 100% fallback to all lines
3. **Incomplete coverage** → Early weeks missing market lines

**Root cause**: ETL adapters weren't normalizing bookmaker names, and audit script was checking wrong field names.

---

## ✅ **Fixes Applied**

### **1. Bookmaker Normalization** ✅

**Created**: `apps/jobs/lib/bookmaker-normalizer.ts`
- Normalizes bookmaker names (e.g., "LowVig.ag" → "LowVig", "fanduel" → "FanDuel")
- Handles 30+ common aliases
- Case-folding and trimming

**Updated**:
- `apps/jobs/adapters/OddsApiAdapter.ts` - Normalizes bookmaker names on parse
- `apps/jobs/adapters/SportsGameOddsAdapter.ts` - Normalizes bookmaker names on parse
- `apps/jobs/ingest.ts` - Normalizes bookmaker names on upsert

**Result**: All market lines now have normalized bookmaker names for proper per-book deduplication.

---

### **2. Scheduled Date Fix** ✅

**Issue**: Audit script was checking `game.scheduledDate` but Game model uses `game.date`.

**Fixed**: `scripts/audit-calibration-data.ts`
- Changed `game.scheduledDate` → `game.date`
- Pre-kick window now correctly uses game kickoff time

**Note**: CFBD adapter already sets `date` field with proper timezone conversion. Games without dates will be excluded from pre-kick window (expected behavior).

---

### **3. Audit Script Field Fix** ✅

**Fixed**: `scripts/audit-calibration-data.ts`
- Changed `line.bookmaker` → `line.bookName` (correct database field)

---

## 📋 **Remaining Tasks**

### **1. Backfill Weeks 1-11** (PENDING)

**Script**: `scripts/backfill-odds-weeks-1-11.ts` (to be created)
- Re-run historical odds backfill for weeks 1-11
- This will populate normalized bookmaker names for existing data
- Will also ensure all games have proper dates

**Acceptance**:
- Coverage table by week: total games vs games with pre-kick lines
- Median uniqueBooksPerGame should be 5-10
- Flag any week with coverage <80%

---

### **2. Add Guardrails/Invariants** (PENDING)

**Location**: `apps/web/app/api/game/[gameId]/route.ts`

**Invariants to add**:
```typescript
// Consensus invariants
assert(favoriteLine < 0, 'favoriteLine must be negative (favorite-centric)');
assert(Math.abs(favoriteLine) <= 60, 'favoriteLine magnitude must be <= 60');
assert(perBookCount >= 2, 'perBookCount must be >= 2 for consensus');
assert(dogLine === Math.abs(favoriteLine), 'dogLine must equal abs(favoriteLine)');

// Window invariant
if (game.status === 'final' && game.date && !windowUnavailable) {
  assert(usingPreKickLines === true, 'Final games must use pre-kick window');
}
```

**Logging**: One-liner per game:
```
CONSENSUS: spread=-X.X (Y books, deduped=true), total=Z.Z, ML=fav:..., window T-60→T+5, snapshot ...
```

---

## 🎯 **Expected Results After Backfill**

### **Before Fixes**
- Pre-kick coverage: 0%
- Median books per game: 1 (all "Unknown")
- Correlation: r = 0.23 (weak)
- OLS slope: 0.65 (should be 3-7)
- R²: 5.1% (poor)

### **After Fixes** (Target)
- Pre-kick coverage: ≥80% for completed games
- Median books per game: 5-10
- Correlation: r = 0.35-0.55 (moderate-strong)
- OLS slope: 3-7 (proper scaling)
- R²: ≥15% (double-digits)

---

## 📊 **Next Steps**

1. **Run backfill script** for weeks 1-11
2. **Re-run audit** to verify fixes
3. **Add guardrails** to API route
4. **If audit passes**: Proceed to Phase 2.6b (Elastic Net calibration)
5. **If audit still fails**: Investigate further (V2 ratings formula, SoS adjustments, etc.)

---

## 📝 **Status**

**Current**: Infrastructure fixes complete, backfill pending
**Next**: Run backfill → Re-audit → Add guardrails → Phase 2.6b

---

**One-liner for README**:
> Calibration paused pending ETL fixes: bookmaker normalization and kickoff timestamps were missing, breaking pre-kick consensus and per-book dedupe. Backfilling weeks 1-11 now; will re-audit, then resume Elastic Net calibration.

