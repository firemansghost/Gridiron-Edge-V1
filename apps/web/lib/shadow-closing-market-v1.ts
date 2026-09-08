/**
 * Shadow Snapshot V1 — deterministic T-30 closing-market capture.
 *
 * This module plans and executes the append-only closing benchmark only.
 * It does not call providers, mutate prediction snapshots, write Bets /
 * MatchupOutputs, or evaluate ATS / CLV.
 */

import { randomUUID } from 'crypto';
import { compareMarketLineRecency } from './market-line-snapshot';
import {
  SHADOW_CAPTURE_SEASON,
  SHADOW_EVALUATION_PROTOCOL,
  SHADOW_POLICY_DEFINITION_HASH,
  SHADOW_POLICY_DEFINITION_ID,
  canonicalMarketSpreadHma,
  toDate,
  type ShadowMarketLineRow,
} from './shadow-snapshot-v1';

export const SHADOW_T30_OFFSET_MS = 30 * 60 * 1000;
export const SHADOW_CLOSING_MARKET_TYPE = 'SPREAD' as const;
export const SHADOW_CLOSING_MISSING_MARKET_REASON =
  'missing_market_at_or_before_t30' as const;

export type ShadowClosingCaptureMode = 'PREVIEW' | 'COMMIT';
export type ShadowClosingAvailabilityStatus = 'AVAILABLE' | 'UNAVAILABLE';
export type ShadowClosingGameState = 'EXISTING' | 'FUTURE' | 'DUE' | 'MISSED';

export interface ShadowClosingGameRow {
  id: string;
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  kickoffTimestamp: Date | string;
}

export interface ExistingShadowClosingRow {
  id: string;
  gameId: string;
  evaluationProtocol: string;
  policyDefinitionId: string;
  policyDefinitionHash: string;
  marketType: string;
  targetTimestamp: Date | string;
  status: string;
  unavailableReason: string | null;
  selectedMarketLineId: string | null;
  selectedMarketTeamId: string | null;
  selectedMarketLineValue: number | null;
  canonicalMarketHma: number | null;
  book: string | null;
  source: string | null;
  marketObservationTimestamp: Date | string | null;
  capturedAt: Date | string;
}

export interface OperationalShadowClosingFrame {
  games: ShadowClosingGameRow[];
  predictionFrames: string[][];
  marketLines: ShadowMarketLineRow[];
  existingClosings: ExistingShadowClosingRow[];
}

export interface SelectedShadowClosingMarket {
  selectedMarketLineId: string;
  selectedMarketTeamId: string;
  selectedMarketLineValue: number;
  canonicalMarketHma: number;
  book: string;
  source: string;
  marketObservationTimestamp: Date;
}

export interface PlannedShadowClosingMarketSnapshot {
  id: string;
  gameId: string;
  evaluationProtocol: typeof SHADOW_EVALUATION_PROTOCOL;
  policyDefinitionId: typeof SHADOW_POLICY_DEFINITION_ID;
  policyDefinitionHash: string;
  marketType: typeof SHADOW_CLOSING_MARKET_TYPE;
  targetTimestamp: Date;
  status: ShadowClosingAvailabilityStatus;
  unavailableReason: string | null;
  selectedMarketLineId: string | null;
  selectedMarketTeamId: string | null;
  selectedMarketLineValue: number | null;
  canonicalMarketHma: number | null;
  book: string | null;
  source: string | null;
  marketObservationTimestamp: Date | null;
  capturedAt: Date;
}

export interface ShadowClosingGamePlan {
  gameId: string;
  kickoffTimestamp: Date;
  targetTimestamp: Date;
  state: ShadowClosingGameState;
  existingClosingId: string | null;
  plannedSnapshot: PlannedShadowClosingMarketSnapshot | null;
}

export interface ShadowClosingCounts {
  totalGames: number;
  predictionEvidenceGames: number;
  existingCount: number;
  futureCount: number;
  dueCount: number;
  missedCount: number;
  plannedAvailableCount: number;
  plannedUnavailableCount: number;
  plannedInsertCount: number;
}

