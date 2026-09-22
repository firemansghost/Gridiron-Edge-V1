/**
 * Shadow Model Capture V1 — generic multi-model prospective prediction layer.
 *
 * Model-neutral planning / PREVIEW / COMMIT engine. Adapters supply model math.
 * Does not call providers, write Bet / MatchupOutput / Hybrid Shadow Snapshot V1,
 * or mutate Official Card. Closing / ATS evaluation writers are out of scope.
 */

import { createHash, randomUUID } from 'crypto';
import { LIVE_ODDS_SOURCE } from './core-v1-weekly-card';
import {
  pickDisplaySpread,
  selectBookSpreadSnapshots,
  type MarketLineObservation,
} from './market-line-snapshot';

export const SHADOW_MODEL_CAPTURE_SEASON = 2026;
export const SHADOW_MODEL_EVALUATION_PROTOCOL = 'CORE_EVAL_V1';
export const MAX_SHADOW_MODEL_MARKET_AGE_SECONDS = 1800;
export const MAX_SHADOW_MODEL_MARKET_AGE_MS = 1_800_000;
export const CAPTURE_CONTEXT_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export const SHADOW_MODEL_ALLOWLIST = [
  'core_v1_shadow_baseline_v1',
  'candidate_b_roster_prior_v1',
  'candidate_b_elo_prior_v1',
] as const;
export type ShadowModelAllowlistId = (typeof SHADOW_MODEL_ALLOWLIST)[number];

export const SHADOW_MODEL_COMMIT_ALLOWLIST = [
  'core_v1_shadow_baseline_v1',
  'candidate_b_roster_prior_v1',
] as const;
export type ShadowModelCommitAllowlistId = (typeof SHADOW_MODEL_COMMIT_ALLOWLIST)[number];

export type ShadowModelCaptureMode = 'PREVIEW' | 'COMMIT';
export type ShadowModelPredictionStatus = 'AVAILABLE' | 'UNAVAILABLE';
export type ShadowModelSelectedSide =
  | 'HOME'
  | 'AWAY'
  | 'OVER'
  | 'UNDER'
  | 'NO_SELECTION';
export type ShadowModelMarketType = 'SPREAD' | 'TOTAL';

export const UNAVAILABLE_REASON_ORDER = [
  'post_kickoff',
  'missing_rating',
  'rating_provenance_unavailable',
  'team_feature_vector_unavailable',
  'missing_market',
  'incoherent_market',
  'stale_market',
  'invalid_model_output',
  'market_selector_unimplemented',
] as const;

export type ShadowModelUnavailableReason = (typeof UNAVAILABLE_REASON_ORDER)[number];

