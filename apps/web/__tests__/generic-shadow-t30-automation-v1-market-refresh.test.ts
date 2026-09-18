/**
 * Generic Shadow T-30 Automation V1 — market-refresh decision tests.
 * Synthetic in-memory fixtures only. No Prisma, DB, network, secrets, or clock.
 */

import { planGenericShadowT30Automation } from '@/lib/generic-shadow-t30-automation-v1';
import {
  decideGenericShadowT30MarketRefresh,
  determineGenericShadowT30MarketRefreshCycleOutcome,
  expectedGenericShadowT30MarketRefreshConfirmation,
} from '@/lib/generic-shadow-t30-automation-v1-market-refresh';
import type {
  GenericShadowT30CaptureRun,
  GenericShadowT30CurrentGame,
  GenericShadowT30OperationalFrame,
  GenericShadowT30Prediction,
} from '@/lib/shadow-model-t30-closing-v1';
import type { ShadowModelMarketLineRow } from '@/lib/shadow-model-capture-v1';

const GAME_ID = 'game-1';
const HOME = 'home';
const AWAY = 'away';
const KICKOFF = new Date('2026-09-19T20:00:00.000Z');
const PRED_TS = new Date('2026-09-17T15:00:00.000Z');
const IN_WINDOW = new Date('2026-09-19T19:20:00.000Z');
const BEFORE_WINDOW = new Date('2026-09-19T19:10:00.000Z');
const AFTER_WINDOW = new Date('2026-09-19T19:26:00.000Z');
const DUE_AT = new Date('2026-09-19T19:31:00.000Z');
const AFTER_KICKOFF = new Date('2026-09-19T20:01:00.000Z');

function run(
  id: string,
  modelDefinitionId = 'candidate_b_roster_prior_v1'
): GenericShadowT30CaptureRun {
  return {
    id,
    season: 2026,
    week: 3,
    captureContext: `${id}-context`,
    evaluationProtocol: 'CORE_EVAL_V1',
    modelDefinitionId,
    modelDefinitionHash: `${id}-model-hash`,
    featureDefinitionHash: `${id}-feature-hash`,
    policyDefinitionHash: `${id}-policy-hash`,
    expectedGameIds: [GAME_ID],
    totalGames: 1,
    availableCount: 1,
    unavailableCount: 0,
    selectionCount: 1,
    noSelectionCount: 0,
    status: 'COMPLETE',
    failureReason: null,
  };
}

function prediction(runId: string): GenericShadowT30Prediction {
  return {
    id: `${runId}-pred`,
    captureRunId: runId,
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
  };
}

function game(): GenericShadowT30CurrentGame {
  return {
    id: GAME_ID,
    homeTeamId: HOME,
    awayTeamId: AWAY,
    kickoffTimestamp: KICKOFF,
  };
}

function pair(timestamp: Date): ShadowModelMarketLineRow[] {
  const prefix = timestamp.toISOString();
  return [
    {
      id: `${prefix}-home`,
      gameId: GAME_ID,
      lineType: 'spread',
      lineValue: -3.5,
      teamId: HOME,
      bookName: 'book-a',
      source: 'oddsapi',
      timestamp,
    },
    {
      id: `${prefix}-away`,
      gameId: GAME_ID,
      lineType: 'spread',
      lineValue: 3.5,
      teamId: AWAY,
      bookName: 'book-a',
      source: 'oddsapi',
      timestamp,
    },
  ];
}

function incoherent(timestamp: Date): ShadowModelMarketLineRow[] {
  return [
    {
      id: `${timestamp.toISOString()}-home-only`,
      gameId: GAME_ID,
      lineType: 'spread',
      lineValue: -3.5,
      teamId: HOME,
      bookName: 'book-a',
      source: 'oddsapi',
      timestamp,
    },
  ];
}

function frame(
  runId = 'run-a',
  marketLines: ShadowModelMarketLineRow[] = [],
  modelDefinitionId = 'candidate_b_roster_prior_v1'
): GenericShadowT30OperationalFrame {
  return {
    captureRun: run(runId, modelDefinitionId),
    predictions: [prediction(runId)],
    games: [game()],
    marketLines,
    existingClosings: [],
  };
}

function decideAt(observedTimestamp: Date, frames = [frame()]) {
  const planned = planGenericShadowT30Automation({
    season: 2026,
    week: 3,
    observedTimestamp,
    frames,
  });
  return { planned, decision: decideGenericShadowT30MarketRefresh(planned) };
}

