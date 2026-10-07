/**
 * ML-CAL-1 Capture V1 — pure evidence planner + artifact helpers.
 *
 * Read-only artifact capture for prospective Core V1 moneyline calibration.
 * Does NOT write bets/ratings/markets, call providers, read scores/outcomes,
 * or freeze the draft evaluation protocol (PR 243 remains draft).
 *
 * Timing rule (frozen for adapters):
 *   predictionReferenceTime === captureEndTime (server clock at end of snapshot reads).
 *   Market evidence and known-at must be <= predictionReferenceTime.
 *   Available forecasts require captureEndTime <= kickoff - 30 minutes.
 *   Do not substitute captureStartTime for publication/as-of checks.
 */

import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { computeEffectiveHfa } from '../../web/lib/core-v1-spread';
import hfaConfigJson from '../../web/lib/data/core_v1_hfa_config.json';
import {
  HARD_MIN_ML_VALUE,
  ML_MAX_ABS_SPREAD,
  modelWinProbsFromCoreSpreadHma,
  selectCoreV1MoneylinePick,
  type CoreV1MoneylinePick,
} from '../../web/lib/core-v1-moneyline';
import { americanToProb } from '../../web/lib/market-line-helpers';
import {
  selectGameMarketSnapshots,
  type MarketLineObservation,
} from '../../web/lib/market-line-snapshot';

export const ML_CAL_1_CAPTURE_SCHEMA_VERSION = 'ml-cal-1-capture-artifact-v1';
export const ML_CAL_1_CAPTURE_PRODUCER_VERSION = 'ml-cal-1-capture-v1.0.0';
export const ML_CAL_1_SUPPORTED_SEASON = 2026;
export const ML_CAL_1_MODEL_VERSION = 'v1';
export const ML_CAL_1_LIVE_ODDS_SOURCE = 'oddsapi';
export const ML_CAL_1_MAX_MARKET_AGE_SECONDS = 1800;
export const ML_CAL_1_MIN_PRE_KICKOFF_MS = 30 * 60 * 1000;
export const ML_CAL_1_LIFECYCLE_POLICY = 'GLOBAL_BLEND_W3_W6';
export const ML_CAL_1_FULL_WEIGHT = 1;

/** Forbidden Game select fields — scores/outcomes must never be projected. */
export const ML_CAL_1_FORBIDDEN_GAME_FIELDS = [
  'homeScore',
  'awayScore',
  'home_score',
  'away_score',
] as const;

export const ML_CAL_1_FORBIDDEN_MODELS = [
  'bet',
  'teamGameStat',
  'teamGameStats',
  'matchupOutput',
] as const;

export type MlCal1CaptureStatus =
  | 'EVIDENCE_CAPTURED'
  | 'PRIMARY_READINESS_BLOCKED'
  | 'INFRASTRUCTURE_ERROR';

export type MlCal1DecimalLike = { toString(): string } | number | string | null | undefined;

export interface MlCal1RawRatingRow {
  season: number;
  teamId: string;
  modelVersion: string;
  powerRating: MlCal1DecimalLike;
  rating: MlCal1DecimalLike;
  games: number;
  dataSource: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface MlCal1ExportedRatingInput {
  season: number;
  teamId: string;
  modelVersion: string;
  powerRatingRaw: string | null;
  ratingRaw: string | null;
  chosenField: 'powerRating' | 'rating' | 'default_zero';
  valueUsed: number | null;
  games: number;
  dataSource: string | null;
  createdAt: string;
  updatedAt: string;
  rowContentHash: string;
  unavailableReasons: string[];
}

export interface MlCal1HfaBreakdown {
  homeTeamId: string;
  neutralSite: boolean;
  hfaConfigHash: string;
  baseHfa: number;
  teamAdjustment: number;
  rawHfa: number;
  clipMin: number;
  clipMax: number;
  effectiveHfa: number;
}

export interface MlCal1GameMeta {
  gameId: string;
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoffAsKnown: Date | string;
  neutralSite: boolean;
  status?: string | null;
}

export interface MlCal1MarketLineCandidate {
  id: string;
  gameId: string;
  lineType: string;
  lineValue: number;
  bookName: string;
  timestamp: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
  teamId: string | null;
  source: string | null;
  season?: number;
  week?: number;
}

export interface MlCal1LifecycleReceipt {
  sourceSha: string;
  completedThroughWeek: number;
  selectedPolicy: string;
  canonicalWeight: number;
  receiptDigest: string;
  /** SHA-256 of canonical exported rating readback identity used at lifecycle write. */
  ratingFingerprint: string;
  acceptedImmutable: boolean;
}

export interface MlCal1UniverseRow {
  gameId: string;
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoffAsKnown: string;
  neutralSite: boolean;
  bothFbs: boolean;
  membershipReasons: string[];
  tracked: boolean;
  exclusionReasons: string[];
}

export interface MlCal1ForecastRow {
  gameId: string;
  predictionTime: string;
  kickoffAsKnown: string;
  homeTeamId: string;
  awayTeamId: string;
  neutralSite: boolean;
  forecastAvailable: boolean;
  unavailableReasons: string[];
  lateCapture: boolean;
  coreSpreadHma: number | null;
  modelHomeWinProb: number | null;
  modelAwayWinProb: number | null;
  absSpreadWithinGate: boolean | null;
  inGateForecast: boolean;
  ratingDiff: number | null;
  hfa: MlCal1HfaBreakdown | null;
  homeRatingInput: MlCal1ExportedRatingInput | null;
  awayRatingInput: MlCal1ExportedRatingInput | null;
  selectionStatus:
    | 'SELECTED'
    | 'NO_SELECTION'
    | 'LARGE_SPREAD_SUPPRESSED'
    | 'MARKET_UNAVAILABLE'
    | 'FORECAST_UNAVAILABLE';
  selection: CoreV1MoneylinePick | null;
  selectionReasons: string[];
  primaryEligibleCandidate: boolean;
  primaryEligibilityReasons: string[];
  modelOnlyEligible: boolean;
}

export interface MlCal1PairedMarketEvidence {
  gameId: string;
  available: boolean;
  rejectionReasons: string[];
  observationAgeSeconds: number | null;
  bookName: string | null;
  source: string | null;
  observationTimestamp: string | null;
  homeRowId: string | null;
  awayRowId: string | null;
  homePrice: number | null;
  awayPrice: number | null;
  homeCreatedAt: string | null;
  awayCreatedAt: string | null;
  homeUpdatedAt: string | null;
  awayUpdatedAt: string | null;
  rawImpliedHome: number | null;
  rawImpliedAway: number | null;
  overround: number | null;
  deVigHome: number | null;
  deVigAway: number | null;
}

export interface MlCal1SpreadMarketEvidence {
  gameId: string;
  available: boolean;
  rejectionReasons: string[];
  observationAgeSeconds: number | null;
  bookName: string | null;
  source: string | null;
  observationTimestamp: string | null;
  homeRowId: string | null;
  awayRowId: string | null;
  homeLine: number | null;
  awayLine: number | null;
  marketSpreadHma: number | null;
}

export interface MlCal1CaptureEnvelope {
  schemaVersion: typeof ML_CAL_1_CAPTURE_SCHEMA_VERSION;
  producerVersion: typeof ML_CAL_1_CAPTURE_PRODUCER_VERSION;
  captureId: string;
  season: number;
  week: number;
  repositorySha: string;
  captureStartTime: string;
  captureEndTime: string;
  predictionReferenceTime: string;
  status: MlCal1CaptureStatus;
  primaryReadinessBlocked: boolean;
  primaryBlockReasons: string[];
  providerCalls: 0;
  businessDataWrites: 0;
  dependencyHashes: Record<string, string>;
  timingRule: {
    predictionReferenceTimeEquals: 'captureEndTime';
    marketAsOfUses: 'predictionReferenceTime';
    minPreKickoffMs: typeof ML_CAL_1_MIN_PRE_KICKOFF_MS;
    maxMarketAgeSecondsInclusive: typeof ML_CAL_1_MAX_MARKET_AGE_SECONDS;
  };
  lifecycleQualification: {
    qualified: boolean;
    reasons: string[];
    receipt: MlCal1LifecycleReceipt | null;
    expectedRatingFingerprint: string | null;
  };
  counts: {
    universeGames: number;
    trackedGames: number;
    availableForecasts: number;
    inGateForecasts: number;
    pairedMarkets: number;
    missingMarkets: number;
    selectedBets: number;
    noSelection: number;
    primaryEligibleCandidates: number;
    modelOnlyEligible: number;
  };
}

export interface MlCal1ArtifactBundle {
  envelope: MlCal1CaptureEnvelope;
  universe: {
    rows: MlCal1UniverseRow[];
    duplicateOrConflictReasons: string[];
  };
  inputs: {
    hfaConfigHash: string;
    ratingsByTeamId: Record<string, MlCal1ExportedRatingInput>;
    ratingFingerprint: string;
  };
  forecasts: { rows: MlCal1ForecastRow[] };
  markets: {
    moneyline: MlCal1PairedMarketEvidence[];
    spread: MlCal1SpreadMarketEvidence[];
    candidateRejectionLedger: Array<{
      gameId: string;
      rowId: string;
      reasons: string[];
    }>;
  };
}

export interface MlCal1FixtureInput {
  captureId: string;
  season: number;
  week: number;
  repositorySha: string;
  captureStartTime: string;
  captureEndTime: string;
  games: MlCal1GameMeta[];
  fbsTeamIds: string[];
  ratings: MlCal1RawRatingRow[];
  marketLines: MlCal1MarketLineCandidate[];
  lifecycleReceipt: MlCal1LifecycleReceipt | null;
}

export interface MlCal1PlanResult {
  status: MlCal1CaptureStatus;
  primaryReadinessBlocked: boolean;
  primaryBlockReasons: string[];
  bundle: MlCal1ArtifactBundle;
}

function toIso(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) {
    throw new Error(`invalid_timestamp:${String(value)}`);
  }
  return d.toISOString();
}

