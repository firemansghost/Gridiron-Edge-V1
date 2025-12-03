/**
 * Portal & NIL Meta Indices (V5 - Planned)
 * 
 * These indices are computed from roster_churn data and will be used as Labs overlays first,
 * then potentially integrated into V5 Hybrid model logic.
 * 
 * Status: Stubs only - not yet implemented or used in production.
 * 
 * See docs/data-inventory.md for detailed descriptions of each index.
 */

import { TeamSeasonStat } from '@prisma/client';

/**
 * Portal & NIL indices interface
 */
export interface PortalIndices {
  continuityScore: number | null;
  positionalShock: number | null;
  mercenaryIndex: number | null;
  portalAggressor: number | null; // Changed from boolean to number (0-1 scale)
}

/**
 * Compute Continuity Score v1
 * 
 * Measures roster stability based on returning production and transfer portal activity.
 * Higher scores indicate more stable rosters (more returning production, fewer transfers).
 * 
 * Formula (adapted from suggested approach):
 * - off_returning ∈ [0,1]: returning offensive production share (from returningProduction.offense / 100)
 * - def_returning ∈ [0,1]: returning defensive production share (from returningProduction.defense / 100)
 * - off_transfers_in ∈ [0,1]: estimated share of production from incoming transfers (normalized from inCount)
 * - def_transfers_in ∈ [0,1]: same for defense (using same estimate since we don't have position-specific data)
 * 
 * - off_effective = off_returning + 0.75 * off_transfers_in
 * - def_effective = def_returning + 0.75 * def_transfers_in
 * - continuity = 0.5 * off_effective + 0.5 * def_effective
 * 
 * Note: Since we don't have position-specific transfer data, we estimate transfer impact
 * by normalizing transfer counts to a [0, 0.3] scale (max 30% new production from transfers).
 * 
 * @param teamSeason TeamSeasonStat with roster_churn data in rawJson
 * @returns Continuity score (0-1 scale, or null if data unavailable)
 */
export function computeContinuityScore(teamSeason: TeamSeasonStat): number | null {
  const rawJson = teamSeason.rawJson as any;
  if (!rawJson || !rawJson.roster_churn) {
    return null;
  }

  const rosterChurn = rawJson.roster_churn;
  const returningProd = rosterChurn.returningProduction;
  const transferPortal = rosterChurn.transferPortal;

  // Need at least returning production data
  if (!returningProd) {
    return null;
  }

  // Get offense and defense returning production
  // Note: CFBD returns these as decimals [0, 1], not percentages [0, 100]
  // Use offense/defense if available, otherwise fall back to overall
  const offReturning = returningProd.offense ?? returningProd.overall ?? null;
  const defReturning = returningProd.defense ?? null;

  // If we don't have at least overall returning production, can't calculate
  if (offReturning === null && defReturning === null) {
    return null;
  }

  // Normalize returning production to [0, 1]
  // CFBD already returns decimals, but handle both formats (0-1 or 0-100)
  const normalizeValue = (val: number | null): number => {
    if (val === null) return 0;
    // If value > 1, assume it's a percentage and divide by 100
    // Otherwise, assume it's already a decimal
    return val > 1 ? Math.max(0, Math.min(1, val / 100)) : Math.max(0, Math.min(1, val));
  };
  
  const offReturningNorm = normalizeValue(offReturning);
  const defReturningNorm = normalizeValue(defReturning);

  // If we only have overall, use it for both sides
  const finalOffReturning = offReturningNorm > 0 ? offReturningNorm : (defReturningNorm > 0 ? defReturningNorm : 0);
  const finalDefReturning = defReturningNorm > 0 ? defReturningNorm : (offReturningNorm > 0 ? offReturningNorm : 0);

  // Estimate transfer impact
  // Since we don't have position-specific transfer data, we normalize transfer counts
  // Assume max reasonable transfers = 20, which represents ~30% of roster production
  const maxTransfers = 20;
  const transferIn = transferPortal?.inCount ?? 0;
  
  // Normalize transfer count to [0, 0.3] (max 30% new production from transfers)
  const transferInNorm = Math.min(0.3, (transferIn / maxTransfers) * 0.3);
  
  // Apply same transfer impact to both offense and defense (since we don't have position data)
  const offTransfersInNorm = transferInNorm;
  const defTransfersInNorm = transferInNorm;

  // Calculate effective continuity using suggested formula:
  // effective = returning + 0.75 * transfers_in
  const offEffective = Math.max(0, Math.min(1, finalOffReturning + 0.75 * offTransfersInNorm));
  const defEffective = Math.max(0, Math.min(1, finalDefReturning + 0.75 * defTransfersInNorm));

  // Combine offense and defense equally (50/50)
  const continuity = 0.5 * offEffective + 0.5 * defEffective;

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, continuity));
}

