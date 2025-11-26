/**
 * Bet Tier Helpers
 * 
 * Shared utilities for calculating edge and filtering bets by confidence tier.
 * These match the exact logic used in Week Review.
 * 
 * Tier Definitions (based on absolute edge):
 * - Tier A: Edge ≥ 4.0
 * - Tier B: Edge ≥ 3.0 and < 4.0
 * - Tier C: Edge < 3.0
 */

export interface BetWithEdge {
  modelPrice: number;
  closePrice: number | null;
  marketType: string;
}

/**
 * Calculate edge for a bet (modelPrice - closePrice)
 * Returns null if edge cannot be calculated (e.g., moneyline or missing closePrice)
 */
export function calculateEdge(bet: BetWithEdge): number | null {
  if (!bet.closePrice || bet.marketType === 'moneyline') {
    return null;
  }
  const modelLine = Number(bet.modelPrice);
  const closeLine = Number(bet.closePrice);
  return modelLine - closeLine;
}

/**
 * Get confidence tier for a bet based on absolute edge
 * Returns null if edge cannot be calculated
 */
export function getBetTier(bet: BetWithEdge): 'A' | 'B' | 'C' | null {
  const edge = calculateEdge(bet);
  if (edge === null) return null;
  
  const absEdge = Math.abs(edge);
  
  if (absEdge >= 4.0) return 'A';
  if (absEdge >= 3.0) return 'B';
  return 'C';
}

/**
 * Check if a bet matches the specified confidence tier filter
 * @param bet - Bet to check
 * @param tierFilter - 'all' to include all bets, or 'A' | 'B' | 'C' for specific tier
 * @returns true if bet matches the filter, false otherwise
 */
export function matchesTierFilter(bet: BetWithEdge, tierFilter: 'all' | 'A' | 'B' | 'C'): boolean {
  if (tierFilter === 'all') return true;
  
  const tier = getBetTier(bet);
  if (tier === null) return false; // Exclude bets without edge (e.g., moneyline)
  
  return tier === tierFilter;
}

