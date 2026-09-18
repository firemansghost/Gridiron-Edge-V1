/**
 * Generic Shadow T-30 Automation V1 — closing-commit decision tests.
 * Synthetic in-memory fixtures only. No Prisma, DB, network, secrets, or clock.
 */

import { planGenericShadowT30Automation } from '@/lib/generic-shadow-t30-automation-v1';
import {
  decideGenericShadowT30ClosingCommit,
  determineGenericShadowT30ClosingCommitCycleOutcome,
  dueCaptureRunIdsFromPlan,
  expectedGenericShadowT30ClosingChildConfirmation,
  expectedGenericShadowT30ClosingCommitConfirmation,
  mutationTargetsInvokedForClosingPersistence,
} from '@/lib/generic-shadow-t30-automation-v1-closing-commit';
import {
  GENERIC_SHADOW_T30_AUTHORIZED_SOURCE,
  GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH,
  GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID,
  GENERIC_SHADOW_T30_EVALUATION_PROTOCOL,
  type GenericShadowT30CaptureRun,
  type GenericShadowT30CurrentGame,
  type GenericShadowT30ExistingClosing,
  type GenericShadowT30OperationalFrame,
  type GenericShadowT30Prediction,
} from '@/lib/shadow-model-t30-closing-v1';
import type { ShadowModelMarketLineRow } from '@/lib/shadow-model-capture-v1';

const GAME_ID = 'game-1';
const HOME = 'home';
const AWAY = 'away';
const KICKOFF = new Date('2026-09-19T20:00:00.000Z');
const TARGET = new Date('2026-09-19T19:30:00.000Z');
const PRED_TS = new Date('2026-09-17T15:00:00.000Z');
const MARKET_TS = new Date('2026-09-19T19:18:00.000Z');
const BEFORE_TARGET = new Date('2026-09-19T19:10:00.000Z');
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
  return { id: GAME_ID, homeTeamId: HOME, awayTeamId: AWAY, kickoffTimestamp: KICKOFF };
}

function pair(timestamp: Date = MARKET_TS): ShadowModelMarketLineRow[] {
  const prefix = timestamp.toISOString();
  return [
    {
      id: `${prefix}-home`,
      gameId: GAME_ID,
      lineType: 'spread',
      lineValue: -3.5,
      teamId: HOME,
      bookName: 'book-a',
      source: GENERIC_SHADOW_T30_AUTHORIZED_SOURCE,
      timestamp,
    },
    {
      id: `${prefix}-away`,
      gameId: GAME_ID,
      lineType: 'spread',
      lineValue: 3.5,
      teamId: AWAY,
      bookName: 'book-a',
      source: GENERIC_SHADOW_T30_AUTHORIZED_SOURCE,
      timestamp,
    },
  ];
}

function existingClosing(runId: string): GenericShadowT30ExistingClosing {
  const lines = pair();
  return {
    id: `${runId}-close`,
    predictionId: `${runId}-pred`,
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
  };
}

function frame(
  runId = 'run-a',
  extra: Partial<GenericShadowT30OperationalFrame> = {},
  modelDefinitionId = 'candidate_b_roster_prior_v1'
): GenericShadowT30OperationalFrame {
  return {
    captureRun: run(runId, modelDefinitionId),
    predictions: [prediction(runId)],
    games: [game()],
    marketLines: pair(),
    existingClosings: [],
    ...extra,
  };
}

function plannedAt(
  observedTimestamp: Date,
  frames: GenericShadowT30OperationalFrame[]
) {
  const planned = planGenericShadowT30Automation({
    season: 2026,
    week: 3,
    observedTimestamp,
    frames,
  });
  return { planned, decision: decideGenericShadowT30ClosingCommit(planned) };
}

