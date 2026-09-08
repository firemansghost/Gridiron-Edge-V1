import {
  SHADOW_CLOSING_MISSING_MARKET_REASON,
  executeShadowClosingCapture,
  expectedClosingWriteConfirmation,
  planShadowClosingCapture,
  selectShadowClosingMarket,
  shadowClosingTargetTimestamp,
  type ExistingShadowClosingRow,
  type OperationalShadowClosingFrame,
  type PlannedShadowClosingMarketSnapshot,
  type ShadowClosingAdapter,
} from '../lib/shadow-closing-market-v1';
import {
  SHADOW_EVALUATION_PROTOCOL,
  SHADOW_POLICY_DEFINITION_HASH,
  SHADOW_POLICY_DEFINITION_ID,
  type ShadowMarketLineRow,
} from '../lib/shadow-snapshot-v1';

const GAME = {
  id: 'g1',
  season: 2026,
  week: 2,
  homeTeamId: 'home',
  awayTeamId: 'away',
  kickoffTimestamp: new Date('2026-09-12T18:00:00.000Z'),
};

function line(extra: Partial<ShadowMarketLineRow> = {}): ShadowMarketLineRow {
  return {
    id: 'line-a',
    gameId: 'g1',
    lineType: 'spread',
    lineValue: -7,
    teamId: 'home',
    bookName: 'Book A',
    source: 'odds_api',
    timestamp: new Date('2026-09-12T17:20:00.000Z'),
    ...extra,
  };
}

function frame(extra: Partial<OperationalShadowClosingFrame> = {}): OperationalShadowClosingFrame {
  return {
    games: [GAME],
    predictionFrames: [['g1']],
    marketLines: [line()],
    existingClosings: [],
    ...extra,
  };
}

function existingAvailable(extra: Partial<ExistingShadowClosingRow> = {}): ExistingShadowClosingRow {
  return {
    id: 'close-1',
    gameId: 'g1',
    evaluationProtocol: SHADOW_EVALUATION_PROTOCOL,
    policyDefinitionId: SHADOW_POLICY_DEFINITION_ID,
    policyDefinitionHash: SHADOW_POLICY_DEFINITION_HASH,
    marketType: 'SPREAD',
    targetTimestamp: new Date('2026-09-12T17:30:00.000Z'),
    status: 'AVAILABLE',
    unavailableReason: null,
    selectedMarketLineId: 'line-a',
    selectedMarketTeamId: 'home',
    selectedMarketLineValue: -7,
    canonicalMarketHma: 7,
    book: 'Book A',
    source: 'odds_api',
    marketObservationTimestamp: new Date('2026-09-12T17:20:00.000Z'),
    capturedAt: new Date('2026-09-12T17:35:00.000Z'),
    ...extra,
  };
}

