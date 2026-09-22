/**
 * Generic Shadow T-30 Closing V1 — pure planner tests.
 * Synthetic in-memory fixtures only. No Prisma, DB, network, or secrets.
 */

import * as fs from 'fs';
import * as path from 'path';
import { pickDisplaySpread, selectBookSpreadSnapshots } from '@/lib/market-line-snapshot';
import type { ShadowModelMarketLineRow } from '@/lib/shadow-model-capture-v1';
import {
  GENERIC_SHADOW_T30_AUTHORIZED_SOURCE,
  GENERIC_SHADOW_T30_CAPTURE_SEASON,
  GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH,
  GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID,
  GENERIC_SHADOW_T30_EVALUATION_PROTOCOL,
  GENERIC_SHADOW_T30_MARKET_TYPE,
  GENERIC_SHADOW_T30_OFFSET_SECONDS,
  GENERIC_SHADOW_T30_SUPPORTED_MODEL_IDS,
  expectedGenericShadowT30WriteConfirmation,
  genericShadowT30TargetTimestamp,
  planGenericShadowT30Closing,
  selectGenericShadowT30ClosingMarket,
  validateExistingGenericShadowT30Closing,
  type GenericShadowT30CaptureRun,
  type GenericShadowT30CurrentGame,
  type GenericShadowT30ExistingClosing,
  type GenericShadowT30OperationalFrame,
  type GenericShadowT30PlanRequest,
  type GenericShadowT30Prediction,
} from '@/lib/shadow-model-t30-closing-v1';

const RUN_ID = 'run-1';
const PRED_ID = 'pred-1';
const GAME_ID = 'game-1';
const HOME = 'home';
const AWAY = 'away';
const KICKOFF = new Date('2026-09-16T20:00:00.000Z');
const TARGET = new Date('2026-09-16T19:30:00.000Z');
const DUE_AT = new Date('2026-09-16T19:35:00.000Z');
const MARKET_TS = new Date('2026-09-16T19:20:00.000Z');
const PRED_TS = new Date('2026-09-16T16:00:00.000Z');
const CANDIDATE_B_RUN = '74234d87-bb32-47c6-927b-6de3d24cfc88';

