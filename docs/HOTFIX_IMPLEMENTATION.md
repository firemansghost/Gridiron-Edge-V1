# Hotfix Implementation Plan: Trust-Market Mode

## Overview

Implement overlay logic that uses market as baseline and only applies small model adjustments (±3.0 pts cap).

---

## Changes Required in `apps/web/app/api/game/[gameId]/route.ts`

### 1. Add Constants (top of file)
```typescript
// Trust-Market Mode Configuration
const MODEL_MODE = 'trust_market'; // Feature flag
const LAMBDA_SPREAD = 0.25; // 25% weight to model for spreads
const LAMBDA_TOTAL = 0.35; // 35% weight for totals
const OVERLAY_CAP_SPREAD = 3.0; // ±3.0 pts max for spread overlay
const OVERLAY_CAP_TOTAL = 3.0; // ±3.0 pts max for total overlay
const OVERLAY_EDGE_FLOOR = 2.0; // Only show pick if overlay ≥ 2.0 pts
const LARGE_DISAGREEMENT_THRESHOLD = 10.0; // Drop confidence grade if raw disagreement > 10 pts
```

### 2. Add Helper Functions (after constants)
```typescript
/**
 * Clamp overlay to prevent catastrophic picks
 */
function clampOverlay(value: number, cap: number): number {
  return Math.max(-cap, Math.min(cap, value));
}

/**
 * Degrade confidence grade if large raw disagreement
 */
function degradeGrade(grade: 'A' | 'B' | 'C' | null, shouldDegrade: boolean): 'A' | 'B' | 'C' | null {
  if (!grade || !shouldDegrade) return grade;
  
  if (grade === 'A') return 'B';
  if (grade === 'B') return 'C';
  return null; // C degrades to no grade
}
```

### 3. Calculate Spread Overlay (after `finalImpliedSpread` is set, ~line 520)

```typescript
// === TRUST-MARKET MODE: Spread Overlay ===
const modelSpreadRaw = finalImpliedSpread; // Model's raw prediction
const rawSpreadDisagreement = Math.abs(modelSpreadRaw - marketSpread);

// Calculate overlay: clamp(λ × (model - market), -cap, +cap)
const spreadOverlay = clampOverlay(
  LAMBDA_SPREAD * (modelSpreadRaw - marketSpread),
  OVERLAY_CAP_SPREAD
);

// Final spread = market baseline + overlay
const finalSpreadWithOverlay = marketSpread + spreadOverlay;

// Check if we should degrade confidence
const shouldDegradeSpreadConfidence = rawSpreadDisagreement > LARGE_DISAGREEMENT_THRESHOLD;

console.log(`[Game ${gameId}] 🎯 Trust-Market Spread Overlay:`, {
  modelSpreadRaw: modelSpreadRaw.toFixed(2),
  marketSpread: marketSpread.toFixed(2),
  rawDisagreement: rawSpreadDisagreement.toFixed(2),
  overlay: spreadOverlay.toFixed(2),
  finalSpread: finalSpreadWithOverlay.toFixed(2),
  shouldDegradeConfidence: shouldDegradeSpreadConfidence
});
```

### 4. Update ATS Edge Calculation (find where `atsEdge` is calculated)

BEFORE:
```typescript
const atsEdge = modelSpreadFC.favoriteSpread - marketSpreadFC.favoriteSpread;
```

AFTER:
```typescript
// In Trust-Market mode, edge is the overlay (not model - market)
const atsEdge = spreadOverlay; // The overlay IS the edge
const atsEdgeAbs = Math.abs(atsEdge);
```

### 5. Update Spread Pick Logic (find where `spreadPick` is computed)

BEFORE:
```typescript
const spreadPick = computeSpreadPick(...);
```

AFTER:
```typescript
// Only show pick if |overlay| ≥ edge floor
const hasSpreadEdge = atsEdgeAbs >= OVERLAY_EDGE_FLOOR;

if (!hasSpreadEdge) {
  // No pick - overlay too small
  spreadPick = null;
  spreadGrade = null;
  bettablePick = {
    teamId: null,
    teamName: null,
    line: null,
    label: null,
    reasoning: 'No edge at current number (overlay < 2.0 pts in Trust-Market mode)',
    betTo: null,
    favoritesDisagree: false
  };
} else {
  // Compute pick using finalSpreadWithOverlay
  const spreadPickResult = computeBettableSpreadPick(
    finalSpreadWithOverlay, // Use overlay-adjusted spread
    marketSpread,
    game.homeTeam.name,
    game.awayTeam.name,
    game.homeTeamId,
    game.awayTeamId,
    favoriteByRule.teamId,
    favoriteByRule.teamName
  );
  
  // Degrade confidence if large disagreement
  const originalGrade = computeSpreadGrade(atsEdgeAbs); // Compute grade from edge
  spreadGrade = degradeGrade(originalGrade, shouldDegradeSpreadConfidence);
  
  spreadPick = spreadPickResult.spreadPickLabel;
  bettablePick = spreadPickResult;
}
```

### 6. Calculate Total Overlay (similar to spread, after `finalImpliedTotal`)

