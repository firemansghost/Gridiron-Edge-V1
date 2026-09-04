/**
 * Shadow Snapshot V1 — prospective Hybrid prediction capture (Phase 4B).
 *
 * Pure planning / contract logic for a guarded PREVIEW/COMMIT writer.
 * Does not call providers, write Bet/MatchupOutput, or mutate Official Card.
 * Closing-market and ATS evaluation writers are out of scope.
 */

import { createHash, randomUUID } from 'crypto';
import { calculateHybridSpread } from './core-v2-spread';
import { compareMarketLineRecency } from './market-line-snapshot';
import hfaConfig from './data/core_v1_hfa_config.json';

export const SHADOW_CAPTURE_SEASON = 2026;
export const SHADOW_EVALUATION_PROTOCOL = 'CORE_EVAL_V1';
export const SHADOW_MODEL_FAMILY = 'hybrid_v2';
export const SHADOW_MODEL_DEFINITION_ID = 'hybrid_v2_shadow_snapshot_v1';
export const SHADOW_POLICY_DEFINITION_ID = 'core_eval_v1_shadow_policy_v1';
export const SHADOW_V4_STRATEGY_TAG = 'v4_labs';
export const MAX_PREDICTION_MARKET_AGE_SECONDS = 1800;
export const HYBRID_SELECTION_ABS_THRESHOLD = 0.1;
export const SUPER_TIER_A_ABS_EDGE_THRESHOLD = 4.0;
export const CAPTURE_CONTEXT_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** Frozen Hybrid V2 math actually used by calculateHybridSpread (constants are not exported). */
export const FROZEN_HYBRID_V2_MODEL_MATH = {
  v1Weight: 0.7,
  v2Weight: 0.3,
  v2Scale: 9.0,
  hybridHfaPoints: 2.5,
  runWeight: 0.4,
  passWeight: 0.4,
  explosivenessWeight: 0.2,
} as const;

export const SHADOW_WEATHER_STATE_UNUSED = {
  used: false,
  source: null,
  values: null,
} as const;

export const UNAVAILABLE_REASON_ORDER = [
  'post_kickoff',
  'missing_rating',
  'rating_provenance_unavailable',
  'missing_unit_grades',
  'unit_grade_provenance_unavailable',
  'missing_market',
  'stale_market',
  'invalid_model_output',
] as const;

export type ShadowCaptureMode = 'PREVIEW' | 'COMMIT';
export type ShadowUnavailableReason = (typeof UNAVAILABLE_REASON_ORDER)[number];
export type ShadowPredictionStatus = 'AVAILABLE' | 'UNAVAILABLE';
export type ShadowSelectedSide = 'HOME' | 'AWAY' | 'NO_SELECTION';
export type ShadowTeamSide = 'HOME' | 'AWAY';
export type ShadowV4ComparisonStatus =
  | 'SIDE_AVAILABLE'
  | 'VERIFIED_NO_SELECTION'
  | 'PROVENANCE_UNAVAILABLE';
export type ShadowQualificationStatus = 'QUALIFIED' | 'NOT_QUALIFIED' | 'UNAVAILABLE';
export type ShadowHybridConflictType = 'hybrid_strong' | 'hybrid_weak' | 'hybrid_only';
export type ShadowTierBucket = 'super_tier_a' | 'none';

export function expectedWriteConfirmation(week: number): string {
  return `CAPTURE_2026_WEEK_${week}_SHADOW_V1`;
}

export function validateCaptureContext(
  value: string
): { ok: true; value: string } | { ok: false; reason: string } {
  const trimmed = String(value ?? '').trim();
  if (!CAPTURE_CONTEXT_PATTERN.test(trimmed)) {
    return {
      ok: false,
      reason:
        'capture_context must match ^[a-z0-9][a-z0-9_-]{0,63}$ and must be declared before execution',
    };
  }
  return { ok: true, value: trimmed };
}

export function canonicalizeJson(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  const rec = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(rec).sort()) {
    const v = rec[key];
    if (v === undefined) continue;
    out[key] = canonicalizeJson(v);
  }
  return out;
}

export function canonicalJsonString(value: unknown): string {
  return JSON.stringify(canonicalizeJson(value));
}

export function sha256CanonicalJson(value: unknown): string {
  return createHash('sha256').update(canonicalJsonString(value), 'utf8').digest('hex');
}

export const SHADOW_MODEL_DEFINITION_MANIFEST = {
  id: SHADOW_MODEL_DEFINITION_ID,
  version: 'shadow_snapshot_v1',
  family: SHADOW_MODEL_FAMILY,
  official: false,
  productionHold: true,
  coreV1Comparison: {
    identity: 'production_core_v1',
    formula:
      'homeV1Rating - awayV1Rating + computeEffectiveHfa(homeTeamId, neutralSite).effectiveHfa',
    notUsed: 'hybrid_internal_simple_v1_component_hfa_2_5',
  },
  hybridV2: {
    v1Weight: FROZEN_HYBRID_V2_MODEL_MATH.v1Weight,
    v2Weight: FROZEN_HYBRID_V2_MODEL_MATH.v2Weight,
    v1Component: {
      formula: 'homeV1Rating - awayV1Rating + hybridHfaPoints',
      hybridHfaPoints: FROZEN_HYBRID_V2_MODEL_MATH.hybridHfaPoints,
      hybridHfaNeutralSite: 0,
    },
    v2Component: {
      scale: FROZEN_HYBRID_V2_MODEL_MATH.v2Scale,
      weights: {
        run: FROZEN_HYBRID_V2_MODEL_MATH.runWeight,
        pass: FROZEN_HYBRID_V2_MODEL_MATH.passWeight,
        explosiveness: FROZEN_HYBRID_V2_MODEL_MATH.explosivenessWeight,
      },
      hfaPoints: FROZEN_HYBRID_V2_MODEL_MATH.hybridHfaPoints,
      hfaNeutralSite: 0,
    },
    blend: 'hybridHma = v1Component * 0.7 + v2Component * 0.3',
  },
  weather: {
    behavior: 'NONE',
    used: false,
    source: null,
    values: null,
    note: 'Current live Hybrid call uses no weather override; this writer freezes weather as not used.',
  },
} as const;

export const SHADOW_POLICY_DEFINITION_MANIFEST = {
  id: SHADOW_POLICY_DEFINITION_ID,
  version: 'shadow_snapshot_v1',
  evaluationProtocol: SHADOW_EVALUATION_PROTOCOL,
  predictionMarket: {
    marketType: 'spread',
    freshnessMaxSeconds: MAX_PREDICTION_MARKET_AGE_SECONDS,
    eligibility: 'marketTimestamp <= predictionTimestamp',
    ordering: ['timestamp DESC', 'id DESC'],
    noFutureMarketFallback: true,
    bookSelection: 'first_usable_team_sided_row_in_frozen_order',
  },
  hybridSelection: {
    thresholdAbs: HYBRID_SELECTION_ABS_THRESHOLD,
    formula: 'spreadEdgeHma = hybridHma - predictionMarketHma',
    sides: {
      noSelection: 'abs(spreadEdgeHma) < 0.1',
      home: 'spreadEdgeHma >= +0.1',
      away: 'spreadEdgeHma <= -0.1',
    },
    noSelectionRemainsAvailable: true,
  },
  teamSidedPickLine: {
    HOME: '-predictionMarketHma',
    AWAY: '+predictionMarketHma',
    NO_SELECTION: null,
  },
  superTierA: {
    absEdgeThreshold: SUPER_TIER_A_ABS_EDGE_THRESHOLD,
    requiresHomeOrAwaySelection: true,
    requiresHybridStrong: true,
    v4DecisionRelevantOnlyWhenHomeOrAwayAndAbsEdgeAtLeast4: true,
  },
  v4Comparison: {
    strategyTag: SHADOW_V4_STRATEGY_TAG,
    marketType: 'spread',
    sideAvailableRequiresCreatedAtAndUpdatedAtAtOrBeforePredictionTimestamp: true,
    verifiedNoSelectionNotInferredFromAbsence: true,
    hybridOnlyRequiresVerifiedNoSelection: true,
  },
  captureContext: {
    required: true,
    declaredBeforeExecution: true,
    pattern: '^[a-z0-9][a-z0-9_-]{0,63}$',
  },
  noRetrospectiveBackfill: true,
  noClosingCapture: true,
  noAtsEvaluation: true,
} as const;