function run(extra: Partial<GenericShadowT30CaptureRun> = {}): GenericShadowT30CaptureRun {
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

function pair(extra: {
  gameId?: string;
  book?: string;
  timestamp?: Date;
  homeLine?: number;
  awayLine?: number;
  source?: string;
  homeId?: string;
  awayId?: string;
  prefix?: string;
} = {}): ShadowModelMarketLineRow[] {
  const ts = extra.timestamp ?? MARKET_TS;
  const book = extra.book ?? 'book-a';
  const source = extra.source ?? GENERIC_SHADOW_T30_AUTHORIZED_SOURCE;
  const prefix = extra.prefix ?? `${book}-${ts.toISOString()}`;
  return [
    {
      id: `${prefix}-home`,
      gameId: extra.gameId ?? GAME_ID,
      lineType: 'spread',
      lineValue: extra.homeLine ?? -3.5,
      teamId: extra.homeId ?? HOME,
      bookName: book,
      source,
      timestamp: ts,
    },
    {
      id: `${prefix}-away`,
      gameId: extra.gameId ?? GAME_ID,
      lineType: 'spread',
      lineValue: extra.awayLine ?? 3.5,
      teamId: extra.awayId ?? AWAY,
      bookName: book,
      source,
      timestamp: ts,
    },
  ];
}

function frame(extra: Partial<GenericShadowT30OperationalFrame> = {}): GenericShadowT30OperationalFrame {
  return {
    captureRun: run(),
    predictions: [prediction()],
    games: [game()],
    marketLines: pair(),
    existingClosings: [],
    ...extra,
  };
}

function plan(
  extra: Partial<GenericShadowT30PlanRequest> & { frame?: GenericShadowT30OperationalFrame } = {}
) {
  let n = 0;
  return planGenericShadowT30Closing({
    season: 2026,
    week: 3,
    captureRunId: RUN_ID,
    mode: 'PREVIEW',
    confirmation: '',
    observedTimestamp: DUE_AT,
    createId: () => `close-${++n}`,
    frame: extra.frame ?? frame(),
    ...extra,
  });
}

function existingAvailable(
  extra: Partial<GenericShadowT30ExistingClosing> = {}
): GenericShadowT30ExistingClosing {
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

function existingUnavailable(
  extra: Partial<GenericShadowT30ExistingClosing> = {}
): GenericShadowT30ExistingClosing {
  return {
    id: 'exist-u',
    predictionId: PRED_ID,
    gameId: GAME_ID,
    evaluationProtocol: GENERIC_SHADOW_T30_EVALUATION_PROTOCOL,
    closingDefinitionId: GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID,
    closingDefinitionHash: GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH,
    marketType: 'SPREAD',
    predictionKickoffTimestamp: KICKOFF,
    closingKickoffTimestamp: KICKOFF,
    targetTimestamp: TARGET,
    status: 'UNAVAILABLE',
    unavailableReason: 'missing_market_at_or_before_t30',
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
    capturedAt: DUE_AT,
    ...extra,
  };
}

describe('Generic Shadow T-30 Closing V1 — frozen identity', () => {
  it('exports the frozen closing definition, protocol, source, offset, and allowlist', () => {
    expect(GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID).toBe('generic_shadow_t30_closing_v1');
    expect(GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH).toBe(
      '1a2b01a893e0d8811d5ffe0c78af2f8a15dc9d4eb165b19ef5f14a9e1e8be898'
    );
    expect(GENERIC_SHADOW_T30_EVALUATION_PROTOCOL).toBe('CORE_EVAL_V1');
    expect(GENERIC_SHADOW_T30_AUTHORIZED_SOURCE).toBe('oddsapi');
    expect(GENERIC_SHADOW_T30_OFFSET_SECONDS).toBe(1800);
    expect(GENERIC_SHADOW_T30_MARKET_TYPE).toBe('SPREAD');
    expect(GENERIC_SHADOW_T30_CAPTURE_SEASON).toBe(2026);
    expect([...GENERIC_SHADOW_T30_SUPPORTED_MODEL_IDS]).toEqual([
      'core_v1_shadow_baseline_v1',
      'candidate_b_roster_prior_v1',
      'candidate_b_elo_prior_v1',
    ]);
  });

  it('keeps the frozen contract identities unchanged', () => {
    const contract = fs.readFileSync(
      path.resolve(__dirname, '../../../research/generic-shadow/GENERIC_SHADOW_T30_CLOSING_V1_CONTRACT.md'),
      'utf8'
    );
    expect(contract).toContain('generic_shadow_t30_closing_v1');
    expect(contract).toContain(
      '1a2b01a893e0d8811d5ffe0c78af2f8a15dc9d4eb165b19ef5f14a9e1e8be898'
    );
  });
});

describe('Generic Shadow T-30 Closing V1 — confirmation and target', () => {
  it('builds the exact COMMIT confirmation string', () => {
    expect(expectedGenericShadowT30WriteConfirmation(3, CANDIDATE_B_RUN)).toBe(
      'CAPTURE_2026_WEEK_3_SHADOW_MODEL_T30_74234d87-bb32-47c6-927b-6de3d24cfc88'
    );
  });

  it('does not block PREVIEW for blank confirmation', () => {
    const result = plan({ mode: 'PREVIEW', confirmation: '' });
    expect(result.confirmationValid).toBe(true);
    expect(result.writeBlockers).not.toContain('confirmation_invalid');
  });

  it('blocks COMMIT on wrong confirmation and accepts the exact string', () => {
    const wrong = plan({
      mode: 'COMMIT',
      confirmation: 'NOPE',
    });
    expect(wrong.confirmationValid).toBe(false);
    expect(wrong.writeSafe).toBe(false);
    expect(wrong.writeBlockers).toContain('confirmation_invalid');

    const ok = plan({
      mode: 'COMMIT',
      confirmation: expectedGenericShadowT30WriteConfirmation(3, RUN_ID),
    });
    expect(ok.confirmationValid).toBe(true);
    expect(ok.writeBlockers).not.toContain('confirmation_invalid');
    expect(ok.writeSafe).toBe(true);
  });

  it('computes kickoff minus 1800 seconds', () => {
    expect(genericShadowT30TargetTimestamp(KICKOFF)?.toISOString()).toBe(TARGET.toISOString());
    expect(genericShadowT30TargetTimestamp('not-a-date')).toBeNull();
  });
});

describe('Generic Shadow T-30 Closing V1 — game states', () => {
  it('classifies FUTURE before target with no planned row', () => {
    const result = plan({ observedTimestamp: new Date('2026-09-16T19:00:00.000Z') });
    expect(result.writeSafe).toBe(true);
    expect(result.predictions[0].state).toBe('FUTURE');
    expect(result.rowsToInsert).toEqual([]);
    expect(result.counts.futureCount).toBe(1);
    expect(result.counts.plannedInsertCount).toBe(0);
  });

  it('plans DUE AVAILABLE with both source rows, home display anchor, and capturedAt=observed', () => {
    const result = plan();
    expect(result.writeSafe).toBe(true);
    expect(result.predictions[0].state).toBe('DUE');
    expect(result.rowsToInsert).toHaveLength(1);
    const row = result.rowsToInsert[0];
    expect(row.status).toBe('AVAILABLE');
    expect(row.selectedHomeMarketLineId).toBe('book-a-2026-09-16T19:20:00.000Z-home');
    expect(row.selectedAwayMarketLineId).toBe('book-a-2026-09-16T19:20:00.000Z-away');
    expect(row.selectedHomeLineValue).toBe(-3.5);
    expect(row.selectedAwayLineValue).toBe(3.5);
    expect(row.selectedDisplayTeamId).toBe(HOME);
    expect(row.selectedDisplayLineValue).toBe(-3.5);
    expect(row.canonicalMarketHma).toBe(3.5);
    expect(row.source).toBe('oddsapi');
    expect(row.capturedAt).toBe(DUE_AT);
    expect(row.unavailableReason).toBeNull();
    expect(row.marketAgeToTargetSeconds).toBe(
      Math.ceil((TARGET.getTime() - MARKET_TS.getTime()) / 1000)
    );
    expect(result.providerCalls).toBe(0);
  });

  it('does not fall forward to a coherent pair after target', () => {
    const result = plan({
      frame: frame({
        marketLines: pair({ timestamp: new Date('2026-09-16T19:31:00.000Z') }),
      }),
    });
    expect(result.writeSafe).toBe(true);
    expect(result.rowsToInsert[0].status).toBe('UNAVAILABLE');
    expect(result.rowsToInsert[0].unavailableReason).toBe('missing_market_at_or_before_t30');
    expect(result.rowsToInsert[0].selectedHomeMarketLineId).toBeNull();
  });

  it('classifies incoherent pre-target evidence even when a post-target pair is coherent', () => {
    const result = plan({
      frame: frame({
        marketLines: [
          {
            id: 'lone-home',
            gameId: GAME_ID,
            lineType: 'spread',
            lineValue: -7,
            teamId: HOME,
            bookName: 'book-a',
            source: 'oddsapi',
            timestamp: MARKET_TS,
          },
          ...pair({
            timestamp: new Date('2026-09-16T19:31:00.000Z'),
            prefix: 'late',
            homeLine: -3.5,
            awayLine: 3.5,
          }),
        ],
      }),
    });
    expect(result.rowsToInsert[0].status).toBe('UNAVAILABLE');
    expect(result.rowsToInsert[0].unavailableReason).toBe(
      'incoherent_market_at_or_before_t30'
    );
  });

  it('returns incoherent_market_at_or_before_t30 when pre-target rows cannot form a pair', () => {
    const selected = selectGenericShadowT30ClosingMarket({
      rows: [
        {
          id: 'home-only',
          gameId: GAME_ID,
          lineType: 'spread',
          lineValue: -7,
          teamId: HOME,
          bookName: 'book-a',
          source: 'oddsapi',
          timestamp: MARKET_TS,
        },
      ],
      gameId: GAME_ID,
      homeTeamId: HOME,
      awayTeamId: AWAY,
      targetTimestamp: TARGET,
    });
    expect(selected.status).toBe('incoherent_market_at_or_before_t30');
  });

  it('keeps a coherent pair older than 1800 seconds eligible with no stale-market blocker', () => {
    const oldTs = new Date('2026-09-16T16:00:00.000Z');
    const result = plan({
      frame: frame({
        marketLines: pair({ timestamp: oldTs, prefix: 'old' }),
      }),
    });
    expect(result.writeSafe).toBe(true);
    expect(result.rowsToInsert[0].status).toBe('AVAILABLE');
    expect(result.rowsToInsert[0].marketAgeToTargetSeconds).toBeGreaterThan(1800);
    expect(result.writeBlockers).toEqual([]);
  });

  it('uses selectBookSpreadSnapshots + pickDisplaySpread for book/timestamp determinism', () => {
    const older = pair({
      book: 'book-old',
      timestamp: new Date('2026-09-16T18:00:00.000Z'),
      prefix: 'old',
    });
    const newerA = pair({
      book: 'book-a',
      timestamp: new Date('2026-09-16T19:10:00.000Z'),
      prefix: 'a',
      homeLine: -7,
      awayLine: 7,
    });
    const newerB = pair({
      book: 'book-b',
      timestamp: new Date('2026-09-16T19:10:00.000Z'),
      prefix: 'b',
      homeLine: -3.5,
      awayLine: 3.5,
    });
    const rows = [...older, ...newerB, ...newerA];
    const expected = pickDisplaySpread(
      selectBookSpreadSnapshots(
        rows.map((r) => ({
          id: r.id,
          gameId: r.gameId,
          lineType: r.lineType,
          lineValue: r.lineValue,
          bookName: r.bookName ?? '',
          timestamp: r.timestamp,
          teamId: r.teamId,
          source: r.source,
        })),
        HOME,
        AWAY
      ).snapshots
    );
    const result = plan({ frame: frame({ marketLines: rows }) });
    expect(result.rowsToInsert[0].selectedHomeMarketLineId).toBe(expected?.homeRowId);
    expect(result.rowsToInsert[0].book).toBe(expected?.bookName);
    expect(result.rowsToInsert[0].canonicalMarketHma).toBe(expected?.marketSpreadHma);
  });

  it('classifies MISSED at/after kickoff even when pre-target markets exist', () => {
    const result = plan({ observedTimestamp: KICKOFF });
    expect(result.predictions[0].state).toBe('MISSED');
    expect(result.rowsToInsert).toEqual([]);
    expect(result.counts.missedCount).toBe(1);
  });

  it('still plans AVAILABLE closing evidence for an UNAVAILABLE prediction', () => {
    const result = plan({
      frame: frame({
        captureRun: run({ availableCount: 0, unavailableCount: 1, selectionCount: 0 }),
        predictions: [
          prediction({ predictionStatus: 'UNAVAILABLE', selectedSide: null }),
        ],
      }),
    });
    expect(result.writeSafe).toBe(true);
    expect(result.predictions[0].predictionStatus).toBe('UNAVAILABLE');
    expect(result.predictions[0].state).toBe('DUE');
    expect(result.rowsToInsert[0].status).toBe('AVAILABLE');
  });
});

describe('Generic Shadow T-30 Closing V1 — kickoff and identity', () => {
  it('uses current Game kickoff when no existing close and reports drift', () => {
    const currentKickoff = new Date('2026-09-16T21:00:00.000Z');
    const result = plan({
      observedTimestamp: new Date('2026-09-16T20:35:00.000Z'),
      frame: frame({
        games: [game({ kickoffTimestamp: currentKickoff })],
      }),
    });
    expect(result.writeSafe).toBe(true);
    expect(result.predictions[0].predictionKickoffTimestamp.toISOString()).toBe(
      KICKOFF.toISOString()
    );
    expect(result.predictions[0].closingKickoffTimestamp.toISOString()).toBe(
      currentKickoff.toISOString()
    );
    expect(result.predictions[0].targetTimestamp.toISOString()).toBe(
      '2026-09-16T20:30:00.000Z'
    );
    expect(result.predictions[0].kickoffChangedSincePrediction).toBe(true);
  });

  it('fails closed on current Game identity contradiction', () => {
    const result = plan({
      frame: frame({
        games: [game({ homeTeamId: 'other-home' })],
      }),
    });
    expect(result.writeSafe).toBe(false);
    expect(result.writeBlockers).toContain('current_game_identity_mismatch');
    expect(result.rowsToInsert).toEqual([]);
  });
});

describe('Generic Shadow T-30 Closing V1 — capture frame integrity', () => {
  it('fails closed when the capture run is not COMPLETE', () => {
    const result = plan({ frame: frame({ captureRun: run({ status: 'FAILED' }) }) });
    expect(result.writeSafe).toBe(false);
    expect(result.writeBlockers).toContain('capture_run_not_complete');
    expect(result.rowsToInsert).toEqual([]);
  });

  it('fails closed on wrong evaluation protocol', () => {
    const result = plan({
      frame: frame({ captureRun: run({ evaluationProtocol: 'OTHER' }) }),
    });
    expect(result.writeBlockers).toContain('capture_run_protocol_mismatch');
  });

  it('fails closed on unsupported model', () => {
    const result = plan({
      frame: frame({ captureRun: run({ modelDefinitionId: 'wepa_shadow' }) }),
    });
    expect(result.writeBlockers).toContain('capture_run_model_not_supported');
  });

  it('fails closed on prediction count mismatch', () => {
    const result = plan({
      frame: frame({
        captureRun: run({ totalGames: 2, expectedGameIds: [GAME_ID, 'game-2'] }),
      }),
    });
    expect(result.writeBlockers).toContain('prediction_row_count_mismatch');
    expect(result.rowsToInsert).toEqual([]);
  });

  it('fails closed on duplicate prediction game IDs', () => {
    const result = plan({
      frame: frame({
        captureRun: run({
          totalGames: 2,
          expectedGameIds: [GAME_ID, 'game-2'],
          availableCount: 2,
          selectionCount: 2,
        }),
        predictions: [prediction(), prediction({ id: 'pred-2', gameId: GAME_ID })],
        games: [game(), game({ id: 'game-2' })],
      }),
    });
    expect(result.writeBlockers).toContain('duplicate_prediction_game_ids');
  });

  it('fails closed when expectedGameIds mismatch the prediction set', () => {
    const result = plan({
      frame: frame({
        captureRun: run({ expectedGameIds: ['other-game'] }),
      }),
    });
    expect(result.writeBlockers).toContain('prediction_game_set_mismatch');
  });

  it('fails closed on a numeric expectedGameId that would stringify to the prediction gameId', () => {
    const numericId = 123;
    const stringId = '123';
    const result = plan({
      frame: frame({
        captureRun: run({ expectedGameIds: [numericId], totalGames: 1 }),
        predictions: [prediction({ gameId: stringId })],
        games: [game({ id: stringId })],
        marketLines: pair({ gameId: stringId }),
      }),
    });
    expect(result.writeSafe).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.writeBlockers).toContain('expected_game_ids_not_strings');
    expect(result.rowsToInsert).toEqual([]);
  });

  it('accepts string expectedGameIds that happen to look numeric', () => {
    const stringId = '123';
    const result = plan({
      frame: frame({
        captureRun: run({ expectedGameIds: [stringId], totalGames: 1 }),
        predictions: [prediction({ gameId: stringId })],
        games: [game({ id: stringId })],
        marketLines: pair({ gameId: stringId }),
      }),
    });
    expect(result.writeSafe).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.writeBlockers).not.toContain('expected_game_ids_not_strings');
    expect(result.rowsToInsert).toHaveLength(1);
    expect(result.predictions[0].gameId).toBe(stringId);
  });

  it('fails closed when a prediction belongs to another capture run', () => {
    const result = plan({
      frame: frame({
        predictions: [prediction({ captureRunId: 'other-run' })],
      }),
    });
    expect(result.writeBlockers).toContain('prediction_capture_run_mismatch');
  });

  it('fails closed on wrong prediction marketType', () => {
    const result = plan({
      frame: frame({
        predictions: [prediction({ marketType: 'TOTAL' })],
      }),
    });
    expect(result.writeBlockers).toContain('prediction_market_type_mismatch');
  });
});

