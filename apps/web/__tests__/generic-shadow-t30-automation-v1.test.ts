/**
 * Generic Shadow T-30 Automation V1 — Stage A pure planner tests.
 * Synthetic in-memory fixtures only. No Prisma, DB, network, secrets, or clock.
 */

import {
  GENERIC_SHADOW_T30_AUTOMATION_MARKET_WINDOW_CLOSE_MINUTES,
  GENERIC_SHADOW_T30_AUTOMATION_MARKET_WINDOW_OPEN_MINUTES,
  GENERIC_SHADOW_T30_AUTOMATION_PROVIDER_ENABLED,
  GENERIC_SHADOW_T30_AUTOMATION_SCHEDULER_CADENCE_MINUTES,
  GENERIC_SHADOW_T30_AUTOMATION_VERSION,
  GENERIC_SHADOW_T30_AUTOMATION_WRITES_ENABLED,
  planGenericShadowT30Automation,
} from '@/lib/generic-shadow-t30-automation-v1';
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
const TARGET = new Date('2026-09-19T19:30:00.000Z');
const WINDOW_OPEN = new Date('2026-09-19T19:15:00.000Z');
const WINDOW_CLOSE = new Date('2026-09-19T19:25:00.000Z');
const PRED_TS = new Date('2026-09-17T15:00:00.000Z');

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

function plan(observedTimestamp: Date, frames = [frame()]) {
  return planGenericShadowT30Automation({
    season: 2026,
    week: 3,
    observedTimestamp,
    frames,
  });
}

