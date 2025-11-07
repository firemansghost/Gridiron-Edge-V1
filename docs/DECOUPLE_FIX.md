# Decoupling & Range Logic Fix

## Problems Identified

1. **Coupled Gates**: ATS suppressed when OU has issues (and vice versa)
2. **Missing Range Logic**: No "bet-to" or "flip point" guidance
3. **Poor NaN/inf Diagnostics**: Generic "NaN/inf" messages without details
4. **Misleading UI Messages**: "inputs failed validation" when it's just "no edge"

## Solution: Independent Validation + Range Math

### 1. Independent Validation Flags

**API Changes:**
```typescript
// Separate flags for ATS and OU
const ats_inputs_ok = finalImpliedSpread !== null && 
                      !isNaN(finalImpliedSpread) && 
                      isFinite(finalImpliedSpread);

const ou_inputs_ok = finalImpliedTotal !== null && 
                     !isNaN(finalImpliedTotal) && 
                     isFinite(finalImpliedTotal) &&
                     finalImpliedTotal >= 15 && 
                     finalImpliedTotal <= 120;

// Add to diagnostics
diagnostics: {
  ats_inputs_ok,
  ou_inputs_ok,
  ats_reason: !ats_inputs_ok ? 'Model spread unavailable/invalid' : null,
  ou_reason: !ou_inputs_ok ? getOUFailureReason() : null
}
```

### 2. Range Logic (Bet-To + Flip Point)

**For Spread (ATS):**
```typescript
// Given: market M (favorite-centric, negative), overlay Δ, edge_floor=2.0

if (|overlay| >= 2.0) {
  // Pick side
  const pick_side = overlay >= 0 ? 'dog' : 'favorite';
  const pick_line = overlay >= 0 ? +|M| : M;
  
  // Bet-to (stop line): where edge = floor
  const bet_to = M + sign(overlay) × 2.0;
  
  // Flip point: where other side becomes a bet
  const flip = M - sign(overlay) × 2.0;
  
  // Display
  "Pick: {team} {pick_line} • Edge: {|overlay|} pts • Bet to: {bet_to}"
  "Range: Value now to {bet_to}; flips to {other_team} at {flip}"
} else {
  "No edge at current number — market {M} (overlay {overlay} < 2.0)"
}
```

**For Total (OU):**
```typescript
// Given: market T_mkt, overlay Δ, edge_floor=2.0

if (|overlay| >= 2.0) {
  // Pick direction
  const direction = overlay >= 0 ? 'Over' : 'Under';
  
  // Bet-to
  const bet_to = T_mkt + sign(overlay) × 2.0;
  
  // Flip
  const flip = T_mkt - sign(overlay) × 2.0;
  
  // Display
  "Pick: {direction} {T_mkt} • Edge: {|overlay|} pts • Bet to: {bet_to}"
  "Range: Value now to {bet_to}; flips to {opposite} at {flip}"
} else {
  "No edge at current number — market {T_mkt} (overlay {overlay} < 2.0)"
}
```

### 3. Better NaN/inf Diagnostics

**Add step tracking:**
```typescript
const totalCalcSteps = {
  pace: { home: homePace, away: awayPace, avg: avgPace },
  epa: { home: homeEpa, away: awayEpa, sum: epaSum },
  ypp: { home: homeYpp, away: awayYpp, weighted: yppWeighted },
  final: finalTotal
};

// Check each step
if (isNaN(homePace) || homePace === 0) {
  ou_reason = `Pace calculation failed: homePace=${homePace}`;
} else if (isNaN(homeEpa)) {
  ou_reason = `EPA calculation failed: homeEpa=${homeEpa}`;
} else if (isNaN(finalTotal) || !isFinite(finalTotal)) {
  ou_reason = `Final total invalid: ${finalTotal}`;
} else if (finalTotal < 15 || finalTotal > 120) {
  ou_reason = `Model returned ${finalTotal.toFixed(1)}, not in points (likely rate/ratio)`;
}
```

### 4. UI Updates

**ATS Card (pick state):**
```tsx
<div>Pick: {team} {line}</div>
<div>Edge: {edge.toFixed(1)} pts • Bet to: {betTo}</div>
<div>Range: Value now to {betTo}; flips to {otherTeam} at {flip}</div>
<div className="text-xs">Model overlay: {overlay >= 0 ? '+' : ''}{overlay.toFixed(1)} pts (cap ±3.0)</div>
```

**ATS Card (no edge):**
```tsx
<div>No edge at current number — market {market}</div>
<div className="text-xs">Model overlay {overlay.toFixed(1)} pts (< 2.0 threshold)</div>
```

**ATS Card (invalid inputs):**
```tsx
<div>No ATS pick this week</div>
<div className="text-xs">{diagnostics.ats_reason}</div>
```

**OU Card (similar structure)**

### 5. Acceptance Criteria

**OSU @ Purdue:**
- ATS shows pick (even if OU has issues)
- If edge < 2.0: "No edge at current number" (not "inputs failed")
- If edge >= 2.0: Shows pick + bet-to + flip

**LSU @ Alabama:**
- ATS shows "Alabama -10.5 • Edge X.X • Bet to -9.5 • Flip to LSU at -11.5"
- OU shows pick (independent of ATS)
- If OU has NaN: Shows specific reason (not generic "NaN/inf")

## Implementation Order

1. ✅ Add independent validation flags (ats_inputs_ok, ou_inputs_ok)
2. ✅ Calculate flip points for ATS and OU
3. ✅ Add detailed NaN/inf step tracking
4. ✅ Update API response with flip + range data
5. ✅ Update UI to show range logic
6. ✅ Test on canary games

