/**
 * Generic Shadow T-30 Closing V1 — production DB adapter / guarded execution.
 *
 * Loads an exact persisted Generic capture-run frame and optionally inserts
 * append-only ShadowModelClosingMarketSnapshot rows. Slice B remains the
 * planner. This module does not call providers, mutate predictions, or
 * invoke Prisma migrate.
 */

import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  GENERIC_SHADOW_T30_AUTHORIZED_SOURCE,
  GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH,
  GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID,
  GENERIC_SHADOW_T30_EVALUATION_PROTOCOL,
  expectedGenericShadowT30WriteConfirmation,
  planGenericShadowT30Closing,
  validateExistingGenericShadowT30Closing,
  type GenericShadowT30CaptureRun,
  type GenericShadowT30CurrentGame,
  type GenericShadowT30ExistingClosing,
  type GenericShadowT30Mode,
  type GenericShadowT30OperationalFrame,
  type GenericShadowT30Plan,
  type GenericShadowT30Prediction,
  type PlannedGenericShadowT30Closing,
} from '../../web/lib/shadow-model-t30-closing-v1';
import type { ShadowModelMarketLineRow } from '../../web/lib/shadow-model-capture-v1';

export type GenericShadowT30Db = PrismaClient | Prisma.TransactionClient;

const CAPTURE_RUN_SELECT = {
  id: true,
  season: true,
  week: true,
  captureContext: true,
  evaluationProtocol: true,
  modelDefinitionId: true,
  modelDefinitionHash: true,
  featureDefinitionHash: true,
  policyDefinitionHash: true,
  expectedGameIds: true,
  totalGames: true,
  availableCount: true,
  unavailableCount: true,
  selectionCount: true,
  noSelectionCount: true,
  status: true,
  failureReason: true,
} as const;

const PREDICTION_SELECT = {
  id: true,
  captureRunId: true,
  gameId: true,
  season: true,
  week: true,
  homeTeamId: true,
  awayTeamId: true,
  kickoffTimestamp: true,
  predictionTimestamp: true,
  predictionStatus: true,
  marketType: true,
  selectedSide: true,
} as const;

const GAME_SELECT = {
  id: true,
  homeTeamId: true,
  awayTeamId: true,
  date: true,
} as const;

const MARKET_LINE_SELECT = {
  id: true,
  gameId: true,
  lineType: true,
  lineValue: true,
  teamId: true,
  bookName: true,
  source: true,
  timestamp: true,
} as const;

const CLOSING_SELECT = {
  id: true,
  predictionId: true,
  gameId: true,
  evaluationProtocol: true,
  closingDefinitionId: true,
  closingDefinitionHash: true,
  marketType: true,
  predictionKickoffTimestamp: true,
  closingKickoffTimestamp: true,
  targetTimestamp: true,
  status: true,
  unavailableReason: true,
  selectedHomeMarketLineId: true,
  selectedAwayMarketLineId: true,
  selectedHomeLineValue: true,
  selectedAwayLineValue: true,
  selectedDisplayTeamId: true,
  selectedDisplayLineValue: true,
  canonicalMarketHma: true,
  book: true,
  source: true,
  marketObservationTimestamp: true,
  marketAgeToTargetSeconds: true,
  capturedAt: true,
} as const;

type PrismaClosingRow = {
  id: string;
  predictionId: string;
  gameId: string;
  evaluationProtocol: string;
  closingDefinitionId: string;
  closingDefinitionHash: string;
  marketType: unknown;
  predictionKickoffTimestamp: Date;
  closingKickoffTimestamp: Date;
  targetTimestamp: Date;
  status: unknown;
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
  marketObservationTimestamp: Date | null;
  marketAgeToTargetSeconds: number | null;
  capturedAt: Date;
};

export interface GenericShadowT30MutationTx {
  loadFrame(): Promise<GenericShadowT30OperationalFrame>;
  now(): Date;
  createClosingSnapshots(rows: PlannedGenericShadowT30Closing[]): Promise<number>;
  readClosingsByPredictionIds(predictionIds: string[]): Promise<GenericShadowT30ExistingClosing[]>;
}