function toMs(value: Date | string): number {
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) {
    throw new Error(`invalid_timestamp:${String(value)}`);
  }
  return d.getTime();
}

export function sha256Utf8Bytes(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const rec = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(rec).sort()) {
    const v = rec[key];
    if (v === undefined) continue;
    out[key] = canonicalize(v);
  }
  return out;
}

export function sha256Canonical(value: unknown): string {
  return sha256Utf8Bytes(stableStringify(value));
}

export function hashFileUtf8(filePath: string): string {
  return sha256Utf8Bytes(fs.readFileSync(filePath));
}

export function getActiveHfaConfigHash(): string {
  return sha256Canonical(hfaConfigJson);
}

/**
 * Preserve production field precedence from the official Core V1 spread helper:
 *   Number(powerRating || rating || 0)
 * Truthiness is evaluated on the Decimal/object BEFORE Number().
 * Prisma Decimal(0) objects are truthy; numeric 0 / null are falsy.
 * This capture path never invokes the Prisma-backed team spread helper.
 */
export function chooseRatingField(row: {
  powerRating: MlCal1DecimalLike;
  rating: MlCal1DecimalLike;
}): {
  chosenField: 'powerRating' | 'rating' | 'default_zero';
  raw: MlCal1DecimalLike;
  value: number | null;
  reasons: string[];
} {
  const reasons: string[] = [];

  let chosenField: 'powerRating' | 'rating' | 'default_zero';
  let selectedRaw: MlCal1DecimalLike;

  if (row.powerRating) {
    chosenField = 'powerRating';
    selectedRaw = row.powerRating;
  } else if (row.rating) {
    chosenField = 'rating';
    selectedRaw = row.rating;
  } else {
    // Mirrors `|| 0` when both operands are falsy (null/undefined/0/'').
    chosenField = 'default_zero';
    selectedRaw = 0;
    if (row.powerRating == null && row.rating == null) {
      reasons.push('missing_rating_fields');
    } else {
      reasons.push('falsy_rating_fields_defaulted_zero');
    }
  }

  const value = Number(selectedRaw);
  if (!Number.isFinite(value)) {
    reasons.push('nonfinite_rating_value');
    return { chosenField, raw: selectedRaw, value: null, reasons };
  }

  return { chosenField, raw: selectedRaw, value, reasons };
}

function decimalToRawString(value: MlCal1DecimalLike): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'object' && value !== null && 'toString' in value) {
    return value.toString();
  }
  return String(value);
}

export function exportRatingInput(row: MlCal1RawRatingRow): MlCal1ExportedRatingInput {
  const unavailableReasons: string[] = [];
  if (row.modelVersion !== ML_CAL_1_MODEL_VERSION) {
    unavailableReasons.push('incorrect_model_version');
  }
  const chosen = chooseRatingField(row);
  unavailableReasons.push(...chosen.reasons);

  const powerRatingRaw = decimalToRawString(row.powerRating);
  const ratingRaw = decimalToRawString(row.rating);
  const createdAt = toIso(row.createdAt);
  const updatedAt = toIso(row.updatedAt);

  const base = {
    season: row.season,
    teamId: row.teamId,
    modelVersion: row.modelVersion,
    powerRatingRaw,
    ratingRaw,
    chosenField: chosen.chosenField,
    valueUsed: chosen.value,
    games: row.games,
    dataSource: row.dataSource,
    createdAt,
    updatedAt,
  };

  const rowContentHash = sha256Canonical(base);
  return {
    ...base,
    rowContentHash,
    unavailableReasons,
  };
}