describe('Generic Shadow T-30 Automation V1 — frozen Stage A posture', () => {
  it('exports the frozen orchestration constants with provider and writes disabled', () => {
    expect(GENERIC_SHADOW_T30_AUTOMATION_VERSION).toBe(1);
    expect(GENERIC_SHADOW_T30_AUTOMATION_SCHEDULER_CADENCE_MINUTES).toBe(5);
    expect(GENERIC_SHADOW_T30_AUTOMATION_MARKET_WINDOW_OPEN_MINUTES).toBe(45);
    expect(GENERIC_SHADOW_T30_AUTOMATION_MARKET_WINDOW_CLOSE_MINUTES).toBe(35);
    expect(GENERIC_SHADOW_T30_AUTOMATION_PROVIDER_ENABLED).toBe(false);
    expect(GENERIC_SHADOW_T30_AUTOMATION_WRITES_ENABLED).toBe(false);
  });

  it('does nothing before the T-45 market window', () => {
    const result = plan(new Date('2026-09-19T19:10:00.000Z'));
    expect(result.outcome).toBe('NO_ACTION');
    expect(result.counts.futureCount).toBe(1);
    expect(result.marketRefreshWindowOpenCount).toBe(0);
    expect(result.marketRefreshNeeded).toBe(false);
    expect(result.providerCallsAttempted).toBe(0);
    expect(result.mutationTargetsInvoked).toEqual([]);
  });

  it('requests a board refresh in PREVIEW when a target is in T-45..T-35 with no fresh pair', () => {
    const result = plan(new Date('2026-09-19T19:20:00.000Z'));
    expect(result.outcome).toBe('PREVIEW_ONLY');
    expect(result.marketRefreshWindowOpenCount).toBe(1);
    expect(result.marketRefreshNeeded).toBe(true);
    expect(result.marketRefreshNeededGameIds).toEqual([GAME_ID]);
    expect(result.marketRefreshGames[0].marketRefreshWindowOpensAt).toEqual(WINDOW_OPEN);
    expect(result.marketRefreshGames[0].marketRefreshWindowClosesAt).toEqual(WINDOW_CLOSE);
    expect(result.marketRefreshGames[0].targetTimestamp).toEqual(TARGET);
    expect(result.marketRefreshGames[0].freshEvidenceStatus).toBe('missing_fresh_market');
    expect(result.providerEnabled).toBe(false);
    expect(result.writesEnabled).toBe(false);
  });

  it('recognizes a coherent persisted pair inside the market refresh window', () => {
    const observed = new Date('2026-09-19T19:20:00.000Z');
    const fresh = pair(new Date('2026-09-19T19:18:00.000Z'));
    const result = plan(observed, [frame('run-a', fresh)]);
    expect(result.outcome).toBe('MARKET_REFRESH_NOT_NEEDED');
    expect(result.marketRefreshNeeded).toBe(false);
    expect(result.marketRefreshGames[0].freshEvidenceStatus).toBe(
      'fresh_coherent_pair_present'
    );
    expect(result.marketRefreshGames[0].freshMarketObservationTimestamp?.toISOString()).toBe(
      '2026-09-19T19:18:00.000Z'
    );
  });

  it('does not treat a pre-T45 pair as sufficiently recent for the automation window', () => {
    const observed = new Date('2026-09-19T19:20:00.000Z');
    const old = pair(new Date('2026-09-19T19:14:59.000Z'));
    const result = plan(observed, [frame('run-a', old)]);
    expect(result.marketRefreshNeeded).toBe(true);
    expect(result.marketRefreshGames[0].freshEvidenceStatus).toBe('missing_fresh_market');
  });

  it('never treats a market observation after the observed coordinator time as current evidence', () => {
    const observed = new Date('2026-09-19T19:20:00.000Z');
    const future = pair(new Date('2026-09-19T19:21:00.000Z'));
    const result = plan(observed, [frame('run-a', future)]);
    expect(result.marketRefreshNeeded).toBe(true);
    expect(result.marketRefreshGames[0].freshEvidenceStatus).toBe('missing_fresh_market');
  });

  it('surfaces DUE closing work after T-30 without opening a provider window', () => {
    const closingEvidence = pair(new Date('2026-09-19T19:29:00.000Z'));
    const result = plan(new Date('2026-09-19T19:31:00.000Z'), [
      frame('run-a', closingEvidence),
    ]);
    expect(result.outcome).toBe('PREVIEW_ONLY');
    expect(result.counts.dueCount).toBe(1);
    expect(result.closingRowsPlanned).toBe(1);
    expect(result.closingAvailablePlanned).toBe(1);
    expect(result.marketRefreshWindowOpenCount).toBe(0);
    expect(result.providerCallsAttempted).toBe(0);
  });

  it('reports MISSED after kickoff and never plans a backfill row', () => {
    const result = plan(new Date('2026-09-19T20:01:00.000Z'), [
      frame('run-a', pair(new Date('2026-09-19T19:29:00.000Z'))),
    ]);
    expect(result.outcome).toBe('MISSED_TARGET_PRESENT');
    expect(result.counts.missedCount).toBe(1);
    expect(result.closingRowsPlanned).toBe(0);
    expect(result.marketRefreshWindowOpenCount).toBe(0);
  });

  it('deduplicates the physical game across multiple eligible capture runs', () => {
    const observed = new Date('2026-09-19T19:20:00.000Z');
    const result = plan(observed, [
      frame('run-b', [], 'core_v1_shadow_baseline_v1'),
      frame('run-a', [], 'candidate_b_roster_prior_v1'),
    ]);
    expect(result.counts.totalPredictions).toBe(2);
    expect(result.marketRefreshWindowOpenCount).toBe(1);
    expect(result.marketRefreshGames).toHaveLength(1);
    expect(result.marketRefreshGames[0].captureRunIds).toEqual(['run-a', 'run-b']);
    expect(result.eligibleCaptureRunIds).toEqual(['run-a', 'run-b']);
    expect(result.marketRefreshNeeded).toBe(true);
  });

  it('fails closed on an unsupported Generic model frame', () => {
    const result = plan(new Date('2026-09-19T19:20:00.000Z'), [
      frame('run-x', [], 'not_authorized_model'),
    ]);
    expect(result.outcome).toBe('BLOCKED');
    expect(result.writeSafe).toBe(false);
    expect(result.blockers).toContain('capture_run_model_not_supported:run-x');
    expect(result.blockers.some((value) => value.includes('capture_run_model_not_supported'))).toBe(
      true
    );
  });
});
