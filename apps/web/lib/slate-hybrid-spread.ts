/**
 * Hybrid V2 spread helpers for slate API (read-only runtime picks).
 * Mirrors sync-hybrid-bets.ts math without modifying sync scripts.
 */

import { calculateHybridSpread } from '@/lib/core-v2-spread';

export interface TeamUnitGradesRow {
  offRunGrade: number;
  defRunGrade: number;
  offPassGrade: number;
  defPassGrade: number;
  offExplosiveness: number;
  defExplosiveness: number;
}

export interface HybridSpreadInputs {
  homeRating: number;
  awayRating: number;
  homeGrades: TeamUnitGradesRow;
  awayGrades: TeamUnitGradesRow;
}

export type HybridConflictType = 'hybrid_strong' | 'hybrid_weak' | 'hybrid_only';

export function tryComputeHybridSpreadHma(
  inputs: HybridSpreadInputs | null,
  neutralSite: boolean,
  homeTeamId: string,
  awayTeamId: string
): number | null {
  if (!inputs) {
    return null;
  }

  const result = calculateHybridSpread(
    inputs.homeRating,
    inputs.awayRating,
    inputs.homeGrades,
    inputs.awayGrades,
    neutralSite,
    homeTeamId,
    awayTeamId,
    null
  );

  const spreadHma = result.hybridSpreadHma;
  return Number.isFinite(spreadHma) ? spreadHma : null;
}

export function deriveHybridConflictType(
  hybridSide: 'home' | 'away' | null,
  v4Side: 'home' | 'away' | null | undefined
): HybridConflictType | null {
  if (!hybridSide) {
    return null;
  }
  if (!v4Side) {
    return 'hybrid_only';
  }
  return hybridSide !== v4Side ? 'hybrid_strong' : 'hybrid_weak';
}

export function deriveHybridSpreadSide(edgeHma: number): 'home' | 'away' | null {
  if (!Number.isFinite(edgeHma) || edgeHma === 0) {
    return null;
  }
  return edgeHma > 0 ? 'home' : 'away';
}

export function deriveHybridTierFields(
  spreadEdgePts: number | null,
  hybridConflictType: HybridConflictType | null,
  closePrice: number | null
): {
  tierBucket: string;
  isSuperTierA: boolean;
  isDog: boolean | null;
} {
  let tierBucket = 'none';
  let isSuperTierA = false;

  if (spreadEdgePts !== null && Number.isFinite(spreadEdgePts)) {
    const absEdge = Math.abs(spreadEdgePts);
    if (hybridConflictType === 'hybrid_strong') {
      if (absEdge >= 4.0) {
        tierBucket = 'super_tier_a';
        isSuperTierA = true;
      } else if (absEdge >= 3.0) {
        tierBucket = 'tier_a';
      } else if (absEdge >= 2.0) {
        tierBucket = 'tier_b';
      }
    } else if (absEdge >= 4.0) {
      tierBucket = 'tier_a';
    } else if (absEdge >= 3.0) {
      tierBucket = 'tier_a';
    } else if (absEdge >= 2.0) {
      tierBucket = 'tier_b';
    }
  }

  let isDog: boolean | null = null;
  if (closePrice !== null && Number.isFinite(closePrice)) {
    isDog = closePrice >= 0;
  }

  return { tierBucket, isSuperTierA, isDog };
}