export function computeDirectV1Margin(options: {
  homeValue: number;
  awayValue: number;
  homeTeamId: string;
  neutralSite: boolean;
}): {
  ratingDiff: number;
  coreSpreadHma: number;
  hfa: MlCal1HfaBreakdown;
} {
  const hfaInfo = computeEffectiveHfa(options.homeTeamId, options.neutralSite);
  const clipRange = (hfaConfigJson as { clipRange: number[] }).clipRange;
  const hfa: MlCal1HfaBreakdown = {
    homeTeamId: options.homeTeamId,
    neutralSite: options.neutralSite,
    hfaConfigHash: getActiveHfaConfigHash(),
    baseHfa: hfaInfo.baseHfa,
    teamAdjustment: hfaInfo.teamAdjustment,
    rawHfa: hfaInfo.rawHfa,
    clipMin: clipRange[0],
    clipMax: clipRange[1],
    effectiveHfa: hfaInfo.effectiveHfa,
  };
  const ratingDiff = options.homeValue - options.awayValue;
  return {
    ratingDiff,
    coreSpreadHma: ratingDiff + hfa.effectiveHfa,
    hfa,
  };
}

export function buildRatingFingerprint(
  ratingsByTeamId: Record<string, MlCal1ExportedRatingInput>
): string {
  const entries = Object.keys(ratingsByTeamId)
    .sort()
    .map((teamId) => {
      const r = ratingsByTeamId[teamId];
      return {
        season: r.season,
        teamId: r.teamId,
        modelVersion: r.modelVersion,
        valueUsed: r.valueUsed,
        chosenField: r.chosenField,
        games: r.games,
        dataSource: r.dataSource,
        rowContentHash: r.rowContentHash,
      };
    });
  return sha256Canonical(entries);
}

export function qualifyLifecycleReceipt(options: {
  receipt: MlCal1LifecycleReceipt | null;
  expectedRatingFingerprint: string;
  repositorySha: string;
}): { qualified: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!options.receipt) {
    return { qualified: false, reasons: ['lifecycle_receipt_missing'] };
  }
  const r = options.receipt;
  if (!r.acceptedImmutable) {
    reasons.push('lifecycle_receipt_not_accepted_immutable');
  }
  if (r.selectedPolicy !== ML_CAL_1_LIFECYCLE_POLICY) {
    reasons.push('lifecycle_policy_mismatch');
  }
  if (r.canonicalWeight !== ML_CAL_1_FULL_WEIGHT) {
    reasons.push('lifecycle_weight_not_full');
  }
  if (r.sourceSha !== options.repositorySha) {
    reasons.push('lifecycle_source_sha_mismatch');
  }
  if (r.ratingFingerprint !== options.expectedRatingFingerprint) {
    reasons.push('lifecycle_rating_fingerprint_mismatch');
  }
  if (!r.receiptDigest || !/^[0-9a-f]{64}$/i.test(r.receiptDigest)) {
    reasons.push('lifecycle_receipt_digest_invalid');
  }
  if (!Number.isInteger(r.completedThroughWeek) || r.completedThroughWeek < 0) {
    reasons.push('lifecycle_completed_through_week_invalid');
  }
  return { qualified: reasons.length === 0, reasons };
}

function validateMarketCandidate(
  row: MlCal1MarketLineCandidate,
  predictionReferenceTime: Date | string,
  expectedGameId: string
): string[] {
  const reasons: string[] = [];
  if (row.gameId !== expectedGameId) reasons.push('game_id_mismatch');
  if (row.source !== ML_CAL_1_LIVE_ODDS_SOURCE) reasons.push('source_mismatch');

  const obsMs = toMs(row.timestamp);
  const knownAtMs = toMs(row.createdAt);
  const updatedMs = toMs(row.updatedAt);
  const refMs = toMs(predictionReferenceTime);

  if (obsMs > refMs) reasons.push('observation_timestamp_after_reference');
  if (knownAtMs > refMs) reasons.push('known_at_after_reference');
  if (updatedMs > refMs) {
    // Post-reference revision without accepted immutable capture-time proof.
    reasons.push('updated_at_after_reference_without_immutable_proof');
  }
  if (obsMs < 0 || knownAtMs < 0) reasons.push('invalid_timestamp');

  const ageSec = (refMs - obsMs) / 1000;
  if (ageSec < 0) reasons.push('negative_observation_age');
  if (ageSec > ML_CAL_1_MAX_MARKET_AGE_SECONDS) reasons.push('observation_stale_above_1800s');

  if (!Number.isFinite(row.lineValue) || row.lineValue === 0) {
    reasons.push('invalid_or_zero_price');
  }
  return reasons;
}

