/**
 * Generic Shadow T-30 Closing V1 — pure planner / validator.
 *
 * Plans EXISTING / FUTURE / DUE / MISSED Generic closing evidence from an
 * in-memory frame. Does not load DB data, persist, call providers, or inspect
 * system time. Slice C owns adapters / transactions / workflows.
 */

import { randomUUID } from 'crypto';
import {
  canonicalSpreadHma,
  pickDisplaySpread,
  selectBookSpreadSnapshots,
  type MarketLineObservation,
} from './market-line-snapshot';
import {
  deriveShadowModelRunCounts,
  isFiniteNumber,
  reconcileShadowModelRunCounts,
  toDate,
  type ShadowModelMarketLineRow,
  type ShadowModelMarketType,
  type ShadowModelPredictionStatus,
  type ShadowModelSelectedSide,
} from './shadow-model-capture-v1';

export const GENERIC_SHADOW_T30_CAPTURE_SEASON = 2026;
export const GENERIC_SHADOW_T30_EVALUATION_PROTOCOL = 'CORE_EVAL_V1' as const;
export const GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID = 'generic_shadow_t30_closing_v1' as const;
export const GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH =
  '1a2b01a893e0d8811d5ffe0c78af2f8a15dc9d4eb165b19ef5f14a9e1e8be898' as const;
export const GENERIC_SHADOW_T30_OFFSET_SECONDS = 1800;
export const GENERIC_SHADOW_T30_OFFSET_MS = 1_800_000;
export const GENERIC_SHADOW_T30_AUTHORIZED_SOURCE = 'oddsapi' as const;
export const GENERIC_SHADOW_T30_MARKET_TYPE = 'SPREAD' as const;

export const GENERIC_SHADOW_T30_SUPPORTED_MODEL_IDS = [
  'core_v1_shadow_baseline_v1',
  'candidate_b_roster_prior_v1',
] as const;
export type GenericShadowT30SupportedModelId =
  (typeof GENERIC_SHADOW_T30_SUPPORTED_MODEL_IDS)[number];

export const GENERIC_SHADOW_T30_UNAVAILABLE_REASONS = [
  'missing_market_at_or_before_t30',
  'incoherent_market_at_or_before_t30',
] as const;
export type GenericShadowT30UnavailableReason =
  (typeof GENERIC_SHADOW_T30_UNAVAILABLE_REASONS)[number];

export type GenericShadowT30Mode = 'PREVIEW' | 'COMMIT';
export type GenericShadowT30GameState = 'EXISTING' | 'FUTURE' | 'DUE' | 'MISSED';
export type GenericShadowT30AvailabilityStatus = 'AVAILABLE' | 'UNAVAILABLE';

export interface GenericShadowT30CaptureRun {
  id: string;
  season: number;
  week: number;
  captureContext: string;
  evaluationProtocol: string;
  modelDefinitionId: string;
  modelDefinitionHash: string;
  featureDefinitionHash: string;
  policyDefinitionHash: string;
  expectedGameIds: unknown;
  totalGames: number;
  availableCount: number;
  unavailableCount: number;
  selectionCount: number;
  noSelectionCount: number;
  status: string;
  failureReason: string | null;
}

export interface GenericShadowT30Prediction {
  id: string;
  captureRunId: string;
  gameId: string;
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  kickoffTimestamp: Date | string;
  predictionTimestamp: Date | string;
  predictionStatus: ShadowModelPredictionStatus | string;
  marketType: ShadowModelMarketType | string;
  selectedSide: ShadowModelSelectedSide | string | null;
}

export interface GenericShadowT30CurrentGame {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  kickoffTimestamp: Date | string;
}

export interface GenericShadowT30ExistingClosing {
  id: string;
  predictionId: string;
  gameId: string;
  evaluationProtocol: string;
  closingDefinitionId: string;
  closingDefinitionHash: string;
  marketType: string;
  predictionKickoffTimestamp: Date | string;
  closingKickoffTimestamp: Date | string;
  targetTimestamp: Date | string;
  status: string;
  unavailableReason: string | null;
  selectedHomeMarketLineId: string | null;
  selectedAwayMarketLineId: string | null;
  selectedHomeLineValue: number | null;
  selectedAwayLineValue: number | null;
  selectedDisplayTeamId: string | null;
  selectedDisplayLineValue: number | null;
  canonicalMarketHma: number | null;
  book: string | null;
  source: string | null;
  marketObservationTimestamp: Date | string | null;
  marketAgeToTargetSeconds: number | null;
  capturedAt: Date | string;
}

export interface GenericShadowT30OperationalFrame {
  captureRun: GenericShadowT30CaptureRun;
  predictions: GenericShadowT30Prediction[];
  games: GenericShadowT30CurrentGame[];
  marketLines: ShadowModelMarketLineRow[];
  existingClosings: GenericShadowT30ExistingClosing[];
}

export interface GenericShadowT30PlanRequest {
  season: number;
  week: number;
  captureRunId: string;
  mode: GenericShadowT30Mode | string;
  confirmation: string;
  observedTimestamp: Date;
  frame: GenericShadowT30OperationalFrame;
  createId?: () => string;
}

export interface GenericShadowT30SelectedMarket {
  homeRowId: string;
  awayRowId: string;
  homeLine: number;
  awayLine: number;
  selectedDisplayTeamId: string;
  selectedDisplayLineValue: number;
  canonicalMarketHma: number;
  book: string;
  source: typeof GENERIC_SHADOW_T30_AUTHORIZED_SOURCE;
  marketObservationTimestamp: Date;
  marketAgeToTargetSeconds: number;
}