export interface GenericShadowT30CaptureAdapter {
  now(): Date;
  createId(): string;
  loadFrame(): Promise<GenericShadowT30OperationalFrame>;
  runTransaction<T>(fn: (tx: GenericShadowT30MutationTx) => Promise<T>): Promise<T>;
  readClosingsByPredictionIds(predictionIds: string[]): Promise<GenericShadowT30ExistingClosing[]>;
}

export interface GenericShadowT30Execution {
  mode: GenericShadowT30Mode | string;
  mutationsInvoked: boolean;
  transactionStarted: boolean;
  transactionalNoOp: boolean;
  commitSucceeded: boolean;
  persistenceCommitted: boolean;
  rolledBack: boolean;
  insertedClosingCount: number;
  insertedClosingIds: string[];
  verificationOk: boolean;
  verificationReasons: string[];
  providerCalls: 0;
  isolationLevel: 'Serializable' | null;
  error: string | null;
}

export interface GenericShadowT30ExecutionResult {
  plan: GenericShadowT30Plan;
  execution: GenericShadowT30Execution;
  report: GenericShadowT30CaptureReport;
}

export interface GenericShadowT30CaptureReport {
  season: number;
  week: number;
  captureRunId: string;
  modelDefinitionId: string;
  modelDefinitionHash: string;
  captureContext: string;
  evaluationProtocol: string;
  closingDefinitionId: string;
  closingDefinitionHash: string;
  mode: GenericShadowT30Mode | string;
  observedTimestamp: string;
  writeSafe: boolean;
  writeBlockers: string[];
  counts: GenericShadowT30Plan['counts'];
  predictions: unknown[];
  rowsToInsert: unknown[];
  confirmationValid: boolean;
  providerCalls: 0;
  previewTimestampWillNotBecomeCommitTimestamp: true;
  mutationsInvoked: boolean;
  transactionStarted: boolean;
  transactionalNoOp: boolean;
  commitSucceeded: boolean;
  persistenceCommitted: boolean;
  rolledBack: boolean;
  insertedClosingCount: number;
  insertedClosingIds: string[];
  verificationOk: boolean;
  verificationReasons: string[];
  isolationLevel: 'Serializable' | null;
}

export function mapPrismaGenericShadowT30Closing(
  row: PrismaClosingRow
): GenericShadowT30ExistingClosing {
  return {
    id: row.id,
    predictionId: row.predictionId,
    gameId: row.gameId,
    evaluationProtocol: row.evaluationProtocol,
    closingDefinitionId: row.closingDefinitionId,
    closingDefinitionHash: row.closingDefinitionHash,
    marketType: String(row.marketType),
    predictionKickoffTimestamp: row.predictionKickoffTimestamp,
    closingKickoffTimestamp: row.closingKickoffTimestamp,
    targetTimestamp: row.targetTimestamp,
    status: String(row.status),
    unavailableReason: row.unavailableReason,
    selectedHomeMarketLineId: row.selectedHomeMarketLineId,
    selectedAwayMarketLineId: row.selectedAwayMarketLineId,
    selectedHomeLineValue: row.selectedHomeLineValue,
    selectedAwayLineValue: row.selectedAwayLineValue,
    selectedDisplayTeamId: row.selectedDisplayTeamId,
    selectedDisplayLineValue: row.selectedDisplayLineValue,
    canonicalMarketHma: row.canonicalMarketHma,
    book: row.book,
    source: row.source,
    marketObservationTimestamp: row.marketObservationTimestamp,
    marketAgeToTargetSeconds: row.marketAgeToTargetSeconds,
    capturedAt: row.capturedAt,
  };
}