export function selectAsOfMoneylineEvidence(options: {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  predictionReferenceTime: Date | string;
  candidates: MlCal1MarketLineCandidate[];
}): {
  evidence: MlCal1PairedMarketEvidence;
  rejectionLedger: Array<{ gameId: string; rowId: string; reasons: string[] }>;
} {
  const rejectionLedger: Array<{ gameId: string; rowId: string; reasons: string[] }> = [];
  const eligible: MlCal1MarketLineCandidate[] = [];

  for (const row of options.candidates) {
    if (row.gameId !== options.gameId) continue;
    if (row.lineType !== 'moneyline') continue;
    const reasons = validateMarketCandidate(
      row,
      options.predictionReferenceTime,
      options.gameId
    );
    if (reasons.length > 0) {
      rejectionLedger.push({ gameId: options.gameId, rowId: row.id, reasons });
      continue;
    }
    eligible.push(row);
  }

  // Ambiguity: same book+timestamp+team with multiple rows after filters.
  const frameKeys = new Map<string, string[]>();
  for (const row of eligible) {
    const key = `${row.bookName}|${toIso(row.timestamp)}|${row.teamId ?? ''}|${row.source}`;
    if (!frameKeys.has(key)) frameKeys.set(key, []);
    frameKeys.get(key)!.push(row.id);
  }
  for (const [key, ids] of Array.from(frameKeys.entries())) {
    if (ids.length > 1) {
      for (const id of ids) {
        rejectionLedger.push({
          gameId: options.gameId,
          rowId: id,
          reasons: [`ambiguous_same_frame:${key}`],
        });
      }
    }
  }
  const ambiguousIds = new Set(
    Array.from(frameKeys.values())
      .filter((ids) => ids.length > 1)
      .flat()
  );
  const clean = eligible.filter((r) => !ambiguousIds.has(r.id));

  const observations: MarketLineObservation[] = clean.map((r) => ({
    id: r.id,
    gameId: r.gameId,
    lineType: r.lineType,
    lineValue: r.lineValue,
    bookName: r.bookName,
    timestamp: r.timestamp,
    teamId: r.teamId,
    source: r.source,
  }));

  const selection = selectGameMarketSnapshots({
    rows: observations,
    homeTeamId: options.homeTeamId,
    awayTeamId: options.awayTeamId,
    mode: 'current',
  });

  const display = selection.displayMoneyline;
  if (!display) {
    const reasons = ['no_coherent_moneyline_pair'];
    if (selection.incoherentMoneylines.length > 0) {
      reasons.push(
        ...selection.incoherentMoneylines.map((x) => `incoherent:${x.reason}`)
      );
    }
    return {
      evidence: {
        gameId: options.gameId,
        available: false,
        rejectionReasons: reasons,
        observationAgeSeconds: null,
        bookName: null,
        source: null,
        observationTimestamp: null,
        homeRowId: null,
        awayRowId: null,
        homePrice: null,
        awayPrice: null,
        homeCreatedAt: null,
        awayCreatedAt: null,
        homeUpdatedAt: null,
        awayUpdatedAt: null,
        rawImpliedHome: null,
        rawImpliedAway: null,
        overround: null,
        deVigHome: null,
        deVigAway: null,
      },
      rejectionLedger,
    };
  }

  // Require same provider/source on both selected rows.
  const homeRow = clean.find((r) => r.id === display.homeRowId);
  const awayRow = clean.find((r) => r.id === display.awayRowId);
  if (!homeRow || !awayRow) {
    return {
      evidence: {
        gameId: options.gameId,
        available: false,
        rejectionReasons: ['selected_pair_rows_missing_from_eligible_set'],
        observationAgeSeconds: null,
        bookName: display.bookName,
        source: null,
        observationTimestamp: display.timestamp,
        homeRowId: display.homeRowId,
        awayRowId: display.awayRowId,
        homePrice: display.homePrice,
        awayPrice: display.awayPrice,
        homeCreatedAt: null,
        awayCreatedAt: null,
        homeUpdatedAt: null,
        awayUpdatedAt: null,
        rawImpliedHome: null,
        rawImpliedAway: null,
        overround: null,
        deVigHome: null,
        deVigAway: null,
      },
      rejectionLedger,
    };
  }

  if (homeRow.source !== awayRow.source || homeRow.source !== ML_CAL_1_LIVE_ODDS_SOURCE) {
    return {
      evidence: {
        gameId: options.gameId,
        available: false,
        rejectionReasons: ['provider_or_source_mismatch_on_pair'],
        observationAgeSeconds: null,
        bookName: display.bookName,
        source: homeRow.source,
        observationTimestamp: display.timestamp,
        homeRowId: display.homeRowId,
        awayRowId: display.awayRowId,
        homePrice: display.homePrice,
        awayPrice: display.awayPrice,
        homeCreatedAt: toIso(homeRow.createdAt),
        awayCreatedAt: toIso(awayRow.createdAt),
        homeUpdatedAt: toIso(homeRow.updatedAt),
        awayUpdatedAt: toIso(awayRow.updatedAt),
        rawImpliedHome: null,
        rawImpliedAway: null,
        overround: null,
        deVigHome: null,
        deVigAway: null,
      },
      rejectionLedger,
    };
  }

  if (homeRow.teamId !== options.homeTeamId || awayRow.teamId !== options.awayTeamId) {
    return {
      evidence: {
        gameId: options.gameId,
        available: false,
        rejectionReasons: ['team_orientation_mismatch'],
        observationAgeSeconds: null,
        bookName: display.bookName,
        source: homeRow.source,
        observationTimestamp: display.timestamp,
        homeRowId: display.homeRowId,
        awayRowId: display.awayRowId,
        homePrice: display.homePrice,
        awayPrice: display.awayPrice,
        homeCreatedAt: toIso(homeRow.createdAt),
        awayCreatedAt: toIso(awayRow.createdAt),
        homeUpdatedAt: toIso(homeRow.updatedAt),
        awayUpdatedAt: toIso(awayRow.updatedAt),
        rawImpliedHome: null,
        rawImpliedAway: null,
        overround: null,
        deVigHome: null,
        deVigAway: null,
      },
      rejectionLedger,
    };
  }

  const ageSec =
    (toMs(options.predictionReferenceTime) - toMs(display.timestamp)) / 1000;
  const rawImpliedHome = americanToProb(display.homePrice);
  const rawImpliedAway = americanToProb(display.awayPrice);
  if (rawImpliedHome == null || rawImpliedAway == null) {
    return {
      evidence: {
        gameId: options.gameId,
        available: false,
        rejectionReasons: ['implied_probability_null'],
        observationAgeSeconds: ageSec,
        bookName: display.bookName,
        source: homeRow.source,
        observationTimestamp: display.timestamp,
        homeRowId: display.homeRowId,
        awayRowId: display.awayRowId,
        homePrice: display.homePrice,
        awayPrice: display.awayPrice,
        homeCreatedAt: toIso(homeRow.createdAt),
        awayCreatedAt: toIso(awayRow.createdAt),
        homeUpdatedAt: toIso(homeRow.updatedAt),
        awayUpdatedAt: toIso(awayRow.updatedAt),
        rawImpliedHome,
        rawImpliedAway,
        overround: null,
        deVigHome: null,
        deVigAway: null,
      },
      rejectionLedger,
    };
  }

  const overround = rawImpliedHome + rawImpliedAway - 1;
  const sum = rawImpliedHome + rawImpliedAway;
  const deVigHome = sum > 0 ? rawImpliedHome / sum : null;
  const deVigAway = sum > 0 ? rawImpliedAway / sum : null;

  return {
    evidence: {
      gameId: options.gameId,
      available: true,
      rejectionReasons: [],
      observationAgeSeconds: ageSec,
      bookName: display.bookName,
      source: homeRow.source,
      observationTimestamp: display.timestamp,
      homeRowId: display.homeRowId,
      awayRowId: display.awayRowId,
      homePrice: display.homePrice,
      awayPrice: display.awayPrice,
      homeCreatedAt: toIso(homeRow.createdAt),
      awayCreatedAt: toIso(awayRow.createdAt),
      homeUpdatedAt: toIso(homeRow.updatedAt),
      awayUpdatedAt: toIso(awayRow.updatedAt),
      rawImpliedHome,
      rawImpliedAway,
      overround,
      deVigHome,
      deVigAway,
    },
    rejectionLedger,
  };
}