/**
 * Compute Positional Shock Index
 * 
 * Quantifies how much key position groups have been rebuilt.
 * Higher values indicate more turnover at critical positions (QB, OL, LB, DB).
 * 
 * Uses available returning production data:
 * - Passing (QB) - weighted heavily
 * - Rushing (RB + OL impact) - weighted heavily
 * - Receiving (WR/TE) - moderate weight
 * - Defense (DL/LB/DB) - weighted heavily
 * 
 * @param teamSeason TeamSeasonStat with roster_churn data in rawJson
 * @returns Positional shock index (0-1 scale, or null if data unavailable)
 */
export function computePositionalShock(teamSeason: TeamSeasonStat): number | null {
  const rawJson = teamSeason.rawJson as any;
  if (!rawJson || !rawJson.roster_churn) {
    return null;
  }

  const rosterChurn = rawJson.roster_churn;
  const returningProd = rosterChurn.returningProduction;

  if (!returningProd) {
    return null;
  }

  // Extract position-specific returning production
  // These are already in [0, 1] decimal format from CFBD
  const passingReturning = returningProd.passing ?? null;
  const rushingReturning = returningProd.rushing ?? null;
  const receivingReturning = returningProd.receiving ?? null;
  const defenseReturning = returningProd.defense ?? null;

  // Need at least one position group to calculate
  if (passingReturning === null && rushingReturning === null && 
      receivingReturning === null && defenseReturning === null) {
    return null;
  }

  // Calculate turnover (1 - returning production) for each position
  // Higher turnover = higher shock
  const passingTurnover = passingReturning !== null ? 1 - passingReturning : null;
  const rushingTurnover = rushingReturning !== null ? 1 - rushingReturning : null;
  const receivingTurnover = receivingReturning !== null ? 1 - receivingReturning : null;
  const defenseTurnover = defenseReturning !== null ? 1 - defenseReturning : null;

  // Weight critical positions more heavily:
  // - QB (passing): 30% weight
  // - OL/RB (rushing): 25% weight (OL impact)
  // - Defense: 30% weight (DL/LB/DB)
  // - Receiving: 15% weight (WR/TE)
  let weightedTurnover = 0;
  let totalWeight = 0;

  if (passingTurnover !== null) {
    weightedTurnover += passingTurnover * 0.30;
    totalWeight += 0.30;
  }

  if (rushingTurnover !== null) {
    weightedTurnover += rushingTurnover * 0.25;
    totalWeight += 0.25;
  }

  if (defenseTurnover !== null) {
    weightedTurnover += defenseTurnover * 0.30;
    totalWeight += 0.30;
  }

  if (receivingTurnover !== null) {
    weightedTurnover += receivingTurnover * 0.15;
    totalWeight += 0.15;
  }

  // If we have no weights, can't calculate
  if (totalWeight === 0) {
    return null;
  }

  // Normalize by total weight to get average weighted turnover
  const positionalShock = weightedTurnover / totalWeight;

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, positionalShock));
}