export const SHADOW_MODEL_DEFINITION_HASH = sha256CanonicalJson(
  SHADOW_MODEL_DEFINITION_MANIFEST
);
export const SHADOW_POLICY_DEFINITION_HASH = sha256CanonicalJson(
  SHADOW_POLICY_DEFINITION_MANIFEST
);

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function canonicalMarketSpreadHma(input: {
  lineValue: number;
  teamId: string | null | undefined;
  homeTeamId: string;
  awayTeamId: string;
}): number | null {
  if (!isFiniteNumber(input.lineValue)) return null;
  if (input.teamId === input.homeTeamId) return -input.lineValue;
  if (input.teamId === input.awayTeamId) return input.lineValue;
  return null;
}

export function teamSidedPickLine(pickHome: boolean, marketSpreadHma: number): number {
  return pickHome ? -marketSpreadHma : marketSpreadHma;
}

function computeEffectiveHfa(
  homeTeamId: string,
  neutralSite: boolean
): { effectiveHfa: number } {
  if (neutralSite) return { effectiveHfa: 0 };
  const baseHfa = Number((hfaConfig as { baseHfaPoints: number }).baseHfaPoints);
  const clipRange = (hfaConfig as { clipRange: number[] }).clipRange;
  const adjustments = (hfaConfig as { teamAdjustments: Record<string, { adjustment?: number }> })
    .teamAdjustments;
  const teamAdjustment = adjustments?.[homeTeamId]?.adjustment ?? 0;
  const rawHfa = baseHfa + teamAdjustment;
  const clipMin = clipRange[0];
  const clipMax = clipRange[1];
  return { effectiveHfa: Math.max(clipMin, Math.min(clipMax, rawHfa)) };
}

export function computeProductionCoreV1HmaFromV1Ratings(input: {
  homeTeamId: string;
  homeRating: number;
  awayRating: number;
  neutralSite: boolean;
}): number {
  const hfaPoints = computeEffectiveHfa(input.homeTeamId, input.neutralSite).effectiveHfa;
  return input.homeRating - input.awayRating + hfaPoints;
}

export function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function toIso(value: Date | string | null | undefined): string | null {
  const d = toDate(value);
  return d ? d.toISOString() : null;
}

function provenanceIsFuture(
  createdAt: Date | string | null | undefined,
  updatedAt: Date | string | null | undefined,
  predictionTimestamp: Date
): boolean {
  const created = toDate(createdAt);
  const updated = toDate(updatedAt);
  if (created && created.getTime() > predictionTimestamp.getTime()) return true;
  if (updated && updated.getTime() > predictionTimestamp.getTime()) return true;
  return false;
}

function uniqueStrings(values: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < values.length; i++) {
    if (out.indexOf(values[i]) === -1) out.push(values[i]);
  }
  return out;
}

function orderedReasons(reasons: Iterable<string>): ShadowUnavailableReason[] {
  const set = new Set(reasons);
  return UNAVAILABLE_REASON_ORDER.filter((r) => set.has(r));
}

function sortIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export interface ShadowGameRow {
  id: string;
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  kickoffTimestamp: Date | string;
  neutralSite: boolean;
}

export interface ShadowRatingRow {
  teamId: string;
  season: number;
  modelVersion: string;
  powerRating: number | null;
  rating: number | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
}

export interface ShadowUnitGradeRow {
  id: string;
  teamId: string;
  season: number;
  offRunGrade: number;
  defRunGrade: number;
  offPassGrade: number;
  defPassGrade: number;
  offExplosiveness: number;
  defExplosiveness: number;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
}

export interface ShadowMarketLineRow {
  id: string;
  gameId: string;
  lineType: string;
  lineValue: number;
  teamId: string | null;
  bookName: string;
  source: string;
  timestamp: Date | string;
}

