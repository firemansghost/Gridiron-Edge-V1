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
 * Compute Continuity Score
 * 
 * Measures roster stability based on returning production and transfer portal activity.
 * Higher scores indicate more stable rosters (more returning production, fewer transfers).
 * 
 * @param teamSeason TeamSeasonStat with roster_churn data in rawJson
 * @returns Continuity score (0-100 scale, or null if data unavailable)
 */
export function computeContinuityScore(teamSeason: TeamSeasonStat): number | null {
  // TODO: implement using returning production and transfers from rawJson.roster_churn
  // Logic:
  // - Base score from returning production percentage (weighted by position importance)
  // - Penalty for high transfer portal activity (net transfers out)
  // - Bonus for low transfer portal activity
  return null;
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

