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
  portalAggressor: boolean | null;
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
 * Identifies teams with extreme turnover at key positions (QB, OL, DL).
 * Higher values indicate more turnover at critical positions.
 * 
 * @param teamSeason TeamSeasonStat with roster_churn data in rawJson
 * @returns Positional shock index (0-100 scale, or null if data unavailable)
 */
export function computePositionalShock(teamSeason: TeamSeasonStat): number | null {
  // TODO: implement using position-group churn from rawJson.roster_churn
  // Logic:
  // - Analyze returning production by position group
  // - Weight QB, OL, DL more heavily (these positions have outsized impact)
  // - Calculate weighted average of turnover at critical positions
  return null;
}

/**
 * Compute Mercenary Index
 * 
 * Measures reliance on short-term transfers (1-year transfers, short-eligibility players).
 * Higher values indicate teams heavily reliant on mercenary-style transfers.
 * 
 * @param teamSeason TeamSeasonStat with roster_churn data in rawJson
 * @returns Mercenary index (0-100 scale, or null if data unavailable)
 */
export function computeMercenaryIndex(teamSeason: TeamSeasonStat): number | null {
  // TODO: implement using 1-year transfers / short-eligibility players from rawJson.roster_churn
  // Logic:
  // - Count transfers with 1 year of eligibility remaining
  // - Count transfers with short eligibility windows (2 years or less)
  // - Calculate as percentage of total roster or transfer count
  return null;
}

/**
 * Compute Portal Aggressor Flag
 * 
 * Identifies teams that aggressively use the transfer portal (net talent gain).
 * True indicates a team that is a net gainer of talent via transfers.
 * 
 * @param teamSeason TeamSeasonStat with roster_churn data in rawJson
 * @returns true if portal aggressor, false if not, null if data unavailable
 */
export function computePortalAggressor(teamSeason: TeamSeasonStat): boolean | null {
  // TODO: implement using net talent gain from transfers
  // Logic:
  // - Check transferPortal.netCount (positive = net gain)
  // - Optionally factor in talent ratings if available (weighted net gain)
  // - Return true if netCount > threshold (e.g., +3 or more)
  return null;
}