export function expectedShadowModelWriteConfirmation(
  week: number,
  modelDefinitionId: string
): string {
  return `CAPTURE_2026_WEEK_${week}_SHADOW_MODEL_${modelDefinitionId}`;
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

export function isShadowModelAllowlisted(id: string): id is ShadowModelAllowlistId {
  return (SHADOW_MODEL_ALLOWLIST as readonly string[]).indexOf(id) >= 0;
}

export function isShadowModelCommitAllowlisted(id: string): id is ShadowModelCommitAllowlistId {
  return (SHADOW_MODEL_COMMIT_ALLOWLIST as readonly string[]).indexOf(id) >= 0;
}

export function shadowModelCommitAuthorizationError(
  mode: string,
  modelId: string
): { error: 'model_id_not_commit_allowlisted'; modelId: string; mode: string } | null {
  if (mode === 'COMMIT' && !isShadowModelCommitAllowlisted(modelId)) {
    return {
      error: 'model_id_not_commit_allowlisted',
      modelId,
      mode,
    };
  }
  return null;
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

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
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

function uniqueStrings(values: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < values.length; i++) {
    if (out.indexOf(values[i]) === -1) out.push(values[i]);
  }
  return out;
}

function orderedReasons(reasons: Iterable<string>): ShadowModelUnavailableReason[] {
  const set = new Set(reasons);
  return UNAVAILABLE_REASON_ORDER.filter((r) => set.has(r));
}

function sortIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
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

export function teamSidedPickValue(pickHome: boolean, marketSpreadHma: number): number {
  return pickHome ? -marketSpreadHma : marketSpreadHma;
}

export interface ShadowModelGameRow {
  id: string;
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  kickoffTimestamp: Date | string;
  neutralSite: boolean;
}

export interface ShadowModelRatingRow {
  teamId: string;
  season: number;
  modelVersion: string;
  powerRating: number | null;
  rating: number | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
}

export interface ShadowModelMarketLineRow {
  id: string;
  gameId: string;
  lineType: string;
  lineValue: number;
  teamId: string | null;
  bookName: string | null;
  source: string | null;
  timestamp: Date | string;
}

export interface FrozenShadowFeatureTeamRow {
  teamId: string;
  season: number;
  availabilityStatus: string;
  unavailableReasons: string[];
  rowHash: string;
}

export interface FrozenShadowFeatureSnapshot {
  parentId: string;
  season: number;
  snapshotHash: string;
  featureDefinitionId: string;
  featureDefinitionVersion: string;
  featureDefinitionHash: string;
  derivationDefinitionId: string;
  derivationDefinitionHash: string;
  sourceManifestHash: string;
  sourceProvenanceManifestHash: string;
  normalizationManifestHash: string;
  populationManifestHash: string;
  expectedTeamCount: number;
  rowCount: number;
  completeVectorCount: number;
  unavailableVectorCount: number;
  portalAvailableCount: number;
  teamsById: Record<string, FrozenShadowFeatureTeamRow>;
}

export interface OperationalShadowModelFrame {
  games: ShadowModelGameRow[];
  ratings: ShadowModelRatingRow[];
  marketLines: ShadowModelMarketLineRow[];
  frozenFeatureSnapshots?: FrozenShadowFeatureSnapshot[];
}

export interface ShadowModelMarketProvenance {
  selector: 'core_v1_coherent_spread_pair_v1';
  sourceFilter: typeof LIVE_ODDS_SOURCE;
  bookName: string;
  marketTimestamp: string;
  marketSource: typeof LIVE_ODDS_SOURCE;
  homeTeamId: string;
  awayTeamId: string;
  homeRowId: string;
  awayRowId: string;
  homeLine: number;
  awayLine: number;
  marketSpreadHma: number;
}

export interface SelectedShadowModelMarket {
  /** Pair anchor (home row) until a HOME/AWAY side is chosen. */
  selectedMarketLineId: string;
  selectedMarketTeamId: string | null;
  selectedMarketLineValue: number | null;
  marketBook: string | null;
  marketSource: string | null;
  marketTimestamp: Date;
  marketAgeSeconds: number;
  canonicalMarketValue: number;
  homeRowId: string;
  awayRowId: string;
  homeLine: number;
  awayLine: number;
  marketProvenance: ShadowModelMarketProvenance;
}

export type ShadowModelMarketSelection =
  | { status: 'selected'; selected: SelectedShadowModelMarket }
  | { status: 'missing_market'; selected: SelectedShadowModelMarket | null }
  | { status: 'incoherent_market'; selected: SelectedShadowModelMarket | null }
  | { status: 'stale_market'; selected: SelectedShadowModelMarket | null };

/**
 * Official Core-card parity spread selector for Shadow Model Capture.
 * - Authorized source only (`LIVE_ODDS_SOURCE` = oddsapi)
 * - Coherent home/away pair via `selectBookSpreadSnapshots` + `pickDisplaySpread`
 * - Observations at or before predictionTimestamp only (no future fallback)
 * - Freshness gate applied after coherent selection
 */
export function selectAuthorizedCoherentSpreadMarket(input: {
  rows: ShadowModelMarketLineRow[];
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  predictionTimestamp: Date;
  authorizedSource?: string;
}): ShadowModelMarketSelection {
  const authorizedSource = input.authorizedSource ?? LIVE_ODDS_SOURCE;
  const predictionMs = input.predictionTimestamp.getTime();

  const sourceRows = input.rows.filter(
    (row) =>
      row.gameId === input.gameId &&
      String(row.lineType) === 'spread' &&
      String(row.source) === authorizedSource
  );

  let futureOnlyCount = 0;
  const asOfRows: ShadowModelMarketLineRow[] = [];
  for (const row of sourceRows) {
    const ts = toDate(row.timestamp);
    if (!ts) continue;
    if (ts.getTime() <= predictionMs) asOfRows.push(row);
    else futureOnlyCount += 1;
  }

  if (asOfRows.length === 0) {
    if (futureOnlyCount > 0) {
      return { status: 'stale_market', selected: null };
    }
    return { status: 'missing_market', selected: null };
  }

  const observations: MarketLineObservation[] = asOfRows.map((row) => ({
    id: row.id,
    gameId: row.gameId,
    lineType: row.lineType,
    lineValue: row.lineValue,
    bookName: row.bookName ?? '',
    timestamp: row.timestamp,
    teamId: row.teamId,
    source: row.source,
  }));

  const { snapshots, incoherent } = selectBookSpreadSnapshots(
    observations,
    input.homeTeamId,
    input.awayTeamId
  );
  const display = pickDisplaySpread(snapshots);
  if (!display) {
    if (incoherent.length > 0) {
      return { status: 'incoherent_market', selected: null };
    }
    return { status: 'missing_market', selected: null };
  }

  const marketTimestamp = toDate(display.timestamp);
  if (!marketTimestamp) {
    return { status: 'missing_market', selected: null };
  }
  const ageMs = predictionMs - marketTimestamp.getTime();
  const provenance: ShadowModelMarketProvenance = {
    selector: 'core_v1_coherent_spread_pair_v1',
    sourceFilter: LIVE_ODDS_SOURCE,
    bookName: display.bookName,
    marketTimestamp: marketTimestamp.toISOString(),
    marketSource: LIVE_ODDS_SOURCE,
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    homeRowId: display.homeRowId,
    awayRowId: display.awayRowId,
    homeLine: display.homeLine,
    awayLine: display.awayLine,
    marketSpreadHma: display.marketSpreadHma,
  };

  const selected: SelectedShadowModelMarket = {
    selectedMarketLineId: display.homeRowId,
    selectedMarketTeamId: null,
    selectedMarketLineValue: null,
    marketBook: display.bookName,
    marketSource: authorizedSource,
    marketTimestamp,
    marketAgeSeconds: ageMs < 0 ? Math.floor(ageMs / 1000) : Math.ceil(ageMs / 1000),
    canonicalMarketValue: display.marketSpreadHma,
    homeRowId: display.homeRowId,
    awayRowId: display.awayRowId,
    homeLine: display.homeLine,
    awayLine: display.awayLine,
    marketProvenance: provenance,
  };

  if (ageMs < 0 || ageMs > MAX_SHADOW_MODEL_MARKET_AGE_MS) {
    return { status: 'stale_market', selected };
  }
  return { status: 'selected', selected };
}

/** @deprecated Use selectAuthorizedCoherentSpreadMarket — kept name alias for callers. */
export function selectSpreadPredictionMarket(
  input: Parameters<typeof selectAuthorizedCoherentSpreadMarket>[0]
): ShadowModelMarketSelection {
  return selectAuthorizedCoherentSpreadMarket(input);
}

export interface ShadowModelDefinition {
  modelFamily: string;
  modelDefinitionId: string;
  modelDefinitionManifest: Record<string, unknown>;
  modelDefinitionHash: string;
  featureDefinitionId: string;
  featureDefinitionVersion: string;
  featureDefinitionManifest: Record<string, unknown>;
  featureDefinitionHash: string;
  policyDefinitionId: string;
  policyDefinitionManifest: Record<string, unknown>;
  policyDefinitionHash: string;
  marketType: ShadowModelMarketType;
  evaluateGame(input: {
    game: ShadowModelGameRow;
    frame: OperationalShadowModelFrame;
    predictionTimestamp: Date;
    market: SelectedShadowModelMarket | null;
    marketStatus:
      | 'selected'
      | 'missing_market'
      | 'incoherent_market'
      | 'stale_market'
      | null;
  }): {
    unavailableReasons: ShadowModelUnavailableReason[];
    inputPayload: Record<string, unknown>;
    featureProvenance: Record<string, unknown>;
    modelOutput: Record<string, unknown>;
    modelValue: number | null;
    edgeValue: number | null;
    absEdgeValue: number | null;
    selectedSide: ShadowModelSelectedSide | null;
    selectedTeamId: string | null;
    predictionPickValue: number | null;
  };
}

export interface PlannedShadowModelPrediction {
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
  predictionStatus: ShadowModelPredictionStatus;
  unavailableReasons: ShadowModelUnavailableReason[];
  inputPayload: Record<string, unknown>;
  inputHash: string;
  featureProvenance: Record<string, unknown>;
  modelOutput: Record<string, unknown>;
  marketType: ShadowModelMarketType;
  selectedMarketLineId: string | null;
  selectedMarketTeamId: string | null;
  selectedMarketLineValue: number | null;
  canonicalMarketValue: number | null;
  marketBook: string | null;
  marketSource: string | null;
  marketTimestamp: Date | null;
  marketAgeSeconds: number | null;
  marketProvenance: Record<string, unknown>;
  modelValue: number | null;
  edgeValue: number | null;
  absEdgeValue: number | null;
  selectedSide: ShadowModelSelectedSide | null;
  selectedTeamId: string | null;
  predictionPickValue: number | null;
}

export interface ShadowModelRunCounts {
  totalGames: number;
  availableCount: number;
  unavailableCount: number;
  selectionCount: number;
  noSelectionCount: number;
}

export function deriveShadowModelRunCounts(
  predictions: Array<
    Pick<PlannedShadowModelPrediction, 'predictionStatus' | 'selectedSide'>
  >
): ShadowModelRunCounts {
  const totalGames = predictions.length;
  const availableCount = predictions.filter((p) => p.predictionStatus === 'AVAILABLE').length;
  const unavailableCount = predictions.filter((p) => p.predictionStatus === 'UNAVAILABLE').length;
  const selectionCount = predictions.filter(
    (p) =>
      p.predictionStatus === 'AVAILABLE' &&
      p.selectedSide != null &&
      p.selectedSide !== 'NO_SELECTION'
  ).length;
  const noSelectionCount = predictions.filter(
    (p) => p.predictionStatus === 'AVAILABLE' && p.selectedSide === 'NO_SELECTION'
  ).length;
  return {
    totalGames,
    availableCount,
    unavailableCount,
    selectionCount,
    noSelectionCount,
  };
}

export function reconcileShadowModelRunCounts(counts: ShadowModelRunCounts): string[] {
  const blockers: string[] = [];
  if (counts.availableCount + counts.unavailableCount !== counts.totalGames) {
    blockers.push('available_unavailable_count_mismatch');
  }
  if (counts.selectionCount + counts.noSelectionCount !== counts.availableCount) {
    blockers.push('selection_no_selection_count_mismatch');
  }
  return blockers;
}

export interface PlannedShadowModelCaptureRun {
  id: string;
  season: number;
  week: number;
  captureContext: string;
  evaluationProtocol: typeof SHADOW_MODEL_EVALUATION_PROTOCOL;
  modelFamily: string;
  modelDefinitionId: string;
  modelDefinitionHash: string;
  modelDefinitionManifest: Record<string, unknown>;
  featureDefinitionId: string;
  featureDefinitionVersion: string;
  featureDefinitionHash: string;
  featureDefinitionManifest: Record<string, unknown>;
  policyDefinitionId: string;
  policyDefinitionHash: string;
  policyDefinitionManifest: Record<string, unknown>;
  repoCommitSha: string;
  captureTimestamp: Date;
  expectedGameIds: string[];
  totalGames: number;
  availableCount: number;
  unavailableCount: number;
  selectionCount: number;
  noSelectionCount: number;
  status: 'COMPLETE';
  failureReason: null;
}

export interface ShadowModelCapturePlan {
  ok: boolean;
  writeSafe: boolean;
  writeBlockers: string[];
  season: number;
  week: number;
  mode: ShadowModelCaptureMode;
  captureContext: string;
  predictionTimestamp: Date;
  repoCommitSha: string;
  modelDefinitionId: string;
  modelDefinitionHash: string;
  featureDefinitionId: string;
  featureDefinitionHash: string;
  policyDefinitionId: string;
  policyDefinitionHash: string;
  expectedGameIds: string[];
  counts: ShadowModelRunCounts;
  predictions: PlannedShadowModelPrediction[];
  run: PlannedShadowModelCaptureRun | null;
  confirmationValid: boolean;
  previewTimestampWillNotBecomeCommitTimestamp: true;
}

export function validateGameFrame(
  season: number,
  week: number,
  games: ShadowModelGameRow[]
): { expectedGameIds: string[]; blockers: string[] } {
  const blockers: string[] = [];
  const ids: string[] = [];
  for (const g of games) {
    if (g.season !== season) blockers.push(`game_${g.id}_season_mismatch`);
    if (g.week !== week) blockers.push(`game_${g.id}_week_mismatch`);
    if (!g.id) blockers.push('game_missing_id');
    else ids.push(g.id);
    if (!g.homeTeamId || !g.awayTeamId) blockers.push(`game_${g.id}_missing_team`);
    if (!toDate(g.kickoffTimestamp)) blockers.push(`game_${g.id}_invalid_kickoff`);
  }
  if (uniqueStrings(ids).length !== ids.length) {
    blockers.push('duplicate_game_ids');
  }
  return { expectedGameIds: sortIds(ids), blockers: uniqueStrings(blockers) };
}

function indexUniqueRatings(
  ratings: ShadowModelRatingRow[],
  season: number
): { byTeam: Map<string, ShadowModelRatingRow>; blockers: string[] } {
  const blockers: string[] = [];
  const byTeam = new Map<string, ShadowModelRatingRow>();
  for (const row of ratings) {
    if (row.season !== season || row.modelVersion !== 'v1') continue;
    if (byTeam.has(row.teamId)) {
      blockers.push(`duplicate_v1_rating_${row.teamId}`);
      continue;
    }
    byTeam.set(row.teamId, row);
  }
  return { byTeam, blockers };
}

export function planShadowModelPrediction(input: {
  captureRunId: string;
  predictionId: string;
  game: ShadowModelGameRow;
  frame: OperationalShadowModelFrame;
  predictionTimestamp: Date;
  model: ShadowModelDefinition;
}): PlannedShadowModelPrediction {
  const kickoff = toDate(input.game.kickoffTimestamp);
  const kickoffTimestamp = kickoff ?? new Date(0);
  const unavailable = new Set<string>();

  if (!kickoff || kickoff.getTime() <= input.predictionTimestamp.getTime()) {
    unavailable.add('post_kickoff');
  }

  let marketStatus:
    | 'selected'
    | 'missing_market'
    | 'incoherent_market'
    | 'stale_market'
    | null = null;
  let market: SelectedShadowModelMarket | null = null;
  if (input.model.marketType === 'SPREAD') {
    const selection = selectAuthorizedCoherentSpreadMarket({
      rows: input.frame.marketLines,
      gameId: input.game.id,
      homeTeamId: input.game.homeTeamId,
      awayTeamId: input.game.awayTeamId,
      predictionTimestamp: input.predictionTimestamp,
    });
    marketStatus = selection.status;
    market = selection.selected;
    if (selection.status === 'missing_market') unavailable.add('missing_market');
    if (selection.status === 'incoherent_market') unavailable.add('incoherent_market');
    if (selection.status === 'stale_market') unavailable.add('stale_market');
  } else {
    unavailable.add('market_selector_unimplemented');
  }

  const evaluated = input.model.evaluateGame({
    game: input.game,
    frame: input.frame,
    predictionTimestamp: input.predictionTimestamp,
    market: marketStatus === 'selected' ? market : null,
    marketStatus,
  });
  for (const reason of evaluated.unavailableReasons) {
    unavailable.add(reason);
  }

  if (
    unavailable.size === 0 &&
    (!isFiniteNumber(evaluated.modelValue) ||
      !isFiniteNumber(evaluated.edgeValue) ||
      !isFiniteNumber(evaluated.absEdgeValue) ||
      evaluated.selectedSide == null)
  ) {
    unavailable.add('invalid_model_output');
  }

  const unavailableReasons = orderedReasons(unavailable);
  const finalStatus: ShadowModelPredictionStatus =
    unavailableReasons.length === 0 ? 'AVAILABLE' : 'UNAVAILABLE';

  const modelValue = finalStatus === 'AVAILABLE' ? evaluated.modelValue : null;
  const edgeValue = finalStatus === 'AVAILABLE' ? evaluated.edgeValue : null;
  const absEdgeValue = finalStatus === 'AVAILABLE' ? evaluated.absEdgeValue : null;
  const selectedSide = finalStatus === 'AVAILABLE' ? evaluated.selectedSide : null;
  const selectedTeamId = finalStatus === 'AVAILABLE' ? evaluated.selectedTeamId : null;
  let predictionPickValue =
    finalStatus === 'AVAILABLE' ? evaluated.predictionPickValue : null;

  let selectedMarketLineId = market?.selectedMarketLineId ?? null;
  let selectedMarketTeamId: string | null = null;
  let selectedMarketLineValue: number | null = null;
  if (finalStatus === 'AVAILABLE' && market && selectedSide === 'HOME') {
    selectedMarketLineId = market.homeRowId;
    selectedMarketTeamId = input.game.homeTeamId;
    selectedMarketLineValue = market.homeLine;
    predictionPickValue = market.homeLine;
  } else if (finalStatus === 'AVAILABLE' && market && selectedSide === 'AWAY') {
    selectedMarketLineId = market.awayRowId;
    selectedMarketTeamId = input.game.awayTeamId;
    selectedMarketLineValue = market.awayLine;
    predictionPickValue = market.awayLine;
  }

  const inputPayload = evaluated.inputPayload;
  const inputHash = sha256CanonicalJson(inputPayload);

  return {
    id: input.predictionId,
    captureRunId: input.captureRunId,
    gameId: input.game.id,
    season: input.game.season,
    week: input.game.week,
    homeTeamId: input.game.homeTeamId,
    awayTeamId: input.game.awayTeamId,
    kickoffTimestamp,
    neutralSite: Boolean(input.game.neutralSite),
    predictionTimestamp: input.predictionTimestamp,
    predictionStatus: finalStatus,
    unavailableReasons,
    inputPayload,
    inputHash,
    featureProvenance: evaluated.featureProvenance,
    modelOutput: evaluated.modelOutput,
    marketType: input.model.marketType,
    selectedMarketLineId,
    selectedMarketTeamId,
    selectedMarketLineValue,
    canonicalMarketValue: market?.canonicalMarketValue ?? null,
    marketBook: market?.marketBook ?? null,
    marketSource: market?.marketSource ?? null,
    marketTimestamp: market?.marketTimestamp ?? null,
    marketAgeSeconds: market?.marketAgeSeconds ?? null,
    marketProvenance: (market?.marketProvenance ?? {
      status: marketStatus,
      note: 'no_coherent_authorized_spread_pair',
    }) as Record<string, unknown>,
    modelValue,
    edgeValue,
    absEdgeValue,
    selectedSide,
    selectedTeamId,
    predictionPickValue,
  };
}

export function planShadowModelCaptureRun(input: {
  season: number;
  week: number;
  mode: ShadowModelCaptureMode;
  captureContext: string;
  confirmation: string;
  repoCommitSha: string;
  predictionTimestamp: Date;
  frame: OperationalShadowModelFrame;
  model: ShadowModelDefinition;
  captureRunId?: string;
  createId?: () => string;
}): ShadowModelCapturePlan {
  const createId = input.createId ?? (() => randomUUID());
  const context = validateCaptureContext(input.captureContext);
  const confirmationValid =
    input.mode === 'PREVIEW' ||
    input.confirmation ===
      expectedShadowModelWriteConfirmation(input.week, input.model.modelDefinitionId);
  const frameCheck = validateGameFrame(input.season, input.week, input.frame.games);
  const ratingIndex = indexUniqueRatings(input.frame.ratings, input.season);

  const writeBlockers = [
    ...(context.ok ? [] : [context.reason]),
    ...frameCheck.blockers,
    ...ratingIndex.blockers,
  ];
  if (input.model.marketType !== 'SPREAD') {
    writeBlockers.push(`market_selector_unimplemented:${input.model.marketType}`);
  }
  if (input.mode === 'COMMIT' && !confirmationValid) {
    writeBlockers.push('confirmation_invalid');
  }
  if (input.season !== SHADOW_MODEL_CAPTURE_SEASON) {
    writeBlockers.push('season_must_be_2026');
  }
  if (!Number.isInteger(input.week) || input.week < 1) {
    writeBlockers.push('week_must_be_positive_integer');
  }

  const emptyCounts = deriveShadowModelRunCounts([]);
  const base = {
    season: input.season,
    week: input.week,
    mode: input.mode,
    captureContext: context.ok ? context.value : input.captureContext,
    predictionTimestamp: input.predictionTimestamp,
    repoCommitSha: input.repoCommitSha,
    modelDefinitionId: input.model.modelDefinitionId,
    modelDefinitionHash: input.model.modelDefinitionHash,
    featureDefinitionId: input.model.featureDefinitionId,
    featureDefinitionHash: input.model.featureDefinitionHash,
    policyDefinitionId: input.model.policyDefinitionId,
    policyDefinitionHash: input.model.policyDefinitionHash,
    confirmationValid,
    previewTimestampWillNotBecomeCommitTimestamp: true as const,
  };

  if (writeBlockers.length > 0) {
    return {
      ...base,
      ok: false,
      writeSafe: false,
      writeBlockers: uniqueStrings(writeBlockers),
      expectedGameIds: frameCheck.expectedGameIds,
      counts: emptyCounts,
      predictions: [],
      run: null,
    };
  }

  const captureRunId = input.captureRunId ?? createId();
  const predictions = input.frame.games.map((game) =>
    planShadowModelPrediction({
      captureRunId,
      predictionId: createId(),
      game,
      frame: input.frame,
      predictionTimestamp: input.predictionTimestamp,
      model: input.model,
    })
  );

  const counts = deriveShadowModelRunCounts(predictions);
  writeBlockers.push(...reconcileShadowModelRunCounts(counts));
  if (writeBlockers.length > 0) {
    return {
      ...base,
      ok: false,
      writeSafe: false,
      writeBlockers: uniqueStrings(writeBlockers),
      expectedGameIds: frameCheck.expectedGameIds,
      counts,
      predictions: [],
      run: null,
    };
  }

  if (!context.ok) {
    return {
      ...base,
      ok: false,
      writeSafe: false,
      writeBlockers: [context.reason],
      expectedGameIds: frameCheck.expectedGameIds,
      counts,
      predictions: [],
      run: null,
    };
  }

  const run: PlannedShadowModelCaptureRun = {
    id: captureRunId,
    season: input.season,
    week: input.week,
    captureContext: context.value,
    evaluationProtocol: SHADOW_MODEL_EVALUATION_PROTOCOL,
    modelFamily: input.model.modelFamily,
    modelDefinitionId: input.model.modelDefinitionId,
    modelDefinitionHash: input.model.modelDefinitionHash,
    modelDefinitionManifest: input.model.modelDefinitionManifest,
    featureDefinitionId: input.model.featureDefinitionId,
    featureDefinitionVersion: input.model.featureDefinitionVersion,
    featureDefinitionHash: input.model.featureDefinitionHash,
    featureDefinitionManifest: input.model.featureDefinitionManifest,
    policyDefinitionId: input.model.policyDefinitionId,
    policyDefinitionHash: input.model.policyDefinitionHash,
    policyDefinitionManifest: input.model.policyDefinitionManifest,
    repoCommitSha: input.repoCommitSha,
    captureTimestamp: input.predictionTimestamp,
    expectedGameIds: frameCheck.expectedGameIds,
    totalGames: counts.totalGames,
    availableCount: counts.availableCount,
    unavailableCount: counts.unavailableCount,
    selectionCount: counts.selectionCount,
    noSelectionCount: counts.noSelectionCount,
    status: 'COMPLETE',
    failureReason: null,
  };

  return {
    ...base,
    ok: true,
    writeSafe: true,
    writeBlockers: [],
    expectedGameIds: frameCheck.expectedGameIds,
    counts,
    predictions,
    run,
  };
}

export interface ExistingShadowModelCohort {
  run: {
    id: string;
    status: string;
    season: number;
    week: number;
    evaluationProtocol: string;
    captureContext: string;
    modelDefinitionId: string;
    modelDefinitionHash: string;
    featureDefinitionId: string;
    featureDefinitionHash: string;
    policyDefinitionId: string;
    policyDefinitionHash: string;
    repoCommitSha: string;
    expectedGameIds: unknown;
    totalGames: number;
    availableCount: number;
    unavailableCount: number;
    selectionCount: number;
    noSelectionCount: number;
  };
  predictions: Array<{
    id: string;
    gameId: string;
    predictionStatus: string;
    selectedSide: string | null;
  }>;
}

export function validateExistingCompleteCohort(
  existing: ExistingShadowModelCohort,
  model: ShadowModelDefinition,
  expectedIdentity?: {
    season: number;
    week: number;
    captureContext: string;
    repoCommitSha?: string;
  }
): string[] {
  const blockers: string[] = [];
  if (existing.run.status !== 'COMPLETE') {
    blockers.push('existing_cohort_not_complete');
  }
  if (expectedIdentity) {
    if (existing.run.season !== expectedIdentity.season) {
      blockers.push('existing_cohort_season_mismatch');
    }
    if (existing.run.week !== expectedIdentity.week) {
      blockers.push('existing_cohort_week_mismatch');
    }
    if (existing.run.captureContext !== expectedIdentity.captureContext) {
      blockers.push('existing_cohort_capture_context_mismatch');
    }
    if (
      expectedIdentity.repoCommitSha != null &&
      existing.run.repoCommitSha !== expectedIdentity.repoCommitSha
    ) {
      blockers.push('existing_cohort_repo_commit_sha_mismatch');
    }
  }
  if (existing.run.evaluationProtocol !== SHADOW_MODEL_EVALUATION_PROTOCOL) {
    blockers.push('existing_cohort_protocol_mismatch');
  }
  if (existing.run.modelDefinitionId !== model.modelDefinitionId) {
    blockers.push('existing_cohort_model_definition_id_mismatch');
  }
  if (existing.run.modelDefinitionHash !== model.modelDefinitionHash) {
    blockers.push('existing_cohort_model_definition_mismatch');
  }
  if (existing.run.featureDefinitionId !== model.featureDefinitionId) {
    blockers.push('existing_cohort_feature_definition_id_mismatch');
  }
  if (existing.run.featureDefinitionHash !== model.featureDefinitionHash) {
    blockers.push('existing_cohort_feature_definition_mismatch');
  }
  if (existing.run.policyDefinitionId !== model.policyDefinitionId) {
    blockers.push('existing_cohort_policy_definition_id_mismatch');
  }
  if (existing.run.policyDefinitionHash !== model.policyDefinitionHash) {
    blockers.push('existing_cohort_policy_definition_mismatch');
  }

  if (!Array.isArray(existing.run.expectedGameIds)) {
    blockers.push('existing_expected_game_ids_not_array');
    return uniqueStrings(blockers);
  }
  const expectedRaw = existing.run.expectedGameIds;
  const expectedStrings = expectedRaw.filter(
    (id): id is string => typeof id === 'string' && id.length > 0
  );
  if (expectedStrings.length !== expectedRaw.length) {
    blockers.push('existing_expected_game_ids_not_strings');
  }
  if (uniqueStrings(expectedStrings).length !== expectedStrings.length) {
    blockers.push('existing_expected_game_ids_not_unique');
  }
  if (expectedStrings.length !== existing.run.totalGames) {
    blockers.push('existing_expected_game_count_mismatch');
  }
  if (existing.predictions.length !== existing.run.totalGames) {
    blockers.push('existing_prediction_row_count_mismatch');
  }
  const snapshotGameIds = existing.predictions.map((s) => s.gameId);
  if (uniqueStrings(snapshotGameIds).length !== snapshotGameIds.length) {
    blockers.push('existing_duplicate_prediction_game');
  }
  if (
    canonicalJsonString(sortIds(expectedStrings)) !==
    canonicalJsonString(sortIds(snapshotGameIds))
  ) {
    blockers.push('existing_prediction_game_set_mismatch');
  }

  const derived = deriveShadowModelRunCounts(
    existing.predictions.map((p) => ({
      predictionStatus: p.predictionStatus as ShadowModelPredictionStatus,
      selectedSide: p.selectedSide as ShadowModelSelectedSide | null,
    }))
  );
  if (derived.availableCount !== existing.run.availableCount) {
    blockers.push('existing_available_count_mismatch');
  }
  if (derived.unavailableCount !== existing.run.unavailableCount) {
    blockers.push('existing_unavailable_count_mismatch');
  }
  if (derived.selectionCount !== existing.run.selectionCount) {
    blockers.push('existing_selection_count_mismatch');
  }
  if (derived.noSelectionCount !== existing.run.noSelectionCount) {
    blockers.push('existing_no_selection_count_mismatch');
  }
  blockers.push(...reconcileShadowModelRunCounts(derived));
  return uniqueStrings(blockers);
}

function countsFromValidExisting(existing: ExistingShadowModelCohort): ShadowModelRunCounts {
  return {
    totalGames: existing.run.totalGames,
    availableCount: existing.run.availableCount,
    unavailableCount: existing.run.unavailableCount,
    selectionCount: existing.run.selectionCount,
    noSelectionCount: existing.run.noSelectionCount,
  };
}

function predictionSummaries(
  predictions: PlannedShadowModelPrediction[]
): ShadowModelGameReportRow[] {
  return predictions.map((p) => ({
    gameId: p.gameId,
    kickoffTimestamp: toIso(p.kickoffTimestamp),
    inputHash: p.inputHash,
    predictionStatus: p.predictionStatus,
    unavailableReasons: p.unavailableReasons,
    marketType: p.marketType,
    selectedMarketLineId: p.selectedMarketLineId,
    selectedMarketTeamId: p.selectedMarketTeamId,
    selectedMarketLineValue: p.selectedMarketLineValue,
    canonicalMarketValue: p.canonicalMarketValue,
    marketBook: p.marketBook,
    marketSource: p.marketSource,
    marketTimestamp: toIso(p.marketTimestamp),
    marketAgeSeconds: p.marketAgeSeconds,
    marketProvenance: p.marketProvenance,
    modelValue: p.modelValue,
    edgeValue: p.edgeValue,
    absEdgeValue: p.absEdgeValue,
    selectedSide: p.selectedSide,
    selectedTeamId: p.selectedTeamId,
    predictionPickValue: p.predictionPickValue,
  }));
}

function existingPredictionSummaries(
  existing: ExistingShadowModelCohort
): ShadowModelGameReportRow[] {
  return existing.predictions.map((p) => ({
    gameId: p.gameId,
    kickoffTimestamp: null,
    inputHash: null,
    predictionStatus: p.predictionStatus as ShadowModelPredictionStatus,
    unavailableReasons: [],
    marketType: 'SPREAD',
    selectedMarketLineId: null,
    selectedMarketTeamId: null,
    selectedMarketLineValue: null,
    canonicalMarketValue: null,
    marketBook: null,
    marketSource: null,
    marketTimestamp: null,
    marketAgeSeconds: null,
    marketProvenance: null,
    modelValue: null,
    edgeValue: null,
    absEdgeValue: null,
    selectedSide: (p.selectedSide as ShadowModelSelectedSide | null) ?? null,
    selectedTeamId: null,
    predictionPickValue: null,
  }));
}

export interface ShadowModelGameReportRow {
  gameId: string;
  kickoffTimestamp: string | null;
  inputHash: string | null;
  predictionStatus: ShadowModelPredictionStatus;
  unavailableReasons: string[];
  marketType: ShadowModelMarketType;
  selectedMarketLineId: string | null;
  selectedMarketTeamId: string | null;
  selectedMarketLineValue: number | null;
  canonicalMarketValue: number | null;
  marketBook: string | null;
  marketSource: string | null;
  marketTimestamp: string | null;
  marketAgeSeconds: number | null;
  marketProvenance: Record<string, unknown> | null;
  modelValue: number | null;
  edgeValue: number | null;
  absEdgeValue: number | null;
  selectedSide: ShadowModelSelectedSide | null;
  selectedTeamId: string | null;
  predictionPickValue: number | null;
}

export interface ShadowModelCaptureReport {
  season: number;
  week: number;
  mode: ShadowModelCaptureMode;
  captureContext: string;
  previewObservedTimestamp: string | null;
  commitObservedTimestamp: string | null;
  previewTimestampWillNotBecomeCommitTimestamp: true;
  repoCommitSha: string;
  modelDefinitionId: string;
  modelDefinitionHash: string;
  featureDefinitionId: string;
  featureDefinitionHash: string;
  policyDefinitionId: string;
  policyDefinitionHash: string;
  expectedGameIds: string[];
  counts: ShadowModelRunCounts;
  writeSafe: boolean;
  writeBlockers: string[];
  games: ShadowModelGameReportRow[];
  marketAgeSeconds: number[];
  providerCalls: 0;
  mutationsInvoked: boolean;
  betWrites: false;
  matchupOutputWrites: false;
  hybridShadowWrites: false;
  existingCohort: 'none' | 'complete_valid_noop' | 'malformed';
}

export interface ShadowModelMutationTx {
  findCohort(): Promise<ExistingShadowModelCohort | null>;
  loadFrame(): Promise<OperationalShadowModelFrame>;
  now(): Date;
  createRun(run: PlannedShadowModelCaptureRun): Promise<void>;
  createPredictions(rows: PlannedShadowModelPrediction[]): Promise<number>;
  countPredictions(captureRunId: string): Promise<number>;
}

export interface ShadowModelCapturePersistence {
  now(): Date;
  createId(): string;
  findCohort(): Promise<ExistingShadowModelCohort | null>;
  loadFrame(): Promise<OperationalShadowModelFrame>;
  runTransaction<T>(fn: (tx: ShadowModelMutationTx) => Promise<T>): Promise<T>;
  readRun(id: string): Promise<ExistingShadowModelCohort | null>;
  /** Read-only fingerprint of season/week official_flat_100 Bet rows. */
  fingerprintOfficialFlat100Bets(): Promise<string>;
}

export interface ShadowModelCaptureExecution {
  mode: ShadowModelCaptureMode;
  providerCalls: 0;
  mutationsInvoked: boolean;
  commitSucceeded: boolean;
  persistenceCommitted: boolean;
  rolledBack: boolean;
  transactionalIdempotentNoOp: boolean;
  insertedRunId: string | null;
  insertedPredictionCount: number;
  error: string | null;
  verificationOk: boolean | null;
  verificationReasons: string[];
  betWrites: false;
  matchupOutputWrites: false;
  hybridShadowWrites: false;
}

function verifyCommittedCohort(
  existing: ExistingShadowModelCohort,
  plan: ShadowModelCapturePlan,
  model: ShadowModelDefinition,
  expectedIdentity: {
    season: number;
    week: number;
    captureContext: string;
    repoCommitSha: string;
  }
): string[] {
  const reasons = validateExistingCompleteCohort(existing, model, expectedIdentity);
  if (!plan.run) {
    reasons.push('committed_plan_run_missing');
    return uniqueStrings(reasons);
  }
  if (existing.run.id !== plan.run.id) reasons.push('committed_run_id_mismatch');
  if (existing.run.repoCommitSha !== plan.run.repoCommitSha) {
    reasons.push('committed_repo_commit_sha_mismatch');
  }
  if (
    canonicalJsonString(existing.run.expectedGameIds) !==
    canonicalJsonString(plan.run.expectedGameIds)
  ) {
    reasons.push('committed_expected_game_ids_mismatch');
  }
  if (existing.run.availableCount !== plan.run.availableCount) {
    reasons.push('committed_available_count_mismatch');
  }
  if (existing.run.unavailableCount !== plan.run.unavailableCount) {
    reasons.push('committed_unavailable_count_mismatch');
  }
  if (existing.run.selectionCount !== plan.run.selectionCount) {
    reasons.push('committed_selection_count_mismatch');
  }
  if (existing.run.noSelectionCount !== plan.run.noSelectionCount) {
    reasons.push('committed_no_selection_count_mismatch');
  }
  return uniqueStrings(reasons);
}

export async function executeShadowModelCapture(input: {
  season: number;
  week: number;
  mode: ShadowModelCaptureMode;
  captureContext: string;
  confirmation: string;
  repoCommitSha: string;
  model: ShadowModelDefinition;
  persistence: ShadowModelCapturePersistence;
}): Promise<{
  plan: ShadowModelCapturePlan;
  execution: ShadowModelCaptureExecution;
  report: ShadowModelCaptureReport;
}> {
  const expectedIdentity = {
    season: input.season,
    week: input.week,
    captureContext: input.captureContext,
    repoCommitSha: input.repoCommitSha,
  };

  const emptyExecution = (
    partial: Partial<ShadowModelCaptureExecution>
  ): ShadowModelCaptureExecution => ({
    mode: input.mode,
    providerCalls: 0,
    mutationsInvoked: false,
    commitSucceeded: false,
    persistenceCommitted: false,
    rolledBack: false,
    transactionalIdempotentNoOp: false,
    insertedRunId: null,
    insertedPredictionCount: 0,
    error: null,
    verificationOk: null,
    verificationReasons: [],
    betWrites: false,
    matchupOutputWrites: false,
    hybridShadowWrites: false,
    ...partial,
  });

  const buildReport = (
    plan: ShadowModelCapturePlan,
    execution: ShadowModelCaptureExecution,
    existingCohort: ShadowModelCaptureReport['existingCohort']
  ): ShadowModelCaptureReport => ({
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
    featureDefinitionId: plan.featureDefinitionId,
    featureDefinitionHash: plan.featureDefinitionHash,
    policyDefinitionId: plan.policyDefinitionId,
    policyDefinitionHash: plan.policyDefinitionHash,
    expectedGameIds: plan.expectedGameIds,
    counts: plan.counts,
    writeSafe: plan.writeSafe,
    writeBlockers: plan.writeBlockers,
    games: predictionSummaries(plan.predictions),
    marketAgeSeconds: plan.predictions
      .map((p) => p.marketAgeSeconds)
      .filter((v): v is number => typeof v === 'number'),
    providerCalls: 0,
    mutationsInvoked: execution.mutationsInvoked,
    betWrites: false,
    matchupOutputWrites: false,
    hybridShadowWrites: false,
    existingCohort,
  });

  if (input.mode === 'PREVIEW') {
    const existingPreview = await input.persistence.findCohort();
    if (existingPreview) {
      const integrity = validateExistingCompleteCohort(
        existingPreview,
        input.model,
        expectedIdentity
      );
      const expected = Array.isArray(existingPreview.run.expectedGameIds)
        ? existingPreview.run.expectedGameIds.filter(
            (id): id is string => typeof id === 'string'
          )
        : [];
      const plan: ShadowModelCapturePlan = {
        ok: integrity.length === 0,
        writeSafe: integrity.length === 0,
        writeBlockers: integrity,
        season: input.season,
        week: input.week,
        mode: 'PREVIEW',
        captureContext: input.captureContext,
        predictionTimestamp: input.persistence.now(),
        repoCommitSha: input.repoCommitSha,
        modelDefinitionId: input.model.modelDefinitionId,
        modelDefinitionHash: input.model.modelDefinitionHash,
        featureDefinitionId: input.model.featureDefinitionId,
        featureDefinitionHash: input.model.featureDefinitionHash,
        policyDefinitionId: input.model.policyDefinitionId,
        policyDefinitionHash: input.model.policyDefinitionHash,
        expectedGameIds: sortIds(expected),
        counts:
          integrity.length === 0
            ? countsFromValidExisting(existingPreview)
            : deriveShadowModelRunCounts([]),
        predictions: [],
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
      report.games = existingPredictionSummaries(existingPreview);
      return { plan, execution, report };
    }

    const frame = await input.persistence.loadFrame();
    const previewTimestamp = input.persistence.now();
    const plan = planShadowModelCaptureRun({
      season: input.season,
      week: input.week,
      mode: 'PREVIEW',
      captureContext: input.captureContext,
      confirmation: input.confirmation,
      repoCommitSha: input.repoCommitSha,
      predictionTimestamp: previewTimestamp,
      frame,
      model: input.model,
      createId: input.persistence.createId,
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

  const confirmationValid =
    input.confirmation ===
    expectedShadowModelWriteConfirmation(input.week, input.model.modelDefinitionId);
  if (!confirmationValid) {
    const frame = await input.persistence.loadFrame();
    const plan = planShadowModelCaptureRun({
      season: input.season,
      week: input.week,
      mode: 'COMMIT',
      captureContext: input.captureContext,
      confirmation: input.confirmation,
      repoCommitSha: input.repoCommitSha,
      predictionTimestamp: input.persistence.now(),
      frame,
      model: input.model,
      createId: input.persistence.createId,
    });
    const execution = emptyExecution({ error: 'confirmation_invalid' });
    return { plan, execution, report: buildReport(plan, execution, 'none') };
  }

  const existing = await input.persistence.findCohort();
  if (existing) {
    const integrity = validateExistingCompleteCohort(
      existing,
      input.model,
      expectedIdentity
    );
    if (integrity.length > 0) {
      const plan: ShadowModelCapturePlan = {
        ok: false,
        writeSafe: false,
        writeBlockers: integrity,
        season: input.season,
        week: input.week,
        mode: 'COMMIT',
        captureContext: input.captureContext,
        predictionTimestamp: input.persistence.now(),
        repoCommitSha: input.repoCommitSha,
        modelDefinitionId: input.model.modelDefinitionId,
        modelDefinitionHash: input.model.modelDefinitionHash,
        featureDefinitionId: input.model.featureDefinitionId,
        featureDefinitionHash: input.model.featureDefinitionHash,
        policyDefinitionId: input.model.policyDefinitionId,
        policyDefinitionHash: input.model.policyDefinitionHash,
        expectedGameIds: Array.isArray(existing.run.expectedGameIds)
          ? sortIds(
              existing.run.expectedGameIds.filter(
                (id): id is string => typeof id === 'string'
              )
            )
          : [],
        counts: deriveShadowModelRunCounts([]),
        predictions: [],
        run: null,
        confirmationValid: true,
        previewTimestampWillNotBecomeCommitTimestamp: true,
      };
      const execution = emptyExecution({
        error: `existing_cohort_malformed: ${integrity.join('; ')}`,
      });
      const report = buildReport(plan, execution, 'malformed');
      report.games = existingPredictionSummaries(existing);
      return { plan, execution, report };
    }

    const expected = Array.isArray(existing.run.expectedGameIds)
      ? existing.run.expectedGameIds.filter((id): id is string => typeof id === 'string')
      : [];
    const betFingerprintBefore = await input.persistence.fingerprintOfficialFlat100Bets();
    const plan: ShadowModelCapturePlan = {
      ok: true,
      writeSafe: true,
      writeBlockers: [],
      season: input.season,
      week: input.week,
      mode: 'COMMIT',
      captureContext: input.captureContext,
      predictionTimestamp: new Date(0),
      repoCommitSha: input.repoCommitSha,
      modelDefinitionId: input.model.modelDefinitionId,
      modelDefinitionHash: input.model.modelDefinitionHash,
      featureDefinitionId: input.model.featureDefinitionId,
      featureDefinitionHash: input.model.featureDefinitionHash,
      policyDefinitionId: input.model.policyDefinitionId,
      policyDefinitionHash: input.model.policyDefinitionHash,
      expectedGameIds: sortIds(expected),
      counts: countsFromValidExisting(existing),
      predictions: [],
      run: null,
      confirmationValid: true,
      previewTimestampWillNotBecomeCommitTimestamp: true,
    };
    const betFingerprintAfter = await input.persistence.fingerprintOfficialFlat100Bets();
    const fingerprintChanged =
      betFingerprintBefore !== betFingerprintAfter
        ? ['official_flat_100_bet_fingerprint_changed']
        : [];
    const execution = emptyExecution({
      commitSucceeded: fingerprintChanged.length === 0,
      transactionalIdempotentNoOp: fingerprintChanged.length === 0,
      insertedRunId: existing.run.id,
      insertedPredictionCount: 0,
      verificationOk: fingerprintChanged.length === 0,
      verificationReasons: fingerprintChanged,
      error: fingerprintChanged.length ? fingerprintChanged.join('; ') : null,
    });
    const report = buildReport(plan, execution, 'complete_valid_noop');
    report.games = existingPredictionSummaries(existing);
    return { plan, execution, report };
  }

  let mutationsInvoked = false;
  let insertedRunId: string | null = null;
  let insertedPredictionCount = 0;
  let planned: ShadowModelCapturePlan | null = null;
  const betFingerprintBefore = await input.persistence.fingerprintOfficialFlat100Bets();

  try {
    const txResult = await input.persistence.runTransaction(async (tx) => {
      const again = await tx.findCohort();
      if (again) {
        throw new Error('cohort_exists_inside_transaction');
      }
      const frame = await tx.loadFrame();
      const commitTimestamp = tx.now();
      const plan = planShadowModelCaptureRun({
        season: input.season,
        week: input.week,
        mode: 'COMMIT',
        captureContext: input.captureContext,
        confirmation: input.confirmation,
        repoCommitSha: input.repoCommitSha,
        predictionTimestamp: commitTimestamp,
        frame,
        model: input.model,
        createId: input.persistence.createId,
      });
      planned = plan;
      if (!plan.ok || !plan.run) {
        throw new Error(`commit_plan_invalid: ${plan.writeBlockers.join('; ')}`);
      }
      mutationsInvoked = true;
      await tx.createRun(plan.run);
      insertedRunId = plan.run.id;
      insertedPredictionCount = await tx.createPredictions(plan.predictions);
      const counted = await tx.countPredictions(plan.run.id);
      if (
        counted !== plan.predictions.length ||
        insertedPredictionCount !== plan.predictions.length
      ) {
        throw new Error('in_transaction_prediction_count_mismatch');
      }
      return plan;
    });
    planned = txResult;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const plan =
      planned ??
      planShadowModelCaptureRun({
        season: input.season,
        week: input.week,
        mode: 'COMMIT',
        captureContext: input.captureContext,
        confirmation: input.confirmation,
        repoCommitSha: input.repoCommitSha,
        predictionTimestamp: input.persistence.now(),
        frame: { games: [], ratings: [], marketLines: [] },
        model: input.model,
        createId: input.persistence.createId,
      });
    const execution = emptyExecution({
      mutationsInvoked,
      rolledBack: true,
      error: msg,
      insertedRunId,
      insertedPredictionCount,
    });
    return { plan, execution, report: buildReport(plan, execution, 'none') };
  }

  const plan = planned as ShadowModelCapturePlan;
  const readBack = insertedRunId ? await input.persistence.readRun(insertedRunId) : null;
  const betFingerprintAfter = await input.persistence.fingerprintOfficialFlat100Bets();
  const verificationReasons: string[] = [];
  if (!insertedRunId) verificationReasons.push('committed_run_id_missing');
  if (!readBack) verificationReasons.push('committed_run_not_readable');
  else
    verificationReasons.push(
      ...verifyCommittedCohort(readBack, plan, input.model, expectedIdentity)
    );
  if (betFingerprintAfter !== betFingerprintBefore) {
    verificationReasons.push('official_flat_100_bet_fingerprint_changed');
  }

  const verificationOk = verificationReasons.length === 0;
  const execution = emptyExecution({
    mutationsInvoked: true,
    commitSucceeded: verificationOk,
    persistenceCommitted: true,
    insertedRunId,
    insertedPredictionCount,
    verificationOk,
    verificationReasons,
    error: verificationOk ? null : verificationReasons.join('; '),
  });
  return { plan, execution, report: buildReport(plan, execution, 'none') };
}

export function fingerprintOfficialFlat100BetRows(
  rows: Array<{
    id: string;
    season: number;
    week: number;
    gameId: string;
    marketType: string;
    side: string;
    modelPrice: number | null;
    closePrice: number | null;
    stake: number | null;
    strategyTag: string;
    source: string;
    result: string | null;
    pnl: number | null;
    clv: number | null;
    createdAt: Date | string;
    updatedAt: Date | string;
  }>
): string {
  const normalized = [...rows]
    .map((row) => ({
      id: row.id,
      season: row.season,
      week: row.week,
      gameId: row.gameId,
      marketType: row.marketType,
      side: row.side,
      modelPrice: row.modelPrice,
      closePrice: row.closePrice,
      stake: row.stake,
      strategyTag: row.strategyTag,
      source: row.source,
      result: row.result,
      pnl: row.pnl,
      clv: row.clv,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return sha256CanonicalJson(normalized);
}

export function resolvePreviewExitCode(writeSafe: boolean): number {
  return writeSafe ? 0 : 1;
}

export function marketAgeDistribution(ages: number[]): Record<string, number> {
  const buckets: Record<string, number> = {
    '0_300': 0,
    '301_900': 0,
    '901_1800': 0,
    over_1800: 0,
    unknown: 0,
  };
  for (const age of ages) {
    if (!Number.isFinite(age)) {
      buckets.unknown += 1;
    } else if (age <= 300) {
      buckets['0_300'] += 1;
    } else if (age <= 900) {
      buckets['301_900'] += 1;
    } else if (age <= 1800) {
      buckets['901_1800'] += 1;
    } else {
      buckets.over_1800 += 1;
    }
  }
  return buckets;
}
