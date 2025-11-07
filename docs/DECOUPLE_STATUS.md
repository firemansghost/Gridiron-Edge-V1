# Decoupling & Range Logic - Implementation Status

## ✅ Phase 1 COMPLETE: API Changes (Deployed)

### 1. Independent Validation Flags ✅
**Location**: `route.ts` lines 1295-1321

```typescript
const ats_inputs_ok = finalImpliedSpread !== null && !isNaN(finalImpliedSpread) && isFinite(finalImpliedSpread);
const ou_inputs_ok = finalImpliedTotal !== null && !isNaN(finalImpliedTotal) && isFinite(finalImpliedTotal) && finalImpliedTotal >= 15 && finalImpliedTotal <= 120;
```

**Added to API response** (`validation` object):
- `ats_inputs_ok`: Boolean - Can ATS show a pick?
- `ou_inputs_ok`: Boolean - Can OU show a pick?
- `ats_reason`: String - Why ATS is suppressed (if any)
- `ou_reason`: String - Why OU is suppressed (if any)

### 2. Flip Point Calculations ✅
**Spread** (lines 1334-1339):
```typescript
const spreadBetTo = market + sign(overlay) × 2.0;  // Stop line
const spreadFlip = market - sign(overlay) × 2.0;   // Where other side becomes bet
```

**Total** (lines 1595-1600):
```typescript
const totalBetToCalc = market + sign(overlay) × 2.0;
const totalFlip = market - sign(overlay) × 2.0;
```

**Added to pick objects**:
- `bettablePick.flip`: Spread flip point
- `totalPick.flip`: Total flip point
- Both available in API response

### 3. Enhanced Logging ✅
```
[Game ID] 🔍 Independent Validation:
  ats_inputs_ok, ou_inputs_ok, ats_reason, ou_reason

[Game ID] ✅ Spread pick generated:
  pick, overlay, edge, betTo, flip

[Game ID] ✅ Total pick generated:
  pick, overlay, edge, betTo, flip, oppositeAt
```

---

## ⏳ Phase 2 PENDING: UI Updates

### What Needs to Change

#### 1. ATS Card Logic
**Current** (line 550):
```tsx
{game.picks?.spread?.grade && game.picks?.spread?.bettablePick ? (
  // Show pick
) : (
  // "inputs failed validation"
)}
```

**Should Be**:
```tsx
{game.validation?.ats_inputs_ok ? (
  game.picks?.spread?.grade ? (
    // Show pick with grade + flip point
  ) : (
    // "No edge at current number" (overlay < 2.0)
  )
) : (
  // Show specific ats_reason
)}
```

#### 2. Display Flip Points
**When pick exists**, add below bet-to:
```tsx
{game.picks.spread.bettablePick?.flip && (
  <div className="text-xs text-gray-600 mt-1">
    Range: Value now to {betTo}; flips to {otherTeam} at {flip}
  </div>
)}
```

#### 3. Better "No Edge" State
**When ats_inputs_ok but no grade**:
```tsx
<div>
  <h3>AGAINST THE SPREAD</h3>
  <div className="text-lg">No edge at current number — market {marketSpread}</div>
  <div className="text-xs text-gray-500">
    Model overlay {overlay.toFixed(1)} pts (< 2.0 threshold)
  </div>
</div>
```

#### 4. Better "Invalid Inputs" State
**When !ats_inputs_ok**:
```tsx
<div>
  <h3>AGAINST THE SPREAD</h3>
  <div className="text-lg">No ATS pick this week</div>
  <div className="text-xs text-gray-600">{game.validation.ats_reason}</div>
</div>
```

---

## 🎯 Expected Behavior After Full Implementation

### OSU @ Purdue
**Before**: "Spread pick hidden — inputs failed validation"
**After** (if overlay < 2.0): "No edge at current number — market -29.5 (overlay +0.8 < 2.0)"
**After** (if overlay ≥ 2.0): "Purdue +29.5 • Edge 2.6 • Bet to +27.5 • Range: Value now to +27.5; flips to OSU at +31.5"

### LSU @ Alabama
**Before**: "Spread pick hidden — inputs failed validation" (blocked by OU)
**After**: "Alabama -10.5 • Edge 2.3 • Bet to -9.5 • Range: Value now to -9.5; flips to LSU at -11.5"
- **Key**: ATS shows even if OU has issues

### Any Game with NaN Total
**Before**: "No model total this week — Computation failed: NaN/inf"
**After**: "No model total this week — {specific reason: e.g., 'Pace calculation failed: homePace=NaN'}"

---

## 📊 API Response Structure (Now Available)

```json
{
  "validation": {
    "ats_inputs_ok": true,
    "ou_inputs_ok": false,
    "ats_reason": null,
    "ou_reason": "Model returned 1.3, not in points (likely rate/ratio)"
  },
  "picks": {
    "spread": {
      "bettablePick": {
        "teamId": "...",
        "teamName": "Alabama",
        "line": -10.5,
        "label": "Alabama -10.5",
        "betTo": -9.5,
        "flip": -11.5,
        "reasoning": "..."
      },
      "edgePts": 2.3,
      "grade": "C"
    },
    "total": {
      "totalPick": null,
      "flip": null,
      "unitsReason": "Model returned 1.3..."
    }
  }
}
```

---

## 🚀 Next Steps

1. **Test API Changes** (deployed now):
   - Check Vercel logs for 🔍 Independent Validation logs
   - Verify `ats_inputs_ok` / `ou_inputs_ok` in browser console
   - Confirm flip points are calculated

2. **UI Updates** (quick pass):
   - Update ATS card conditional (`ats_inputs_ok` vs `grade`)
   - Display flip points when available
   - Show better "no edge" vs "invalid inputs" messages
   - Same for OU card

3. **Test Canary Games**:
   - OSU @ Purdue: Verify ATS shows (not blocked)
   - LSU @ Alabama: Verify ATS shows even if OU fails
   - Any game with invalid total: Check specific reason

---

## 📝 Commits

- `1f5ec92`: feat(critical): Decouple ATS/OU validation + add flip-point range logic
- `a3eaa66`: fix(critical): Kill hardcoded 45.0 total fallback
- `ff9ee7e`: docs: Add Phase 1 completion summary

**Total Changes**: 225 insertions, 6 deletions