describe('Generic Shadow T-30 Closing V1 — run count reconciliation', () => {
  it('fails closed when persisted availableCount is corrupt', () => {
    const result = plan({
      frame: frame({ captureRun: run({ availableCount: 0 }) }),
    });
    expect(result.writeSafe).toBe(false);
    expect(result.writeBlockers).toContain('capture_run_available_count_mismatch');
  });

  it('fails closed when persisted selectionCount is corrupt', () => {
    const result = plan({
      frame: frame({ captureRun: run({ selectionCount: 0 }) }),
    });
    expect(result.writeSafe).toBe(false);
    expect(result.writeBlockers).toContain('capture_run_selection_count_mismatch');
  });
});

describe('Generic Shadow T-30 Closing V1 — existing rows', () => {
  it('treats a valid AVAILABLE existing row as immutable EXISTING', () => {
    const lines = pair();
    const existing = existingAvailable();
    const result = plan({
      frame: frame({ marketLines: lines, existingClosings: [existing] }),
    });
    expect(result.writeSafe).toBe(true);
    expect(result.predictions[0].state).toBe('EXISTING');
    expect(result.predictions[0].existingClosingId).toBe('exist-1');
    expect(result.rowsToInsert).toEqual([]);
  });

  it('does not retarget an existing close after post-capture kickoff drift', () => {
    const lines = pair();
    const existing = existingAvailable();
    const result = plan({
      frame: frame({
        games: [game({ kickoffTimestamp: new Date('2026-09-16T21:00:00.000Z') })],
        marketLines: lines,
        existingClosings: [existing],
      }),
    });
    expect(result.writeSafe).toBe(true);
    expect(result.predictions[0].state).toBe('EXISTING');
    expect(result.predictions[0].targetTimestamp.toISOString()).toBe(TARGET.toISOString());
    expect(result.predictions[0].closingKickoffTimestamp.toISOString()).toBe(
      KICKOFF.toISOString()
    );
    expect(result.predictions[0].kickoffChangedSincePrediction).toBe(true);
    expect(result.rowsToInsert).toEqual([]);
  });

  it('blocks an existing AVAILABLE row that falls forward after T-30 without replacement', () => {
    const lines = pair({ timestamp: new Date('2026-09-16T19:31:00.000Z'), prefix: 'late' });
    const existing = existingAvailable({
      selectedHomeMarketLineId: lines[0].id,
      selectedAwayMarketLineId: lines[1].id,
      marketObservationTimestamp: new Date('2026-09-16T19:31:00.000Z'),
      marketAgeToTargetSeconds: -60,
    });
    const result = plan({
      frame: frame({ marketLines: lines, existingClosings: [existing] }),
    });
    expect(result.writeSafe).toBe(false);
    expect(result.writeBlockers).toContain('existing_closing_falls_forward_after_t30');
    expect(result.predictions[0].state).toBe('EXISTING');
    expect(result.rowsToInsert).toEqual([]);
  });

  it('blocks existing source-pair corruption without replacement', () => {
    const lines = pair();
    const cases: Array<Partial<GenericShadowT30ExistingClosing>> = [
      { selectedHomeMarketLineId: 'missing-home' },
      { selectedAwayMarketLineId: 'missing-away' },
      { book: 'other-book' },
      { selectedHomeLineValue: -99 },
      { canonicalMarketHma: 99 },
    ];
    for (const extra of cases) {
      const existing = existingAvailable(extra);
      const result = plan({
        frame: frame({ marketLines: lines, existingClosings: [existing] }),
      });
      expect(result.writeSafe).toBe(false);
      expect(result.predictions[0].state).toBe('EXISTING');
      expect(result.rowsToInsert).toEqual([]);
    }
    const teamMismatch = existingAvailable();
    const badLines = pair({ homeId: 'not-home', prefix: 'bad-team' });
    const teamResult = plan({
      frame: frame({
        marketLines: badLines,
        existingClosings: [
          {
            ...teamMismatch,
            selectedHomeMarketLineId: badLines[0].id,
            selectedAwayMarketLineId: badLines[1].id,
          },
        ],
      }),
    });
    expect(teamResult.writeBlockers).toContain('existing_closing_market_pair_mismatch');

    const tsMismatch = existingAvailable({
      marketObservationTimestamp: new Date('2026-09-16T19:10:00.000Z'),
      marketAgeToTargetSeconds: Math.ceil(
        (TARGET.getTime() - new Date('2026-09-16T19:10:00.000Z').getTime()) / 1000
      ),
    });
    const tsResult = plan({
      frame: frame({ marketLines: lines, existingClosings: [tsMismatch] }),
    });
    expect(tsResult.writeBlockers).toContain('existing_closing_market_pair_mismatch');
  });

  it('accepts a valid UNAVAILABLE existing row and blocks bad reason or market fields', () => {
    const ok = plan({
      frame: frame({ existingClosings: [existingUnavailable()] }),
    });
    expect(ok.writeSafe).toBe(true);
    expect(ok.predictions[0].state).toBe('EXISTING');

    const badReason = plan({
      frame: frame({
        existingClosings: [existingUnavailable({ unavailableReason: 'stale_market' })],
      }),
    });
    expect(badReason.writeBlockers).toContain('existing_unavailable_closing_reason_invalid');
    expect(badReason.rowsToInsert).toEqual([]);

    const hasMarket = plan({
      frame: frame({
        existingClosings: [existingUnavailable({ book: 'book-a' })],
      }),
    });
    expect(hasMarket.writeBlockers).toContain('existing_unavailable_closing_has_market_fields');
    expect(hasMarket.predictions[0].state).toBe('EXISTING');
  });

  it('does not re-rank an existing close when later MarketLine history appears', () => {
    const lines = pair();
    const newer = pair({
      timestamp: new Date('2026-09-16T19:29:00.000Z'),
      prefix: 'newer',
      homeLine: -14,
      awayLine: 14,
    });
    const result = plan({
      frame: frame({
        marketLines: [...lines, ...newer],
        existingClosings: [existingAvailable()],
      }),
    });
    expect(result.writeSafe).toBe(true);
    expect(result.predictions[0].state).toBe('EXISTING');
    expect(result.predictions[0].selectedHomeLineValue).toBe(-3.5);
    expect(result.rowsToInsert).toEqual([]);
  });

  it('validateExistingGenericShadowT30Closing does not mutate the input row', () => {
    const row = existingAvailable();
    const frozen = JSON.stringify(row);
    validateExistingGenericShadowT30Closing({
      row,
      prediction: prediction(),
      marketLines: pair(),
    });
    expect(JSON.stringify(row)).toBe(frozen);
  });
});