export type GenericShadowT30MarketSelection =
  | { status: 'selected'; selected: GenericShadowT30SelectedMarket }
  | { status: 'missing_market_at_or_before_t30'; selected: null }
  | { status: 'incoherent_market_at_or_before_t30'; selected: null };

export interface PlannedGenericShadowT30Closing {
  id: string;
  predictionId: string;
  gameId: string;
  evaluationProtocol: typeof GENERIC_SHADOW_T30_EVALUATION_PROTOCOL;
  closingDefinitionId: typeof GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID;
  closingDefinitionHash: typeof GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH;
  marketType: typeof GENERIC_SHADOW_T30_MARKET_TYPE;
  predictionKickoffTimestamp: Date;
  closingKickoffTimestamp: Date;
  targetTimestamp: Date;
  status: GenericShadowT30AvailabilityStatus;
  unavailableReason: GenericShadowT30UnavailableReason | null;
  selectedHomeMarketLineId: string | null;
  selectedAwayMarketLineId: string | null;
  selectedHomeLineValue: number | null;
  selectedAwayLineValue: number | null;
  selectedDisplayTeamId: string | null;
  selectedDisplayLineValue: number | null;
  canonicalMarketHma: number | null;
  book: string | null;
  source: string | null;
  marketObservationTimestamp: Date | null;
  marketAgeToTargetSeconds: number | null;
  capturedAt: Date;
}

export interface GenericShadowT30PredictionPlan {
  predictionId: string;
  gameId: string;
  predictionStatus: ShadowModelPredictionStatus | string;
  predictionTimestamp: Date;
  predictionKickoffTimestamp: Date;
  closingKickoffTimestamp: Date;
  kickoffChangedSincePrediction: boolean;
  targetTimestamp: Date;
  state: GenericShadowT30GameState;
  existingClosingId: string | null;
  plannedClosingId: string | null;
  status: GenericShadowT30AvailabilityStatus | null;
  unavailableReason: GenericShadowT30UnavailableReason | null;
  selectedHomeMarketLineId: string | null;
  selectedAwayMarketLineId: string | null;
  selectedHomeLineValue: number | null;
  selectedAwayLineValue: number | null;
  selectedDisplayTeamId: string | null;
  selectedDisplayLineValue: number | null;
  canonicalMarketHma: number | null;
  book: string | null;
  source: string | null;
  marketObservationTimestamp: Date | null;
  marketAgeToTargetSeconds: number | null;
}

export interface GenericShadowT30Counts {
  totalPredictions: number;
  existingCount: number;
  futureCount: number;
  dueCount: number;
  missedCount: number;
  plannedAvailableCount: number;
  plannedUnavailableCount: number;
  plannedInsertCount: number;
}

export interface GenericShadowT30Plan {
  ok: boolean;
  writeSafe: boolean;
  writeBlockers: string[];
  season: number;
  week: number;
  captureRunId: string;
  modelDefinitionId: string;
  modelDefinitionHash: string;
  captureContext: string;
  evaluationProtocol: typeof GENERIC_SHADOW_T30_EVALUATION_PROTOCOL;
  closingDefinitionId: typeof GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID;
  closingDefinitionHash: typeof GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH;
  mode: GenericShadowT30Mode | string;
  observedTimestamp: Date;
  expectedPredictionCount: number;
  expectedPredictionIds: string[];
  expectedGameIds: string[];
  counts: GenericShadowT30Counts;
  predictions: GenericShadowT30PredictionPlan[];
  rowsToInsert: PlannedGenericShadowT30Closing[];
  confirmationValid: boolean;
  providerCalls: 0;
  previewTimestampWillNotBecomeCommitTimestamp: true;
}

export function expectedGenericShadowT30WriteConfirmation(
  week: number,
  captureRunId: string
): string {
  return `CAPTURE_2026_WEEK_${week}_SHADOW_MODEL_T30_${captureRunId}`;
}

export function genericShadowT30TargetTimestamp(
  kickoff: Date | string | null | undefined
): Date | null {
  const date = toDate(kickoff);
  if (!date) return null;
  return new Date(date.getTime() - GENERIC_SHADOW_T30_OFFSET_MS);
}

export function isGenericShadowT30ModelSupported(
  id: string
): id is GenericShadowT30SupportedModelId {
  return (GENERIC_SHADOW_T30_SUPPORTED_MODEL_IDS as readonly string[]).indexOf(id) >= 0;
}

function uniqueInOrder(values: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < values.length; i++) {
    if (out.indexOf(values[i]) === -1) out.push(values[i]);
  }
  return out;
}

function sortIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function sameIdSet(a: string[], b: string[]): boolean {
  const aa = sortIds(uniqueInOrder(a));
  const bb = sortIds(uniqueInOrder(b));
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) {
    if (aa[i] !== bb[i]) return false;
  }
  return true;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function sameInstant(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

function emptyCounts(): GenericShadowT30Counts {
  return {
    totalPredictions: 0,
    existingCount: 0,
    futureCount: 0,
    dueCount: 0,
    missedCount: 0,
    plannedAvailableCount: 0,
    plannedUnavailableCount: 0,
    plannedInsertCount: 0,
  };
}

function unavailablePlannedFields(): Pick<
  PlannedGenericShadowT30Closing,
  | 'unavailableReason'
  | 'selectedHomeMarketLineId'
  | 'selectedAwayMarketLineId'
  | 'selectedHomeLineValue'
  | 'selectedAwayLineValue'
  | 'selectedDisplayTeamId'
  | 'selectedDisplayLineValue'
  | 'canonicalMarketHma'
  | 'book'
  | 'source'
  | 'marketObservationTimestamp'
  | 'marketAgeToTargetSeconds'
> {
  return {
    unavailableReason: null,
    selectedHomeMarketLineId: null,
    selectedAwayMarketLineId: null,
    selectedHomeLineValue: null,
    selectedAwayLineValue: null,
    selectedDisplayTeamId: null,
    selectedDisplayLineValue: null,
    canonicalMarketHma: null,
    book: null,
    source: null,
    marketObservationTimestamp: null,
    marketAgeToTargetSeconds: null,
  };
}

function predictionPlanFromExisting(
  prediction: GenericShadowT30Prediction,
  predictionKickoff: Date,
  predictionTimestamp: Date,
  currentKickoff: Date,
  existing: GenericShadowT30ExistingClosing
): GenericShadowT30PredictionPlan {
  const frozenKickoff = toDate(existing.closingKickoffTimestamp) ?? currentKickoff;
  const frozenTarget =
    toDate(existing.targetTimestamp) ??
    genericShadowT30TargetTimestamp(frozenKickoff) ??
    currentKickoff;
  return {
    predictionId: prediction.id,
    gameId: prediction.gameId,
    predictionStatus: prediction.predictionStatus,
    predictionTimestamp,
    predictionKickoffTimestamp: predictionKickoff,
    closingKickoffTimestamp: frozenKickoff,
    kickoffChangedSincePrediction: currentKickoff.getTime() !== predictionKickoff.getTime(),
    targetTimestamp: frozenTarget,
    state: 'EXISTING',
    existingClosingId: existing.id,
    plannedClosingId: null,
    status:
      existing.status === 'AVAILABLE' || existing.status === 'UNAVAILABLE'
        ? existing.status
        : null,
    unavailableReason:
      existing.unavailableReason === 'missing_market_at_or_before_t30' ||
      existing.unavailableReason === 'incoherent_market_at_or_before_t30'
        ? existing.unavailableReason
        : null,
    selectedHomeMarketLineId: existing.selectedHomeMarketLineId,
    selectedAwayMarketLineId: existing.selectedAwayMarketLineId,
    selectedHomeLineValue: existing.selectedHomeLineValue,
    selectedAwayLineValue: existing.selectedAwayLineValue,
    selectedDisplayTeamId: existing.selectedDisplayTeamId,
    selectedDisplayLineValue: existing.selectedDisplayLineValue,
    canonicalMarketHma: existing.canonicalMarketHma,
    book: existing.book,
    source: existing.source,
    marketObservationTimestamp: toDate(existing.marketObservationTimestamp),
    marketAgeToTargetSeconds: existing.marketAgeToTargetSeconds,
  };
}

function predictionPlanFromPlanned(
  prediction: GenericShadowT30Prediction,
  predictionKickoff: Date,
  predictionTimestamp: Date,
  closingKickoff: Date,
  target: Date,
  state: Exclude<GenericShadowT30GameState, 'EXISTING'>,
  planned: PlannedGenericShadowT30Closing | null
): GenericShadowT30PredictionPlan {
  return {
    predictionId: prediction.id,
    gameId: prediction.gameId,
    predictionStatus: prediction.predictionStatus,
    predictionTimestamp,
    predictionKickoffTimestamp: predictionKickoff,
    closingKickoffTimestamp: closingKickoff,
    kickoffChangedSincePrediction: closingKickoff.getTime() !== predictionKickoff.getTime(),
    targetTimestamp: target,
    state,
    existingClosingId: null,
    plannedClosingId: planned?.id ?? null,
    status: planned?.status ?? null,
    unavailableReason: planned?.unavailableReason ?? null,
    selectedHomeMarketLineId: planned?.selectedHomeMarketLineId ?? null,
    selectedAwayMarketLineId: planned?.selectedAwayMarketLineId ?? null,
    selectedHomeLineValue: planned?.selectedHomeLineValue ?? null,
    selectedAwayLineValue: planned?.selectedAwayLineValue ?? null,
    selectedDisplayTeamId: planned?.selectedDisplayTeamId ?? null,
    selectedDisplayLineValue: planned?.selectedDisplayLineValue ?? null,
    canonicalMarketHma: planned?.canonicalMarketHma ?? null,
    book: planned?.book ?? null,
    source: planned?.source ?? null,
    marketObservationTimestamp: planned?.marketObservationTimestamp ?? null,
    marketAgeToTargetSeconds: planned?.marketAgeToTargetSeconds ?? null,
  };
}

export function selectGenericShadowT30ClosingMarket(input: {
  rows: ShadowModelMarketLineRow[];
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  targetTimestamp: Date;
}): GenericShadowT30MarketSelection {
  const targetMs = input.targetTimestamp.getTime();
  const eligible: ShadowModelMarketLineRow[] = [];
  for (const row of input.rows) {
    if (row.gameId !== input.gameId) continue;
    if (String(row.lineType) !== 'spread') continue;
    if (String(row.source) !== GENERIC_SHADOW_T30_AUTHORIZED_SOURCE) continue;
    const ts = toDate(row.timestamp);
    if (!ts) continue;
    if (ts.getTime() > targetMs) continue;
    eligible.push(row);
  }

  if (eligible.length === 0) {
    return { status: 'missing_market_at_or_before_t30', selected: null };
  }

  const observations: MarketLineObservation[] = eligible.map((row) => ({
    id: row.id,
    gameId: row.gameId,
    lineType: row.lineType,
    lineValue: row.lineValue,
    bookName: row.bookName ?? '',
    timestamp: row.timestamp,
    teamId: row.teamId,
    source: row.source,
  }));

  const { snapshots } = selectBookSpreadSnapshots(
    observations,
    input.homeTeamId,
    input.awayTeamId
  );
  const display = pickDisplaySpread(snapshots);
  if (!display) {
    return { status: 'incoherent_market_at_or_before_t30', selected: null };
  }

  const marketObservationTimestamp = toDate(display.timestamp);
  if (!marketObservationTimestamp) {
    return { status: 'incoherent_market_at_or_before_t30', selected: null };
  }
  const ageMs = targetMs - marketObservationTimestamp.getTime();
  if (ageMs < 0) {
    return { status: 'incoherent_market_at_or_before_t30', selected: null };
  }

  return {
    status: 'selected',
    selected: {
      homeRowId: display.homeRowId,
      awayRowId: display.awayRowId,
      homeLine: display.homeLine,
      awayLine: display.awayLine,
      selectedDisplayTeamId: input.homeTeamId,
      selectedDisplayLineValue: display.homeLine,
      canonicalMarketHma: display.marketSpreadHma,
      book: display.bookName,
      source: GENERIC_SHADOW_T30_AUTHORIZED_SOURCE,
      marketObservationTimestamp,
      marketAgeToTargetSeconds: Math.ceil(ageMs / 1000),
    },
  };
}

export function validateExistingGenericShadowT30Closing(input: {
  row: GenericShadowT30ExistingClosing;
  prediction: GenericShadowT30Prediction;
  marketLines: ShadowModelMarketLineRow[];
}): string[] {
  const blockers: string[] = [];
  const row = input.row;
  const prediction = input.prediction;
  const predictionKickoff = toDate(prediction.kickoffTimestamp);
  const predictionKickoffStored = toDate(row.predictionKickoffTimestamp);
  const closingKickoff = toDate(row.closingKickoffTimestamp);
  const target = toDate(row.targetTimestamp);
  const capturedAt = toDate(row.capturedAt);

  if (row.predictionId !== prediction.id) blockers.push('existing_closing_prediction_mismatch');
  if (row.gameId !== prediction.gameId) blockers.push('existing_closing_game_mismatch');
  if (row.evaluationProtocol !== GENERIC_SHADOW_T30_EVALUATION_PROTOCOL) {
    blockers.push('existing_closing_protocol_mismatch');
  }
  if (row.closingDefinitionId !== GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID) {
    blockers.push('existing_closing_definition_id_mismatch');
  }
  if (row.closingDefinitionHash !== GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH) {
    blockers.push('existing_closing_definition_hash_mismatch');
  }
  if (String(row.marketType) !== GENERIC_SHADOW_T30_MARKET_TYPE) {
    blockers.push('existing_closing_market_type_mismatch');
  }
  if (!predictionKickoff || !predictionKickoffStored || !closingKickoff || !target || !capturedAt) {
    blockers.push('existing_closing_invalid_timestamp');
    return uniqueInOrder(blockers);
  }
  if (!sameInstant(predictionKickoffStored, predictionKickoff)) {
    blockers.push('existing_closing_prediction_kickoff_mismatch');
  }
  const expectedTarget = genericShadowT30TargetTimestamp(closingKickoff);
  if (!expectedTarget || expectedTarget.getTime() !== target.getTime()) {
    blockers.push('existing_closing_target_mismatch');
  }
  if (capturedAt.getTime() < target.getTime() || capturedAt.getTime() >= closingKickoff.getTime()) {
    blockers.push('existing_closing_captured_outside_due_window');
  }

  if (row.status === 'AVAILABLE') {
    if (row.unavailableReason != null) {
      blockers.push('existing_available_closing_has_unavailable_reason');
    }
    const missingFields =
      !isNonEmptyString(row.selectedHomeMarketLineId) ||
      !isNonEmptyString(row.selectedAwayMarketLineId) ||
      row.selectedHomeMarketLineId === row.selectedAwayMarketLineId ||
      !isFiniteNumber(row.selectedHomeLineValue) ||
      !isFiniteNumber(row.selectedAwayLineValue) ||
      !isNonEmptyString(row.selectedDisplayTeamId) ||
      !isFiniteNumber(row.selectedDisplayLineValue) ||
      !isFiniteNumber(row.canonicalMarketHma) ||
      !isNonEmptyString(row.book) ||
      row.source !== GENERIC_SHADOW_T30_AUTHORIZED_SOURCE ||
      row.marketObservationTimestamp == null ||
      row.marketAgeToTargetSeconds == null;
    if (missingFields) blockers.push('existing_available_closing_missing_fields');
    if (row.selectedDisplayTeamId !== prediction.homeTeamId) {
      blockers.push('existing_closing_display_not_home_anchor');
    }
    if (
      isFiniteNumber(row.selectedDisplayLineValue) &&
      isFiniteNumber(row.selectedHomeLineValue) &&
      row.selectedDisplayLineValue !== row.selectedHomeLineValue
    ) {
      blockers.push('existing_closing_display_not_home_anchor');
    }

    const obs = toDate(row.marketObservationTimestamp);
    if (!obs) {
      blockers.push('existing_available_closing_missing_fields');
    } else {
      if (obs.getTime() > target.getTime()) {
        blockers.push('existing_closing_falls_forward_after_t30');
      }
      const expectedAge = Math.ceil((target.getTime() - obs.getTime()) / 1000);
      if (
        typeof row.marketAgeToTargetSeconds !== 'number' ||
        !Number.isInteger(row.marketAgeToTargetSeconds) ||
        row.marketAgeToTargetSeconds < 0
      ) {
        blockers.push('existing_closing_market_age_invalid');
      } else if (row.marketAgeToTargetSeconds !== expectedAge) {
        blockers.push('existing_closing_market_age_mismatch');
      }
    }

    const homeRow = input.marketLines.find((line) => line.id === row.selectedHomeMarketLineId);
    const awayRow = input.marketLines.find((line) => line.id === row.selectedAwayMarketLineId);
    if (!homeRow || !awayRow) {
      blockers.push('existing_closing_market_line_missing');
    } else {
      const homeTs = toDate(homeRow.timestamp);
      const awayTs = toDate(awayRow.timestamp);
      const hma = canonicalSpreadHma(Number(homeRow.lineValue), Number(awayRow.lineValue));
      const pairOk =
        homeRow.gameId === prediction.gameId &&
        awayRow.gameId === prediction.gameId &&
        String(homeRow.lineType) === 'spread' &&
        String(awayRow.lineType) === 'spread' &&
        String(homeRow.source) === GENERIC_SHADOW_T30_AUTHORIZED_SOURCE &&
        String(awayRow.source) === GENERIC_SHADOW_T30_AUTHORIZED_SOURCE &&
        homeRow.teamId === prediction.homeTeamId &&
        awayRow.teamId === prediction.awayTeamId &&
        (homeRow.bookName ?? '') === (awayRow.bookName ?? '') &&
        homeTs != null &&
        awayTs != null &&
        obs != null &&
        homeTs.getTime() === awayTs.getTime() &&
        homeTs.getTime() === obs.getTime() &&
        Number(homeRow.lineValue) === row.selectedHomeLineValue &&
        Number(awayRow.lineValue) === row.selectedAwayLineValue &&
        (homeRow.bookName ?? '') === row.book &&
        hma != null &&
        hma === row.canonicalMarketHma;
      if (!pairOk) blockers.push('existing_closing_market_pair_mismatch');
    }
  } else if (row.status === 'UNAVAILABLE') {
    if (
      row.unavailableReason !== 'missing_market_at_or_before_t30' &&
      row.unavailableReason !== 'incoherent_market_at_or_before_t30'
    ) {
      blockers.push('existing_unavailable_closing_reason_invalid');
    }
    const hasMarketFields =
      row.selectedHomeMarketLineId != null ||
      row.selectedAwayMarketLineId != null ||
      row.selectedHomeLineValue != null ||
      row.selectedAwayLineValue != null ||
      row.selectedDisplayTeamId != null ||
      row.selectedDisplayLineValue != null ||
      row.canonicalMarketHma != null ||
      row.book != null ||
      row.source != null ||
      row.marketObservationTimestamp != null ||
      row.marketAgeToTargetSeconds != null;
    if (hasMarketFields) blockers.push('existing_unavailable_closing_has_market_fields');
  } else {
    blockers.push('existing_closing_status_unrecognized');
  }

  return uniqueInOrder(blockers);
}

function emptyPlan(input: GenericShadowT30PlanRequest, extra: {
  writeBlockers: string[];
  confirmationValid: boolean;
  expectedGameIds?: string[];
  expectedPredictionIds?: string[];
}): GenericShadowT30Plan {
  const run = input.frame.captureRun;
  return {
    ok: extra.writeBlockers.length === 0,
    writeSafe: extra.writeBlockers.length === 0,
    writeBlockers: uniqueInOrder(extra.writeBlockers),
    season: input.season,
    week: input.week,
    captureRunId: input.captureRunId,
    modelDefinitionId: run.modelDefinitionId,
    modelDefinitionHash: run.modelDefinitionHash,
    captureContext: String(run.captureContext ?? ''),
    evaluationProtocol: GENERIC_SHADOW_T30_EVALUATION_PROTOCOL,
    closingDefinitionId: GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID,
    closingDefinitionHash: GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH,
    mode: input.mode,
    observedTimestamp: input.observedTimestamp,
    expectedPredictionCount: Number(run.totalGames) || 0,
    expectedPredictionIds: extra.expectedPredictionIds ?? [],
    expectedGameIds: extra.expectedGameIds ?? [],
    counts: emptyCounts(),
    predictions: [],
    rowsToInsert: [],
    confirmationValid: extra.confirmationValid,
    providerCalls: 0,
    previewTimestampWillNotBecomeCommitTimestamp: true,
  };
}

export function planGenericShadowT30Closing(
  input: GenericShadowT30PlanRequest
): GenericShadowT30Plan {
  const blockers: string[] = [];
  const confirmationExpected = expectedGenericShadowT30WriteConfirmation(
    input.week,
    input.captureRunId
  );
  const confirmationValid =
    input.mode !== 'COMMIT' || input.confirmation === confirmationExpected;
  if (input.mode === 'COMMIT' && !confirmationValid) {
    blockers.push('confirmation_invalid');
  }

  if (input.season !== GENERIC_SHADOW_T30_CAPTURE_SEASON) {
    blockers.push('season_must_be_2026');
  }
  if (!Number.isInteger(input.week) || input.week < 1) {
    blockers.push('week_must_be_positive_integer');
  }
  if (input.mode !== 'PREVIEW' && input.mode !== 'COMMIT') {
    blockers.push('mode_invalid');
  }
  if (!(input.observedTimestamp instanceof Date) || !Number.isFinite(input.observedTimestamp.getTime())) {
    blockers.push('observed_timestamp_invalid');
    return emptyPlan(input, { writeBlockers: blockers, confirmationValid });
  }

  const run = input.frame.captureRun;
  if (run.id !== input.captureRunId) blockers.push('capture_run_id_mismatch');
  if (run.status !== 'COMPLETE') blockers.push('capture_run_not_complete');
  if (run.season !== input.season) blockers.push('capture_run_season_mismatch');
  if (run.week !== input.week) blockers.push('capture_run_week_mismatch');
  if (run.evaluationProtocol !== GENERIC_SHADOW_T30_EVALUATION_PROTOCOL) {
    blockers.push('capture_run_protocol_mismatch');
  }
  if (!isGenericShadowT30ModelSupported(run.modelDefinitionId)) {
    blockers.push('capture_run_model_not_supported');
  }
  if (!isNonEmptyString(run.modelDefinitionHash)) {
    blockers.push('capture_run_model_hash_missing');
  }
  if (!isNonEmptyString(run.featureDefinitionHash)) {
    blockers.push('capture_run_feature_hash_missing');
  }
  if (!isNonEmptyString(run.policyDefinitionHash)) {
    blockers.push('capture_run_policy_hash_missing');
  }
  if (!isNonEmptyString(run.captureContext)) {
    blockers.push('capture_run_context_missing');
  }

  const expectedGameIdsRaw = run.expectedGameIds;
  if (!Array.isArray(expectedGameIdsRaw)) {
    blockers.push('expected_game_ids_not_array');
  }
  const expectedGameIds = Array.isArray(expectedGameIdsRaw)
    ? expectedGameIdsRaw.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  if (Array.isArray(expectedGameIdsRaw) && expectedGameIds.length !== expectedGameIdsRaw.length) {
    blockers.push('expected_game_ids_not_strings');
  }
  if (
    Array.isArray(expectedGameIdsRaw) &&
    uniqueInOrder(expectedGameIds).length !== expectedGameIds.length
  ) {
    blockers.push('expected_game_ids_not_unique');
  }
  if (Array.isArray(expectedGameIdsRaw) && expectedGameIds.length !== run.totalGames) {
    blockers.push('expected_game_count_mismatch');
  }
  if (!(run.totalGames > 0)) blockers.push('zero_expected_predictions');

  const predictions = input.frame.predictions;
  if (predictions.length !== run.totalGames) {
    blockers.push('prediction_row_count_mismatch');
  }
  const predictionIds = predictions.map((p) => p.id);
  const predictionGameIds = predictions.map((p) => p.gameId);
  if (predictionIds.some((id) => !isNonEmptyString(id))) {
    blockers.push('prediction_identity_invalid');
  }
  if (uniqueInOrder(predictionIds.filter(isNonEmptyString)).length !== predictions.length) {
    blockers.push('duplicate_prediction_ids');
  }
  if (predictionGameIds.some((id) => !isNonEmptyString(id))) {
    blockers.push('prediction_identity_invalid');
  }
  if (
    uniqueInOrder(predictionGameIds.filter(isNonEmptyString)).length !== predictions.length
  ) {
    blockers.push('duplicate_prediction_game_ids');
  }
  if (
    Array.isArray(expectedGameIdsRaw) &&
    !sameIdSet(predictionGameIds.filter(isNonEmptyString), expectedGameIds)
  ) {
    blockers.push('prediction_game_set_mismatch');
  }

  for (const prediction of predictions) {
    if (prediction.captureRunId !== run.id) {
      blockers.push('prediction_capture_run_mismatch');
    }
    if (prediction.season !== run.season || prediction.week !== run.week) {
      blockers.push('prediction_season_week_mismatch');
    }
    if (
      !isNonEmptyString(prediction.homeTeamId) ||
      !isNonEmptyString(prediction.awayTeamId) ||
      prediction.homeTeamId === prediction.awayTeamId
    ) {
      blockers.push('prediction_identity_invalid');
    }
    if (!toDate(prediction.kickoffTimestamp)) blockers.push('prediction_kickoff_invalid');
    if (!toDate(prediction.predictionTimestamp)) {
      blockers.push('prediction_timestamp_invalid');
    }
    if (String(prediction.marketType) !== GENERIC_SHADOW_T30_MARKET_TYPE) {
      blockers.push('prediction_market_type_mismatch');
    }
    if (
      prediction.predictionStatus !== 'AVAILABLE' &&
      prediction.predictionStatus !== 'UNAVAILABLE'
    ) {
      blockers.push('prediction_status_invalid');
    }
    if (prediction.predictionStatus === 'AVAILABLE') {
      if (
        prediction.selectedSide !== 'HOME' &&
        prediction.selectedSide !== 'AWAY' &&
        prediction.selectedSide !== 'NO_SELECTION'
      ) {
        blockers.push('prediction_selection_state_invalid');
      }
    } else if (prediction.predictionStatus === 'UNAVAILABLE' && prediction.selectedSide != null) {
      blockers.push('prediction_selection_state_invalid');
    }
  }

  const derived = deriveShadowModelRunCounts(
    predictions.map((p) => ({
      predictionStatus: p.predictionStatus as ShadowModelPredictionStatus,
      selectedSide: p.selectedSide as ShadowModelSelectedSide | null,
    }))
  );
  if (derived.totalGames !== run.totalGames) blockers.push('capture_run_total_count_mismatch');
  if (derived.availableCount !== run.availableCount) {
    blockers.push('capture_run_available_count_mismatch');
  }
  if (derived.unavailableCount !== run.unavailableCount) {
    blockers.push('capture_run_unavailable_count_mismatch');
  }
  if (derived.selectionCount !== run.selectionCount) {
    blockers.push('capture_run_selection_count_mismatch');
  }
  if (derived.noSelectionCount !== run.noSelectionCount) {
    blockers.push('capture_run_no_selection_count_mismatch');
  }
  blockers.push(
    ...reconcileShadowModelRunCounts({
      totalGames: run.totalGames,
      availableCount: run.availableCount,
      unavailableCount: run.unavailableCount,
      selectionCount: run.selectionCount,
      noSelectionCount: run.noSelectionCount,
    })
  );

  const games = input.frame.games;
  const uniquePredictionGames = uniqueInOrder(predictionGameIds.filter(isNonEmptyString));
  if (games.length !== uniquePredictionGames.length) {
    blockers.push('current_game_frame_count_mismatch');
  }
  const gameIds = games.map((g) => g.id);
  if (uniqueInOrder(gameIds.filter(isNonEmptyString)).length !== games.length) {
    blockers.push('duplicate_current_game_ids');
  }
  if (!sameIdSet(gameIds.filter(isNonEmptyString), uniquePredictionGames)) {
    blockers.push('current_game_set_mismatch');
  }
  const gamesById = new Map<string, GenericShadowT30CurrentGame>();
  for (const game of games) {
    if (isNonEmptyString(game.id) && !gamesById.has(game.id)) gamesById.set(game.id, game);
  }
  for (const prediction of predictions) {
    const game = gamesById.get(prediction.gameId);
    if (!game) continue;
    if (
      game.homeTeamId !== prediction.homeTeamId ||
      game.awayTeamId !== prediction.awayTeamId
    ) {
      blockers.push('current_game_identity_mismatch');
    }
    if (!toDate(game.kickoffTimestamp)) blockers.push('current_game_kickoff_invalid');
  }

  const existing = input.frame.existingClosings;
  const existingIds = existing.map((row) => row.id);
  if (uniqueInOrder(existingIds.filter(isNonEmptyString)).length !== existing.length) {
    blockers.push('duplicate_existing_closing_id');
  }
  const existingByPrediction = new Map<string, GenericShadowT30ExistingClosing>();
  const predictionIdSet = new Set(predictionIds.filter(isNonEmptyString));
  for (const row of existing) {
    if (existingByPrediction.has(row.predictionId)) {
      blockers.push('duplicate_existing_closing_prediction');
    } else {
      existingByPrediction.set(row.predictionId, row);
    }
    if (!predictionIdSet.has(row.predictionId)) {
      blockers.push('existing_closing_outside_capture_frame');
    }
  }

  const structuralKeys = [
    'season_must_be_2026',
    'week_must_be_positive_integer',
    'mode_invalid',
    'observed_timestamp_invalid',
    'capture_run_id_mismatch',
    'capture_run_not_complete',
    'capture_run_season_mismatch',
    'capture_run_week_mismatch',
    'capture_run_protocol_mismatch',
    'capture_run_model_not_supported',
    'capture_run_model_hash_missing',
    'capture_run_feature_hash_missing',
    'capture_run_policy_hash_missing',
    'capture_run_context_missing',
    'expected_game_ids_not_array',
    'expected_game_ids_not_strings',
    'expected_game_ids_not_unique',
    'expected_game_count_mismatch',
    'zero_expected_predictions',
    'prediction_row_count_mismatch',
    'duplicate_prediction_ids',
    'duplicate_prediction_game_ids',
    'prediction_game_set_mismatch',
    'prediction_capture_run_mismatch',
    'prediction_identity_invalid',
    'prediction_season_week_mismatch',
    'prediction_kickoff_invalid',
    'prediction_timestamp_invalid',
    'prediction_market_type_mismatch',
    'prediction_status_invalid',
    'prediction_selection_state_invalid',
    'capture_run_total_count_mismatch',
    'capture_run_available_count_mismatch',
    'capture_run_unavailable_count_mismatch',
    'capture_run_selection_count_mismatch',
    'capture_run_no_selection_count_mismatch',
    'available_unavailable_count_mismatch',
    'selection_no_selection_count_mismatch',
    'current_game_frame_count_mismatch',
    'duplicate_current_game_ids',
    'current_game_set_mismatch',
    'current_game_identity_mismatch',
    'current_game_kickoff_invalid',
  ];
  const uniqueBlockers = uniqueInOrder(blockers);
  const structuralFail = uniqueBlockers.some((b) => structuralKeys.indexOf(b) >= 0);
  const expectedPredictionIds = sortIds(predictionIds.filter(isNonEmptyString));
  const expectedGamesOut = sortIds(expectedGameIds.filter(isNonEmptyString));

  if (structuralFail) {
    const plan = emptyPlan(input, {
      writeBlockers: uniqueBlockers,
      confirmationValid,
      expectedGameIds: expectedGamesOut,
      expectedPredictionIds,
    });
    return plan;
  }

  const createId = input.createId ?? (() => randomUUID());
  const orderedPredictions = [...predictions].sort((a, b) => {
    if (a.gameId === b.gameId) {
      if (a.id === b.id) return 0;
      return a.id < b.id ? -1 : 1;
    }
    return a.gameId < b.gameId ? -1 : 1;
  });

  const predictionPlans: GenericShadowT30PredictionPlan[] = [];
  const rowsToInsert: PlannedGenericShadowT30Closing[] = [];

  for (const prediction of orderedPredictions) {
    const game = gamesById.get(prediction.gameId) as GenericShadowT30CurrentGame;
    const predictionKickoff = toDate(prediction.kickoffTimestamp) as Date;
    const predictionTimestamp = toDate(prediction.predictionTimestamp) as Date;
    const currentKickoff = toDate(game.kickoffTimestamp) as Date;
    const existingRow = existingByPrediction.get(prediction.id) ?? null;

    if (existingRow) {
      blockers.push(
        ...validateExistingGenericShadowT30Closing({
          row: existingRow,
          prediction,
          marketLines: input.frame.marketLines,
        })
      );
      predictionPlans.push(
        predictionPlanFromExisting(
          prediction,
          predictionKickoff,
          predictionTimestamp,
          currentKickoff,
          existingRow
        )
      );
      continue;
    }

    const target = genericShadowT30TargetTimestamp(currentKickoff) as Date;
    if (input.observedTimestamp.getTime() < target.getTime()) {
      predictionPlans.push(
        predictionPlanFromPlanned(
          prediction,
          predictionKickoff,
          predictionTimestamp,
          currentKickoff,
          target,
          'FUTURE',
          null
        )
      );
      continue;
    }
    if (input.observedTimestamp.getTime() >= currentKickoff.getTime()) {
      predictionPlans.push(
        predictionPlanFromPlanned(
          prediction,
          predictionKickoff,
          predictionTimestamp,
          currentKickoff,
          target,
          'MISSED',
          null
        )
      );
      continue;
    }

    const selected = selectGenericShadowT30ClosingMarket({
      rows: input.frame.marketLines,
      gameId: prediction.gameId,
      homeTeamId: prediction.homeTeamId,
      awayTeamId: prediction.awayTeamId,
      targetTimestamp: target,
    });
    const plannedId = createId();
    const base = {
      id: plannedId,
      predictionId: prediction.id,
      gameId: prediction.gameId,
      evaluationProtocol: GENERIC_SHADOW_T30_EVALUATION_PROTOCOL,
      closingDefinitionId: GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID,
      closingDefinitionHash: GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH,
      marketType: GENERIC_SHADOW_T30_MARKET_TYPE,
      predictionKickoffTimestamp: predictionKickoff,
      closingKickoffTimestamp: currentKickoff,
      targetTimestamp: target,
      capturedAt: input.observedTimestamp,
    };
    const planned: PlannedGenericShadowT30Closing =
      selected.status === 'selected'
        ? {
            ...base,
            ...unavailablePlannedFields(),
            status: 'AVAILABLE',
            unavailableReason: null,
            selectedHomeMarketLineId: selected.selected.homeRowId,
            selectedAwayMarketLineId: selected.selected.awayRowId,
            selectedHomeLineValue: selected.selected.homeLine,
            selectedAwayLineValue: selected.selected.awayLine,
            selectedDisplayTeamId: selected.selected.selectedDisplayTeamId,
            selectedDisplayLineValue: selected.selected.selectedDisplayLineValue,
            canonicalMarketHma: selected.selected.canonicalMarketHma,
            book: selected.selected.book,
            source: selected.selected.source,
            marketObservationTimestamp: selected.selected.marketObservationTimestamp,
            marketAgeToTargetSeconds: selected.selected.marketAgeToTargetSeconds,
          }
        : {
            ...base,
            ...unavailablePlannedFields(),
            status: 'UNAVAILABLE',
            unavailableReason: selected.status,
          };
    rowsToInsert.push(planned);
    predictionPlans.push(
      predictionPlanFromPlanned(
        prediction,
        predictionKickoff,
        predictionTimestamp,
        currentKickoff,
        target,
        'DUE',
        planned
      )
    );
  }

  const counts: GenericShadowT30Counts = {
    totalPredictions: predictionPlans.length,
    existingCount: predictionPlans.filter((p) => p.state === 'EXISTING').length,
    futureCount: predictionPlans.filter((p) => p.state === 'FUTURE').length,
    dueCount: predictionPlans.filter((p) => p.state === 'DUE').length,
    missedCount: predictionPlans.filter((p) => p.state === 'MISSED').length,
    plannedAvailableCount: rowsToInsert.filter((r) => r.status === 'AVAILABLE').length,
    plannedUnavailableCount: rowsToInsert.filter((r) => r.status === 'UNAVAILABLE').length,
    plannedInsertCount: rowsToInsert.length,
  };
  if (
    counts.existingCount + counts.futureCount + counts.dueCount + counts.missedCount !==
    counts.totalPredictions
  ) {
    blockers.push('closing_state_count_mismatch');
  }
  if (counts.plannedAvailableCount + counts.plannedUnavailableCount !== counts.plannedInsertCount) {
    blockers.push('closing_insert_count_mismatch');
  }

  const writeBlockers = uniqueInOrder(blockers);
  return {
    ok: writeBlockers.length === 0,
    writeSafe: writeBlockers.length === 0,
    writeBlockers,
    season: input.season,
    week: input.week,
    captureRunId: input.captureRunId,
    modelDefinitionId: run.modelDefinitionId,
    modelDefinitionHash: run.modelDefinitionHash,
    captureContext: run.captureContext,
    evaluationProtocol: GENERIC_SHADOW_T30_EVALUATION_PROTOCOL,
    closingDefinitionId: GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID,
    closingDefinitionHash: GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH,
    mode: input.mode,
    observedTimestamp: input.observedTimestamp,
    expectedPredictionCount: run.totalGames,
    expectedPredictionIds,
    expectedGameIds: expectedGamesOut,
    counts,
    predictions: predictionPlans,
    rowsToInsert,
    confirmationValid,
    providerCalls: 0,
    previewTimestampWillNotBecomeCommitTimestamp: true,
  };
}