describe('Generic Shadow T-30 Automation V1 — closing-commit decision', () => {
  it('uses the Stage D outer confirmation and existing per-run child confirmation', () => {
    expect(expectedGenericShadowT30ClosingCommitConfirmation(3)).toBe(
      'CAPTURE_2026_WEEK_3_GENERIC_SHADOW_T30_AUTOMATED_CLOSINGS'
    );
    expect(expectedGenericShadowT30ClosingChildConfirmation(3, 'run-a')).toBe(
      'CAPTURE_2026_WEEK_3_SHADOW_MODEL_T30_run-a'
    );
  });

  it('does not request a closing COMMIT before target / FUTURE only', () => {
    const { planned, decision } = plannedAt(BEFORE_TARGET, [frame()]);
    expect(planned.counts.futureCount).toBe(1);
    expect(planned.counts.dueCount).toBe(0);
    expect(decision.closingCommitRequested).toBe(false);
    expect(decision.dueCaptureRunIds).toEqual([]);
  });

  it('reports DUE work for PLAN without requesting a writer', () => {
    const { planned, decision } = plannedAt(DUE_AT, [frame()]);
    expect(planned.counts.dueCount).toBe(1);
    expect(decision.action).toBe('REQUEST_DUE_CLOSING_COMMITS');
    expect(decision.dueCaptureRunIds).toEqual(['run-a']);
    expect(planned.mutationTargetsInvoked).toEqual([]);
  });

  it('keeps two DUE capture runs for the same physical game in captureRunId order', () => {
    const { planned, decision } = plannedAt(DUE_AT, [
      frame('run-b', {}, 'core_v1_shadow_baseline_v1'),
      frame('run-a', {}, 'candidate_b_roster_prior_v1'),
    ]);
    expect(decision.dueCaptureRunIds).toEqual(['run-a', 'run-b']);
    expect(dueCaptureRunIdsFromPlan(planned)).toEqual(['run-a', 'run-b']);
    expect(decision.dueCaptureRunIds).toHaveLength(2);
  });

  it('does not request a closing COMMIT for EXISTING-only runs', () => {
    const { planned, decision } = plannedAt(DUE_AT, [
      frame('run-a', { existingClosings: [existingClosing('run-a')], marketLines: pair() }),
    ]);
    expect(planned.counts.existingCount).toBe(1);
    expect(planned.counts.dueCount).toBe(0);
    expect(decision.closingCommitRequested).toBe(false);
  });

  it('does not request a closing COMMIT for MISSED-only runs', () => {
    const { planned, decision } = plannedAt(AFTER_KICKOFF, [frame()]);
    expect(planned.counts.missedCount).toBe(1);
    expect(planned.counts.dueCount).toBe(0);
    expect(decision.closingCommitRequested).toBe(false);
  });

  it('does not request a closing COMMIT when the coordinator is blocked', () => {
    const { planned, decision } = plannedAt(DUE_AT, [
      frame('run-x', {}, 'not_authorized_model'),
    ]);
    expect(planned.outcome).toBe('BLOCKED');
    expect(decision.failClosed).toBe(true);
    expect(decision.closingCommitRequested).toBe(false);
  });

  it('encodes mutation targets without a false zero-mutation UNKNOWN', () => {
    expect(mutationTargetsInvokedForClosingPersistence([{ persistenceStatus: 'NOT_ATTEMPTED' }])).toEqual(
      []
    );
    expect(mutationTargetsInvokedForClosingPersistence([{ persistenceStatus: 'NOT_PERSISTED' }])).toEqual(
      []
    );
    expect(mutationTargetsInvokedForClosingPersistence([{ persistenceStatus: 'PERSISTED' }])).toEqual([
      'ShadowModelClosingMarketSnapshot',
    ]);
    expect(mutationTargetsInvokedForClosingPersistence([{ persistenceStatus: 'UNKNOWN' }])).toBeNull();
    expect(
      mutationTargetsInvokedForClosingPersistence([
        { persistenceStatus: 'PERSISTED' },
        { persistenceStatus: 'UNKNOWN' },
      ])
    ).toEqual(['ShadowModelClosingMarketSnapshot']);
    expect(
      mutationTargetsInvokedForClosingPersistence([
        { persistenceStatus: 'NOT_PERSISTED' },
        { persistenceStatus: 'UNKNOWN' },
      ])
    ).toBeNull();
  });

  it('classifies PLAN DUE as PREVIEW_ONLY and COMMIT persist as CLOSINGS_CAPTURED', () => {
    expect(
      determineGenericShadowT30ClosingCommitCycleOutcome({
        mode: 'PLAN',
        blockers: [],
        initialCounts: {
          totalPredictions: 1,
          existingCount: 0,
          futureCount: 0,
          dueCount: 1,
          missedCount: 0,
          plannedAvailableCount: 1,
          plannedUnavailableCount: 0,
          plannedInsertCount: 1,
        },
        closingCommitRequested: false,
        runResults: [],
      })
    ).toBe('PREVIEW_ONLY');
    expect(
      determineGenericShadowT30ClosingCommitCycleOutcome({
        mode: 'COMMIT',
        blockers: [],
        initialCounts: {
          totalPredictions: 1,
          existingCount: 0,
          futureCount: 0,
          dueCount: 1,
          missedCount: 0,
          plannedAvailableCount: 1,
          plannedUnavailableCount: 0,
          plannedInsertCount: 1,
        },
        closingCommitRequested: true,
        runResults: [
          {
            captureRunId: 'run-a',
            modelDefinitionId: 'candidate_b_roster_prior_v1',
            invocationAttempted: true,
            childConfirmationGenerated: true,
            childReportPath: 'reports/child.json',
            observedTimestamp: DUE_AT,
            existingCount: 0,
            futureCount: 0,
            dueCount: 0,
            missedCount: 0,
            plannedInsertCount: 1,
            plannedAvailableCount: 1,
            plannedUnavailableCount: 0,
            transactionStarted: true,
            transactionalNoOp: false,
            persistenceStatus: 'PERSISTED',
            persistenceCommitted: true,
            insertedClosingCount: 1,
            insertedClosingIds: ['close-1'],
            verificationOk: true,
            verificationReasons: [],
            rolledBack: false,
            providerCalls: 0,
            blockers: [],
            error: null,
            skippedAfterPriorChildFailure: false,
          },
        ],
      })
    ).toBe('CLOSINGS_CAPTURED');
  });
});