export function genericShadowT30ClosingCreateData(row: PlannedGenericShadowT30Closing) {
  return {
    id: row.id,
    predictionId: row.predictionId,
    gameId: row.gameId,
    evaluationProtocol: row.evaluationProtocol,
    closingDefinitionId: row.closingDefinitionId,
    closingDefinitionHash: row.closingDefinitionHash,
    marketType: row.marketType,
    predictionKickoffTimestamp: row.predictionKickoffTimestamp,
    closingKickoffTimestamp: row.closingKickoffTimestamp,
    targetTimestamp: row.targetTimestamp,
    status: row.status,
    unavailableReason: row.unavailableReason,
    selectedHomeMarketLineId: row.selectedHomeMarketLineId,
    selectedAwayMarketLineId: row.selectedAwayMarketLineId,
    selectedHomeLineValue: row.selectedHomeLineValue,
    selectedAwayLineValue: row.selectedAwayLineValue,
    selectedDisplayTeamId: row.selectedDisplayTeamId,
    selectedDisplayLineValue: row.selectedDisplayLineValue,
    canonicalMarketHma: row.canonicalMarketHma,
    book: row.book,
    source: row.source,
    marketObservationTimestamp: row.marketObservationTimestamp,
    marketAgeToTargetSeconds: row.marketAgeToTargetSeconds,
    capturedAt: row.capturedAt,
  };
}

function uniqueIds(values: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < values.length; i++) {
    if (out.indexOf(values[i]) === -1) out.push(values[i]);
  }
  return out;
}

function epochMs(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function jsonSafe(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = jsonSafe(nested);
    }
    return out;
  }
  return value;
}

async function loadClosingsByPredictionIds(
  db: GenericShadowT30Db,
  predictionIds: string[]
): Promise<GenericShadowT30ExistingClosing[]> {
  if (predictionIds.length === 0) return [];
  const rows = await db.shadowModelClosingMarketSnapshot.findMany({
    where: { predictionId: { in: predictionIds } },
    select: CLOSING_SELECT,
  });
  return rows.map((row) => mapPrismaGenericShadowT30Closing(row));
}

export async function loadGenericShadowT30OperationalFrame(
  db: GenericShadowT30Db,
  captureRunId: string
): Promise<GenericShadowT30OperationalFrame> {
  const run = await db.shadowModelCaptureRun.findUnique({
    where: { id: captureRunId },
    select: CAPTURE_RUN_SELECT,
  });
  if (!run) {
    throw new Error(`capture_run_not_found:${captureRunId}`);
  }

  const predictionRows = await db.shadowModelPrediction.findMany({
    where: { captureRunId },
    select: PREDICTION_SELECT,
    orderBy: [{ gameId: 'asc' }, { id: 'asc' }],
  });

  const captureRun: GenericShadowT30CaptureRun = {
    id: run.id,
    season: run.season,
    week: run.week,
    captureContext: run.captureContext,
    evaluationProtocol: run.evaluationProtocol,
    modelDefinitionId: run.modelDefinitionId,
    modelDefinitionHash: run.modelDefinitionHash,
    featureDefinitionHash: run.featureDefinitionHash,
    policyDefinitionHash: run.policyDefinitionHash,
    expectedGameIds: run.expectedGameIds,
    totalGames: run.totalGames,
    availableCount: run.availableCount,
    unavailableCount: run.unavailableCount,
    selectionCount: run.selectionCount,
    noSelectionCount: run.noSelectionCount,
    status: String(run.status),
    failureReason: run.failureReason,
  };

  const predictions: GenericShadowT30Prediction[] = predictionRows.map((row) => ({
    id: row.id,
    captureRunId: row.captureRunId,
    gameId: row.gameId,
    season: row.season,
    week: row.week,
    homeTeamId: row.homeTeamId,
    awayTeamId: row.awayTeamId,
    kickoffTimestamp: row.kickoffTimestamp,
    predictionTimestamp: row.predictionTimestamp,
    predictionStatus: String(row.predictionStatus),
    marketType: String(row.marketType),
    selectedSide: row.selectedSide == null ? null : String(row.selectedSide),
  }));

  const predictionGameIds = uniqueIds(predictions.map((p) => p.gameId));
  const predictionIds = predictions.map((p) => p.id);

  const gameRows =
    predictionGameIds.length === 0
      ? []
      : await db.game.findMany({
          where: { id: { in: predictionGameIds } },
          select: GAME_SELECT,
        });
  const games: GenericShadowT30CurrentGame[] = gameRows.map((row) => ({
    id: row.id,
    homeTeamId: row.homeTeamId,
    awayTeamId: row.awayTeamId,
    kickoffTimestamp: row.date,
  }));

  const marketRaw =
    predictionGameIds.length === 0
      ? []
      : await db.marketLine.findMany({
          where: {
            gameId: { in: predictionGameIds },
            lineType: 'spread',
            source: GENERIC_SHADOW_T30_AUTHORIZED_SOURCE,
          },
          select: MARKET_LINE_SELECT,
        });
  const marketLines: ShadowModelMarketLineRow[] = marketRaw.map((row) => ({
    id: row.id,
    gameId: row.gameId,
    lineType: String(row.lineType),
    lineValue: row.lineValue,
    teamId: row.teamId,
    bookName: row.bookName,
    source: row.source,
    timestamp: row.timestamp,
  }));

  const existingClosings = await loadClosingsByPredictionIds(db, predictionIds);

  return {
    captureRun,
    predictions,
    games,
    marketLines,
    existingClosings,
  };
}

