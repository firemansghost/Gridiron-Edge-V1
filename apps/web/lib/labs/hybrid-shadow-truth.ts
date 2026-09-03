/**
 * Phase 4A — Hybrid V2 shadow/research product truth.
 * Read-only presentation + coverage helpers. Does not authorize Hybrid,
 * persist shadow records, or change Core/Hybrid formulas.
 */

import {
  HYBRID_V2_PRODUCTION_HOLD_REASON,
  isHybridV2ProductionAuthorized,
} from '@/lib/config/hybrid-production-activation';
import { computeEffectiveHfa } from '@/lib/core-v1-spread';
import { calculateHybridSpread } from '@/lib/core-v2-spread';

export const HYBRID_SHADOW_STATUS_LABEL = 'HYBRID V2 — SHADOW / HELD';
export const HYBRID_NOT_OFFICIAL_2026_BET = 'NOT AN OFFICIAL 2026 BET';
export const HYBRID_LIVE_MUTABLE_SHADOW = 'LIVE / MUTABLE SHADOW';
export const CORE_V1_EFFECTIVE_PRODUCTION_LABEL = 'Core V1';
export const SUPER_TIER_A_SHADOW_STATUS = 'SHADOW / HELD';
export const V4_FADE_HISTORICAL_STATUS = 'HISTORICAL / BACKTEST — 2024–2025';
export const HYBRID_UNAVAILABLE_UNIT_GRADES =
  'Hybrid unavailable — 2026 unit-grade inputs not present';
export const HYBRID_UNAVAILABLE_RATING =
  'Hybrid unavailable — persisted V1 rating missing';

/** Frozen Super Tier A qualification. Not a live 2026 record. */
export const SUPER_TIER_A_FROZEN_QUALIFICATION = {
  selection: 'actual Hybrid V2 spread selection',
  hybridConflictType: 'hybrid_strong',
  minAbsSpreadEdge: 4.0,
} as const;

export type HybridUnavailableReason = 'missing_rating' | 'missing_unit_grades';

export type HybridShadowCoverageKind =
  | 'no_games'
  | 'games_without_hybrid'
  | 'partial_hybrid'
  | 'full_hybrid';

export interface HybridShadowSpread {
  hma: number;
  favoriteSpread: number;
  favoriteTeamId: string | null;
  favoriteName: string | null;
}

/** Latest Labs-selected MarketLine row. teamId is the signed-row side, not the favorite. */
export interface HybridShadowSelectedMarketLine {
  value: number | null;
  teamId: string | null;
  book: string | null;
  timestamp: string | null;
  source: string | null;
}

export interface HybridShadowMarket extends HybridShadowSelectedMarketLine {
  spreadHma: number | null;
  favoriteTeamId: string | null;
  favoriteName: string | null;
}

export interface HybridShadowUnitGrades {
  offRunGrade: number;
  defRunGrade: number;
  offPassGrade: number;
  defPassGrade: number;
  offExplosiveness: number;
  defExplosiveness: number;
}

export interface HybridShadowGameInput {
  gameId: string;
  date: string;
  status: 'final' | 'scheduled' | 'in_progress';
  awayTeamId: string;
  awayTeamName: string;
  homeTeamId: string;
  homeTeamName: string;
  awayScore: number | null;
  homeScore: number | null;
  neutralSite: boolean;
  homeRating: number | null | undefined;
  awayRating: number | null | undefined;
  homeGrades: HybridShadowUnitGrades | null | undefined;
  awayGrades: HybridShadowUnitGrades | null | undefined;
  market: HybridShadowSelectedMarketLine | null;
}

export interface HybridShadowGame {
  gameId: string;
  date: string;
  status: HybridShadowGameInput['status'];
  awayTeamId: string;
  awayTeamName: string;
  homeTeamId: string;
  homeTeamName: string;
  awayScore: number | null;
  homeScore: number | null;
  neutralSite: boolean;
  hybridAvailable: boolean;
  unavailableReasons: HybridUnavailableReason[];
  unavailableLabel: string | null;
  missingRatingTeamIds: string[];
  missingUnitGradeTeamIds: string[];
  v1Spread: HybridShadowSpread | null;
  v2Spread: HybridShadowSpread | null;
  hybridSpread: HybridShadowSpread | null;
  diff: number | null;
  marketSpread: HybridShadowMarket | null;
  favoritesDisagree: boolean | null;
}

export interface HybridShadowCoverage {
  totalGames: number;
  computedGames: number;
  unavailableGames: number;
  coverageKind: HybridShadowCoverageKind;
  missingRatingTeamIds: string[];
  missingUnitGradeTeamIds: string[];
}

export interface HybridShadowStatus {
  hybridProductionAuthorized: boolean;
  effectiveProductionModel: 'core_v1' | 'hybrid_v2';
  holdReason: string | null;
  statusLabel: string | null;
  liveMutable: true;
  official: false;
  notOfficialBetLabel: string | null;
}

