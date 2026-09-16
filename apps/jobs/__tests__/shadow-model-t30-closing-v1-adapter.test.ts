/**
 * Generic Shadow T-30 Closing V1 — adapter / execution tests.
 * Synthetic fakes only. No real DB, DIRECT_URL, network, or providers.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  GENERIC_SHADOW_T30_AUTHORIZED_SOURCE,
  GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH,
  GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID,
  GENERIC_SHADOW_T30_EVALUATION_PROTOCOL,
  expectedGenericShadowT30WriteConfirmation,
  type GenericShadowT30CaptureRun,
  type GenericShadowT30CurrentGame,
  type GenericShadowT30ExistingClosing,
  type GenericShadowT30OperationalFrame,
  type GenericShadowT30Prediction,
  type PlannedGenericShadowT30Closing,
} from '../../web/lib/shadow-model-t30-closing-v1';
import type { ShadowModelMarketLineRow } from '../../web/lib/shadow-model-capture-v1';
import {
  createPrismaGenericShadowT30Adapter,
  executeGenericShadowT30ClosingCapture,
  genericShadowT30ClosingCreateData,
  loadGenericShadowT30OperationalFrame,
  type GenericShadowT30CaptureAdapter,
  type GenericShadowT30MutationTx,
} from '../src/shadow-model-t30-closing-v1-adapter';

const ROOT = path.resolve(__dirname, '../../..');
const ADAPTER_SRC = path.join(ROOT, 'apps/jobs/src/shadow-model-t30-closing-v1-adapter.ts');
const CLI_SRC = path.join(ROOT, 'apps/jobs/capture-shadow-model-t30-closing-v1-2026.ts');

const RUN_ID = 'run-1';
const PRED_ID = 'pred-1';
const PRED_UNAVAILABLE_ID = 'pred-u';
const GAME_ID = 'game-1';
const GAME_UNAVAILABLE_ID = 'game-u';
const HOME = 'home';
const AWAY = 'away';
const HOME_U = 'home-u';
const AWAY_U = 'away-u';
const KICKOFF = new Date('2026-09-16T20:00:00.000Z');
const TARGET = new Date('2026-09-16T19:30:00.000Z');
const DUE_AT = new Date('2026-09-16T19:35:00.000Z');
const COMMIT_AT = new Date('2026-09-16T19:40:00.000Z');
const FUTURE_AT = new Date('2026-09-16T19:00:00.000Z');
const MARKET_TS = new Date('2026-09-16T19:20:00.000Z');
const PRED_TS = new Date('2026-09-16T16:00:00.000Z');
const CONFIRM = expectedGenericShadowT30WriteConfirmation(3, RUN_ID);

function captureRun(extra: Partial<GenericShadowT30CaptureRun> = {}): GenericShadowT30CaptureRun {
  return {
    id: RUN_ID,
    season: 2026,
    week: 3,
    captureContext: 'candidate_b_w3_first_observation',
    evaluationProtocol: GENERIC_SHADOW_T30_EVALUATION_PROTOCOL,
    modelDefinitionId: 'core_v1_shadow_baseline_v1',
    modelDefinitionHash: 'model-hash',
    featureDefinitionHash: 'feature-hash',
    policyDefinitionHash: 'policy-hash',
    expectedGameIds: [GAME_ID],
    totalGames: 1,
    availableCount: 1,
    unavailableCount: 0,
    selectionCount: 1,
    noSelectionCount: 0,
    status: 'COMPLETE',
    failureReason: null,
    ...extra,
  };
}

function prediction(extra: Partial<GenericShadowT30Prediction> = {}): GenericShadowT30Prediction {
  return {
    id: PRED_ID,
    captureRunId: RUN_ID,
    gameId: GAME_ID,
    season: 2026,
    week: 3,
    homeTeamId: HOME,
    awayTeamId: AWAY,
    kickoffTimestamp: KICKOFF,
    predictionTimestamp: PRED_TS,
    predictionStatus: 'AVAILABLE',
    marketType: 'SPREAD',
    selectedSide: 'HOME',
    ...extra,
  };
}

function game(extra: Partial<GenericShadowT30CurrentGame> = {}): GenericShadowT30CurrentGame {
  return {
    id: GAME_ID,
    homeTeamId: HOME,
    awayTeamId: AWAY,
    kickoffTimestamp: KICKOFF,
    ...extra,
  };
}

function pair(extra: { gameId?: string; prefix?: string; homeId?: string; awayId?: string } = {}): ShadowModelMarketLineRow[] {
  const gameId = extra.gameId ?? GAME_ID;
  const prefix = extra.prefix ?? 'book-a';
  return [
    {
      id: `${prefix}-home`,
      gameId,
      lineType: 'spread',
      lineValue: -3.5,
      teamId: extra.homeId ?? HOME,
      bookName: 'book-a',
      source: GENERIC_SHADOW_T30_AUTHORIZED_SOURCE,
      timestamp: MARKET_TS,
    },
    {
      id: `${prefix}-away`,
      gameId,
      lineType: 'spread',
      lineValue: 3.5,
      teamId: extra.awayId ?? AWAY,
      bookName: 'book-a',
      source: GENERIC_SHADOW_T30_AUTHORIZED_SOURCE,
      timestamp: MARKET_TS,
    },
  ];
}

function existingAvailable(extra: Partial<GenericShadowT30ExistingClosing> = {}): GenericShadowT30ExistingClosing {
  const lines = pair();
  return {
    id: 'exist-1',
    predictionId: PRED_ID,
    gameId: GAME_ID,
    evaluationProtocol: GENERIC_SHADOW_T30_EVALUATION_PROTOCOL,
    closingDefinitionId: GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID,
    closingDefinitionHash: GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH,
    marketType: 'SPREAD',
    predictionKickoffTimestamp: KICKOFF,
    closingKickoffTimestamp: KICKOFF,
    targetTimestamp: TARGET,
    status: 'AVAILABLE',
    unavailableReason: null,
    selectedHomeMarketLineId: lines[0].id,
    selectedAwayMarketLineId: lines[1].id,
    selectedHomeLineValue: -3.5,
    selectedAwayLineValue: 3.5,
    selectedDisplayTeamId: HOME,
    selectedDisplayLineValue: -3.5,
    canonicalMarketHma: 3.5,
    book: 'book-a',
    source: GENERIC_SHADOW_T30_AUTHORIZED_SOURCE,
    marketObservationTimestamp: MARKET_TS,
    marketAgeToTargetSeconds: Math.ceil((TARGET.getTime() - MARKET_TS.getTime()) / 1000),
    capturedAt: DUE_AT,
    ...extra,
  };
}

function dueFrame(extra: Partial<GenericShadowT30OperationalFrame> = {}): GenericShadowT30OperationalFrame {
  return {
    captureRun: captureRun(),
    predictions: [prediction()],
    games: [game()],
    marketLines: pair(),
    existingClosings: [],
    ...extra,
  };
}

function twoDueFrame(): GenericShadowT30OperationalFrame {
  return {
    captureRun: captureRun({
      expectedGameIds: [GAME_ID, GAME_UNAVAILABLE_ID],
      totalGames: 2,
      availableCount: 2,
      selectionCount: 2,
    }),
    predictions: [
      prediction(),
      prediction({
        id: PRED_UNAVAILABLE_ID,
        gameId: GAME_UNAVAILABLE_ID,
        homeTeamId: HOME_U,
        awayTeamId: AWAY_U,
      }),
    ],
    games: [
      game(),
      game({ id: GAME_UNAVAILABLE_ID, homeTeamId: HOME_U, awayTeamId: AWAY_U }),
    ],
    marketLines: [
      ...pair(),
      ...pair({ gameId: GAME_UNAVAILABLE_ID, prefix: 'book-u', homeId: HOME_U, awayId: AWAY_U }),
    ],
    existingClosings: [],
  };
}

function plannedToExisting(row: PlannedGenericShadowT30Closing): GenericShadowT30ExistingClosing {
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

function fakeAdapter(opts: {
  previewFrame?: GenericShadowT30OperationalFrame;
  txFrame?: GenericShadowT30OperationalFrame;
  previewNow?: Date;
  txNow?: Date;
  createCount?: (rows: PlannedGenericShadowT30Closing[]) => number;
  readback?: (
    rows: PlannedGenericShadowT30Closing[],
    ids: string[]
  ) => GenericShadowT30ExistingClosing[];
} = {}): GenericShadowT30CaptureAdapter & {
  createCalls: PlannedGenericShadowT30Closing[][];
  loadFrameCalls: number;
  txLoadFrameCalls: number;
  runTransactionCalls: number;
} {
  const createCalls: PlannedGenericShadowT30Closing[][] = [];
  let loadFrameCalls = 0;
  let txLoadFrameCalls = 0;
  let runTransactionCalls = 0;
  const previewFrame = opts.previewFrame ?? dueFrame();
  const txFrame = opts.txFrame ?? previewFrame;
  let seq = 0;
  const adapter: GenericShadowT30CaptureAdapter & {
    createCalls: PlannedGenericShadowT30Closing[][];
    loadFrameCalls: number;
    txLoadFrameCalls: number;
    runTransactionCalls: number;
  } = {
    createCalls,
    get loadFrameCalls() {
      return loadFrameCalls;
    },
    get txLoadFrameCalls() {
      return txLoadFrameCalls;
    },
    get runTransactionCalls() {
      return runTransactionCalls;
    },
    now: () => opts.previewNow ?? DUE_AT,
    createId: () => `close-${++seq}`,
    loadFrame: async () => {
      loadFrameCalls += 1;
      return previewFrame;
    },
    readClosingsByPredictionIds: async () => [],
    runTransaction: async (fn) => {
      runTransactionCalls += 1;
      const tx: GenericShadowT30MutationTx = {
        loadFrame: async () => {
          txLoadFrameCalls += 1;
          return txFrame;
        },
        now: () => opts.txNow ?? COMMIT_AT,
        createClosingSnapshots: async (rows) => {
          createCalls.push(rows);
          return (opts.createCount ?? ((r) => r.length))(rows);
        },
        readClosingsByPredictionIds: async (ids) => {
          const last = createCalls[createCalls.length - 1] ?? [];
          if (opts.readback) return opts.readback(last, ids);
          return last.filter((row) => ids.indexOf(row.predictionId) >= 0).map(plannedToExisting);
        },
      };
      return fn(tx);
    },
  };
  return adapter;
}

function prismaLike(handlers: {
  captureRun?: unknown;
  predictions?: unknown[];
  games?: unknown[];
  marketLines?: unknown[];
  closings?: unknown[];
}) {
  const calls: Record<string, unknown[]> = {
    findUnique: [],
    predictions: [],
    games: [],
    marketLines: [],
    closings: [],
    createMany: [],
  };
  return {
    calls,
    shadowModelCaptureRun: {
      findUnique: jest.fn(async (args: unknown) => {
        calls.findUnique.push(args);
        return handlers.captureRun ?? null;
      }),
    },
    shadowModelPrediction: {
      findMany: jest.fn(async (args: unknown) => {
        calls.predictions.push(args);
        return handlers.predictions ?? [];
      }),
    },
    game: {
      findMany: jest.fn(async (args: unknown) => {
        calls.games.push(args);
        return handlers.games ?? [];
      }),
    },
    marketLine: {
      findMany: jest.fn(async (args: unknown) => {
        calls.marketLines.push(args);
        return handlers.marketLines ?? [];
      }),
    },
    shadowModelClosingMarketSnapshot: {
      findMany: jest.fn(async (args: unknown) => {
        calls.closings.push(args);
        return handlers.closings ?? [];
      }),
      createMany: jest.fn(async (args: unknown) => {
        calls.createMany.push(args);
        return { count: 0 };
      }),
    },
    shadowClosingMarketSnapshot: {
      findMany: jest.fn(),
      createMany: jest.fn(),
    },
  };
}

describe('Generic Shadow T-30 Closing V1 — frame loader', () => {
  it('loads the exact capture run by primary key and fails closed when missing', async () => {
    const db = prismaLike({});
    await expect(loadGenericShadowT30OperationalFrame(db as never, RUN_ID)).rejects.toThrow(
      `capture_run_not_found:${RUN_ID}`
    );
    expect(db.shadowModelCaptureRun.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: RUN_ID } })
    );
    expect(JSON.stringify(db.calls.findUnique)).not.toContain('findFirst');
    expect(JSON.stringify(db.calls.findUnique)).not.toContain('latest');
  });

  it('includes AVAILABLE and UNAVAILABLE prediction children with no selection filter', async () => {
    const db = prismaLike({
      captureRun: captureRun({
        expectedGameIds: [GAME_ID, GAME_UNAVAILABLE_ID],
        totalGames: 2,
        availableCount: 1,
        unavailableCount: 1,
        selectionCount: 1,
        noSelectionCount: 0,
      }),
      predictions: [
        prediction(),
        prediction({
          id: PRED_UNAVAILABLE_ID,
          gameId: GAME_UNAVAILABLE_ID,
          predictionStatus: 'UNAVAILABLE',
          selectedSide: null,
          homeTeamId: HOME_U,
          awayTeamId: AWAY_U,
        }),
      ],
      games: [
        { ...game(), date: KICKOFF },
        { id: GAME_UNAVAILABLE_ID, homeTeamId: HOME_U, awayTeamId: AWAY_U, date: KICKOFF },
      ],
      marketLines: pair(),
      closings: [],
    });
    const frame = await loadGenericShadowT30OperationalFrame(db as never, RUN_ID);
    expect(frame.predictions.map((p) => p.id).sort()).toEqual([PRED_ID, PRED_UNAVAILABLE_ID].sort());
    expect(frame.predictions.some((p) => p.predictionStatus === 'UNAVAILABLE')).toBe(true);
    expect(db.shadowModelPrediction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { captureRunId: RUN_ID } })
    );
    const predWhere = (db.calls.predictions[0] as { where: unknown }).where;
    expect(predWhere).toEqual({ captureRunId: RUN_ID });
  });

  it('loads current Games by persisted prediction game IDs, not week', async () => {
    const db = prismaLike({
      captureRun: captureRun(),
      predictions: [prediction()],
      games: [{ ...game(), date: KICKOFF }],
      marketLines: pair(),
      closings: [],
    });
    await loadGenericShadowT30OperationalFrame(db as never, RUN_ID);
    expect(db.game.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [GAME_ID] } },
      })
    );
    const gameQuery = JSON.stringify(db.calls.games);
    expect(gameQuery).not.toContain('"week"');
    expect(gameQuery).not.toContain('unrelated-week-game');
  });

  it('prefilters persisted MarketLine rows to oddsapi spread', async () => {
    const db = prismaLike({
      captureRun: captureRun(),
      predictions: [prediction()],
      games: [{ ...game(), date: KICKOFF }],
      marketLines: pair(),
      closings: [],
    });
    const frame = await loadGenericShadowT30OperationalFrame(db as never, RUN_ID);
    expect(db.marketLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          gameId: { in: [GAME_ID] },
          lineType: 'spread',
          source: 'oddsapi',
        },
      })
    );
    expect(frame.marketLines.every((row) => row.source === 'oddsapi')).toBe(true);
  });

  it('loads Generic closing rows only, never Hybrid ShadowClosingMarketSnapshot', async () => {
    const db = prismaLike({
      captureRun: captureRun(),
      predictions: [prediction()],
      games: [{ ...game(), date: KICKOFF }],
      marketLines: pair(),
      closings: [existingAvailable()],
    });
    const frame = await loadGenericShadowT30OperationalFrame(db as never, RUN_ID);
    expect(db.shadowModelClosingMarketSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { predictionId: { in: [PRED_ID] } },
      })
    );
    expect(db.shadowClosingMarketSnapshot.findMany).not.toHaveBeenCalled();
    expect(frame.existingClosings).toHaveLength(1);
    expect(frame.existingClosings[0].closingDefinitionId).toBe(
      GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID
    );
  });
});

describe('Generic Shadow T-30 Closing V1 — PREVIEW / COMMIT execution', () => {
  it('PREVIEW is read-only and uses the adapter clock', async () => {
    const adapter = fakeAdapter({ previewNow: DUE_AT });
    const { plan, execution } = await executeGenericShadowT30ClosingCapture({
      season: 2026,
      week: 3,
      captureRunId: RUN_ID,
      mode: 'PREVIEW',
      confirmation: '',
      adapter,
    });
    expect(execution.transactionStarted).toBe(false);
    expect(execution.mutationsInvoked).toBe(false);
    expect(adapter.createCalls).toHaveLength(0);
    expect(execution.insertedClosingCount).toBe(0);
    expect(execution.providerCalls).toBe(0);
    expect(execution.isolationLevel).toBeNull();
    expect(execution.verificationOk).toBe(true);
    expect(plan.writeSafe).toBe(true);
    expect(plan.observedTimestamp).toBe(DUE_AT);
    expect(adapter.runTransactionCalls).toBe(0);
  });

  it('does not reuse the PREVIEW timestamp for a later COMMIT', async () => {
    const adapter = fakeAdapter({ previewNow: DUE_AT, txNow: COMMIT_AT });
    const preview = await executeGenericShadowT30ClosingCapture({
      season: 2026,
      week: 3,
      captureRunId: RUN_ID,
      mode: 'PREVIEW',
      confirmation: '',
      adapter,
    });
    const commit = await executeGenericShadowT30ClosingCapture({
      season: 2026,
      week: 3,
      captureRunId: RUN_ID,
      mode: 'COMMIT',
      confirmation: CONFIRM,
      adapter,
    });
    expect(preview.plan.observedTimestamp).toBe(DUE_AT);
    expect(commit.plan.observedTimestamp).toBe(COMMIT_AT);
    expect(commit.plan.observedTimestamp.getTime()).not.toBe(preview.plan.observedTimestamp.getTime());
    expect(commit.plan.rowsToInsert[0].capturedAt).toBe(COMMIT_AT);
  });

  it('COMMIT re-plans inside the transaction rather than reusing a stale outer plan', async () => {
    const stale = dueFrame({
      marketLines: pair({ prefix: 'stale-book' }),
    });
    const fresh = dueFrame({
      marketLines: pair({ prefix: 'fresh-book' }),
    });
    const adapter = fakeAdapter({ previewFrame: stale, txFrame: fresh, txNow: COMMIT_AT });
    const { plan, execution } = await executeGenericShadowT30ClosingCapture({
      season: 2026,
      week: 3,
      captureRunId: RUN_ID,
      mode: 'COMMIT',
      confirmation: CONFIRM,
      adapter,
    });
    expect(adapter.txLoadFrameCalls).toBe(1);
    expect(execution.commitSucceeded).toBe(true);
    expect(plan.rowsToInsert[0].selectedHomeMarketLineId).toBe('fresh-book-home');
    expect(plan.rowsToInsert[0].selectedHomeMarketLineId).not.toBe('stale-book-home');
  });

  it('treats a race as EXISTING and does not insert a duplicate', async () => {
    const adapter = fakeAdapter({
      previewFrame: dueFrame(),
      txFrame: dueFrame({ existingClosings: [existingAvailable()] }),
      txNow: COMMIT_AT,
    });
    const { plan, execution } = await executeGenericShadowT30ClosingCapture({
      season: 2026,
      week: 3,
      captureRunId: RUN_ID,
      mode: 'COMMIT',
      confirmation: CONFIRM,
      adapter,
    });
    expect(plan.predictions[0].state).toBe('EXISTING');
    expect(adapter.createCalls).toHaveLength(0);
    expect(execution.mutationsInvoked).toBe(false);
    expect(execution.transactionalNoOp).toBe(true);
    expect(execution.transactionStarted).toBe(true);
    expect(execution.commitSucceeded).toBe(true);
    expect(execution.insertedClosingCount).toBe(0);
  });

  it('inserts exactly the DUE planned row and verifies read-back', async () => {
    const adapter = fakeAdapter({ txNow: COMMIT_AT });
    const { plan, execution } = await executeGenericShadowT30ClosingCapture({
      season: 2026,
      week: 3,
      captureRunId: RUN_ID,
      mode: 'COMMIT',
      confirmation: CONFIRM,
      adapter,
    });
    expect(plan.rowsToInsert).toHaveLength(1);
    expect(adapter.createCalls).toHaveLength(1);
    expect(adapter.createCalls[0]).toHaveLength(1);
    expect(execution.insertedClosingCount).toBe(1);
    expect(execution.commitSucceeded).toBe(true);
    expect(execution.persistenceCommitted).toBe(true);
    expect(execution.rolledBack).toBe(false);
    expect(execution.verificationOk).toBe(true);
    expect(execution.isolationLevel).toBe('Serializable');
    expect(execution.mutationsInvoked).toBe(true);
  });

  it('commits a FUTURE-only frame as a transactional no-op without claiming idempotent completion', async () => {
    const adapter = fakeAdapter({
      txFrame: dueFrame(),
      txNow: FUTURE_AT,
    });
    const { plan, execution } = await executeGenericShadowT30ClosingCapture({
      season: 2026,
      week: 3,
      captureRunId: RUN_ID,
      mode: 'COMMIT',
      confirmation: CONFIRM,
      adapter,
    });
    expect(plan.predictions[0].state).toBe('FUTURE');
    expect(execution.transactionStarted).toBe(true);
    expect(execution.mutationsInvoked).toBe(false);
    expect(execution.transactionalNoOp).toBe(true);
    expect(execution.commitSucceeded).toBe(true);
    expect(execution.insertedClosingCount).toBe(0);
    expect(adapter.createCalls).toHaveLength(0);
    expect(JSON.stringify(execution)).not.toMatch(/idempotent/i);
  });

  it('fails closed on invalid COMMIT confirmation before starting a transaction', async () => {
    const adapter = fakeAdapter();
    const { plan, execution } = await executeGenericShadowT30ClosingCapture({
      season: 2026,
      week: 3,
      captureRunId: RUN_ID,
      mode: 'COMMIT',
      confirmation: 'CAPTURE_2026_WEEK_3_T30_CLOSING_V1',
      adapter,
    });
    expect(adapter.runTransactionCalls).toBe(0);
    expect(adapter.createCalls).toHaveLength(0);
    expect(execution.mutationsInvoked).toBe(false);
    expect(execution.transactionStarted).toBe(false);
    expect(execution.commitSucceeded).toBe(false);
    expect(execution.verificationReasons).toContain('confirmation_invalid');
    expect(plan.confirmationValid).toBe(false);
    expect(CONFIRM).toBe(`CAPTURE_2026_WEEK_3_SHADOW_MODEL_T30_${RUN_ID}`);
  });

  it('does not mutate when the transaction frame is not write-safe', async () => {
    const adapter = fakeAdapter({
      txFrame: dueFrame({ captureRun: captureRun({ status: 'FAILED' }) }),
    });
    const { plan, execution } = await executeGenericShadowT30ClosingCapture({
      season: 2026,
      week: 3,
      captureRunId: RUN_ID,
      mode: 'COMMIT',
      confirmation: CONFIRM,
      adapter,
    });
    expect(plan.writeSafe).toBe(false);
    expect(plan.writeBlockers).toContain('capture_run_not_complete');
    expect(adapter.createCalls).toHaveLength(0);
    expect(execution.mutationsInvoked).toBe(false);
    expect(execution.commitSucceeded).toBe(false);
    expect(execution.rolledBack).toBe(true);
  });

  it('rolls back when insert count does not match planned rows', async () => {
    const adapter = fakeAdapter({
      txFrame: twoDueFrame(),
      createCount: () => 1,
    });
    const { execution } = await executeGenericShadowT30ClosingCapture({
      season: 2026,
      week: 3,
      captureRunId: RUN_ID,
      mode: 'COMMIT',
      confirmation: CONFIRM,
      adapter,
    });
    expect(adapter.createCalls[0]).toHaveLength(2);
    expect(execution.verificationOk).toBe(false);
    expect(execution.commitSucceeded).toBe(false);
    expect(execution.rolledBack).toBe(true);
    expect(execution.verificationReasons).toContain('in_transaction_closing_count_mismatch');
  });

  it('rolls back when read-back omits a planned row', async () => {
    const adapter = fakeAdapter({
      txFrame: twoDueFrame(),
      readback: (rows) => [plannedToExisting(rows[0])],
    });
    const { execution } = await executeGenericShadowT30ClosingCapture({
      season: 2026,
      week: 3,
      captureRunId: RUN_ID,
      mode: 'COMMIT',
      confirmation: CONFIRM,
      adapter,
    });
    expect(execution.verificationOk).toBe(false);
    expect(execution.rolledBack).toBe(true);
    expect(execution.commitSucceeded).toBe(false);
    expect(execution.verificationReasons.join(' ')).toMatch(/not_readable|count_mismatch/);
  });

  it('rolls back when a persisted frozen field does not match the planned row', async () => {
    const adapter = fakeAdapter({
      readback: (rows) => [
        {
          ...plannedToExisting(rows[0]),
          closingDefinitionHash: 'tampered-hash',
        },
      ],
    });
    const { execution } = await executeGenericShadowT30ClosingCapture({
      season: 2026,
      week: 3,
      captureRunId: RUN_ID,
      mode: 'COMMIT',
      confirmation: CONFIRM,
      adapter,
    });
    expect(execution.rolledBack).toBe(true);
    expect(execution.verificationReasons).toContain('committed_closing_definition_hash_mismatch');
  });

  it('reuses the existing-row validator against transactional read-back', async () => {
    const adapter = fakeAdapter({
      readback: (rows) => [
        {
          ...plannedToExisting(rows[0]),
          marketObservationTimestamp: new Date('2026-09-16T19:31:00.000Z'),
        },
      ],
    });
    const { execution } = await executeGenericShadowT30ClosingCapture({
      season: 2026,
      week: 3,
      captureRunId: RUN_ID,
      mode: 'COMMIT',
      confirmation: CONFIRM,
      adapter,
    });
    expect(execution.verificationOk).toBe(false);
    expect(execution.rolledBack).toBe(true);
    expect(execution.verificationReasons.join(' ')).toMatch(
      /falls_forward|market_timestamp_mismatch|existing_validation/
    );
  });
});

describe('Generic Shadow T-30 Closing V1 — mutation and provider purity', () => {
  it('createMany mapping does not use skipDuplicates and createPrisma adapter is insert-only', () => {
    const row = {
      id: 'close-1',
      predictionId: PRED_ID,
      gameId: GAME_ID,
      evaluationProtocol: GENERIC_SHADOW_T30_EVALUATION_PROTOCOL,
      closingDefinitionId: GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID,
      closingDefinitionHash: GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH,
      marketType: 'SPREAD' as const,
      predictionKickoffTimestamp: KICKOFF,
      closingKickoffTimestamp: KICKOFF,
      targetTimestamp: TARGET,
      status: 'AVAILABLE' as const,
      unavailableReason: null,
      selectedHomeMarketLineId: 'h',
      selectedAwayMarketLineId: 'a',
      selectedHomeLineValue: -3.5,
      selectedAwayLineValue: 3.5,
      selectedDisplayTeamId: HOME,
      selectedDisplayLineValue: -3.5,
      canonicalMarketHma: 3.5,
      book: 'book-a',
      source: 'oddsapi',
      marketObservationTimestamp: MARKET_TS,
      marketAgeToTargetSeconds: 600,
      capturedAt: DUE_AT,
    };
    const data = genericShadowT30ClosingCreateData(row);
    expect(data).not.toHaveProperty('skipDuplicates');
    expect(data).not.toHaveProperty('createdAt');
    expect(data).not.toHaveProperty('updatedAt');
    expect(typeof createPrismaGenericShadowT30Adapter).toBe('function');
  });

  it('adapter source mutates only shadowModelClosingMarketSnapshot.createMany', () => {
    const src = fs.readFileSync(ADAPTER_SRC, 'utf8');
    expect(src).toContain('shadowModelClosingMarketSnapshot.createMany');
    expect(src).not.toContain('skipDuplicates');
    expect(src).not.toContain('shadowModelCaptureRun.create');
    expect(src).not.toContain('shadowModelCaptureRun.update');
    expect(src).not.toContain('shadowModelPrediction.create');
    expect(src).not.toContain('shadowModelPrediction.update');
    expect(src).not.toContain('shadowClosingMarketSnapshot.create');
    expect(src).not.toContain('shadowEvaluationResult.create');
    expect(src).not.toContain('bet.create');
    expect(src).not.toContain('bet.update');
    expect(src).not.toContain('matchupOutput.create');
    expect(src).not.toContain('game.update');
    expect(src).not.toContain('marketLine.create');
    expect(src).not.toContain('marketLine.update');
    expect(src).not.toMatch(/shadowModelClosingMarketSnapshot\.update\(/);
    expect(src).not.toMatch(/shadowModelClosingMarketSnapshot\.delete\(/);
    expect(src).not.toMatch(/shadowModelClosingMarketSnapshot\.upsert\(/);
    expect(src).not.toContain('ODDS_API_KEY');
    expect(src).not.toContain('CFBD_API_KEY');
    expect(src).not.toContain('SGO_API_KEY');
    expect(src).not.toContain('VISUALCROSSING_API_KEY');
    expect(src).not.toContain('fetch(');
    expect(src).not.toContain('axios');
    expect(src).toContain("GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID");
    expect(src).toContain("GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH");
    expect(src).toContain("from '../../web/lib/shadow-model-t30-closing-v1'");
    expect(src).not.toContain("'generic_shadow_t30_closing_v2'");
  });

  it('CLI source remains provider-free and uses Slice B frozen identity', () => {
    const src = fs.readFileSync(CLI_SRC, 'utf8');
    expect(src).not.toContain('ODDS_API_KEY');
    expect(src).not.toContain('CFBD_API_KEY');
    expect(src).not.toContain('SGO_API_KEY');
    expect(src).not.toContain('VISUALCROSSING_API_KEY');
    expect(src).not.toContain('fetch(');
    expect(src).not.toContain('axios');
    expect(src).toContain('GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID');
    expect(src).toContain('GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH');
  });
});