export interface ShadowV4BetRow {
  id: string;
  gameId: string;
  strategyTag: string;
  marketType: string;
  side: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface OperationalShadowFrame {
  games: ShadowGameRow[];
  ratings: ShadowRatingRow[];
  unitGrades: ShadowUnitGradeRow[];
  marketLines: ShadowMarketLineRow[];
  v4Bets: ShadowV4BetRow[];
}

export interface SelectedPredictionMarket {
  selectedMarketLineId: string;
  selectedMarketTeamId: string;
  selectedMarketLineValue: number;
  marketBook: string;
  marketSource: string;
  marketTimestamp: Date;
  marketAgeSeconds: number;
  predictionMarketHma: number;
  marketFavoriteTeamId: string | null;
}

export type PredictionMarketSelection =
  | { status: 'selected'; selected: SelectedPredictionMarket }
  | { status: 'missing_market'; selected: null }
  | { status: 'stale_market'; selected: SelectedPredictionMarket | null };

function ratingUsedValue(row: ShadowRatingRow): number | null {
  if (isFiniteNumber(row.powerRating)) return row.powerRating;
  if (isFiniteNumber(row.rating)) return row.rating;
  return null;
}

function unitGradesUsed(row: ShadowUnitGradeRow): {
  offRunGrade: number;
  defRunGrade: number;
  offPassGrade: number;
  defPassGrade: number;
  offExplosiveness: number;
  defExplosiveness: number;
} | null {
  const grades = {
    offRunGrade: row.offRunGrade,
    defRunGrade: row.defRunGrade,
    offPassGrade: row.offPassGrade,
    defPassGrade: row.defPassGrade,
    offExplosiveness: row.offExplosiveness,
    defExplosiveness: row.defExplosiveness,
  };
  return Object.values(grades).every(isFiniteNumber) ? grades : null;
}

export function deriveShadowSelectedSide(spreadEdgeHma: number): ShadowSelectedSide {
  if (!isFiniteNumber(spreadEdgeHma)) return 'NO_SELECTION';
  const absEdge = Math.abs(spreadEdgeHma);
  if (absEdge < HYBRID_SELECTION_ABS_THRESHOLD) return 'NO_SELECTION';
  if (spreadEdgeHma >= HYBRID_SELECTION_ABS_THRESHOLD) return 'HOME';
  return 'AWAY';
}

export function selectPredictionMarket(input: {
  rows: ShadowMarketLineRow[];
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  predictionTimestamp: Date;
}): PredictionMarketSelection {
  const spreadRows = input.rows.filter(
    (row) => row.gameId === input.gameId && String(row.lineType) === 'spread'
  );
  if (spreadRows.length === 0) {
    return { status: 'missing_market', selected: null };
  }

  const sorted = [...spreadRows].sort(compareMarketLineRecency);
  const predictionMs = input.predictionTimestamp.getTime();
  const preCutoff: ShadowMarketLineRow[] = [];
  let futureCount = 0;
  for (const row of sorted) {
    const ts = toDate(row.timestamp);
    if (!ts) continue;
    if (ts.getTime() <= predictionMs) preCutoff.push(row);
    else futureCount += 1;
  }

  const firstUsable = preCutoff.find((row) => {
    if (!isFiniteNumber(row.lineValue)) return false;
    return row.teamId === input.homeTeamId || row.teamId === input.awayTeamId;
  });

  if (!firstUsable) {
    if (futureCount > 0 && preCutoff.length === 0) {
      return { status: 'stale_market', selected: null };
    }
    return { status: 'missing_market', selected: null };
  }

  const marketTimestamp = toDate(firstUsable.timestamp);
  if (!marketTimestamp) {
    return { status: 'missing_market', selected: null };
  }
  const ageMs = predictionMs - marketTimestamp.getTime();
  const hma = canonicalMarketSpreadHma({
    lineValue: firstUsable.lineValue,
    teamId: firstUsable.teamId,
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
  });
  if (hma == null || !isFiniteNumber(hma)) {
    return { status: 'missing_market', selected: null };
  }

  const selected: SelectedPredictionMarket = {
    selectedMarketLineId: firstUsable.id,
    selectedMarketTeamId: firstUsable.teamId as string,
    selectedMarketLineValue: firstUsable.lineValue,
    marketBook: firstUsable.bookName,
    marketSource: firstUsable.source,
    marketTimestamp,
    marketAgeSeconds: Math.floor(ageMs / 1000),
    predictionMarketHma: hma,
    marketFavoriteTeamId:
      hma > 0 ? input.homeTeamId : hma < 0 ? input.awayTeamId : null,
  };

  if (ageMs < 0 || ageMs > MAX_PREDICTION_MARKET_AGE_SECONDS * 1000) {
    return { status: 'stale_market', selected };
  }
  return { status: 'selected', selected };
}

export function resolveV4Comparison(input: {
  rows: ShadowV4BetRow[];
  gameId: string;
  predictionTimestamp: Date;
}): {
  v4ComparisonStatus: ShadowV4ComparisonStatus;
  v4ComparisonSide: ShadowTeamSide | null;
  v4Provenance: Record<string, unknown>;
} {
  const candidates = input.rows.filter(
    (row) =>
      row.gameId === input.gameId &&
      row.strategyTag === SHADOW_V4_STRATEGY_TAG &&
      String(row.marketType) === 'spread'
  );

  const asOf = candidates.filter((row) => {
    const created = toDate(row.createdAt);
    const updated = toDate(row.updatedAt);
    if (!created || !updated) return false;
    return (
      created.getTime() <= input.predictionTimestamp.getTime() &&
      updated.getTime() <= input.predictionTimestamp.getTime()
    );
  });

  const sides = asOf
    .map((row) => String(row.side).toLowerCase())
    .filter((side) => side === 'home' || side === 'away');

  if (asOf.length === 1 && sides.length === 1) {
    const row = asOf[0];
    const side: ShadowTeamSide = String(row.side).toLowerCase() === 'home' ? 'HOME' : 'AWAY';
    return {
      v4ComparisonStatus: 'SIDE_AVAILABLE',
      v4ComparisonSide: side,
      v4Provenance: {
        betId: row.id,
        strategyTag: row.strategyTag,
        marketType: row.marketType,
        side: row.side,
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
      },
    };
  }

  return {
    v4ComparisonStatus: 'PROVENANCE_UNAVAILABLE',
    v4ComparisonSide: null,
    v4Provenance: {
      candidateCount: candidates.length,
      asOfCount: asOf.length,
      verifiedNoSelectionInferredFromAbsence: false,
    },
  };
}

export function qualifyShadowSnapshot(input: {
  predictionStatus: ShadowPredictionStatus;
  selectedSide: ShadowSelectedSide | null;
  absSpreadEdge: number | null;
  v4ComparisonStatus: ShadowV4ComparisonStatus;
  v4ComparisonSide: ShadowTeamSide | null;
}): {
  qualificationStatus: ShadowQualificationStatus;
  isSuperTierA: boolean | null;
  hybridConflictType: ShadowHybridConflictType | null;
  tierBucket: ShadowTierBucket | null;
  qualificationReasons: string[];
} {
  if (input.predictionStatus === 'UNAVAILABLE') {
    return {
      qualificationStatus: 'UNAVAILABLE',
      isSuperTierA: null,
      hybridConflictType: null,
      tierBucket: null,
      qualificationReasons: [],
    };
  }

  if (input.selectedSide === 'NO_SELECTION' || input.selectedSide == null) {
    return {
      qualificationStatus: 'NOT_QUALIFIED',
      isSuperTierA: false,
      hybridConflictType: null,
      tierBucket: 'none',
      qualificationReasons: [],
    };
  }

  const absEdge = input.absSpreadEdge;
  if (!isFiniteNumber(absEdge) || absEdge < SUPER_TIER_A_ABS_EDGE_THRESHOLD) {
    return {
      qualificationStatus: 'NOT_QUALIFIED',
      isSuperTierA: false,
      hybridConflictType: null,
      tierBucket: 'none',
      qualificationReasons: [],
    };
  }

  if (input.v4ComparisonStatus === 'SIDE_AVAILABLE' && input.v4ComparisonSide) {
    const sameSide = input.selectedSide === input.v4ComparisonSide;
    if (sameSide) {
      return {
        qualificationStatus: 'NOT_QUALIFIED',
        isSuperTierA: false,
        hybridConflictType: 'hybrid_weak',
        tierBucket: 'none',
        qualificationReasons: [],
      };
    }
    return {
      qualificationStatus: 'QUALIFIED',
      isSuperTierA: true,
      hybridConflictType: 'hybrid_strong',
      tierBucket: 'super_tier_a',
      qualificationReasons: [],
    };
  }

  if (input.v4ComparisonStatus === 'VERIFIED_NO_SELECTION') {
    return {
      qualificationStatus: 'NOT_QUALIFIED',
      isSuperTierA: false,
      hybridConflictType: 'hybrid_only',
      tierBucket: 'none',
      qualificationReasons: [],
    };
  }

  return {
    qualificationStatus: 'UNAVAILABLE',
    isSuperTierA: null,
    hybridConflictType: null,
    tierBucket: null,
    qualificationReasons: ['missing_v4_provenance'],
  };
}

function freezeRating(row: ShadowRatingRow | undefined): Record<string, unknown> | null {
  if (!row) return null;
  return {
    teamId: row.teamId,
    season: row.season,
    modelVersion: row.modelVersion,
    powerRating: row.powerRating,
    rating: row.rating,
    usedValue: ratingUsedValue(row),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function freezeUnitGrades(row: ShadowUnitGradeRow | undefined): Record<string, unknown> | null {
  if (!row) return null;
  return {
    id: row.id,
    teamId: row.teamId,
    season: row.season,
    offRunGrade: row.offRunGrade,
    defRunGrade: row.defRunGrade,
    offPassGrade: row.offPassGrade,
    defPassGrade: row.defPassGrade,
    offExplosiveness: row.offExplosiveness,
    defExplosiveness: row.defExplosiveness,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export interface PlannedShadowPredictionSnapshot {
  id: string;
  captureRunId: string;
  gameId: string;
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  kickoffTimestamp: Date;
  neutralSite: boolean;
  predictionTimestamp: Date;
  predictionStatus: ShadowPredictionStatus;
  unavailableReasons: ShadowUnavailableReason[];
  homeV1Rating: number | null;
  awayV1Rating: number | null;
  ratingProvenance: Record<string, unknown> | null;
  homeUnitGrades: Record<string, unknown> | null;
  awayUnitGrades: Record<string, unknown> | null;
  unitGradeProvenance: Record<string, unknown> | null;
  weatherState: typeof SHADOW_WEATHER_STATE_UNUSED;
  inputPayload: Record<string, unknown>;
  inputHash: string;
  coreV1Hma: number | null;
  v2Hma: number | null;
  hybridHma: number | null;
  predictionMarketHma: number | null;
  spreadEdgeHma: number | null;
  absSpreadEdge: number | null;
  selectedSide: ShadowSelectedSide | null;
  selectedTeamId: string | null;
  predictionPickLine: number | null;
  selectedMarketLineId: string | null;
  selectedMarketTeamId: string | null;
  selectedMarketLineValue: number | null;
  marketBook: string | null;
  marketSource: string | null;
  marketTimestamp: Date | null;
  marketAgeSeconds: number | null;
  marketFavoriteTeamId: string | null;
  v4ComparisonStatus: ShadowV4ComparisonStatus;
  v4ComparisonSide: ShadowTeamSide | null;
  v4Provenance: Record<string, unknown>;
  hybridConflictType: ShadowHybridConflictType | null;
  tierBucket: ShadowTierBucket | null;
  qualificationStatus: ShadowQualificationStatus;
  qualificationReasons: string[];
  isSuperTierA: boolean | null;
}

export interface ShadowRunCounts {
  totalGames: number;
  hybridAvailableCount: number;
  hybridUnavailableCount: number;
  qualificationQualifiedCount: number;
  qualificationNotQualifiedCount: number;
  qualificationUnavailableCount: number;
  v4SideAvailableCount: number;
  v4VerifiedNoSelectionCount: number;
  v4ProvenanceUnavailableCount: number;
}

export function deriveShadowRunCounts(
  snapshots: Array<Pick<
    PlannedShadowPredictionSnapshot,
    | 'predictionStatus'
    | 'qualificationStatus'
    | 'v4ComparisonStatus'
  >>
): ShadowRunCounts {
  const totalGames = snapshots.length;
  const hybridAvailableCount = snapshots.filter((s) => s.predictionStatus === 'AVAILABLE').length;
  const hybridUnavailableCount = snapshots.filter((s) => s.predictionStatus === 'UNAVAILABLE').length;
  const qualificationQualifiedCount = snapshots.filter((s) => s.qualificationStatus === 'QUALIFIED').length;
  const qualificationNotQualifiedCount = snapshots.filter(
    (s) => s.qualificationStatus === 'NOT_QUALIFIED'
  ).length;
  const qualificationUnavailableCount = snapshots.filter(
    (s) => s.qualificationStatus === 'UNAVAILABLE'
  ).length;
  const v4SideAvailableCount = snapshots.filter(
    (s) => s.v4ComparisonStatus === 'SIDE_AVAILABLE'
  ).length;
  const v4VerifiedNoSelectionCount = snapshots.filter(
    (s) => s.v4ComparisonStatus === 'VERIFIED_NO_SELECTION'
  ).length;
  const v4ProvenanceUnavailableCount = snapshots.filter(
    (s) => s.v4ComparisonStatus === 'PROVENANCE_UNAVAILABLE'
  ).length;
  return {
    totalGames,
    hybridAvailableCount,
    hybridUnavailableCount,
    qualificationQualifiedCount,
    qualificationNotQualifiedCount,
    qualificationUnavailableCount,
    v4SideAvailableCount,
    v4VerifiedNoSelectionCount,
    v4ProvenanceUnavailableCount,
  };
}

export function reconcileShadowRunCounts(
  counts: ShadowRunCounts,
  snapshots: Array<{ gameId: string }>,
  expectedGameIds: string[]
): string[] {
  const blockers: string[] = [];
  if (counts.hybridAvailableCount + counts.hybridUnavailableCount !== counts.totalGames) {
    blockers.push('count_mismatch_hybrid_availability');
  }
  if (
    counts.qualificationQualifiedCount +
      counts.qualificationNotQualifiedCount +
      counts.qualificationUnavailableCount !==
    counts.totalGames
  ) {
    blockers.push('count_mismatch_qualification');
  }
  if (
    counts.v4SideAvailableCount +
      counts.v4VerifiedNoSelectionCount +
      counts.v4ProvenanceUnavailableCount !==
    counts.totalGames
  ) {
    blockers.push('count_mismatch_v4');
  }
  if (snapshots.length !== counts.totalGames) {
    blockers.push('snapshot_count_mismatch');
  }
  const unique = new Set(snapshots.map((s) => s.gameId));
  if (unique.size !== counts.totalGames) {
    blockers.push('duplicate_game_snapshot');
  }
  const expected = sortIds(expectedGameIds);
  const actual = sortIds(snapshots.map((s) => s.gameId));
  if (canonicalJsonString(expected) !== canonicalJsonString(actual)) {
    blockers.push('frame_mismatch');
  }
  if (expected.length !== counts.totalGames) {
    blockers.push('expected_game_count_mismatch');
  }
  return blockers;
}

export function validateGameFrame(
  season: number,
  week: number,
  games: ShadowGameRow[]
): { expectedGameIds: string[]; blockers: string[] } {
  const blockers: string[] = [];
  if (season !== SHADOW_CAPTURE_SEASON) {
    blockers.push(`season_must_be_${SHADOW_CAPTURE_SEASON}`);
  }
  if (!Number.isInteger(week) || week < 1) {
    blockers.push('week_must_be_positive_integer');
  }
  if (games.length === 0) {
    blockers.push('zero_games');
  }
  const ids = games.map((g) => g.id);
  if (new Set(ids).size !== ids.length) {
    blockers.push('duplicate_game_ids');
  }
  for (const game of games) {
    if (game.season !== season || game.week !== week) {
      blockers.push('contradictory_game_identity');
      break;
    }
    if (!game.id || game.homeTeamId === game.awayTeamId || !game.homeTeamId || !game.awayTeamId) {
      blockers.push('contradictory_game_identity');
      break;
    }
    if (!toDate(game.kickoffTimestamp)) {
      blockers.push('contradictory_game_identity');
      break;
    }
  }
  return { expectedGameIds: sortIds(ids), blockers: uniqueStrings(blockers) };
}

function indexUniqueByTeam<T extends { teamId: string }>(
  rows: T[],
  label: string
): { byTeam: Map<string, T>; blockers: string[] } {
  const byTeam = new Map<string, T>();
  const blockers: string[] = [];
  for (const row of rows) {
    if (byTeam.has(row.teamId)) {
      blockers.push(`duplicate_${label}_${row.teamId}`);
    }
    byTeam.set(row.teamId, row);
  }
  return { byTeam, blockers };
}

export function planShadowGameSnapshot(input: {
  game: ShadowGameRow;
  captureRunId: string;
  snapshotId: string;
  predictionTimestamp: Date;
  ratingByTeam: Map<string, ShadowRatingRow>;
  unitGradesByTeam: Map<string, ShadowUnitGradeRow>;
  marketLines: ShadowMarketLineRow[];
  v4Bets: ShadowV4BetRow[];
}): PlannedShadowPredictionSnapshot {
  const kickoffTimestamp = toDate(input.game.kickoffTimestamp) as Date;
  const reasons: string[] = [];
  const homeRatingRow = input.ratingByTeam.get(input.game.homeTeamId);
  const awayRatingRow = input.ratingByTeam.get(input.game.awayTeamId);
  const homeGradeRow = input.unitGradesByTeam.get(input.game.homeTeamId);
  const awayGradeRow = input.unitGradesByTeam.get(input.game.awayTeamId);

  const homeRatingFuture =
    homeRatingRow != null &&
    provenanceIsFuture(homeRatingRow.createdAt, homeRatingRow.updatedAt, input.predictionTimestamp);
  const awayRatingFuture =
    awayRatingRow != null &&
    provenanceIsFuture(awayRatingRow.createdAt, awayRatingRow.updatedAt, input.predictionTimestamp);
  const homeGradeFuture =
    homeGradeRow != null &&
    provenanceIsFuture(homeGradeRow.createdAt, homeGradeRow.updatedAt, input.predictionTimestamp);
  const awayGradeFuture =
    awayGradeRow != null &&
    provenanceIsFuture(awayGradeRow.createdAt, awayGradeRow.updatedAt, input.predictionTimestamp);

  const homeUsed =
    homeRatingRow && !homeRatingFuture ? ratingUsedValue(homeRatingRow) : null;
  const awayUsed =
    awayRatingRow && !awayRatingFuture ? ratingUsedValue(awayRatingRow) : null;
  const homeGrades =
    homeGradeRow && !homeGradeFuture ? unitGradesUsed(homeGradeRow) : null;
  const awayGrades =
    awayGradeRow && !awayGradeFuture ? unitGradesUsed(awayGradeRow) : null;

  if (input.predictionTimestamp.getTime() >= kickoffTimestamp.getTime()) {
    reasons.push('post_kickoff');
  }
  if (homeRatingFuture || awayRatingFuture) {
    reasons.push('rating_provenance_unavailable');
  }
  const homeRatingMissing = homeUsed == null && !homeRatingFuture;
  const awayRatingMissing = awayUsed == null && !awayRatingFuture;
  if (homeRatingMissing || awayRatingMissing) {
    reasons.push('missing_rating');
  }
  if (homeGradeFuture || awayGradeFuture) {
    reasons.push('unit_grade_provenance_unavailable');
  }
  const homeGradesMissing = homeGrades == null && !homeGradeFuture;
  const awayGradesMissing = awayGrades == null && !awayGradeFuture;
  if (homeGradesMissing || awayGradesMissing) {
    reasons.push('missing_unit_grades');
  }

  const market = selectPredictionMarket({
    rows: input.marketLines,
    gameId: input.game.id,
    homeTeamId: input.game.homeTeamId,
    awayTeamId: input.game.awayTeamId,
    predictionTimestamp: input.predictionTimestamp,
  });
  if (market.status === 'missing_market') reasons.push('missing_market');
  if (market.status === 'stale_market') reasons.push('stale_market');

  const v4 = resolveV4Comparison({
    rows: input.v4Bets,
    gameId: input.game.id,
    predictionTimestamp: input.predictionTimestamp,
  });

  const inputPayload = {
    gameId: input.game.id,
    homeTeamId: input.game.homeTeamId,
    awayTeamId: input.game.awayTeamId,
    neutralSite: input.game.neutralSite,
    homeV1Rating: homeUsed,
    awayV1Rating: awayUsed,
    homeUnitGrades: homeGrades,
    awayUnitGrades: awayGrades,
    weather: SHADOW_WEATHER_STATE_UNUSED,
  };
  const inputHash = sha256CanonicalJson(inputPayload);

  let coreV1Hma: number | null = null;
  let v2Hma: number | null = null;
  let hybridHma: number | null = null;
  let spreadEdgeHma: number | null = null;
  let absSpreadEdge: number | null = null;
  let selectedSide: ShadowSelectedSide | null = null;
  let selectedTeamId: string | null = null;
  let predictionPickLine: number | null = null;
  let predictionStatus: ShadowPredictionStatus = 'UNAVAILABLE';

  const canPredict =
    reasons.length === 0 &&
    homeUsed != null &&
    awayUsed != null &&
    homeGrades != null &&
    awayGrades != null &&
    market.status === 'selected' &&
    market.selected != null;

  if (canPredict) {
    coreV1Hma = computeProductionCoreV1HmaFromV1Ratings({
      homeTeamId: input.game.homeTeamId,
      homeRating: homeUsed,
      awayRating: awayUsed,
      neutralSite: input.game.neutralSite,
    });
    const hybrid = calculateHybridSpread(
      homeUsed,
      awayUsed,
      homeGrades,
      awayGrades,
      input.game.neutralSite,
      input.game.homeTeamId,
      input.game.awayTeamId,
      null
    );
    v2Hma = hybrid.v2SpreadHma;
    hybridHma = hybrid.hybridSpreadHma;
    const marketHma = market.selected.predictionMarketHma;
    spreadEdgeHma = hybridHma - marketHma;
    absSpreadEdge = Math.abs(spreadEdgeHma);
    if (
      !isFiniteNumber(coreV1Hma) ||
      !isFiniteNumber(v2Hma) ||
      !isFiniteNumber(hybridHma) ||
      !isFiniteNumber(spreadEdgeHma)
    ) {
      reasons.push('invalid_model_output');
      coreV1Hma = null;
      v2Hma = null;
      hybridHma = null;
      spreadEdgeHma = null;
      absSpreadEdge = null;
    } else {
      selectedSide = deriveShadowSelectedSide(spreadEdgeHma);
      if (selectedSide === 'HOME') {
        selectedTeamId = input.game.homeTeamId;
        predictionPickLine = teamSidedPickLine(true, marketHma);
      } else if (selectedSide === 'AWAY') {
        selectedTeamId = input.game.awayTeamId;
        predictionPickLine = teamSidedPickLine(false, marketHma);
      } else {
        selectedTeamId = null;
        predictionPickLine = null;
      }
      predictionStatus = 'AVAILABLE';
    }
  }

  const unavailableReasons = orderedReasons(reasons);
  if (unavailableReasons.length > 0) {
    predictionStatus = 'UNAVAILABLE';
    selectedSide = null;
    selectedTeamId = null;
    predictionPickLine = null;
    spreadEdgeHma = null;
    absSpreadEdge = null;
    coreV1Hma = null;
    v2Hma = null;
    hybridHma = null;
  }

  const qualification = qualifyShadowSnapshot({
    predictionStatus,
    selectedSide,
    absSpreadEdge,
    v4ComparisonStatus: v4.v4ComparisonStatus,
    v4ComparisonSide: v4.v4ComparisonSide,
  });

  const freezeMarket = market.selected;

  return {
    id: input.snapshotId,
    captureRunId: input.captureRunId,
    gameId: input.game.id,
    season: input.game.season,
    week: input.game.week,
    homeTeamId: input.game.homeTeamId,
    awayTeamId: input.game.awayTeamId,
    kickoffTimestamp,
    neutralSite: input.game.neutralSite,
    predictionTimestamp: input.predictionTimestamp,
    predictionStatus,
    unavailableReasons,
    homeV1Rating: homeUsed,
    awayV1Rating: awayUsed,
    ratingProvenance: {
      home: freezeRating(homeRatingRow),
      away: freezeRating(awayRatingRow),
    },
    homeUnitGrades: homeGrades,
    awayUnitGrades: awayGrades,
    unitGradeProvenance: {
      home: freezeUnitGrades(homeGradeRow),
      away: freezeUnitGrades(awayGradeRow),
    },
    weatherState: SHADOW_WEATHER_STATE_UNUSED,
    inputPayload,
    inputHash,
    coreV1Hma,
    v2Hma,
    hybridHma,
    predictionMarketHma: freezeMarket ? freezeMarket.predictionMarketHma : null,
    spreadEdgeHma,
    absSpreadEdge,
    selectedSide,
    selectedTeamId,
    predictionPickLine,
    selectedMarketLineId: freezeMarket ? freezeMarket.selectedMarketLineId : null,
    selectedMarketTeamId: freezeMarket ? freezeMarket.selectedMarketTeamId : null,
    selectedMarketLineValue: freezeMarket ? freezeMarket.selectedMarketLineValue : null,
    marketBook: freezeMarket ? freezeMarket.marketBook : null,
    marketSource: freezeMarket ? freezeMarket.marketSource : null,
    marketTimestamp: freezeMarket ? freezeMarket.marketTimestamp : null,
    marketAgeSeconds: freezeMarket ? freezeMarket.marketAgeSeconds : null,
    marketFavoriteTeamId: freezeMarket ? freezeMarket.marketFavoriteTeamId : null,
    v4ComparisonStatus: v4.v4ComparisonStatus,
    v4ComparisonSide: v4.v4ComparisonSide,
    v4Provenance: v4.v4Provenance,
    hybridConflictType: qualification.hybridConflictType,
    tierBucket: qualification.tierBucket,
    qualificationStatus: qualification.qualificationStatus,
    qualificationReasons: qualification.qualificationReasons,
    isSuperTierA: qualification.isSuperTierA,
  };
}

export interface PlannedShadowCaptureRun {
  id: string;
  season: number;
  week: number;
  evaluationProtocol: typeof SHADOW_EVALUATION_PROTOCOL;
  captureContext: string;
  modelFamily: typeof SHADOW_MODEL_FAMILY;
  modelDefinitionId: typeof SHADOW_MODEL_DEFINITION_ID;
  modelDefinitionHash: string;
  modelDefinitionManifest: typeof SHADOW_MODEL_DEFINITION_MANIFEST;
  policyDefinitionId: typeof SHADOW_POLICY_DEFINITION_ID;
  policyDefinitionHash: string;
  policyDefinitionManifest: typeof SHADOW_POLICY_DEFINITION_MANIFEST;
  repoCommitSha: string;
  captureTimestamp: Date;
  expectedGameIds: string[];
  totalGames: number;
  hybridAvailableCount: number;
  hybridUnavailableCount: number;
  qualificationQualifiedCount: number;
  qualificationNotQualifiedCount: number;
  qualificationUnavailableCount: number;
  v4SideAvailableCount: number;
  v4VerifiedNoSelectionCount: number;
  v4ProvenanceUnavailableCount: number;
  status: 'COMPLETE';
  failureReason: null;
}

export interface ShadowCapturePlan {
  ok: boolean;
  writeSafe: boolean;
  writeBlockers: string[];
  season: number;
  week: number;
  mode: ShadowCaptureMode;
  captureContext: string;
  predictionTimestamp: Date;
  repoCommitSha: string;
  modelDefinitionId: string;
  modelDefinitionHash: string;
  policyDefinitionId: string;
  policyDefinitionHash: string;
  expectedGameIds: string[];
  counts: ShadowRunCounts;
  snapshots: PlannedShadowPredictionSnapshot[];
  run: PlannedShadowCaptureRun | null;
  confirmationValid: boolean;
  previewTimestampWillNotBecomeCommitTimestamp: true;
}

export function planShadowCaptureRun(input: {
  season: number;
  week: number;
  mode: ShadowCaptureMode;
  captureContext: string;
  confirmation: string;
  repoCommitSha: string;
  predictionTimestamp: Date;
  frame: OperationalShadowFrame;
  captureRunId?: string;
  createId?: () => string;
}): ShadowCapturePlan {
  const createId = input.createId ?? (() => randomUUID());
  const context = validateCaptureContext(input.captureContext);
  const confirmationValid =
    input.mode === 'PREVIEW' ||
    input.confirmation === expectedWriteConfirmation(input.week);
  const frameCheck = validateGameFrame(input.season, input.week, input.frame.games);
  const ratingIndex = indexUniqueByTeam(
    input.frame.ratings.filter((r) => r.season === input.season && r.modelVersion === 'v1'),
    'rating'
  );
  const gradeIndex = indexUniqueByTeam(
    input.frame.unitGrades.filter((r) => r.season === input.season),
    'unit_grades'
  );

  const writeBlockers = [
    ...(context.ok ? [] : [context.reason]),
    ...frameCheck.blockers,
    ...ratingIndex.blockers,
    ...gradeIndex.blockers,
  ];
  if (input.mode === 'COMMIT' && !confirmationValid) {
    writeBlockers.push('confirmation_invalid');
  }

  const emptyCounts = deriveShadowRunCounts([]);
  const base = {
    season: input.season,
    week: input.week,
    mode: input.mode,
    captureContext: context.ok ? context.value : input.captureContext,
    predictionTimestamp: input.predictionTimestamp,
    repoCommitSha: input.repoCommitSha,
    modelDefinitionId: SHADOW_MODEL_DEFINITION_ID,
    modelDefinitionHash: SHADOW_MODEL_DEFINITION_HASH,
    policyDefinitionId: SHADOW_POLICY_DEFINITION_ID,
    policyDefinitionHash: SHADOW_POLICY_DEFINITION_HASH,
    confirmationValid,
    previewTimestampWillNotBecomeCommitTimestamp: true as const,
  };

  if (writeBlockers.length > 0) {
    return {
      ...base,
      ok: false,
      writeSafe: false,
      writeBlockers,
      expectedGameIds: frameCheck.expectedGameIds,
      counts: emptyCounts,
      snapshots: [],
      run: null,
    };
  }

  const captureRunId = input.captureRunId ?? createId();
  const snapshots = sortIds(input.frame.games.map((g) => g.id)).map((gameId) => {
    const game = input.frame.games.find((g) => g.id === gameId) as ShadowGameRow;
    return planShadowGameSnapshot({
      game,
      captureRunId,
      snapshotId: createId(),
      predictionTimestamp: input.predictionTimestamp,
      ratingByTeam: ratingIndex.byTeam,
      unitGradesByTeam: gradeIndex.byTeam,
      marketLines: input.frame.marketLines,
      v4Bets: input.frame.v4Bets,
    });
  });

  const counts = deriveShadowRunCounts(snapshots);
  const invariantBlockers = reconcileShadowRunCounts(
    counts,
    snapshots,
    frameCheck.expectedGameIds
  );
  if (invariantBlockers.length > 0) {
    return {
      ...base,
      ok: false,
      writeSafe: false,
      writeBlockers: invariantBlockers,
      expectedGameIds: frameCheck.expectedGameIds,
      counts,
      snapshots,
      run: null,
    };
  }

  const run: PlannedShadowCaptureRun = {
    id: captureRunId,
    season: input.season,
    week: input.week,
    evaluationProtocol: SHADOW_EVALUATION_PROTOCOL,
    captureContext: context.value,
    modelFamily: SHADOW_MODEL_FAMILY,
    modelDefinitionId: SHADOW_MODEL_DEFINITION_ID,
    modelDefinitionHash: SHADOW_MODEL_DEFINITION_HASH,
    modelDefinitionManifest: SHADOW_MODEL_DEFINITION_MANIFEST,
    policyDefinitionId: SHADOW_POLICY_DEFINITION_ID,
    policyDefinitionHash: SHADOW_POLICY_DEFINITION_HASH,
    policyDefinitionManifest: SHADOW_POLICY_DEFINITION_MANIFEST,
    repoCommitSha: input.repoCommitSha,
    captureTimestamp: input.predictionTimestamp,
    expectedGameIds: frameCheck.expectedGameIds,
    ...counts,
    status: 'COMPLETE',
    failureReason: null,
  };

  return {
    ...base,
    ok: true,
    writeSafe: input.mode === 'PREVIEW' || confirmationValid,
    writeBlockers: [],
    expectedGameIds: frameCheck.expectedGameIds,
    counts,
    snapshots,
    run,
  };
}

export interface ExistingShadowCohort {
  run: {
    id: string;
    status: string;
    season: number;
    week: number;
    evaluationProtocol: string;
    captureContext: string;
    modelDefinitionId: string;
    modelDefinitionHash: string;
    policyDefinitionId: string;
    policyDefinitionHash: string;
    expectedGameIds: unknown;
    totalGames: number;
    hybridAvailableCount: number;
    hybridUnavailableCount: number;
    qualificationQualifiedCount: number;
    qualificationNotQualifiedCount: number;
    qualificationUnavailableCount: number;
    v4SideAvailableCount: number;
    v4VerifiedNoSelectionCount: number;
    v4ProvenanceUnavailableCount: number;
  };
  snapshots: Array<{
    id: string;
    gameId: string;
    predictionStatus: string;
    qualificationStatus: string | null;
    v4ComparisonStatus: string | null;
  }>;
  closingCount: number;
  evaluationCount: number;
}

export function validateExistingCompleteCohort(existing: ExistingShadowCohort): string[] {
  const blockers: string[] = [];
  if (existing.run.status !== 'COMPLETE') {
    blockers.push('existing_cohort_not_complete');
  }
  if (existing.closingCount !== 0) {
    blockers.push('existing_cohort_has_closing_snapshots');
  }
  if (existing.evaluationCount !== 0) {
    blockers.push('existing_cohort_has_evaluation_rows');
  }
  if (existing.run.modelDefinitionHash !== SHADOW_MODEL_DEFINITION_HASH) {
    blockers.push('existing_cohort_model_definition_mismatch');
  }
  if (existing.run.policyDefinitionHash !== SHADOW_POLICY_DEFINITION_HASH) {
    blockers.push('existing_cohort_policy_definition_mismatch');
  }
  if (existing.run.evaluationProtocol !== SHADOW_EVALUATION_PROTOCOL) {
    blockers.push('existing_cohort_protocol_mismatch');
  }
  const expected = Array.isArray(existing.run.expectedGameIds)
    ? (existing.run.expectedGameIds as string[])
    : [];
  const counts = deriveShadowRunCounts(
    existing.snapshots.map((s) => ({
      predictionStatus: s.predictionStatus as ShadowPredictionStatus,
      qualificationStatus: (s.qualificationStatus ?? 'UNAVAILABLE') as ShadowQualificationStatus,
      v4ComparisonStatus: (s.v4ComparisonStatus ??
        'PROVENANCE_UNAVAILABLE') as ShadowV4ComparisonStatus,
    }))
  );
  blockers.push(
    ...reconcileShadowRunCounts(counts, existing.snapshots, expected)
  );
  if (counts.totalGames !== existing.run.totalGames) blockers.push('existing_total_games_mismatch');
  if (counts.hybridAvailableCount !== existing.run.hybridAvailableCount) {
    blockers.push('existing_hybrid_available_mismatch');
  }
  if (counts.hybridUnavailableCount !== existing.run.hybridUnavailableCount) {
    blockers.push('existing_hybrid_unavailable_mismatch');
  }
  if (counts.qualificationQualifiedCount !== existing.run.qualificationQualifiedCount) {
    blockers.push('existing_qualified_mismatch');
  }
  if (counts.qualificationNotQualifiedCount !== existing.run.qualificationNotQualifiedCount) {
    blockers.push('existing_not_qualified_mismatch');
  }
  if (counts.qualificationUnavailableCount !== existing.run.qualificationUnavailableCount) {
    blockers.push('existing_qualification_unavailable_mismatch');
  }
  if (counts.v4SideAvailableCount !== existing.run.v4SideAvailableCount) {
    blockers.push('existing_v4_side_mismatch');
  }
  if (counts.v4VerifiedNoSelectionCount !== existing.run.v4VerifiedNoSelectionCount) {
    blockers.push('existing_v4_verified_mismatch');
  }
  if (counts.v4ProvenanceUnavailableCount !== existing.run.v4ProvenanceUnavailableCount) {
    blockers.push('existing_v4_unavailable_mismatch');
  }
  return uniqueStrings(blockers);
}

export interface ShadowMutationTx {
  findCohort(): Promise<ExistingShadowCohort | null>;
  loadFrame(): Promise<OperationalShadowFrame>;
  now(): Date;
  createRun(run: PlannedShadowCaptureRun): Promise<void>;
  createPredictionSnapshots(rows: PlannedShadowPredictionSnapshot[]): Promise<number>;
  countPredictions(captureRunId: string): Promise<number>;
}

export interface ShadowCaptureAdapter {
  now(): Date;
  createId(): string;
  findCohort(): Promise<ExistingShadowCohort | null>;
  loadFrame(): Promise<OperationalShadowFrame>;
  runTransaction<T>(fn: (tx: ShadowMutationTx) => Promise<T>): Promise<T>;
  readRun(id: string): Promise<ExistingShadowCohort | null>;
  countClosingSnapshots(): Promise<number>;
  countEvaluationResults(): Promise<number>;
}

export interface ShadowCaptureExecution {
  mode: ShadowCaptureMode;
  providerCalls: 0;
  mutationsInvoked: boolean;
  commitSucceeded: boolean;
  persistenceCommitted: boolean;
  rolledBack: boolean;
  transactionalIdempotentNoOp: boolean;
  insertedRunId: string | null;
  insertedSnapshotCount: number;
  error: string | null;
  verificationOk: boolean | null;
  verificationReasons: string[];
}

export interface ShadowCaptureReport {
  season: number;
  week: number;
  mode: ShadowCaptureMode;
  captureContext: string;
  previewObservedTimestamp: string | null;
  commitObservedTimestamp: string | null;
  previewTimestampWillNotBecomeCommitTimestamp: true;
  repoCommitSha: string;
  modelDefinitionId: string;
  modelDefinitionHash: string;
  policyDefinitionId: string;
  policyDefinitionHash: string;
  expectedGameIds: string[];
  counts: ShadowRunCounts;
  writeSafe: boolean;
  writeBlockers: string[];
  games: Array<{
    gameId: string;
    predictionStatus: ShadowPredictionStatus;
    unavailableReasons: string[];
    selectedSide: ShadowSelectedSide | null;
    qualificationStatus: ShadowQualificationStatus | null;
    isSuperTierA: boolean | null;
    v4ComparisonStatus: ShadowV4ComparisonStatus;
    hybridConflictType: ShadowHybridConflictType | null;
  }>;
  providerCalls: 0;
  mutationsInvoked: boolean;
  existingCohort: 'none' | 'complete_valid_noop' | 'malformed';
}

function snapshotSummaries(snapshots: PlannedShadowPredictionSnapshot[]) {
  return snapshots.map((s) => ({
    gameId: s.gameId,
    predictionStatus: s.predictionStatus,
    unavailableReasons: s.unavailableReasons,
    selectedSide: s.selectedSide,
    qualificationStatus: s.qualificationStatus,
    isSuperTierA: s.isSuperTierA,
    v4ComparisonStatus: s.v4ComparisonStatus,
    hybridConflictType: s.hybridConflictType,
  }));
}

function verifyCommittedCohort(
  existing: ExistingShadowCohort,
  plan: ShadowCapturePlan
): string[] {
  const reasons = validateExistingCompleteCohort(existing);
  if (!plan.run) {
    reasons.push('missing_planned_run');
    return reasons;
  }
  if (existing.run.id !== plan.run.id) reasons.push('committed_run_id_mismatch');
  if (existing.snapshots.length !== plan.snapshots.length) {
    reasons.push('committed_snapshot_count_mismatch');
  }
  return reasons;
}

export async function executeShadowCapture(input: {
  season: number;
  week: number;
  mode: ShadowCaptureMode;
  captureContext: string;
  confirmation: string;
  repoCommitSha: string;
  adapter: ShadowCaptureAdapter;
}): Promise<{
  plan: ShadowCapturePlan;
  execution: ShadowCaptureExecution;
  report: ShadowCaptureReport;
}> {
  const emptyExecution = (partial: Partial<ShadowCaptureExecution>): ShadowCaptureExecution => ({
    mode: input.mode,
    providerCalls: 0,
    mutationsInvoked: false,
    commitSucceeded: false,
    persistenceCommitted: false,
    rolledBack: false,
    transactionalIdempotentNoOp: false,
    insertedRunId: null,
    insertedSnapshotCount: 0,
    error: null,
    verificationOk: null,
    verificationReasons: [],
    ...partial,
  });

  const buildReport = (
    plan: ShadowCapturePlan,
    execution: ShadowCaptureExecution,
    existingCohort: ShadowCaptureReport['existingCohort']
  ): ShadowCaptureReport => ({
    season: plan.season,
    week: plan.week,
    mode: plan.mode,
    captureContext: plan.captureContext,
    previewObservedTimestamp:
      input.mode === 'PREVIEW' ? plan.predictionTimestamp.toISOString() : null,
    commitObservedTimestamp:
      input.mode === 'COMMIT' && !execution.transactionalIdempotentNoOp
        ? plan.predictionTimestamp.toISOString()
        : null,
    previewTimestampWillNotBecomeCommitTimestamp: true,
    repoCommitSha: plan.repoCommitSha,
    modelDefinitionId: plan.modelDefinitionId,
    modelDefinitionHash: plan.modelDefinitionHash,
    policyDefinitionId: plan.policyDefinitionId,
    policyDefinitionHash: plan.policyDefinitionHash,
    expectedGameIds: plan.expectedGameIds,
    counts: plan.counts,
    writeSafe: plan.writeSafe,
    writeBlockers: plan.writeBlockers,
    games: snapshotSummaries(plan.snapshots),
    providerCalls: 0,
    mutationsInvoked: execution.mutationsInvoked,
    existingCohort,
  });

  if (input.mode === 'PREVIEW') {
    const existingPreview = await input.adapter.findCohort();
    if (existingPreview) {
      const integrity = validateExistingCompleteCohort(existingPreview);
      const expected = Array.isArray(existingPreview.run.expectedGameIds)
        ? (existingPreview.run.expectedGameIds as string[])
        : [];
      const counts = deriveShadowRunCounts(
        existingPreview.snapshots.map((s) => ({
          predictionStatus: s.predictionStatus as ShadowPredictionStatus,
          qualificationStatus: (s.qualificationStatus ??
            'UNAVAILABLE') as ShadowQualificationStatus,
          v4ComparisonStatus: (s.v4ComparisonStatus ??
            'PROVENANCE_UNAVAILABLE') as ShadowV4ComparisonStatus,
        }))
      );
      const plan: ShadowCapturePlan = {
        ok: integrity.length === 0,
        writeSafe: integrity.length === 0,
        writeBlockers: integrity,
        season: input.season,
        week: input.week,
        mode: 'PREVIEW',
        captureContext: input.captureContext,
        predictionTimestamp: input.adapter.now(),
        repoCommitSha: input.repoCommitSha,
        modelDefinitionId: SHADOW_MODEL_DEFINITION_ID,
        modelDefinitionHash: SHADOW_MODEL_DEFINITION_HASH,
        policyDefinitionId: SHADOW_POLICY_DEFINITION_ID,
        policyDefinitionHash: SHADOW_POLICY_DEFINITION_HASH,
        expectedGameIds: sortIds(expected),
        counts,
        snapshots: [],
        run: null,
        confirmationValid: true,
        previewTimestampWillNotBecomeCommitTimestamp: true,
      };
      const execution = emptyExecution({
        error: integrity.length ? integrity.join('; ') : null,
        transactionalIdempotentNoOp: integrity.length === 0,
        insertedRunId: existingPreview.run.id,
        verificationOk: integrity.length === 0,
      });
      const report = buildReport(
        plan,
        execution,
        integrity.length === 0 ? 'complete_valid_noop' : 'malformed'
      );
      report.games = existingPreview.snapshots.map((s) => ({
        gameId: s.gameId,
        predictionStatus: s.predictionStatus as ShadowPredictionStatus,
        unavailableReasons: [],
        selectedSide: null,
        qualificationStatus: (s.qualificationStatus as ShadowQualificationStatus) ?? null,
        isSuperTierA: null,
        v4ComparisonStatus:
          (s.v4ComparisonStatus as ShadowV4ComparisonStatus) ?? 'PROVENANCE_UNAVAILABLE',
        hybridConflictType: null,
      }));
      return { plan, execution, report };
    }

    const frame = await input.adapter.loadFrame();
    const previewTimestamp = input.adapter.now();
    const plan = planShadowCaptureRun({
      season: input.season,
      week: input.week,
      mode: 'PREVIEW',
      captureContext: input.captureContext,
      confirmation: input.confirmation,
      repoCommitSha: input.repoCommitSha,
      predictionTimestamp: previewTimestamp,
      frame,
      createId: input.adapter.createId,
    });
    const execution = emptyExecution({
      commitSucceeded: false,
      error: plan.ok ? null : plan.writeBlockers.join('; '),
    });
    return {
      plan,
      execution,
      report: buildReport(plan, execution, 'none'),
    };
  }

  const confirmationValid = input.confirmation === expectedWriteConfirmation(input.week);
  if (!confirmationValid) {
    const frame = await input.adapter.loadFrame();
    const plan = planShadowCaptureRun({
      season: input.season,
      week: input.week,
      mode: 'COMMIT',
      captureContext: input.captureContext,
      confirmation: input.confirmation,
      repoCommitSha: input.repoCommitSha,
      predictionTimestamp: input.adapter.now(),
      frame,
      createId: input.adapter.createId,
    });
    const execution = emptyExecution({ error: 'confirmation_invalid' });
    return { plan, execution, report: buildReport(plan, execution, 'none') };
  }

  const existing = await input.adapter.findCohort();
  if (existing) {
    const integrity = validateExistingCompleteCohort(existing);
    if (integrity.length > 0) {
      const plan: ShadowCapturePlan = {
        ok: false,
        writeSafe: false,
        writeBlockers: integrity,
        season: input.season,
        week: input.week,
        mode: 'COMMIT',
        captureContext: input.captureContext,
        predictionTimestamp: input.adapter.now(),
        repoCommitSha: input.repoCommitSha,
        modelDefinitionId: SHADOW_MODEL_DEFINITION_ID,
        modelDefinitionHash: SHADOW_MODEL_DEFINITION_HASH,
        policyDefinitionId: SHADOW_POLICY_DEFINITION_ID,
        policyDefinitionHash: SHADOW_POLICY_DEFINITION_HASH,
        expectedGameIds: Array.isArray(existing.run.expectedGameIds)
          ? sortIds(existing.run.expectedGameIds as string[])
          : [],
        counts: deriveShadowRunCounts([]),
        snapshots: [],
        run: null,
        confirmationValid: true,
        previewTimestampWillNotBecomeCommitTimestamp: true,
      };
      const execution = emptyExecution({
        error: `existing_cohort_malformed: ${integrity.join('; ')}`,
      });
      return { plan, execution, report: buildReport(plan, execution, 'malformed') };
    }

    const expected = Array.isArray(existing.run.expectedGameIds)
      ? (existing.run.expectedGameIds as string[])
      : [];
    const counts = deriveShadowRunCounts(
      existing.snapshots.map((s) => ({
        predictionStatus: s.predictionStatus as ShadowPredictionStatus,
        qualificationStatus: (s.qualificationStatus ?? 'UNAVAILABLE') as ShadowQualificationStatus,
        v4ComparisonStatus: (s.v4ComparisonStatus ??
          'PROVENANCE_UNAVAILABLE') as ShadowV4ComparisonStatus,
      }))
    );
    const plan: ShadowCapturePlan = {
      ok: true,
      writeSafe: true,
      writeBlockers: [],
      season: input.season,
      week: input.week,
      mode: 'COMMIT',
      captureContext: input.captureContext,
      predictionTimestamp: new Date(0),
      repoCommitSha: input.repoCommitSha,
      modelDefinitionId: SHADOW_MODEL_DEFINITION_ID,
      modelDefinitionHash: SHADOW_MODEL_DEFINITION_HASH,
      policyDefinitionId: SHADOW_POLICY_DEFINITION_ID,
      policyDefinitionHash: SHADOW_POLICY_DEFINITION_HASH,
      expectedGameIds: sortIds(expected),
      counts,
      snapshots: [],
      run: null,
      confirmationValid: true,
      previewTimestampWillNotBecomeCommitTimestamp: true,
    };
    const execution = emptyExecution({
      commitSucceeded: true,
      transactionalIdempotentNoOp: true,
      insertedRunId: existing.run.id,
      insertedSnapshotCount: 0,
      verificationOk: true,
    });
    const report = buildReport(plan, execution, 'complete_valid_noop');
    report.games = existing.snapshots.map((s) => ({
      gameId: s.gameId,
      predictionStatus: s.predictionStatus as ShadowPredictionStatus,
      unavailableReasons: [],
      selectedSide: null,
      qualificationStatus: (s.qualificationStatus as ShadowQualificationStatus) ?? null,
      isSuperTierA: null,
      v4ComparisonStatus: (s.v4ComparisonStatus as ShadowV4ComparisonStatus) ??
        'PROVENANCE_UNAVAILABLE',
      hybridConflictType: null,
    }));
    return { plan, execution, report };
  }

  let mutationsInvoked = false;
  let insertedRunId: string | null = null;
  let insertedSnapshotCount = 0;
  let planned: ShadowCapturePlan | null = null;

  try {
    const txResult = await input.adapter.runTransaction(async (tx) => {
      const again = await tx.findCohort();
      if (again) {
        throw new Error('cohort_exists_inside_transaction');
      }
      const frame = await tx.loadFrame();
      const commitTimestamp = tx.now();
      const plan = planShadowCaptureRun({
        season: input.season,
        week: input.week,
        mode: 'COMMIT',
        captureContext: input.captureContext,
        confirmation: input.confirmation,
        repoCommitSha: input.repoCommitSha,
        predictionTimestamp: commitTimestamp,
        frame,
        createId: input.adapter.createId,
      });
      planned = plan;
      if (!plan.ok || !plan.run) {
        throw new Error(`commit_plan_invalid: ${plan.writeBlockers.join('; ')}`);
      }
      mutationsInvoked = true;
      await tx.createRun(plan.run);
      insertedRunId = plan.run.id;
      insertedSnapshotCount = await tx.createPredictionSnapshots(plan.snapshots);
      const counted = await tx.countPredictions(plan.run.id);
      if (counted !== plan.snapshots.length || insertedSnapshotCount !== plan.snapshots.length) {
        throw new Error('in_transaction_snapshot_count_mismatch');
      }
      return plan;
    });
    planned = txResult;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const plan =
      planned ??
      planShadowCaptureRun({
        season: input.season,
        week: input.week,
        mode: 'COMMIT',
        captureContext: input.captureContext,
        confirmation: input.confirmation,
        repoCommitSha: input.repoCommitSha,
        predictionTimestamp: input.adapter.now(),
        frame: { games: [], ratings: [], unitGrades: [], marketLines: [], v4Bets: [] },
        createId: input.adapter.createId,
      });
    const execution = emptyExecution({
      mutationsInvoked,
      rolledBack: true,
      error: msg,
      insertedRunId,
      insertedSnapshotCount,
    });
    return { plan, execution, report: buildReport(plan, execution, 'none') };
  }

  const plan = planned as ShadowCapturePlan;
  const readBack = insertedRunId ? await input.adapter.readRun(insertedRunId) : null;
  const closingCount = await input.adapter.countClosingSnapshots();
  const evaluationCount = await input.adapter.countEvaluationResults();
  const verificationReasons: string[] = [];
  if (!readBack) verificationReasons.push('committed_run_not_readable');
  else verificationReasons.push(...verifyCommittedCohort(readBack, plan));
  if (closingCount !== 0) verificationReasons.push('closing_snapshots_created');
  if (evaluationCount !== 0) verificationReasons.push('evaluation_rows_created');

  const verificationOk = verificationReasons.length === 0;
  const execution = emptyExecution({
    mutationsInvoked: true,
    commitSucceeded: verificationOk,
    persistenceCommitted: true,
    insertedRunId,
    insertedSnapshotCount,
    verificationOk,
    verificationReasons,
    error: verificationOk ? null : verificationReasons.join('; '),
  });
  return { plan, execution, report: buildReport(plan, execution, 'none') };
}

export function resolvePreviewExitCode(writeSafe: boolean): number {
  return writeSafe ? 0 : 1;
}