export function selectAsOfSpreadEvidence(options: {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  predictionReferenceTime: Date | string;
  candidates: MlCal1MarketLineCandidate[];
}): MlCal1SpreadMarketEvidence {
  const eligible: MlCal1MarketLineCandidate[] = [];
  const rejectionReasons: string[] = [];

  for (const row of options.candidates) {
    if (row.gameId !== options.gameId || row.lineType !== 'spread') continue;
    const reasons = validateMarketCandidate(
      row,
      options.predictionReferenceTime,
      options.gameId
    ).filter((r) => r !== 'invalid_or_zero_price'); // spreads may be 0
    // Re-validate finite (0 allowed for pick'em)
    if (!Number.isFinite(row.lineValue)) {
      reasons.push('invalid_spread_value');
    }
    if (reasons.length > 0) {
      rejectionReasons.push(...reasons.map((r) => `${row.id}:${r}`));
      continue;
    }
    eligible.push(row);
  }

  const observations: MarketLineObservation[] = eligible.map((r) => ({
    id: r.id,
    gameId: r.gameId,
    lineType: r.lineType,
    lineValue: r.lineValue,
    bookName: r.bookName,
    timestamp: r.timestamp,
    teamId: r.teamId,
    source: r.source,
  }));

  const selection = selectGameMarketSnapshots({
    rows: observations,
    homeTeamId: options.homeTeamId,
    awayTeamId: options.awayTeamId,
    mode: 'current',
  });

  const display = selection.displaySpread;
  if (!display) {
    return {
      gameId: options.gameId,
      available: false,
      rejectionReasons:
        rejectionReasons.length > 0
          ? rejectionReasons
          : ['no_coherent_spread_pair'],
      observationAgeSeconds: null,
      bookName: null,
      source: null,
      observationTimestamp: null,
      homeRowId: null,
      awayRowId: null,
      homeLine: null,
      awayLine: null,
      marketSpreadHma: null,
    };
  }

  const homeRow = eligible.find((r) => r.id === display.homeRowId);
  const ageSec =
    (toMs(options.predictionReferenceTime) - toMs(display.timestamp)) / 1000;

  return {
    gameId: options.gameId,
    available: true,
    rejectionReasons: [],
    observationAgeSeconds: ageSec,
    bookName: display.bookName,
    source: homeRow?.source ?? null,
    observationTimestamp: display.timestamp,
    homeRowId: display.homeRowId,
    awayRowId: display.awayRowId,
    homeLine: display.homeLine,
    awayLine: display.awayLine,
    marketSpreadHma: display.marketSpreadHma,
  };
}

export function buildUniverse(options: {
  games: MlCal1GameMeta[];
  fbsTeamIds: Set<string>;
  predictionReferenceTime: Date | string;
}): {
  rows: MlCal1UniverseRow[];
  duplicateOrConflictReasons: string[];
} {
  const duplicateOrConflictReasons: string[] = [];
  const seen = new Map<string, MlCal1GameMeta>();
  const orientationKeys = new Map<string, string[]>();

  for (const g of options.games) {
    if (seen.has(g.gameId)) {
      duplicateOrConflictReasons.push(`duplicate_game_id:${g.gameId}`);
    }
    seen.set(g.gameId, g);
    const orient = [g.homeTeamId, g.awayTeamId].sort().join('|');
    if (!orientationKeys.has(orient)) orientationKeys.set(orient, []);
    orientationKeys.get(orient)!.push(g.gameId);
  }

  for (const [orient, ids] of Array.from(orientationKeys.entries())) {
    if (ids.length > 1) {
      duplicateOrConflictReasons.push(
        `conflicting_or_duplicate_matchup_frame:${orient}:${ids.join(',')}`
      );
    }
  }

  const refMs = toMs(options.predictionReferenceTime);
  const rows: MlCal1UniverseRow[] = options.games.map((g) => {
    const membershipReasons: string[] = [];
    const homeFbs = options.fbsTeamIds.has(g.homeTeamId);
    const awayFbs = options.fbsTeamIds.has(g.awayTeamId);
    if (!homeFbs) membershipReasons.push('home_not_fbs');
    if (!awayFbs) membershipReasons.push('away_not_fbs');
    const bothFbs = homeFbs && awayFbs;

    const exclusionReasons: string[] = [];
    const kickMs = toMs(g.kickoffAsKnown);
    if (kickMs <= refMs) {
      exclusionReasons.push('kickoff_at_or_before_prediction_reference');
    }
    if (!bothFbs) {
      exclusionReasons.push('non_fbs_matchup');
    }

    const tracked = bothFbs; // ledger keeps all; tracked marks FBS/FBS primary universe membership
    return {
      gameId: g.gameId,
      season: g.season,
      week: g.week,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      homeTeamName: g.homeTeamName,
      awayTeamName: g.awayTeamName,
      kickoffAsKnown: toIso(g.kickoffAsKnown),
      neutralSite: g.neutralSite,
      bothFbs,
      membershipReasons,
      tracked,
      exclusionReasons,
    };
  });

  return { rows, duplicateOrConflictReasons };
}