export function createPrismaGenericShadowT30Adapter(
  prisma: PrismaClient,
  args: { captureRunId: string; now?: () => Date; createId?: () => string }
): GenericShadowT30CaptureAdapter {
  const clock = args.now ?? (() => new Date());
  const createId = args.createId ?? (() => randomUUID());
  const bindTx = (db: GenericShadowT30Db): GenericShadowT30MutationTx => ({
    loadFrame: () => loadGenericShadowT30OperationalFrame(db, args.captureRunId),
    now: clock,
    createClosingSnapshots: async (rows) => {
      const created = await db.shadowModelClosingMarketSnapshot.createMany({
        data: rows.map(genericShadowT30ClosingCreateData),
      });
      return created.count;
    },
    readClosingsByPredictionIds: (predictionIds) =>
      loadClosingsByPredictionIds(db, predictionIds),
  });

  return {
    now: clock,
    createId,
    loadFrame: () => loadGenericShadowT30OperationalFrame(prisma, args.captureRunId),
    runTransaction: (fn) =>
      prisma.$transaction((tx) => fn(bindTx(tx)), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }),
    readClosingsByPredictionIds: (predictionIds) =>
      loadClosingsByPredictionIds(prisma, predictionIds),
  };
}

function emptyExecution(
  mode: GenericShadowT30Mode | string,
  extra: Partial<GenericShadowT30Execution> = {}
): GenericShadowT30Execution {
  return {
    mode,
    mutationsInvoked: false,
    transactionStarted: false,
    transactionalNoOp: false,
    commitSucceeded: false,
    persistenceCommitted: false,
    rolledBack: false,
    insertedClosingCount: 0,
    insertedClosingIds: [],
    verificationOk: false,
    verificationReasons: [],
    providerCalls: 0,
    isolationLevel: null,
    error: null,
    ...extra,
  };
}