```typescript
// === TRUST-MARKET MODE: Total Overlay ===
if (marketTotal !== null && isModelTotalValid) {
  const modelTotalRaw = finalImpliedTotal;
  const rawTotalDisagreement = Math.abs(modelTotalRaw - marketTotal);
  
  // Calculate overlay
  const totalOverlay = clampOverlay(
    LAMBDA_TOTAL * (modelTotalRaw - marketTotal),
    OVERLAY_CAP_TOTAL
  );
  
  // Final total = market baseline + overlay
  const finalTotalWithOverlay = marketTotal + totalOverlay;
  
  // Check if we should degrade confidence
  const shouldDegradeTotalConfidence = rawTotalDisagreement > LARGE_DISAGREEMENT_THRESHOLD;
  
  console.log(`[Game ${gameId}] 🎯 Trust-Market Total Overlay:`, {
    modelTotalRaw: modelTotalRaw.toFixed(2),
    marketTotal: marketTotal.toFixed(2),
    rawDisagreement: rawTotalDisagreement.toFixed(2),
    overlay: totalOverlay.toFixed(2),
    finalTotal: finalTotalWithOverlay.toFixed(2),
    shouldDegradeConfidence: shouldDegradeTotalConfidence
  });
  
  // Update total edge and pick logic...
  // (Similar to spread above)
}
```

### 7. Update Moneyline (derive from finalSpreadWithOverlay)

```typescript
// Calculate model win probability from OVERLAY-ADJUSTED spread
const stdDev = 14;
const modelHomeWinProb = Math.max(0.05, Math.min(0.95, 
  0.5 + (finalSpreadWithOverlay / (2 * stdDev)) * 0.5 // Use finalSpreadWithOverlay, not raw
));
```

### 8. Add to Response Object (in `picks` section)

```typescript
picks: {
  spread: {
    ...spreadPick,
    // Add overlay diagnostics
    overlay: {
      modelRaw: modelSpreadRaw,
      market: marketSpread,
      overlayValue: spreadOverlay,
      final: finalSpreadWithOverlay,
      rawDisagreement: rawSpreadDisagreement,
      confidenceDegraded: shouldDegradeSpreadConfidence
    },
    // ... rest of spread pick
  },
  // Similar for total and moneyline
},

// Add model mode to diagnostics
modelConfig: {
  version: 'v0.0.1',
  mode: MODEL_MODE, // 'trust_market'
  overlayConfig: {
    lambdaSpread: LAMBDA_SPREAD,
    lambdaTotal: LAMBDA_TOTAL,
    capSpread: OVERLAY_CAP_SPREAD,
    capTotal: OVERLAY_CAP_TOTAL,
    edgeFloor: OVERLAY_EDGE_FLOOR
  }
}
```

---

## UI Updates Required (in `apps/web/app/game/[gameId]/page.tsx`)

### 1. Add Mode Badge (in header)

```tsx
{game.modelConfig?.mode === 'trust_market' && (
  <div className="bg-blue-100 border border-blue-300 rounded px-3 py-1 text-xs font-semibold text-blue-800">
    Mode: Trust-Market — model overlays the book number (cap ±3.0)
  </div>
)}
```

### 2. Add Overlay Note to ATS Card

```tsx
{game.picks?.spread?.overlay && (
  <div className="text-xs text-gray-600 mt-2 border-t border-gray-200 pt-2">
    Model overlay: {game.picks.spread.overlay.overlayValue >= 0 ? '+' : ''}
    {game.picks.spread.overlay.overlayValue.toFixed(1)} pts (cap ±{OVERLAY_CAP_SPREAD})
    {game.picks.spread.overlay.confidenceDegraded && (
      <div className="mt-1 text-yellow-700 bg-yellow-50 p-1 rounded">
        ⚠️ Large raw disagreement — overlay capped in Trust-Market mode
      </div>
    )}
  </div>
)}
```

### 3. Similar Updates for Total and ML Cards

---

## Testing Checklist

- [ ] OSU @ Purdue: No crazy picks (should show no pick or small overlay)
- [ ] LSU @ Alabama: Alabama favored everywhere
- [ ] All overlays capped at ±3.0 pts
- [ ] Confidence degraded when raw disagreement > 10 pts
- [ ] Mode badge displays correctly
- [ ] Overlay notes show with correct copy
- [ ] Moneyline derived from overlay-adjusted spread
- [ ] No blank cards

---

## Acceptance Criteria

1. ✅ Model mode = 'trust_market' in API response
2. ✅ Spreads: baseline = market, overlay = clamp(0.25 × diff, ±3.0)
3. ✅ Totals: baseline = market, overlay = clamp(0.35 × diff, ±3.0)
4. ✅ Picks only show if |overlay| ≥ 2.0 pts
5. ✅ Confidence drops one tier if raw disagreement > 10 pts
6. ✅ UI displays overlay value and cap note
7. ✅ Banner shows for large disagreements
8. ✅ OSU @ Purdue shows no catastrophic pick

---

## Files to Modify

1. `apps/web/app/api/game/[gameId]/route.ts` (main logic)
2. `apps/web/app/game/[gameId]/page.tsx` (UI display)
3. OPTIONAL: `apps/web/lib/pick-helpers.ts` (if helper functions need updating)

---

## Estimated Implementation Time

- API changes: ~2-3 hours
- UI changes: ~1 hour
- Testing: ~1 hour
- **Total: 4-5 hours**

Ready to ship same day!