export function isFiniteRating(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function hybridUnavailableReasons(input: {
  homeRating: number | null | undefined;
  awayRating: number | null | undefined;
  homeGrades: unknown;
  awayGrades: unknown;
}): HybridUnavailableReason[] {
  const reasons: HybridUnavailableReason[] = [];
  if (!isFiniteRating(input.homeRating) || !isFiniteRating(input.awayRating)) {
    reasons.push('missing_rating');
  }
  if (input.homeGrades == null || input.awayGrades == null) {
    reasons.push('missing_unit_grades');
  }
  return reasons;
}

export function hybridUnavailableLabel(
  reasons: HybridUnavailableReason[]
): string | null {
  if (reasons.includes('missing_unit_grades')) {
    return HYBRID_UNAVAILABLE_UNIT_GRADES;
  }
  if (reasons.includes('missing_rating')) {
    return HYBRID_UNAVAILABLE_RATING;
  }
  return reasons.length > 0 ? 'Hybrid unavailable' : null;
}

export function classifyHybridShadowCoverage(input: {
  totalGames: number;
  computedGames: number;
}): HybridShadowCoverageKind {
  if (input.totalGames <= 0) return 'no_games';
  if (input.computedGames <= 0) return 'games_without_hybrid';
  if (input.computedGames < input.totalGames) return 'partial_hybrid';
  return 'full_hybrid';
}

export function hybridShadowEmptyMessage(
  kind: HybridShadowCoverageKind,
  totalGames: number
): string {
  switch (kind) {
    case 'no_games':
      return 'No games exist for this season and week.';
    case 'games_without_hybrid':
      return `Hybrid unavailable for all ${totalGames} games — required Hybrid inputs are not present.`;
    case 'partial_hybrid':
      return 'Some Hybrid predictions are available; remaining games are Hybrid unavailable.';
    case 'full_hybrid':
      return 'Hybrid coverage is available for every game in this week.';
  }
}

export function buildHybridShadowStatus(season: number): HybridShadowStatus {
  const authorized = isHybridV2ProductionAuthorized(season);
  return {
    hybridProductionAuthorized: authorized,
    effectiveProductionModel: authorized ? 'hybrid_v2' : 'core_v1',
    holdReason: authorized ? null : HYBRID_V2_PRODUCTION_HOLD_REASON,
    statusLabel: authorized ? null : HYBRID_SHADOW_STATUS_LABEL,
    liveMutable: true,
    official: false,
    notOfficialBetLabel: authorized ? null : HYBRID_NOT_OFFICIAL_2026_BET,
  };
}

export function buildHybridShadowCoverage(
  games: Array<{
    hybridAvailable: boolean;
    missingRatingTeamIds: string[];
    missingUnitGradeTeamIds: string[];
  }>
): HybridShadowCoverage {
  const missingRating = new Set<string>();
  const missingGrades = new Set<string>();
  let computedGames = 0;

  for (const game of games) {
    if (game.hybridAvailable) computedGames += 1;
    for (const id of game.missingRatingTeamIds) missingRating.add(id);
    for (const id of game.missingUnitGradeTeamIds) missingGrades.add(id);
  }

  const totalGames = games.length;
  return {
    totalGames,
    computedGames,
    unavailableGames: totalGames - computedGames,
    coverageKind: classifyHybridShadowCoverage({ totalGames, computedGames }),
    missingRatingTeamIds: Array.from(missingRating).sort(),
    missingUnitGradeTeamIds: Array.from(missingGrades).sort(),
  };
}

function toSpreadInfo(
  hma: number,
  homeTeamId: string,
  awayTeamId: string,
  homeName: string,
  awayName: string
): HybridShadowSpread {
  const homeFavorite = hma > 0;
  return {
    hma,
    favoriteSpread: homeFavorite ? -hma : hma,
    favoriteTeamId: homeFavorite ? homeTeamId : awayTeamId,
    favoriteName: homeFavorite ? homeName : awayName,
  };
}

export { toSpreadInfo };

/**
 * Production Core V1 HMA for already-loaded persisted V1 ratings.
 * Matches getCoreV1SpreadFromTeams when V1 ratings exist:
 * (homeRating - awayRating) + computeEffectiveHfa.
 * Hybrid's internal simple V1 component (legacy +2.5 HFA) is not used here.
 */
export function computeProductionCoreV1HmaFromV1Ratings(input: {
  homeTeamId: string;
  homeRating: number;
  awayRating: number;
  neutralSite: boolean;
}): number {
  const hfaPoints = computeEffectiveHfa(input.homeTeamId, input.neutralSite)
    .effectiveHfa;
  return input.homeRating - input.awayRating + hfaPoints;
}

/**
 * Convert a team-sided MarketLine spread row to canonical HMA
 * (positive = home favored). teamId is the row's side, not the favorite.
 */
export function canonicalMarketSpreadHma(input: {
  lineValue: number;
  teamId: string | null | undefined;
  homeTeamId: string;
  awayTeamId: string;
}): number | null {
  if (!Number.isFinite(input.lineValue)) return null;
  if (input.teamId === input.homeTeamId) return -input.lineValue;
  if (input.teamId === input.awayTeamId) return input.lineValue;
  return null;
}

/**
 * Convert canonical market HMA into the selected team's ATS pick line.
 * Home pick → -HMA. Away pick → +HMA. Do not treat HMA as a pick line.
 */
export function teamSidedPickLine(pickHome: boolean, marketSpreadHma: number): number {
  return pickHome ? -marketSpreadHma : marketSpreadHma;
}

export function canonicalizeLabsMarketSpread(input: {
  line: HybridShadowSelectedMarketLine;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
}): HybridShadowMarket {
  const spreadHma =
    input.line.value != null
      ? canonicalMarketSpreadHma({
          lineValue: input.line.value,
          teamId: input.line.teamId,
          homeTeamId: input.homeTeamId,
          awayTeamId: input.awayTeamId,
        })
      : null;
  const favorite =
    spreadHma == null
      ? { favoriteTeamId: null, favoriteName: null }
      : spreadHma === 0
        ? { favoriteTeamId: null, favoriteName: null }
        : toSpreadInfo(
            spreadHma,
            input.homeTeamId,
            input.awayTeamId,
            input.homeTeamName,
            input.awayTeamName
          );

  return {
    value: input.line.value,
    teamId: input.line.teamId,
    book: input.line.book,
    timestamp: input.line.timestamp,
    source: input.line.source,
    spreadHma,
    favoriteTeamId: favorite.favoriteTeamId,
    favoriteName: favorite.favoriteName,
  };
}

export function buildHybridShadowGame(input: HybridShadowGameInput): HybridShadowGame {
  const reasons = hybridUnavailableReasons(input);
  const hybridAvailable = reasons.length === 0;
  const homeRating = isFiniteRating(input.homeRating) ? input.homeRating : null;
  const awayRating = isFiniteRating(input.awayRating) ? input.awayRating : null;

  let v1Spread: HybridShadowSpread | null = null;
  let v2Spread: HybridShadowSpread | null = null;
  let hybridSpread: HybridShadowSpread | null = null;
  let diff: number | null = null;

  if (homeRating != null && awayRating != null) {
    const coreV1Hma = computeProductionCoreV1HmaFromV1Ratings({
      homeTeamId: input.homeTeamId,
      homeRating,
      awayRating,
      neutralSite: input.neutralSite,
    });
    v1Spread = toSpreadInfo(
      coreV1Hma,
      input.homeTeamId,
      input.awayTeamId,
      input.homeTeamName,
      input.awayTeamName
    );

    if (hybridAvailable && input.homeGrades && input.awayGrades) {
      const hybridResult = calculateHybridSpread(
        homeRating,
        awayRating,
        input.homeGrades,
        input.awayGrades,
        input.neutralSite,
        input.homeTeamId,
        input.awayTeamId
      );
      v2Spread = toSpreadInfo(
        hybridResult.v2SpreadHma,
        input.homeTeamId,
        input.awayTeamId,
        input.homeTeamName,
        input.awayTeamName
      );
      hybridSpread = toSpreadInfo(
        hybridResult.hybridSpreadHma,
        input.homeTeamId,
        input.awayTeamId,
        input.homeTeamName,
        input.awayTeamName
      );
      diff = hybridResult.hybridSpreadHma - coreV1Hma;
    }
  }

  const marketSpread = input.market
    ? canonicalizeLabsMarketSpread({
        line: input.market,
        homeTeamId: input.homeTeamId,
        awayTeamId: input.awayTeamId,
        homeTeamName: input.homeTeamName,
        awayTeamName: input.awayTeamName,
      })
    : null;

  let favoritesDisagree: boolean | null = null;
  if (hybridSpread?.favoriteTeamId && marketSpread?.favoriteTeamId) {
    favoritesDisagree =
      hybridSpread.favoriteTeamId !== marketSpread.favoriteTeamId;
  }

  const missingRatingTeamIds = [
    ...(homeRating == null ? [input.homeTeamId] : []),
    ...(awayRating == null ? [input.awayTeamId] : []),
  ].sort();
  const missingUnitGradeTeamIds = [
    ...(input.homeGrades == null ? [input.homeTeamId] : []),
    ...(input.awayGrades == null ? [input.awayTeamId] : []),
  ].sort();

  return {
    gameId: input.gameId,
    date: input.date,
    status: input.status,
    awayTeamId: input.awayTeamId,
    awayTeamName: input.awayTeamName,
    homeTeamId: input.homeTeamId,
    homeTeamName: input.homeTeamName,
    awayScore: input.awayScore,
    homeScore: input.homeScore,
    neutralSite: input.neutralSite,
    hybridAvailable,
    unavailableReasons: reasons,
    unavailableLabel: hybridUnavailableLabel(reasons),
    missingRatingTeamIds,
    missingUnitGradeTeamIds,
    v1Spread,
    v2Spread,
    hybridSpread,
    diff,
    marketSpread,
    favoritesDisagree,
  };
}