/**
 * Compute Mercenary Index
 * 
 * Measures "mercenary / 1-year rental" burden - how much the roster relies on
 * short-term portal transfers rather than developed players.
 * 
 * Uses transfer portal inCount as a proxy for mercenary behavior:
 * - High transfer inCount relative to typical roster suggests heavy reliance on portal
 * - Normalized to [0, 1] where 0 = minimal portal reliance, 1 = heavy mercenary profile
 * 
 * Note: Without 1-year eligibility data, we use total transfer inCount as a proxy.
 * Teams with very high transfer counts are likely relying on short-term rentals.
 * 
 * @param teamSeason TeamSeasonStat with roster_churn data in rawJson
 * @returns Mercenary index (0-1 scale, or null if data unavailable)
 */
export function computeMercenaryIndex(teamSeason: TeamSeasonStat): number | null {
  const rawJson = teamSeason.rawJson as any;
  if (!rawJson || !rawJson.roster_churn) {
    return null;
  }

  const rosterChurn = rawJson.roster_churn;
  const transferPortal = rosterChurn.transferPortal;

  if (!transferPortal || transferPortal.inCount === undefined) {
    return null;
  }

  const transferIn = transferPortal.inCount;

  // Normalize transfer count to [0, 1] scale
  // Typical FBS roster: ~85 scholarship players
  // High mercenary teams: 15+ transfers in (representing ~18% of roster)
  // Extreme mercenary teams: 20+ transfers in (representing ~24% of roster)
  // 
  // We'll use a sigmoid-like normalization:
  // - 0 transfers = 0.0 (no mercenary profile)
  // - 10 transfers = ~0.5 (moderate mercenary)
  // - 20+ transfers = ~1.0 (heavy mercenary)
  
  const maxTransfers = 20; // Threshold for "heavy mercenary"
  const mercenaryIndex = Math.min(1.0, transferIn / maxTransfers);

  return Math.max(0, Math.min(1, mercenaryIndex));
}

/**
 * Compute Portal Aggressor Index
 * 
 * Measures how aggressively the team uses the portal to ADD talent.
 * Higher values indicate teams that are net talent gainers via transfers.
 * 
 * Uses net transfer count (inCount - outCount) as the primary metric:
 * - Positive netCount = aggressive portal user (net gainer)
 * - Negative netCount = portal loser (net loser)
 * 
 * Normalized to [0, 1] where:
 * - 0.0 = net portal loser / passive (negative netCount)
 * - 1.0 = heavy net talent gainer / active portal aggressor (high positive netCount)
 * 
 * @param teamSeason TeamSeasonStat with roster_churn data in rawJson
 * @returns Portal aggressor index (0-1 scale, or null if data unavailable)
 */
export function computePortalAggressor(teamSeason: TeamSeasonStat): number | null {
  const rawJson = teamSeason.rawJson as any;
  if (!rawJson || !rawJson.roster_churn) {
    return null;
  }

  const rosterChurn = rawJson.roster_churn;
  const transferPortal = rosterChurn.transferPortal;

  if (!transferPortal || transferPortal.netCount === undefined) {
    return null;
  }

  const netCount = transferPortal.netCount;

  // Normalize netCount to [0, 1] scale
  // - Negative netCount (portal loser) → 0.0
  // - Zero netCount → 0.5 (neutral)
  // - Positive netCount (portal gainer) → 0.5 to 1.0
  //
  // Thresholds:
  // - netCount <= -5: 0.0 (heavy portal loser)
  // - netCount = 0: 0.5 (neutral)
  // - netCount >= +10: 1.0 (heavy portal aggressor)
  
  if (netCount <= -5) {
    return 0.0;
  }
  
  if (netCount >= 10) {
    return 1.0;
  }

  // Linear interpolation between -5 and +10
  // At -5: 0.0
  // At 0: 0.5
  // At +10: 1.0
  const normalized = (netCount + 5) / 15; // Scale from [-5, 10] to [0, 1]
  
  return Math.max(0, Math.min(1, normalized));
}