describe('Shadow T-30 closing market V1', () => {
  it('computes the frozen kickoff-minus-30-minute target', () => {
    expect(shadowClosingTargetTimestamp(GAME.kickoffTimestamp)?.toISOString()).toBe(
      '2026-09-12T17:30:00.000Z'
    );
  });

  it('selects timestamp DESC then id DESC and never falls forward after T-30', () => {
    const selected = selectShadowClosingMarket({
      rows: [
        line({ id: 'line-old', timestamp: new Date('2026-09-12T17:20:00.000Z') }),
        line({ id: 'line-a', lineValue: -6.5, timestamp: new Date('2026-09-12T17:30:00.000Z') }),
        line({ id: 'line-b', lineValue: -7, timestamp: new Date('2026-09-12T17:30:00.000Z') }),
        line({ id: 'line-post', lineValue: -9, timestamp: new Date('2026-09-12T17:31:00.000Z') }),
      ],
      gameId: 'g1',
      homeTeamId: 'home',
      awayTeamId: 'away',
      targetTimestamp: new Date('2026-09-12T17:30:00.000Z'),
    });
    expect(selected?.selectedMarketLineId).toBe('line-b');
    expect(selected?.selectedMarketLineValue).toBe(-7);
    expect(selected?.canonicalMarketHma).toBe(7);
    expect(selected?.marketObservationTimestamp.toISOString()).toBe('2026-09-12T17:30:00.000Z');
  });

  it('keeps future games out of the mutation set', () => {
    const plan = planShadowClosingCapture({
      season: 2026,
      week: 2,
      mode: 'PREVIEW',
      confirmation: '',
      observedTimestamp: new Date('2026-09-12T17:00:00.000Z'),
      frame: frame(),
      createId: () => 'close-new',
    });
    expect(plan.writeSafe).toBe(true);
    expect(plan.counts.futureCount).toBe(1);
    expect(plan.counts.plannedInsertCount).toBe(0);
  });

  it('plans a due AVAILABLE row using only a pre-target market observation', () => {
    const plan = planShadowClosingCapture({
      season: 2026,
      week: 2,
      mode: 'PREVIEW',
      confirmation: '',
      observedTimestamp: new Date('2026-09-12T17:35:00.000Z'),
      frame: frame({
        marketLines: [
          line({ id: 'eligible', timestamp: new Date('2026-09-12T17:29:59.000Z') }),
          line({ id: 'too-late', timestamp: new Date('2026-09-12T17:30:01.000Z') }),
        ],
      }),
      createId: () => 'close-new',
    });
    expect(plan.writeSafe).toBe(true);
    expect(plan.counts.dueCount).toBe(1);
    expect(plan.counts.plannedAvailableCount).toBe(1);
    expect(plan.rowsToInsert[0].selectedMarketLineId).toBe('eligible');
  });

  it('freezes due games as UNAVAILABLE when no eligible T-30 market exists', () => {
    const plan = planShadowClosingCapture({
      season: 2026,
      week: 2,
      mode: 'PREVIEW',
      confirmation: '',
      observedTimestamp: new Date('2026-09-12T17:35:00.000Z'),
      frame: frame({ marketLines: [line({ timestamp: new Date('2026-09-12T17:31:00.000Z') })] }),
      createId: () => 'close-new',
    });
    expect(plan.counts.plannedUnavailableCount).toBe(1);
    expect(plan.rowsToInsert[0].status).toBe('UNAVAILABLE');
    expect(plan.rowsToInsert[0].unavailableReason).toBe(SHADOW_CLOSING_MISSING_MARKET_REASON);
    expect(plan.rowsToInsert[0].selectedMarketLineId).toBeNull();
  });

  it('does not retrospectively create a missing closing row at or after kickoff', () => {
    const plan = planShadowClosingCapture({
      season: 2026,
      week: 2,
      mode: 'PREVIEW',
      confirmation: '',
      observedTimestamp: new Date('2026-09-12T18:00:00.000Z'),
      frame: frame(),
      createId: () => 'close-new',
    });
    expect(plan.writeSafe).toBe(true);
    expect(plan.counts.missedCount).toBe(1);
    expect(plan.counts.plannedInsertCount).toBe(0);
  });

  it('fails closed unless a COMPLETE prediction frame covers the entire week game frame', () => {
    const plan = planShadowClosingCapture({
      season: 2026,
      week: 2,
      mode: 'PREVIEW',
      confirmation: '',
      observedTimestamp: new Date('2026-09-12T17:35:00.000Z'),
      frame: frame({ predictionFrames: [[]] }),
    });
    expect(plan.writeSafe).toBe(false);
    expect(plan.writeBlockers).toContain('prediction_evidence_frame_mismatch');
  });

  it('treats a valid existing immutable closing as an idempotent row', () => {
    const plan = planShadowClosingCapture({
      season: 2026,
      week: 2,
      mode: 'PREVIEW',
      confirmation: '',
      observedTimestamp: new Date('2026-09-12T17:40:00.000Z'),
      frame: frame({ existingClosings: [existingAvailable()] }),
    });
    expect(plan.writeSafe).toBe(true);
    expect(plan.counts.existingCount).toBe(1);
    expect(plan.counts.plannedInsertCount).toBe(0);
  });

  it('fails closed on an existing closing that used a post-T-30 market row', () => {
    const badMarket = line({ id: 'line-post', timestamp: new Date('2026-09-12T17:31:00.000Z') });
    const plan = planShadowClosingCapture({
      season: 2026,
      week: 2,
      mode: 'PREVIEW',
      confirmation: '',
      observedTimestamp: new Date('2026-09-12T17:40:00.000Z'),
      frame: frame({
        marketLines: [badMarket],
        existingClosings: [existingAvailable({
          selectedMarketLineId: 'line-post',
          marketObservationTimestamp: new Date('2026-09-12T17:31:00.000Z'),
        })],
      }),
    });
    expect(plan.writeSafe).toBe(false);
    expect(plan.writeBlockers).toContain('existing_closing_falls_forward_after_t30');
  });

  it('COMMIT uses a fresh transaction timestamp, persists once, and retries as an idempotent no-op', async () => {
    let now = new Date('2026-09-12T17:25:00.000Z');
    const state: { closings: ExistingShadowClosingRow[] } = { closings: [] };
    let idCounter = 0;

    const currentFrame = (): OperationalShadowClosingFrame => frame({
      existingClosings: [...state.closings],
    });

    const adapter: ShadowClosingAdapter = {
      now: () => new Date(now),
      createId: () => `close-${++idCounter}`,
      loadFrame: async () => currentFrame(),
      runTransaction: async (fn) =>
        fn({
          now: () => new Date(now),
          loadFrame: async () => currentFrame(),
          createClosingSnapshots: async (rows: PlannedShadowClosingMarketSnapshot[]) => {
            for (const row of rows) {
              state.closings.push({
                ...row,
                marketType: row.marketType,
              });
            }
            return rows.length;
          },
        }),
      readClosings: async (ids) => state.closings.filter((row) => ids.includes(row.id)),
      countEvaluationResultsForClosingIds: async () => 0,
    };

    const preview = await executeShadowClosingCapture({
      season: 2026,
      week: 2,
      mode: 'PREVIEW',
      confirmation: '',
      adapter,
    });
    expect(preview.plan.counts.futureCount).toBe(1);
    expect(state.closings).toHaveLength(0);

    now = new Date('2026-09-12T17:35:00.000Z');
    const commit = await executeShadowClosingCapture({
      season: 2026,
      week: 2,
      mode: 'COMMIT',
      confirmation: expectedClosingWriteConfirmation(2),
      adapter,
    });
    expect(commit.execution.commitSucceeded).toBe(true);
    expect(commit.execution.persistenceCommitted).toBe(true);
    expect(commit.execution.insertedSnapshotCount).toBe(1);
    expect(state.closings).toHaveLength(1);
    expect(new Date(state.closings[0].capturedAt).toISOString()).toBe('2026-09-12T17:35:00.000Z');

    now = new Date('2026-09-12T17:40:00.000Z');
    const retry = await executeShadowClosingCapture({
      season: 2026,
      week: 2,
      mode: 'COMMIT',
      confirmation: expectedClosingWriteConfirmation(2),
      adapter,
    });
    expect(retry.execution.commitSucceeded).toBe(true);
    expect(retry.execution.transactionalIdempotentNoOp).toBe(true);
    expect(retry.execution.insertedSnapshotCount).toBe(0);
    expect(state.closings).toHaveLength(1);
  });
});