describe('Generic Shadow T-30 Automation V1 — market refresh decision', () => {
  it('uses the frozen proof-era COMMIT confirmation', () => {
    expect(expectedGenericShadowT30MarketRefreshConfirmation(3)).toBe(
      'REFRESH_2026_WEEK_3_GENERIC_SHADOW_T30_MARKET'
    );
  });

  it('does not request a provider call before T-45', () => {
    const { planned, decision } = decideAt(BEFORE_WINDOW);
    expect(planned.counts.futureCount).toBe(1);
    expect(planned.marketRefreshWindowOpenCount).toBe(0);
    expect(decision.providerCallRequested).toBe(false);
    expect(decision.action).toBe('NO_PROVIDER_CALL');
  });

  it('does not request a provider call in T-45..T-35 when a fresh coherent pair exists', () => {
    const { planned, decision } = decideAt(IN_WINDOW, [
      frame('run-a', pair(new Date('2026-09-19T19:18:00.000Z'))),
    ]);
    expect(planned.marketRefreshNeeded).toBe(false);
    expect(planned.marketRefreshGames[0].freshEvidenceStatus).toBe(
      'fresh_coherent_pair_present'
    );
    expect(decision.providerCallRequested).toBe(false);
  });

  it('requests exactly one board refresh in T-45..T-35 when the fresh pair is missing', () => {
    const { planned, decision } = decideAt(IN_WINDOW);
    expect(planned.marketRefreshNeeded).toBe(true);
    expect(planned.marketRefreshNeededGameIds).toEqual([GAME_ID]);
    expect(decision.action).toBe('REQUEST_ONE_BOARD_REFRESH');
    expect(decision.providerCallRequested).toBe(true);
    expect(decision.marketRefreshNeededGameIds).toEqual([GAME_ID]);
  });

  it('requests exactly one board refresh in T-45..T-35 when fresh evidence is incoherent', () => {
    const { planned, decision } = decideAt(IN_WINDOW, [
      frame('run-a', incoherent(new Date('2026-09-19T19:18:00.000Z'))),
    ]);
    expect(planned.marketRefreshGames[0].freshEvidenceStatus).toBe(
      'incoherent_fresh_market'
    );
    expect(decision.providerCallRequested).toBe(true);
    expect(decision.action).toBe('REQUEST_ONE_BOARD_REFRESH');
  });

  it('does not request a provider refresh after T-35', () => {
    const { planned, decision } = decideAt(AFTER_WINDOW);
    expect(planned.marketRefreshWindowOpenCount).toBe(0);
    expect(planned.counts.futureCount).toBe(1);
    expect(decision.providerCallRequested).toBe(false);
  });

  it('does not request a provider refresh when a closing is DUE at/after T-30', () => {
    const { planned, decision } = decideAt(DUE_AT, [
      frame('run-a', pair(new Date('2026-09-19T19:29:00.000Z'))),
    ]);
    expect(planned.counts.dueCount).toBe(1);
    expect(planned.marketRefreshWindowOpenCount).toBe(0);
    expect(decision.providerCallRequested).toBe(false);
  });

  it('does not request a provider refresh or backfill after kickoff MISSED', () => {
    const { planned, decision } = decideAt(AFTER_KICKOFF, [
      frame('run-a', pair(new Date('2026-09-19T19:29:00.000Z'))),
    ]);
    expect(planned.counts.missedCount).toBe(1);
    expect(planned.closingRowsPlanned).toBe(0);
    expect(decision.providerCallRequested).toBe(false);
  });

  it('deduplicates multiple capture runs for the same physical game into one board refresh', () => {
    const { planned, decision } = decideAt(IN_WINDOW, [
      frame('run-b', [], 'core_v1_shadow_baseline_v1'),
      frame('run-a', [], 'candidate_b_roster_prior_v1'),
    ]);
    expect(planned.marketRefreshWindowOpenCount).toBe(1);
    expect(planned.marketRefreshGames).toHaveLength(1);
    expect(decision.providerCallRequested).toBe(true);
    expect(decision.marketRefreshNeededGameIds).toEqual([GAME_ID]);
  });

  it('does not request a provider call when the coordinator is blocked', () => {
    const { planned, decision } = decideAt(IN_WINDOW, [
      frame('run-x', [], 'not_authorized_model'),
    ]);
    expect(planned.outcome).toBe('BLOCKED');
    expect(decision.providerCallRequested).toBe(false);
    expect(decision.failClosed).toBe(true);
  });

  it('classifies a verified MarketLine persist as MARKET_REFRESHED', () => {
    expect(
      determineGenericShadowT30MarketRefreshCycleOutcome({
        initialOutcome: 'PREVIEW_ONLY',
        finalOutcome: 'MARKET_REFRESH_NOT_NEEDED',
        blockers: [],
        providerCallAttempted: true,
        providerCallSucceeded: true,
        persistenceStatus: 'PERSISTED',
        verificationOk: true,
      })
    ).toBe('MARKET_REFRESHED');
  });

  it('classifies a Live Odds persist with failed postwrite verification as FAILED', () => {
    expect(
      determineGenericShadowT30MarketRefreshCycleOutcome({
        initialOutcome: 'PREVIEW_ONLY',
        finalOutcome: null,
        blockers: [],
        providerCallAttempted: true,
        providerCallSucceeded: true,
        persistenceStatus: 'PERSISTED',
        verificationOk: false,
      })
    ).toBe('FAILED');
  });

  it('uses the later pre-refresh plan when the window closed before a provider call', () => {
    expect(
      determineGenericShadowT30MarketRefreshCycleOutcome({
        initialOutcome: 'PREVIEW_ONLY',
        finalOutcome: 'NO_ACTION',
        blockers: [],
        providerCallAttempted: false,
        providerCallSucceeded: false,
        persistenceStatus: 'NOT_ATTEMPTED',
        verificationOk: null,
      })
    ).toBe('NO_ACTION');
  });

  it('fails closed when persistence state is UNKNOWN', () => {
    expect(
      determineGenericShadowT30MarketRefreshCycleOutcome({
        initialOutcome: 'PREVIEW_ONLY',
        finalOutcome: null,
        blockers: ['persistence_state_unknown'],
        providerCallAttempted: true,
        providerCallSucceeded: false,
        persistenceStatus: 'UNKNOWN',
        verificationOk: null,
      })
    ).toBe('FAILED');
  });
});