export function planMlCal1Capture(input: MlCal1FixtureInput): MlCal1PlanResult {
  const primaryBlockReasons: string[] = [];

  if (input.season !== ML_CAL_1_SUPPORTED_SEASON) {
    throw new Error(`unsupported_season:${input.season}`);
  }
  if (!Number.isInteger(input.week) || input.week < 1) {
    throw new Error(`invalid_week:${input.week}`);
  }

  const predictionReferenceTime = toIso(input.captureEndTime);
  // Reject forged backdated production clocks relative to start.
  if (toMs(input.captureEndTime) < toMs(input.captureStartTime)) {
    throw new Error('capture_end_before_start');
  }

  const fbsSet = new Set(input.fbsTeamIds);
  const universe = buildUniverse({
    games: input.games,
    fbsTeamIds: fbsSet,
    predictionReferenceTime,
  });
  if (universe.duplicateOrConflictReasons.length > 0) {
    primaryBlockReasons.push(...universe.duplicateOrConflictReasons);
  }

  // Index ratings; detect duplicates for same composite key.
  const ratingsByKey = new Map<string, MlCal1RawRatingRow[]>();
  for (const r of input.ratings) {
    const key = `${r.season}|${r.teamId}|${r.modelVersion}`;
    if (!ratingsByKey.has(key)) ratingsByKey.set(key, []);
    ratingsByKey.get(key)!.push(r);
  }
  for (const [key, rows] of Array.from(ratingsByKey.entries())) {
    if (rows.length > 1) {
      primaryBlockReasons.push(`duplicate_rating_rows:${key}`);
    }
  }

  const ratingsByTeamId: Record<string, MlCal1ExportedRatingInput> = {};
  for (const r of input.ratings) {
    if (r.modelVersion !== ML_CAL_1_MODEL_VERSION) continue;
    if (r.season !== input.season) continue;
    const exported = exportRatingInput(r);
    if (ratingsByTeamId[r.teamId]) {
      primaryBlockReasons.push(`duplicate_v1_rating_team:${r.teamId}`);
    }
    ratingsByTeamId[r.teamId] = exported;
  }

  const ratingFingerprint = buildRatingFingerprint(ratingsByTeamId);
  const lifecycle = qualifyLifecycleReceipt({
    receipt: input.lifecycleReceipt,
    expectedRatingFingerprint: ratingFingerprint,
    repositorySha: input.repositorySha,
  });
  if (!lifecycle.qualified) {
    primaryBlockReasons.push(...lifecycle.reasons.map((r) => `lifecycle:${r}`));
  }

  const marketsMl: MlCal1PairedMarketEvidence[] = [];
  const marketsSp: MlCal1SpreadMarketEvidence[] = [];
  const candidateRejectionLedger: Array<{
    gameId: string;
    rowId: string;
    reasons: string[];
  }> = [];
  const forecasts: MlCal1ForecastRow[] = [];

  for (const game of input.games) {
    const urow = universe.rows.find((r) => r.gameId === game.gameId)!;
    const homeRating = ratingsByTeamId[game.homeTeamId] ?? null;
    const awayRating = ratingsByTeamId[game.awayTeamId] ?? null;

    const unavailableReasons: string[] = [];
    if (!urow.bothFbs) unavailableReasons.push('non_fbs_matchup');
    if (!homeRating) unavailableReasons.push('missing_home_v1_rating');
    if (!awayRating) unavailableReasons.push('missing_away_v1_rating');
    if (homeRating?.unavailableReasons.length) {
      unavailableReasons.push(
        ...homeRating.unavailableReasons.map((r) => `home:${r}`)
      );
    }
    if (awayRating?.unavailableReasons.length) {
      unavailableReasons.push(
        ...awayRating.unavailableReasons.map((r) => `away:${r}`)
      );
    }
    if (
      homeRating?.valueUsed == null ||
      awayRating?.valueUsed == null ||
      !Number.isFinite(homeRating?.valueUsed as number) ||
      !Number.isFinite(awayRating?.valueUsed as number)
    ) {
      if (!unavailableReasons.includes('missing_home_v1_rating') &&
          !unavailableReasons.includes('missing_away_v1_rating')) {
        unavailableReasons.push('nonfinite_or_null_rating_value');
      }
    }

    const kickMs = toMs(game.kickoffAsKnown);
    const endMs = toMs(predictionReferenceTime);
    const lateCapture = endMs > kickMs - ML_CAL_1_MIN_PRE_KICKOFF_MS;
    if (lateCapture) {
      unavailableReasons.push('capture_end_within_30m_of_kickoff_or_later');
    }
    if (endMs >= kickMs) {
      unavailableReasons.push('not_prospective_post_or_at_kickoff');
    }

    let coreSpreadHma: number | null = null;
    let ratingDiff: number | null = null;
    let hfa: MlCal1HfaBreakdown | null = null;
    let modelHomeWinProb: number | null = null;
    let modelAwayWinProb: number | null = null;
    let forecastAvailable = false;

    if (
      homeRating?.valueUsed != null &&
      awayRating?.valueUsed != null &&
      Number.isFinite(homeRating.valueUsed) &&
      Number.isFinite(awayRating.valueUsed) &&
      homeRating.modelVersion === ML_CAL_1_MODEL_VERSION &&
      awayRating.modelVersion === ML_CAL_1_MODEL_VERSION &&
      !lateCapture &&
      endMs < kickMs &&
      urow.bothFbs
    ) {
      const computed = computeDirectV1Margin({
        homeValue: homeRating.valueUsed,
        awayValue: awayRating.valueUsed,
        homeTeamId: game.homeTeamId,
        neutralSite: game.neutralSite,
      });
      coreSpreadHma = computed.coreSpreadHma;
      ratingDiff = computed.ratingDiff;
      hfa = computed.hfa;
      const probs = modelWinProbsFromCoreSpreadHma(coreSpreadHma);
      modelHomeWinProb = probs.modelHomeWinProb;
      modelAwayWinProb = probs.modelAwayWinProb;
      forecastAvailable = true;
    } else if (!forecastAvailable && unavailableReasons.length === 0) {
      unavailableReasons.push('forecast_inputs_incomplete');
    }

    const mlResult = selectAsOfMoneylineEvidence({
      gameId: game.gameId,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      predictionReferenceTime,
      candidates: input.marketLines,
    });
    marketsMl.push(mlResult.evidence);
    candidateRejectionLedger.push(...mlResult.rejectionLedger);

    marketsSp.push(
      selectAsOfSpreadEvidence({
        gameId: game.gameId,
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
        predictionReferenceTime,
        candidates: input.marketLines,
      })
    );

    const absWithin =
      coreSpreadHma != null ? Math.abs(coreSpreadHma) <= ML_MAX_ABS_SPREAD : null;
    const inGateForecast =
      forecastAvailable && absWithin === true && coreSpreadHma != null;

    const selectionReasons: string[] = [];
    let selectionStatus: MlCal1ForecastRow['selectionStatus'] = 'FORECAST_UNAVAILABLE';
    let selection: CoreV1MoneylinePick | null = null;

    if (!forecastAvailable || coreSpreadHma == null) {
      selectionStatus = 'FORECAST_UNAVAILABLE';
      selectionReasons.push(...unavailableReasons);
    } else if (Math.abs(coreSpreadHma) > ML_MAX_ABS_SPREAD) {
      selectionStatus = 'LARGE_SPREAD_SUPPRESSED';
      selectionReasons.push('abs_spread_above_24');
    } else if (!mlResult.evidence.available) {
      selectionStatus = 'MARKET_UNAVAILABLE';
      selectionReasons.push(...mlResult.evidence.rejectionReasons);
    } else {
      selection = selectCoreV1MoneylinePick({
        coreSpreadHma,
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
        homeTeamName: game.homeTeamName,
        awayTeamName: game.awayTeamName,
        homeAmericanPrice: mlResult.evidence.homePrice!,
        awayAmericanPrice: mlResult.evidence.awayPrice!,
      });
      if (selection) {
        selectionStatus = 'SELECTED';
      } else {
        selectionStatus = 'NO_SELECTION';
        selectionReasons.push('no_qualifying_value_or_gate');
      }
    }

    const primaryEligibilityReasons: string[] = [];
    if (!lifecycle.qualified) {
      primaryEligibilityReasons.push('lifecycle_not_qualified');
    }
    if (!forecastAvailable) {
      primaryEligibilityReasons.push('forecast_unavailable');
    }
    if (!inGateForecast) {
      primaryEligibilityReasons.push('not_in_gate');
    }
    if (!mlResult.evidence.available) {
      primaryEligibilityReasons.push('paired_market_unavailable');
    }
    if (universe.duplicateOrConflictReasons.length > 0) {
      primaryEligibilityReasons.push('universe_frame_conflict');
    }

    const primaryEligibleCandidate =
      lifecycle.qualified &&
      forecastAvailable &&
      inGateForecast &&
      mlResult.evidence.available &&
      universe.duplicateOrConflictReasons.length === 0;

    const modelOnlyEligible =
      forecastAvailable && inGateForecast && lifecycle.qualified;

    forecasts.push({
      gameId: game.gameId,
      predictionTime: predictionReferenceTime,
      kickoffAsKnown: toIso(game.kickoffAsKnown),
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      neutralSite: game.neutralSite,
      forecastAvailable,
      unavailableReasons,
      lateCapture,
      coreSpreadHma,
      modelHomeWinProb,
      modelAwayWinProb,
      absSpreadWithinGate: absWithin,
      inGateForecast,
      ratingDiff,
      hfa,
      homeRatingInput: homeRating,
      awayRatingInput: awayRating,
      selectionStatus,
      selection,
      selectionReasons,
      primaryEligibleCandidate,
      primaryEligibilityReasons,
      modelOnlyEligible,
    });
  }

  // Independent reproduction check: exported inputs → margins.
  for (const f of forecasts) {
    if (!f.forecastAvailable || f.coreSpreadHma == null) continue;
    if (f.homeRatingInput?.valueUsed == null || f.awayRatingInput?.valueUsed == null) {
      primaryBlockReasons.push(`input_reproduction_missing:${f.gameId}`);
      continue;
    }
    const repro = computeDirectV1Margin({
      homeValue: f.homeRatingInput.valueUsed,
      awayValue: f.awayRatingInput.valueUsed,
      homeTeamId: f.homeTeamId,
      neutralSite: f.neutralSite,
    });
    if (repro.coreSpreadHma !== f.coreSpreadHma) {
      primaryBlockReasons.push(`input_reproduction_mismatch:${f.gameId}`);
    }
  }

  const availableForecasts = forecasts.filter((f) => f.forecastAvailable).length;
  const inGateForecasts = forecasts.filter((f) => f.inGateForecast).length;
  const pairedMarkets = marketsMl.filter((m) => m.available).length;
  const missingMarkets = marketsMl.filter((m) => !m.available).length;
  const selectedBets = forecasts.filter((f) => f.selectionStatus === 'SELECTED').length;
  const noSelection = forecasts.filter((f) => f.selectionStatus === 'NO_SELECTION').length;
  const primaryEligibleCandidates = forecasts.filter(
    (f) => f.primaryEligibleCandidate
  ).length;
  const modelOnlyEligible = forecasts.filter((f) => f.modelOnlyEligible).length;

  // Capture success is evidence emission; primary readiness is separate.
  if (!lifecycle.qualified) {
    primaryBlockReasons.push('primary_blocked_lifecycle');
  }

  const uniqueBlocks = Array.from(new Set(primaryBlockReasons));
  const primaryReadinessBlocked = uniqueBlocks.length > 0;
  const status: MlCal1CaptureStatus = primaryReadinessBlocked
    ? 'PRIMARY_READINESS_BLOCKED'
    : 'EVIDENCE_CAPTURED';

  const envelope: MlCal1CaptureEnvelope = {
    schemaVersion: ML_CAL_1_CAPTURE_SCHEMA_VERSION,
    producerVersion: ML_CAL_1_CAPTURE_PRODUCER_VERSION,
    captureId: input.captureId,
    season: input.season,
    week: input.week,
    repositorySha: input.repositorySha,
    captureStartTime: toIso(input.captureStartTime),
    captureEndTime: toIso(input.captureEndTime),
    predictionReferenceTime,
    status,
    primaryReadinessBlocked,
    primaryBlockReasons: uniqueBlocks,
    providerCalls: 0,
    businessDataWrites: 0,
    dependencyHashes: {}, // filled by runner/tests with file hashes
    timingRule: {
      predictionReferenceTimeEquals: 'captureEndTime',
      marketAsOfUses: 'predictionReferenceTime',
      minPreKickoffMs: ML_CAL_1_MIN_PRE_KICKOFF_MS,
      maxMarketAgeSecondsInclusive: ML_CAL_1_MAX_MARKET_AGE_SECONDS,
    },
    lifecycleQualification: {
      qualified: lifecycle.qualified,
      reasons: lifecycle.reasons,
      receipt: input.lifecycleReceipt,
      expectedRatingFingerprint: ratingFingerprint,
    },
    counts: {
      universeGames: universe.rows.length,
      trackedGames: universe.rows.filter((r) => r.tracked).length,
      availableForecasts,
      inGateForecasts,
      pairedMarkets,
      missingMarkets,
      selectedBets,
      noSelection,
      primaryEligibleCandidates,
      modelOnlyEligible,
    },
  };

  return {
    status,
    primaryReadinessBlocked,
    primaryBlockReasons: uniqueBlocks,
    bundle: {
      envelope,
      universe: {
        rows: universe.rows,
        duplicateOrConflictReasons: universe.duplicateOrConflictReasons,
      },
      inputs: {
        hfaConfigHash: getActiveHfaConfigHash(),
        ratingsByTeamId,
        ratingFingerprint,
      },
      forecasts: { rows: forecasts },
      markets: {
        moneyline: marketsMl,
        spread: marketsSp,
        candidateRejectionLedger,
      },
    },
  };
}