function comparePlannedToPersisted(
  planned: PlannedGenericShadowT30Closing,
  persisted: GenericShadowT30ExistingClosing
): string[] {
  const reasons: string[] = [];
  if (persisted.id !== planned.id) reasons.push('committed_closing_id_mismatch');
  if (persisted.predictionId !== planned.predictionId) {
    reasons.push('committed_closing_prediction_mismatch');
  }
  if (persisted.gameId !== planned.gameId) reasons.push('committed_closing_game_mismatch');
  if (persisted.evaluationProtocol !== planned.evaluationProtocol) {
    reasons.push('committed_closing_protocol_mismatch');
  }
  if (persisted.closingDefinitionId !== planned.closingDefinitionId) {
    reasons.push('committed_closing_definition_id_mismatch');
  }
  if (persisted.closingDefinitionHash !== planned.closingDefinitionHash) {
    reasons.push('committed_closing_definition_hash_mismatch');
  }
  if (String(persisted.marketType) !== planned.marketType) {
    reasons.push('committed_closing_market_type_mismatch');
  }
  if (epochMs(persisted.predictionKickoffTimestamp) !== epochMs(planned.predictionKickoffTimestamp)) {
    reasons.push('committed_closing_prediction_kickoff_mismatch');
  }
  if (epochMs(persisted.closingKickoffTimestamp) !== epochMs(planned.closingKickoffTimestamp)) {
    reasons.push('committed_closing_kickoff_mismatch');
  }
  if (epochMs(persisted.targetTimestamp) !== epochMs(planned.targetTimestamp)) {
    reasons.push('committed_closing_target_mismatch');
  }
  if (String(persisted.status) !== planned.status) reasons.push('committed_closing_status_mismatch');
  if (persisted.unavailableReason !== planned.unavailableReason) {
    reasons.push('committed_closing_reason_mismatch');
  }
  if (persisted.selectedHomeMarketLineId !== planned.selectedHomeMarketLineId) {
    reasons.push('committed_closing_home_market_id_mismatch');
  }
  if (persisted.selectedAwayMarketLineId !== planned.selectedAwayMarketLineId) {
    reasons.push('committed_closing_away_market_id_mismatch');
  }
  if (persisted.selectedHomeLineValue !== planned.selectedHomeLineValue) {
    reasons.push('committed_closing_home_line_mismatch');
  }
  if (persisted.selectedAwayLineValue !== planned.selectedAwayLineValue) {
    reasons.push('committed_closing_away_line_mismatch');
  }
  if (persisted.selectedDisplayTeamId !== planned.selectedDisplayTeamId) {
    reasons.push('committed_closing_display_team_mismatch');
  }
  if (persisted.selectedDisplayLineValue !== planned.selectedDisplayLineValue) {
    reasons.push('committed_closing_display_line_mismatch');
  }
  if (persisted.canonicalMarketHma !== planned.canonicalMarketHma) {
    reasons.push('committed_closing_hma_mismatch');
  }
  if (persisted.book !== planned.book) reasons.push('committed_closing_book_mismatch');
  if (persisted.source !== planned.source) reasons.push('committed_closing_source_mismatch');
  if (epochMs(persisted.marketObservationTimestamp) !== epochMs(planned.marketObservationTimestamp)) {
    reasons.push('committed_closing_market_timestamp_mismatch');
  }
  if (persisted.marketAgeToTargetSeconds !== planned.marketAgeToTargetSeconds) {
    reasons.push('committed_closing_market_age_mismatch');
  }
  if (epochMs(persisted.capturedAt) !== epochMs(planned.capturedAt)) {
    reasons.push('committed_closing_capture_timestamp_mismatch');
  }
  return reasons;
}

function verifyInsertedRows(input: {
  plan: GenericShadowT30Plan;
  persisted: GenericShadowT30ExistingClosing[];
}): string[] {
  const reasons: string[] = [];
  const planned = input.plan.rowsToInsert;
  const plannedPredictionIds = planned.map((row) => row.predictionId);
  if (input.persisted.length !== planned.length) {
    reasons.push('committed_closing_count_mismatch');
  }
  const persistedByPrediction = new Map<string, GenericShadowT30ExistingClosing[]>();
  for (const row of input.persisted) {
    const current = persistedByPrediction.get(row.predictionId) ?? [];
    current.push(row);
    persistedByPrediction.set(row.predictionId, current);
  }
  for (const id of plannedPredictionIds) {
    const found = persistedByPrediction.get(id) ?? [];
    if (found.length === 0) reasons.push('committed_closing_not_readable');
    if (found.length > 1) reasons.push('committed_closing_duplicate_readback');
  }
  for (const row of input.persisted) {
    if (plannedPredictionIds.indexOf(row.predictionId) < 0) {
      reasons.push('committed_closing_extra_readback');
    }
  }
  return uniqueIds(reasons);
}

function verifyInsertedSemantics(input: {
  plan: GenericShadowT30Plan;
  frame: GenericShadowT30OperationalFrame;
  persisted: GenericShadowT30ExistingClosing[];
}): string[] {
  const reasons = verifyInsertedRows({ plan: input.plan, persisted: input.persisted });
  const persistedByPrediction = new Map(input.persisted.map((row) => [row.predictionId, row]));
  const frozenPredictions = new Map(input.frame.predictions.map((p) => [p.id, p]));
  for (const planned of input.plan.rowsToInsert) {
    const persisted = persistedByPrediction.get(planned.predictionId);
    if (!persisted) continue;
    reasons.push(...comparePlannedToPersisted(planned, persisted));
    const prediction = frozenPredictions.get(planned.predictionId);
    if (!prediction) {
      reasons.push('committed_closing_prediction_missing');
      continue;
    }
    const existingBlockers = validateExistingGenericShadowT30Closing({
      row: persisted,
      prediction,
      marketLines: input.frame.marketLines,
    });
    for (const blocker of existingBlockers) {
      reasons.push(`committed_existing_validation:${blocker}`);
    }
  }
  return uniqueIds(reasons);
}