describe('Generic Shadow T-30 Closing V1 — source and market-type filters', () => {
  it('ignores non-oddsapi coherent rows', () => {
    const result = plan({
      frame: frame({
        marketLines: pair({ source: 'some_other_source', prefix: 'other' }),
      }),
    });
    expect(result.rowsToInsert[0].unavailableReason).toBe(
      'missing_market_at_or_before_t30'
    );
  });

  it('ignores totals/moneyline-only rows', () => {
    const result = plan({
      frame: frame({
        marketLines: [
          {
            id: 'total-1',
            gameId: GAME_ID,
            lineType: 'total',
            lineValue: 50.5,
            teamId: null,
            bookName: 'book-a',
            source: 'oddsapi',
            timestamp: MARKET_TS,
          },
          {
            id: 'ml-1',
            gameId: GAME_ID,
            lineType: 'moneyline',
            lineValue: -140,
            teamId: HOME,
            bookName: 'book-a',
            source: 'oddsapi',
            timestamp: MARKET_TS,
          },
        ],
      }),
    });
    expect(result.rowsToInsert[0].unavailableReason).toBe(
      'missing_market_at_or_before_t30'
    );
  });
});

describe('Generic Shadow T-30 Closing V1 — counts and determinism', () => {
  it('reconciles EXISTING + FUTURE + DUE + MISSED counts', () => {
    const kick2 = new Date('2026-09-16T22:00:00.000Z');
    const kick3 = new Date('2026-09-16T18:00:00.000Z');
    const kick4 = new Date('2026-09-16T23:00:00.000Z');
    const p1 = prediction();
    const p2 = prediction({ id: 'pred-2', gameId: 'game-2', kickoffTimestamp: kick2 });
    const p3 = prediction({ id: 'pred-3', gameId: 'game-3', kickoffTimestamp: kick3 });
    const p4 = prediction({
      id: 'pred-4',
      gameId: 'game-4',
      kickoffTimestamp: kick4,
      selectedSide: 'AWAY',
    });
    const lines = [
      ...pair(),
      ...pair({ gameId: 'game-2', prefix: 'g2' }),
      ...pair({ gameId: 'game-3', prefix: 'g3' }),
      ...pair({ gameId: 'game-4', prefix: 'g4' }),
    ];
    const result = plan({
      observedTimestamp: DUE_AT,
      frame: {
        captureRun: run({
          totalGames: 4,
          expectedGameIds: ['game-1', 'game-2', 'game-3', 'game-4'],
          availableCount: 4,
          selectionCount: 4,
        }),
        predictions: [p1, p2, p3, p4],
        games: [
          game(),
          game({ id: 'game-2', kickoffTimestamp: kick2 }),
          game({ id: 'game-3', kickoffTimestamp: kick3 }),
          game({ id: 'game-4', kickoffTimestamp: kick4 }),
        ],
        marketLines: lines,
        existingClosings: [existingAvailable()],
      },
    });
    expect(result.writeSafe).toBe(true);
    expect(result.counts).toEqual({
      totalPredictions: 4,
      existingCount: 1,
      futureCount: 2,
      dueCount: 0,
      missedCount: 1,
      plannedAvailableCount: 0,
      plannedUnavailableCount: 0,
      plannedInsertCount: 0,
    });
    // game-1 EXISTING, game-2 FUTURE (kick 22:00, target 21:30), game-3 MISSED (kick 18:00),
    // wait game-4 kick 23:00 is also FUTURE. That's 1 existing + 2 future + 1 missed = 4, due 0.

    const dueKick = new Date('2026-09-16T20:00:00.000Z');
    const duePred = prediction({
      id: 'pred-due',
      gameId: 'game-due',
      kickoffTimestamp: dueKick,
    });
    const withDue = plan({
      observedTimestamp: DUE_AT,
      frame: {
        captureRun: run({
          totalGames: 4,
          expectedGameIds: ['game-1', 'game-2', 'game-3', 'game-due'],
          availableCount: 4,
          selectionCount: 4,
        }),
        predictions: [p1, p2, p3, duePred],
        games: [
          game(),
          game({ id: 'game-2', kickoffTimestamp: kick2 }),
          game({ id: 'game-3', kickoffTimestamp: kick3 }),
          game({ id: 'game-due', kickoffTimestamp: dueKick }),
        ],
        marketLines: [
          ...pair(),
          ...pair({ gameId: 'game-2', prefix: 'g2' }),
          ...pair({ gameId: 'game-3', prefix: 'g3' }),
          ...pair({ gameId: 'game-due', prefix: 'g-due' }),
        ],
        existingClosings: [existingAvailable()],
      },
    });
    expect(withDue.writeSafe).toBe(true);
    expect(withDue.counts.existingCount).toBe(1);
    expect(withDue.counts.futureCount).toBe(1);
    expect(withDue.counts.dueCount).toBe(1);
    expect(withDue.counts.missedCount).toBe(1);
    expect(withDue.counts.plannedInsertCount).toBe(1);
    expect(withDue.counts.plannedAvailableCount).toBe(1);
    expect(
      withDue.counts.existingCount +
        withDue.counts.futureCount +
        withDue.counts.dueCount +
        withDue.counts.missedCount
    ).toBe(4);
  });

  it('is independent of input array order', () => {
    const p1 = prediction();
    const p2 = prediction({ id: 'pred-2', gameId: 'game-2', selectedSide: 'AWAY' });
    const g1 = game();
    const g2 = game({ id: 'game-2' });
    const lines = [...pair(), ...pair({ gameId: 'game-2', prefix: 'g2' })];
    const existing = existingAvailable();
    const base = {
      captureRun: run({
        totalGames: 2,
        expectedGameIds: [GAME_ID, 'game-2'],
        availableCount: 2,
        selectionCount: 2,
      }),
      predictions: [p2, p1],
      games: [g2, g1],
      marketLines: [...pair({ gameId: 'game-2', prefix: 'g2' }), ...pair()],
      existingClosings: [existing],
    };
    const a = plan({ frame: base });
    const b = plan({
      frame: {
        ...base,
        predictions: [p1, p2],
        games: [g1, g2],
        marketLines: lines,
        existingClosings: [existing],
      },
    });
    expect(a.predictions.map((p) => p.gameId)).toEqual(['game-1', 'game-2']);
    expect(b.predictions.map((p) => p.gameId)).toEqual(['game-1', 'game-2']);
    expect(a.predictions.map((p) => p.state)).toEqual(b.predictions.map((p) => p.state));
    expect(a.rowsToInsert.map((r) => r.gameId)).toEqual(b.rowsToInsert.map((r) => r.gameId));
  });
});

describe('Generic Shadow T-30 Closing V1 — purity', () => {
  it('runtime module has no Prisma, fetch, axios, process.env, or provider secrets', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../lib/shadow-model-t30-closing-v1.ts'),
      'utf8'
    );
    expect(src).not.toContain('@prisma/client');
    expect(src).not.toContain('PrismaClient');
    expect(src).not.toContain('fetch(');
    expect(src).not.toContain('axios');
    expect(src).not.toContain('process.env');
    expect(src).not.toContain('DATABASE_URL');
    expect(src).not.toContain('DIRECT_URL');
    expect(src).not.toContain('ODDS_API_KEY');
    expect(src).not.toContain('CFBD_API_KEY');
    expect(src).not.toContain('selectGameMarketSnapshots');
    expect(src).not.toContain('executeGenericShadowT30ClosingCapture');
    expect(src).toContain('selectBookSpreadSnapshots');
    expect(src).toContain('pickDisplaySpread');
  });
});