export function buildArtifactMembers(bundle: MlCal1ArtifactBundle): Record<
  string,
  string
> {
  return {
    'envelope.json': `${stableStringify(bundle.envelope)}\n`,
    'universe.json': `${stableStringify(bundle.universe)}\n`,
    'inputs.json': `${stableStringify(bundle.inputs)}\n`,
    'forecasts.json': `${stableStringify(bundle.forecasts)}\n`,
    'markets.json': `${stableStringify(bundle.markets)}\n`,
  };
}

export function buildManifest(options: {
  captureId: string;
  members: Record<string, string>;
  dependencyHashes: Record<string, string>;
  repositorySha: string;
  producerVersion: string;
}): {
  manifestJson: string;
  manifest: Record<string, unknown>;
  memberDigests: Record<string, { sha256: string; byteCount: number }>;
} {
  const memberDigests: Record<string, { sha256: string; byteCount: number }> = {};
  for (const [name, body] of Object.entries(options.members)) {
    const buf = Buffer.from(body, 'utf8');
    memberDigests[name] = {
      sha256: sha256Utf8Bytes(buf),
      byteCount: buf.byteLength,
    };
  }

  const manifest = {
    schemaVersion: ML_CAL_1_CAPTURE_SCHEMA_VERSION,
    captureId: options.captureId,
    repositorySha: options.repositorySha,
    producerVersion: options.producerVersion,
    dependencyHashes: options.dependencyHashes,
    members: memberDigests,
    // Explicitly no self-hash field.
  };

  return {
    manifest,
    manifestJson: `${stableStringify(manifest)}\n`,
    memberDigests,
  };
}

export function writeCaptureArtifactsAtomic(options: {
  rootDir: string;
  captureId: string;
  bundle: MlCal1ArtifactBundle;
  dependencyHashes: Record<string, string>;
}): {
  captureDir: string;
  manifestPath: string;
  memberDigests: Record<string, { sha256: string; byteCount: number }>;
  manifestSha256: string;
} {
  const captureDir = path.join(options.rootDir, options.captureId);
  if (fs.existsSync(captureDir)) {
    throw new Error(`capture_directory_exists:${captureDir}`);
  }

  const tmpDir = path.join(
    options.rootDir,
    `.tmp-${options.captureId}-${randomUUID()}`
  );
  fs.mkdirSync(tmpDir, { recursive: true });

  const members = buildArtifactMembers({
    ...options.bundle,
    envelope: {
      ...options.bundle.envelope,
      dependencyHashes: options.dependencyHashes,
    },
  });

  const { manifestJson, memberDigests } = buildManifest({
    captureId: options.captureId,
    members,
    dependencyHashes: options.dependencyHashes,
    repositorySha: options.bundle.envelope.repositorySha,
    producerVersion: options.bundle.envelope.producerVersion,
  });

  for (const [name, body] of Object.entries(members)) {
    fs.writeFileSync(path.join(tmpDir, name), body, 'utf8');
  }
  fs.writeFileSync(path.join(tmpDir, 'manifest.json'), manifestJson, 'utf8');

  fs.renameSync(tmpDir, captureDir);

  return {
    captureDir,
    manifestPath: path.join(captureDir, 'manifest.json'),
    memberDigests,
    manifestSha256: sha256Utf8Bytes(Buffer.from(manifestJson, 'utf8')),
  };
}