export interface ShadowClosingPlan {
  ok: boolean;
  writeSafe: boolean;
  writeBlockers: string[];
  season: number;
  week: number;
  mode: ShadowClosingCaptureMode;
  observedTimestamp: Date;
  policyDefinitionId: typeof SHADOW_POLICY_DEFINITION_ID;
  policyDefinitionHash: string;
  expectedGameIds: string[];
  counts: ShadowClosingCounts;
  games: ShadowClosingGamePlan[];
  rowsToInsert: PlannedShadowClosingMarketSnapshot[];
  confirmationValid: boolean;
  previewTimestampWillNotBecomeCommitTimestamp: true;
}

export function expectedClosingWriteConfirmation(week: number): string {
  return `CAPTURE_2026_WEEK_${week}_T30_CLOSING_V1`;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function sortIds(values: string[]): string[] {
  return [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function sameStringSet(a: string[], b: string[]): boolean {
  const aa = sortIds(uniqueStrings(a));
  const bb = sortIds(uniqueStrings(b));
  return JSON.stringify(aa) === JSON.stringify(bb);
}

function iso(value: Date | string | null | undefined): string | null {
  const d = toDate(value);
  return d ? d.toISOString() : null;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function shadowClosingTargetTimestamp(kickoff: Date | string): Date | null {
  const date = toDate(kickoff);
  if (!date) return null;
  return new Date(date.getTime() - SHADOW_T30_OFFSET_MS);
}

export function selectShadowClosingMarket(input: {
  rows: ShadowMarketLineRow[];
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  targetTimestamp: Date;
}): SelectedShadowClosingMarket | null {
  const eligible = input.rows
    .filter((row) => row.gameId === input.gameId && String(row.lineType) === 'spread')
    .filter((row) => {
      const ts = toDate(row.timestamp);
      return ts != null && ts.getTime() <= input.targetTimestamp.getTime();
    })
    .sort(compareMarketLineRecency);

  for (const row of eligible) {
    if (!finite(row.lineValue)) continue;
    if (row.teamId !== input.homeTeamId && row.teamId !== input.awayTeamId) continue;
    if (!row.bookName || !row.source) continue;
    const canonical = canonicalMarketSpreadHma({
      lineValue: row.lineValue,
      teamId: row.teamId,
      homeTeamId: input.homeTeamId,
      awayTeamId: input.awayTeamId,
    });
    const ts = toDate(row.timestamp);
    if (canonical == null || !finite(canonical) || !ts) continue;
    return {
      selectedMarketLineId: row.id,
      selectedMarketTeamId: row.teamId as string,
      selectedMarketLineValue: row.lineValue,
      canonicalMarketHma: canonical,
      book: row.bookName,
      source: row.source,
      marketObservationTimestamp: ts,
    };
  }
  return null;
}

export function validateExistingShadowClosing(input: {
  row: ExistingShadowClosingRow;
  game: ShadowClosingGameRow;
  marketLines: ShadowMarketLineRow[];
}): string[] {
  const blockers: string[] = [];
  const kickoff = toDate(input.game.kickoffTimestamp);
  const target = shadowClosingTargetTimestamp(input.game.kickoffTimestamp);
  const actualTarget = toDate(input.row.targetTimestamp);
  const capturedAt = toDate(input.row.capturedAt);

  if (!kickoff || !target || !actualTarget || !capturedAt) {
    blockers.push('existing_closing_invalid_timestamp');
    return blockers;
  }
  if (input.row.gameId !== input.game.id) blockers.push('existing_closing_game_mismatch');
  if (input.row.evaluationProtocol !== SHADOW_EVALUATION_PROTOCOL) {
    blockers.push('existing_closing_protocol_mismatch');
  }
  if (input.row.policyDefinitionId !== SHADOW_POLICY_DEFINITION_ID) {
    blockers.push('existing_closing_policy_id_mismatch');
  }
  if (input.row.policyDefinitionHash !== SHADOW_POLICY_DEFINITION_HASH) {
    blockers.push('existing_closing_policy_hash_mismatch');
  }
  if (String(input.row.marketType) !== SHADOW_CLOSING_MARKET_TYPE) {
    blockers.push('existing_closing_market_type_mismatch');
  }
  if (actualTarget.getTime() !== target.getTime()) {
    blockers.push('existing_closing_target_mismatch');
  }
  if (capturedAt.getTime() >= kickoff.getTime()) {
    blockers.push('existing_closing_captured_post_kickoff');
  }

  if (input.row.status === 'AVAILABLE') {
    if (
      !input.row.selectedMarketLineId ||
      !input.row.selectedMarketTeamId ||
      !finite(input.row.selectedMarketLineValue) ||
      !finite(input.row.canonicalMarketHma) ||
      !input.row.book ||
      !input.row.source ||
      !input.row.marketObservationTimestamp ||
      input.row.unavailableReason != null
    ) {
      blockers.push('existing_available_closing_missing_fields');
      return uniqueStrings(blockers);
    }
    const observation = toDate(input.row.marketObservationTimestamp);
    if (!observation || observation.getTime() > target.getTime()) {
      blockers.push('existing_closing_falls_forward_after_t30');
      return uniqueStrings(blockers);
    }
    const sourceRow = input.marketLines.find((r) => r.id === input.row.selectedMarketLineId);
    if (!sourceRow) {
      blockers.push('existing_closing_market_line_missing');
      return uniqueStrings(blockers);
    }
    const sourceTs = toDate(sourceRow.timestamp);
    const sourceCanonical = canonicalMarketSpreadHma({
      lineValue: sourceRow.lineValue,
      teamId: sourceRow.teamId,
      homeTeamId: input.game.homeTeamId,
      awayTeamId: input.game.awayTeamId,
    });
    if (
      sourceRow.gameId !== input.game.id ||
      String(sourceRow.lineType) !== 'spread' ||
      sourceRow.teamId !== input.row.selectedMarketTeamId ||
      sourceRow.lineValue !== input.row.selectedMarketLineValue ||
      sourceCanonical !== input.row.canonicalMarketHma ||
      sourceRow.bookName !== input.row.book ||
      sourceRow.source !== input.row.source ||
      !sourceTs ||
      sourceTs.getTime() !== observation.getTime()
    ) {
      blockers.push('existing_closing_market_line_mismatch');
    }
  } else if (input.row.status === 'UNAVAILABLE') {
    if (!input.row.unavailableReason) blockers.push('existing_unavailable_closing_missing_reason');
    if (
      input.row.selectedMarketLineId != null ||
      input.row.selectedMarketTeamId != null ||
      input.row.selectedMarketLineValue != null ||
      input.row.canonicalMarketHma != null ||
      input.row.book != null ||
      input.row.source != null ||
      input.row.marketObservationTimestamp != null
    ) {
      blockers.push('existing_unavailable_closing_has_market_fields');
    }
  } else {
    blockers.push('existing_closing_status_unrecognized');
  }
  return uniqueStrings(blockers);
}

export function planShadowClosingCapture(input: {
  season: number;
  week: number;
  mode: ShadowClosingCaptureMode;
  confirmation: string;
  observedTimestamp: Date;
  frame: OperationalShadowClosingFrame;
  createId?: () => string;
}): ShadowClosingPlan {
  const createId = input.createId ?? (() => randomUUID());
  const blockers: string[] = [];
  const confirmationValid =
    input.mode === 'PREVIEW' ||
    input.confirmation === expectedClosingWriteConfirmation(input.week);

  if (input.season !== SHADOW_CAPTURE_SEASON) blockers.push(`season_must_be_${SHADOW_CAPTURE_SEASON}`);
  if (!Number.isInteger(input.week) || input.week < 1) blockers.push('week_must_be_positive_integer');
  if (input.frame.games.length === 0) blockers.push('zero_games');
  if (input.mode !== 'PREVIEW' && input.mode !== 'COMMIT') blockers.push('mode_invalid');
  if (input.mode === 'COMMIT' && !confirmationValid) blockers.push('confirmation_invalid');

  const gameIds = input.frame.games.map((g) => g.id);
  if (uniqueStrings(gameIds).length !== gameIds.length) blockers.push('duplicate_game_ids');
  for (const game of input.frame.games) {
    if (
      game.season !== input.season ||
      game.week !== input.week ||
      !game.id ||
      !game.homeTeamId ||
      !game.awayTeamId ||
      game.homeTeamId === game.awayTeamId ||
      !toDate(game.kickoffTimestamp)
    ) {
      blockers.push('contradictory_game_identity');
      break;
    }
  }

  const matchingPredictionFrame = input.frame.predictionFrames.find((frame) =>
    sameStringSet(gameIds, frame)
  );
  const predictionIds = matchingPredictionFrame
    ? uniqueStrings(matchingPredictionFrame)
    : uniqueStrings(input.frame.predictionFrames.flatMap((frame) => frame));
  if (!matchingPredictionFrame) {
    blockers.push('prediction_evidence_frame_mismatch');
  }

  const existingByGame = new Map<string, ExistingShadowClosingRow>();
  for (const row of input.frame.existingClosings) {
    if (existingByGame.has(row.gameId)) blockers.push('duplicate_existing_closing_game');
    existingByGame.set(row.gameId, row);
  }

  const games: ShadowClosingGamePlan[] = [];
  for (const gameId of sortIds(gameIds)) {
    const game = input.frame.games.find((g) => g.id === gameId) as ShadowClosingGameRow;
    const kickoff = toDate(game.kickoffTimestamp) as Date;
    const target = shadowClosingTargetTimestamp(kickoff) as Date;
    const existing = existingByGame.get(gameId) ?? null;

    if (existing) {
      blockers.push(
        ...validateExistingShadowClosing({ row: existing, game, marketLines: input.frame.marketLines })
      );
      games.push({
        gameId,
        kickoffTimestamp: kickoff,
        targetTimestamp: target,
        state: 'EXISTING',
        existingClosingId: existing.id,
        plannedSnapshot: null,
      });
      continue;
    }

    if (input.observedTimestamp.getTime() < target.getTime()) {
      games.push({
        gameId,
        kickoffTimestamp: kickoff,
        targetTimestamp: target,
        state: 'FUTURE',
        existingClosingId: null,
        plannedSnapshot: null,
      });
      continue;
    }

    // Operational anti-backfill guard: once kickoff has arrived, do not create
    // a new closing evidence row after the outcome window has opened.
    if (input.observedTimestamp.getTime() >= kickoff.getTime()) {
      games.push({
        gameId,
        kickoffTimestamp: kickoff,
        targetTimestamp: target,
        state: 'MISSED',
        existingClosingId: null,
        plannedSnapshot: null,
      });
      continue;
    }

    const selected = selectShadowClosingMarket({
      rows: input.frame.marketLines,
      gameId,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      targetTimestamp: target,
    });

    const plannedSnapshot: PlannedShadowClosingMarketSnapshot = selected
      ? {
          id: createId(),
          gameId,
          evaluationProtocol: SHADOW_EVALUATION_PROTOCOL,
          policyDefinitionId: SHADOW_POLICY_DEFINITION_ID,
          policyDefinitionHash: SHADOW_POLICY_DEFINITION_HASH,
          marketType: SHADOW_CLOSING_MARKET_TYPE,
          targetTimestamp: target,
          status: 'AVAILABLE',
          unavailableReason: null,
          selectedMarketLineId: selected.selectedMarketLineId,
          selectedMarketTeamId: selected.selectedMarketTeamId,
          selectedMarketLineValue: selected.selectedMarketLineValue,
          canonicalMarketHma: selected.canonicalMarketHma,
          book: selected.book,
          source: selected.source,
          marketObservationTimestamp: selected.marketObservationTimestamp,
          capturedAt: input.observedTimestamp,
        }
      : {
          id: createId(),
          gameId,
          evaluationProtocol: SHADOW_EVALUATION_PROTOCOL,
          policyDefinitionId: SHADOW_POLICY_DEFINITION_ID,
          policyDefinitionHash: SHADOW_POLICY_DEFINITION_HASH,
          marketType: SHADOW_CLOSING_MARKET_TYPE,
          targetTimestamp: target,
          status: 'UNAVAILABLE',
          unavailableReason: SHADOW_CLOSING_MISSING_MARKET_REASON,
          selectedMarketLineId: null,
          selectedMarketTeamId: null,
          selectedMarketLineValue: null,
          canonicalMarketHma: null,
          book: null,
          source: null,
          marketObservationTimestamp: null,
          capturedAt: input.observedTimestamp,
        };

    games.push({
      gameId,
      kickoffTimestamp: kickoff,
      targetTimestamp: target,
      state: 'DUE',
      existingClosingId: null,
      plannedSnapshot,
    });
  }

  const rowsToInsert = games
    .map((g) => g.plannedSnapshot)
    .filter((row): row is PlannedShadowClosingMarketSnapshot => row != null);

  const counts: ShadowClosingCounts = {
    totalGames: games.length,
    predictionEvidenceGames: predictionIds.length,
    existingCount: games.filter((g) => g.state === 'EXISTING').length,
    futureCount: games.filter((g) => g.state === 'FUTURE').length,
    dueCount: games.filter((g) => g.state === 'DUE').length,
    missedCount: games.filter((g) => g.state === 'MISSED').length,
    plannedAvailableCount: rowsToInsert.filter((r) => r.status === 'AVAILABLE').length,
    plannedUnavailableCount: rowsToInsert.filter((r) => r.status === 'UNAVAILABLE').length,
    plannedInsertCount: rowsToInsert.length,
  };

  const uniqueBlockers = uniqueStrings(blockers);
  return {
    ok: uniqueBlockers.length === 0,
    writeSafe: uniqueBlockers.length === 0,
    writeBlockers: uniqueBlockers,
    season: input.season,
    week: input.week,
    mode: input.mode,
    observedTimestamp: input.observedTimestamp,
    policyDefinitionId: SHADOW_POLICY_DEFINITION_ID,
    policyDefinitionHash: SHADOW_POLICY_DEFINITION_HASH,
    expectedGameIds: sortIds(gameIds),
    counts,
    games,
    rowsToInsert,
    confirmationValid,
    previewTimestampWillNotBecomeCommitTimestamp: true,
  };
}

export interface ShadowClosingMutationTx {
  loadFrame(): Promise<OperationalShadowClosingFrame>;
  now(): Date;
  createClosingSnapshots(rows: PlannedShadowClosingMarketSnapshot[]): Promise<number>;
}

export interface ShadowClosingAdapter {
  now(): Date;
  createId(): string;
  loadFrame(): Promise<OperationalShadowClosingFrame>;
  runTransaction<T>(fn: (tx: ShadowClosingMutationTx) => Promise<T>): Promise<T>;
  readClosings(ids: string[]): Promise<ExistingShadowClosingRow[]>;
  countEvaluationResultsForClosingIds(ids: string[]): Promise<number>;
}

export interface ShadowClosingExecution {
  mode: ShadowClosingCaptureMode;
  providerCalls: 0;
  mutationsInvoked: boolean;
  predictionMutationsInvoked: false;
  evaluationMutationsInvoked: false;
  commitSucceeded: boolean;
  persistenceCommitted: boolean;
  rolledBack: boolean;
  transactionalIdempotentNoOp: boolean;
  insertedSnapshotCount: number;
  insertedSnapshotIds: string[];
  verificationOk: boolean | null;
  verificationReasons: string[];
  error: string | null;
}

export interface ShadowClosingGameReportRow {
  gameId: string;
  kickoffTimestamp: string;
  targetTimestamp: string;
  state: ShadowClosingGameState;
  existingClosingId: string | null;
  plannedClosingId: string | null;
  status: ShadowClosingAvailabilityStatus | null;
  unavailableReason: string | null;
  selectedMarketLineId: string | null;
  selectedMarketTeamId: string | null;
  selectedMarketLineValue: number | null;
  canonicalMarketHma: number | null;
  book: string | null;
  source: string | null;
  marketObservationTimestamp: string | null;
}

export interface ShadowClosingReport {
  season: number;
  week: number;
  mode: ShadowClosingCaptureMode;
  previewObservedTimestamp: string | null;
  commitObservedTimestamp: string | null;
  previewTimestampWillNotBecomeCommitTimestamp: true;
  evaluationProtocol: typeof SHADOW_EVALUATION_PROTOCOL;
  policyDefinitionId: typeof SHADOW_POLICY_DEFINITION_ID;
  policyDefinitionHash: string;
  expectedGameIds: string[];
  counts: ShadowClosingCounts;
  writeSafe: boolean;
  writeBlockers: string[];
  games: ShadowClosingGameReportRow[];
  providerCalls: 0;
  mutationsInvoked: boolean;
  predictionMutationsInvoked: false;
  evaluationMutationsInvoked: false;
}

function summarizeGames(games: ShadowClosingGamePlan[]): ShadowClosingGameReportRow[] {
  return games.map((g) => ({
    gameId: g.gameId,
    kickoffTimestamp: g.kickoffTimestamp.toISOString(),
    targetTimestamp: g.targetTimestamp.toISOString(),
    state: g.state,
    existingClosingId: g.existingClosingId,
    plannedClosingId: g.plannedSnapshot?.id ?? null,
    status: g.plannedSnapshot?.status ?? null,
    unavailableReason: g.plannedSnapshot?.unavailableReason ?? null,
    selectedMarketLineId: g.plannedSnapshot?.selectedMarketLineId ?? null,
    selectedMarketTeamId: g.plannedSnapshot?.selectedMarketTeamId ?? null,
    selectedMarketLineValue: g.plannedSnapshot?.selectedMarketLineValue ?? null,
    canonicalMarketHma: g.plannedSnapshot?.canonicalMarketHma ?? null,
    book: g.plannedSnapshot?.book ?? null,
    source: g.plannedSnapshot?.source ?? null,
    marketObservationTimestamp: iso(g.plannedSnapshot?.marketObservationTimestamp),
  }));
}

function verifyInsertedClosing(
  persisted: ExistingShadowClosingRow,
  planned: PlannedShadowClosingMarketSnapshot
): string[] {
  const reasons: string[] = [];
  if (persisted.id !== planned.id) reasons.push('committed_closing_id_mismatch');
  if (persisted.gameId !== planned.gameId) reasons.push('committed_closing_game_mismatch');
  if (persisted.evaluationProtocol !== planned.evaluationProtocol) reasons.push('committed_closing_protocol_mismatch');
  if (persisted.policyDefinitionId !== planned.policyDefinitionId) reasons.push('committed_closing_policy_id_mismatch');
  if (persisted.policyDefinitionHash !== planned.policyDefinitionHash) reasons.push('committed_closing_policy_hash_mismatch');
  if (String(persisted.marketType) !== planned.marketType) reasons.push('committed_closing_market_type_mismatch');
  if (iso(persisted.targetTimestamp) !== planned.targetTimestamp.toISOString()) reasons.push('committed_closing_target_mismatch');
  if (persisted.status !== planned.status) reasons.push('committed_closing_status_mismatch');
  if (persisted.unavailableReason !== planned.unavailableReason) reasons.push('committed_closing_reason_mismatch');
  if (persisted.selectedMarketLineId !== planned.selectedMarketLineId) reasons.push('committed_closing_market_id_mismatch');
  if (persisted.selectedMarketTeamId !== planned.selectedMarketTeamId) reasons.push('committed_closing_market_team_mismatch');
  if (persisted.selectedMarketLineValue !== planned.selectedMarketLineValue) reasons.push('committed_closing_market_value_mismatch');
  if (persisted.canonicalMarketHma !== planned.canonicalMarketHma) reasons.push('committed_closing_hma_mismatch');
  if (persisted.book !== planned.book) reasons.push('committed_closing_book_mismatch');
  if (persisted.source !== planned.source) reasons.push('committed_closing_source_mismatch');
  if (iso(persisted.marketObservationTimestamp) !== iso(planned.marketObservationTimestamp)) reasons.push('committed_closing_market_timestamp_mismatch');
  if (iso(persisted.capturedAt) !== planned.capturedAt.toISOString()) reasons.push('committed_closing_capture_timestamp_mismatch');
  return reasons;
}

export async function executeShadowClosingCapture(input: {
  season: number;
  week: number;
  mode: ShadowClosingCaptureMode;
  confirmation: string;
  adapter: ShadowClosingAdapter;
}): Promise<{
  plan: ShadowClosingPlan;
  execution: ShadowClosingExecution;
  report: ShadowClosingReport;
}> {
  const emptyExecution = (partial: Partial<ShadowClosingExecution> = {}): ShadowClosingExecution => ({
    mode: input.mode,
    providerCalls: 0,
    mutationsInvoked: false,
    predictionMutationsInvoked: false,
    evaluationMutationsInvoked: false,
    commitSucceeded: false,
    persistenceCommitted: false,
    rolledBack: false,
    transactionalIdempotentNoOp: false,
    insertedSnapshotCount: 0,
    insertedSnapshotIds: [],
    verificationOk: null,
    verificationReasons: [],
    error: null,
    ...partial,
  });

  const buildReport = (plan: ShadowClosingPlan, execution: ShadowClosingExecution): ShadowClosingReport => ({
    season: plan.season,
    week: plan.week,
    mode: plan.mode,
    previewObservedTimestamp: input.mode === 'PREVIEW' ? plan.observedTimestamp.toISOString() : null,
    commitObservedTimestamp: input.mode === 'COMMIT' ? plan.observedTimestamp.toISOString() : null,
    previewTimestampWillNotBecomeCommitTimestamp: true,
    evaluationProtocol: SHADOW_EVALUATION_PROTOCOL,
    policyDefinitionId: plan.policyDefinitionId,
    policyDefinitionHash: plan.policyDefinitionHash,
    expectedGameIds: plan.expectedGameIds,
    counts: plan.counts,
    writeSafe: plan.writeSafe,
    writeBlockers: plan.writeBlockers,
    games: summarizeGames(plan.games),
    providerCalls: 0,
    mutationsInvoked: execution.mutationsInvoked,
    predictionMutationsInvoked: false,
    evaluationMutationsInvoked: false,
  });

  if (input.mode === 'PREVIEW') {
    const frame = await input.adapter.loadFrame();
    const plan = planShadowClosingCapture({
      season: input.season,
      week: input.week,
      mode: 'PREVIEW',
      confirmation: input.confirmation,
      observedTimestamp: input.adapter.now(),
      frame,
      createId: input.adapter.createId,
    });
    const execution = emptyExecution({ error: plan.ok ? null : plan.writeBlockers.join('; ') });
    return { plan, execution, report: buildReport(plan, execution) };
  }

  let planned: ShadowClosingPlan | null = null;
  let mutationsInvoked = false;
  let insertedCount = 0;
  let insertedIds: string[] = [];

  try {
    planned = await input.adapter.runTransaction(async (tx) => {
      const frame = await tx.loadFrame();
      const plan = planShadowClosingCapture({
        season: input.season,
        week: input.week,
        mode: 'COMMIT',
        confirmation: input.confirmation,
        observedTimestamp: tx.now(),
        frame,
        createId: input.adapter.createId,
      });
      if (!plan.ok || !plan.writeSafe) {
        throw new Error(`commit_plan_invalid: ${plan.writeBlockers.join('; ')}`);
      }
      if (plan.rowsToInsert.length === 0) return plan;
      mutationsInvoked = true;
      insertedCount = await tx.createClosingSnapshots(plan.rowsToInsert);
      insertedIds = plan.rowsToInsert.map((r) => r.id);
      if (insertedCount !== plan.rowsToInsert.length) {
        throw new Error('in_transaction_closing_count_mismatch');
      }
      return plan;
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const plan =
      planned ??
      planShadowClosingCapture({
        season: input.season,
        week: input.week,
        mode: 'COMMIT',
        confirmation: input.confirmation,
        observedTimestamp: input.adapter.now(),
        frame: { games: [], predictionFrames: [], marketLines: [], existingClosings: [] },
        createId: input.adapter.createId,
      });
    const execution = emptyExecution({
      mutationsInvoked,
      rolledBack: true,
      insertedSnapshotCount: insertedCount,
      insertedSnapshotIds: insertedIds,
      error: message,
    });
    return { plan, execution, report: buildReport(plan, execution) };
  }

  const plan = planned as ShadowClosingPlan;
  if (insertedIds.length === 0) {
    const execution = emptyExecution({
      commitSucceeded: true,
      transactionalIdempotentNoOp: true,
      verificationOk: true,
    });
    return { plan, execution, report: buildReport(plan, execution) };
  }

  const persisted = await input.adapter.readClosings(insertedIds);
  const evaluationCount = await input.adapter.countEvaluationResultsForClosingIds(insertedIds);
  const verificationReasons: string[] = [];
  if (persisted.length !== insertedIds.length) verificationReasons.push('committed_closing_count_mismatch');
  const persistedById = new Map(persisted.map((row) => [row.id, row]));
  for (const row of plan.rowsToInsert) {
    const found = persistedById.get(row.id);
    if (!found) {
      verificationReasons.push('committed_closing_not_readable');
      continue;
    }
    verificationReasons.push(...verifyInsertedClosing(found, row));
  }
  if (evaluationCount !== 0) verificationReasons.push('evaluation_rows_created_for_inserted_closings');

  const uniqueVerification = uniqueStrings(verificationReasons);
  const verificationOk = uniqueVerification.length === 0;
  const execution = emptyExecution({
    mutationsInvoked: true,
    commitSucceeded: verificationOk,
    persistenceCommitted: true,
    insertedSnapshotCount: insertedCount,
    insertedSnapshotIds: insertedIds,
    verificationOk,
    verificationReasons: uniqueVerification,
    error: verificationOk ? null : uniqueVerification.join('; '),
  });
  return { plan, execution, report: buildReport(plan, execution) };
}

export function resolveClosingPreviewExitCode(writeSafe: boolean): number {
  return writeSafe ? 0 : 1;
}