function buildReport(
  plan: GenericShadowT30Plan,
  execution: GenericShadowT30Execution
): GenericShadowT30CaptureReport {
  return {
    season: plan.season,
    week: plan.week,
    captureRunId: plan.captureRunId,
    modelDefinitionId: plan.modelDefinitionId,
    modelDefinitionHash: plan.modelDefinitionHash,
    captureContext: plan.captureContext,
    evaluationProtocol: plan.evaluationProtocol,
    closingDefinitionId: plan.closingDefinitionId,
    closingDefinitionHash: plan.closingDefinitionHash,
    mode: plan.mode,
    observedTimestamp: plan.observedTimestamp.toISOString(),
    writeSafe: plan.writeSafe,
    writeBlockers: plan.writeBlockers,
    counts: plan.counts,
    predictions: jsonSafe(plan.predictions) as unknown[],
    rowsToInsert: jsonSafe(plan.rowsToInsert) as unknown[],
    confirmationValid: plan.confirmationValid,
    providerCalls: 0,
    previewTimestampWillNotBecomeCommitTimestamp: true,
    mutationsInvoked: execution.mutationsInvoked,
    transactionStarted: execution.transactionStarted,
    transactionalNoOp: execution.transactionalNoOp,
    commitSucceeded: execution.commitSucceeded,
    persistenceCommitted: execution.persistenceCommitted,
    rolledBack: execution.rolledBack,
    insertedClosingCount: execution.insertedClosingCount,
    insertedClosingIds: execution.insertedClosingIds,
    verificationOk: execution.verificationOk,
    verificationReasons: execution.verificationReasons,
    isolationLevel: execution.isolationLevel,
  };
}

function failClosedPlan(input: {
  season: number;
  week: number;
  captureRunId: string;
  mode: GenericShadowT30Mode | string;
  confirmation: string;
  observedTimestamp: Date;
  createId: () => string;
}): GenericShadowT30Plan {
  return planGenericShadowT30Closing({
    season: input.season,
    week: input.week,
    captureRunId: input.captureRunId,
    mode: input.mode,
    confirmation: input.confirmation,
    observedTimestamp: input.observedTimestamp,
    createId: input.createId,
    frame: {
      captureRun: {
        id: input.captureRunId,
        season: input.season,
        week: input.week,
        captureContext: '',
        evaluationProtocol: GENERIC_SHADOW_T30_EVALUATION_PROTOCOL,
        modelDefinitionId: '',
        modelDefinitionHash: '',
        featureDefinitionHash: '',
        policyDefinitionHash: '',
        expectedGameIds: [],
        totalGames: 0,
        availableCount: 0,
        unavailableCount: 0,
        selectionCount: 0,
        noSelectionCount: 0,
        status: 'COMPLETE',
        failureReason: null,
      },
      predictions: [],
      games: [],
      marketLines: [],
      existingClosings: [],
    },
  });
}