export function writeBlockedReasonReceipt(options: {
  path: string;
  captureId: string;
  status: MlCal1CaptureStatus;
  reasons: string[];
  redacted?: Record<string, unknown>;
}): void {
  const body = `${stableStringify({
    schemaVersion: ML_CAL_1_CAPTURE_SCHEMA_VERSION,
    captureId: options.captureId,
    status: options.status,
    reasons: options.reasons,
    redacted: options.redacted ?? {},
    providerCalls: 0,
    businessDataWrites: 0,
  })}\n`;
  fs.writeFileSync(options.path, body, 'utf8');
}

/** CLI arg validation before any DB access. */
export function parseMlCal1CliArgs(argv: string[]): {
  season: number;
  week: number;
  fixturePath?: string;
  outDir?: string;
  captureId?: string;
  repositorySha?: string;
  lifecycleReceiptPath?: string;
  enableLiveDbRead: boolean;
} {
  let season: number | undefined;
  let week: number | undefined;
  let fixturePath: string | undefined;
  let outDir: string | undefined;
  let captureId: string | undefined;
  let repositorySha: string | undefined;
  let lifecycleReceiptPath: string | undefined;
  let enableLiveDbRead = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--season') season = Number(argv[++i]);
    else if (a === '--week') week = Number(argv[++i]);
    else if (a === '--fixture') fixturePath = String(argv[++i] ?? '');
    else if (a === '--out') outDir = String(argv[++i] ?? '');
    else if (a === '--capture-id') captureId = String(argv[++i] ?? '');
    else if (a === '--repository-sha') repositorySha = String(argv[++i] ?? '');
    else if (a === '--lifecycle-receipt')
      lifecycleReceiptPath = String(argv[++i] ?? '');
    else if (a === '--enable-live-db-read') enableLiveDbRead = true;
    else if (a === '--mode' || a === '--confirm' || a === '--confirmation') {
      throw new Error(
        `unsupported_cli_flag:${a}:ml-cal-1-capture-has-no-commit-mode`
      );
    } else if (a.startsWith('--')) {
      throw new Error(`unsupported_cli_flag:${a}`);
    }
  }

  if (season === undefined) {
    throw new Error('season_required');
  }
  if (season !== ML_CAL_1_SUPPORTED_SEASON) {
    throw new Error(`unsupported_season:${season}`);
  }
  if (week === undefined || !Number.isInteger(week) || week < 1) {
    throw new Error(`invalid_week:${String(week)}`);
  }

  return {
    season,
    week,
    fixturePath,
    outDir,
    captureId,
    repositorySha,
    lifecycleReceiptPath,
    enableLiveDbRead,
  };
}

export function assertNoForbiddenGameSelect(select: Record<string, unknown>): void {
  for (const key of Object.keys(select)) {
    if (
      (ML_CAL_1_FORBIDDEN_GAME_FIELDS as readonly string[]).includes(key) ||
      /score/i.test(key) ||
      /pnl|result|clv/i.test(key)
    ) {
      throw new Error(`forbidden_game_select_field:${key}`);
    }
  }
}

export function createInstrumentedReadClient(options: {
  delegate: {
    game: { findMany: (args: unknown) => Promise<unknown> };
    teamMembership: { findMany: (args: unknown) => Promise<unknown> };
    teamSeasonRating: { findMany: (args: unknown) => Promise<unknown> };
    marketLine: { findMany: (args: unknown) => Promise<unknown> };
  };
  allowedSeason: number;
}): {
  game: { findMany: (args: any) => Promise<unknown> };
  teamMembership: { findMany: (args: any) => Promise<unknown> };
  teamSeasonRating: { findMany: (args: any) => Promise<unknown> };
  marketLine: { findMany: (args: any) => Promise<unknown> };
  mutations: string[];
  providerCalls: number;
} {
  const mutations: string[] = [];
  const wrapMutation = (model: string, method: string) => {
    return async () => {
      mutations.push(`${model}.${method}`);
      throw new Error(`forbidden_mutation:${model}.${method}`);
    };
  };

  const guardSeason = (where: any, model: string) => {
    if (where?.season != null && where.season !== options.allowedSeason) {
      throw new Error(`forbidden_season_read:${model}:${where.season}`);
    }
    if (where?.season?.in) {
      for (const s of where.season.in) {
        if (s !== options.allowedSeason) {
          throw new Error(`forbidden_season_read:${model}:${s}`);
        }
      }
    }
  };

  return {
    mutations,
    providerCalls: 0,
    game: {
      findMany: async (args: any) => {
        guardSeason(args?.where, 'game');
        if (args?.select) assertNoForbiddenGameSelect(args.select);
        if (args?.include) {
          const inc = JSON.stringify(args.include);
          if (/score/i.test(inc)) {
            throw new Error('forbidden_game_include_score');
          }
        }
        return options.delegate.game.findMany(args);
      },
      create: wrapMutation('game', 'create'),
      update: wrapMutation('game', 'update'),
      delete: wrapMutation('game', 'delete'),
      upsert: wrapMutation('game', 'upsert'),
    } as any,
    teamMembership: {
      findMany: async (args: any) => {
        guardSeason(args?.where, 'teamMembership');
        return options.delegate.teamMembership.findMany(args);
      },
      create: wrapMutation('teamMembership', 'create'),
      update: wrapMutation('teamMembership', 'update'),
    } as any,
    teamSeasonRating: {
      findMany: async (args: any) => {
        guardSeason(args?.where, 'teamSeasonRating');
        if (args?.where?.season === 2025 || args?.where?.season < options.allowedSeason) {
          throw new Error('forbidden_2025_or_prior_rating_read');
        }
        return options.delegate.teamSeasonRating.findMany(args);
      },
      create: wrapMutation('teamSeasonRating', 'create'),
      update: wrapMutation('teamSeasonRating', 'update'),
      upsert: wrapMutation('teamSeasonRating', 'upsert'),
    } as any,
    marketLine: {
      findMany: async (args: any) => {
        return options.delegate.marketLine.findMany(args);
      },
      create: wrapMutation('marketLine', 'create'),
      update: wrapMutation('marketLine', 'update'),
      createMany: wrapMutation('marketLine', 'createMany'),
    } as any,
    bet: {
      findMany: async () => {
        throw new Error('forbidden_bet_read');
      },
      create: wrapMutation('bet', 'create'),
    },
    teamGameStat: {
      findMany: async () => {
        throw new Error('forbidden_team_game_stat_read');
      },
    },
  } as any;
}

export { HARD_MIN_ML_VALUE, ML_MAX_ABS_SPREAD, modelWinProbsFromCoreSpreadHma };