export async function executeGenericShadowT30ClosingCapture(input: {
  season: number;
  week: number;
  captureRunId: string;
  mode: GenericShadowT30Mode | string;
  confirmation: string;
  adapter: GenericShadowT30CaptureAdapter;
}): Promise<GenericShadowT30ExecutionResult> {
  const mode = String(input.mode).toUpperCase();

  if (mode === 'PREVIEW') {
    const frame = await input.adapter.loadFrame();
    const plan = planGenericShadowT30Closing({
      season: input.season,
      week: input.week,
      captureRunId: input.captureRunId,
      mode: 'PREVIEW',
      confirmation: input.confirmation,
      observedTimestamp: input.adapter.now(),
      frame,
      createId: input.adapter.createId,
    });
    const execution = emptyExecution('PREVIEW', {
      verificationOk: true,
      error: plan.writeSafe ? null : plan.writeBlockers.join('; '),
    });
    return { plan, execution, report: buildReport(plan, execution) };
  }

  const expected = expectedGenericShadowT30WriteConfirmation(input.week, input.captureRunId);
  if (input.confirmation !== expected) {
    const plan = failClosedPlan({
      season: input.season,
      week: input.week,
      captureRunId: input.captureRunId,
      mode: 'COMMIT',
      confirmation: input.confirmation,
      observedTimestamp: input.adapter.now(),
      createId: input.adapter.createId,
    });
    const execution = emptyExecution('COMMIT', {
      verificationOk: false,
      verificationReasons: ['confirmation_invalid'],
      error: 'confirmation_invalid',
    });
    return { plan, execution, report: buildReport(plan, execution) };
  }

  let planned: GenericShadowT30Plan | null = null;
  let mutationsInvoked = false;
  let insertedCount = 0;
  let insertedIds: string[] = [];

  try {
    const txResult = await input.adapter.runTransaction(async (tx) => {
      const frame = await tx.loadFrame();
      const plan = planGenericShadowT30Closing({
        season: input.season,
        week: input.week,
        captureRunId: input.captureRunId,
        mode: 'COMMIT',
        confirmation: input.confirmation,
        observedTimestamp: tx.now(),
        frame,
        createId: input.adapter.createId,
      });
      planned = plan;
      if (!plan.writeSafe) {
        throw new Error(`commit_plan_invalid: ${plan.writeBlockers.join('; ')}`);
      }
      if (plan.rowsToInsert.length === 0) {
        return { plan, mutationsInvoked: false, insertedCount: 0, insertedIds: [] as string[] };
      }
      mutationsInvoked = true;
      insertedCount = await tx.createClosingSnapshots(plan.rowsToInsert);
      insertedIds = plan.rowsToInsert.map((row) => row.id);
      if (insertedCount !== plan.rowsToInsert.length) {
        throw new Error('in_transaction_closing_count_mismatch');
      }
      const persisted = await tx.readClosingsByPredictionIds(
        plan.rowsToInsert.map((row) => row.predictionId)
      );
      const verificationReasons = verifyInsertedSemantics({ plan, frame, persisted });
      if (verificationReasons.length > 0) {
        throw new Error(`in_transaction_verification_failed: ${verificationReasons.join('; ')}`);
      }
      return { plan, mutationsInvoked: true, insertedCount, insertedIds };
    });

    const plan = txResult.plan;
    const noOp = txResult.insertedIds.length === 0;
    const execution = emptyExecution('COMMIT', {
      mutationsInvoked: txResult.mutationsInvoked,
      transactionStarted: true,
      transactionalNoOp: noOp,
      commitSucceeded: true,
      persistenceCommitted: true,
      rolledBack: false,
      insertedClosingCount: txResult.insertedCount,
      insertedClosingIds: txResult.insertedIds,
      verificationOk: true,
      isolationLevel: 'Serializable',
    });
    return { plan, execution, report: buildReport(plan, execution) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const verificationReasons = message.indexOf('in_transaction_verification_failed:') === 0
      ? message.replace('in_transaction_verification_failed: ', '').split('; ').filter(Boolean)
      : message === 'in_transaction_closing_count_mismatch'
        ? ['in_transaction_closing_count_mismatch']
        : message.indexOf('commit_plan_invalid:') === 0
          ? (planned ? planned.writeBlockers : ['commit_plan_invalid'])
          : [message];
    const plan =
      planned ??
      failClosedPlan({
        season: input.season,
        week: input.week,
        captureRunId: input.captureRunId,
        mode: 'COMMIT',
        confirmation: input.confirmation,
        observedTimestamp: input.adapter.now(),
        createId: input.adapter.createId,
      });
    const execution = emptyExecution('COMMIT', {
      mutationsInvoked,
      transactionStarted: true,
      transactionalNoOp: false,
      commitSucceeded: false,
      persistenceCommitted: false,
      rolledBack: true,
      insertedClosingCount: insertedCount,
      insertedClosingIds: insertedIds,
      verificationOk: false,
      verificationReasons,
      isolationLevel: 'Serializable',
      error: message,
    });
    return { plan, execution, report: buildReport(plan, execution) };
  }
}

export const GENERIC_SHADOW_T30_ADAPTER_IDENTITY = {
  closingDefinitionId: GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID,
  closingDefinitionHash: GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH,
  evaluationProtocol: GENERIC_SHADOW_T30_EVALUATION_PROTOCOL,
} as const;
