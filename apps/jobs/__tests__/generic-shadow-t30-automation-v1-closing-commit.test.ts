/**
 * Generic Shadow T-30 Automation V1 — closing-commit cycle tests.
 * Injected discover/now/closing-COMMIT fakes only. No real DB, provider, or writes.
 */

import { expectedGenericShadowT30WriteConfirmation } from '../../web/lib/shadow-model-t30-closing-v1';
import {
  expectedGenericShadowT30ClosingCommitConfirmation,
  type GenericShadowT30ClosingChildSummary,
} from '../../web/lib/generic-shadow-t30-automation-v1-closing-commit';
import type {
  GenericShadowT30CaptureRun,
  GenericShadowT30CurrentGame,
  GenericShadowT30ExistingClosing,
  GenericShadowT30OperationalFrame,
  GenericShadowT30Prediction,
} from '../../web/lib/shadow-model-t30-closing-v1';
import {
  GENERIC_SHADOW_T30_AUTHORIZED_SOURCE,
  GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH,
  GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID,
  GENERIC_SHADOW_T30_EVALUATION_PROTOCOL,
} from '../../web/lib/shadow-model-t30-closing-v1';
import type { ShadowModelMarketLineRow } from '../../web/lib/shadow-model-capture-v1';
import { runGenericShadowT30ClosingCommitCycle } from '../src/generic-shadow-t30-automation-v1-closing-commit-adapter';
import type { GenericShadowT30AutomationDiscovery } from '../src/generic-shadow-t30-automation-v1-adapter';
import type { GenericShadowT30ClosingCommitRequest } from '../src/generic-shadow-t30-automation-v1-closing-commit-adapter';

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
const CONFIRM = expectedGenericShadowT30ClosingCommitConfirmation(3);

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
  const prefix = `${timestamp.toISOString()}`;
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

function discovery(frames: GenericShadowT30OperationalFrame[]): GenericShadowT30AutomationDiscovery {
  return {
    frames,
    discoveredSupportedRunIds: frames.map((item) => item.captureRun.id),
    eligibleCaptureRunIds: frames.map((item) => item.captureRun.id),
    skippedIncompleteRunIds: [],
    blockers: [],
    providerCalls: 0,
    mutationsInvoked: false,
  };
}

function nowQueue(dates: Date[]) {
  let index = 0;
  return () => {
    const current = dates[Math.min(index, dates.length - 1)];
    index += 1;
    return new Date(current.getTime());
  };
}

function persistedChild(
  captureRunId: string,
  extra: Partial<GenericShadowT30ClosingChildSummary> = {}
): GenericShadowT30ClosingChildSummary {
  return {
    captureRunId,
    modelDefinitionId: extra.modelDefinitionId ?? 'candidate_b_roster_prior_v1',
    observedTimestamp: extra.observedTimestamp ?? DUE_AT,
    existingCount: 0,
    futureCount: 0,
    dueCount: 0,
    missedCount: 0,
    plannedInsertCount: 1,
    plannedAvailableCount: extra.plannedAvailableCount ?? 1,
    plannedUnavailableCount: extra.plannedUnavailableCount ?? 0,
    writeSafe: true,
    transactionStarted: true,
    transactionalNoOp: false,
    persistenceStatus: 'PERSISTED',
    persistenceCommitted: true,
    mutationsInvoked: true,
    insertedClosingCount: extra.insertedClosingCount ?? 1,
    insertedClosingIds: extra.insertedClosingIds ?? [`${captureRunId}-close`],
    verificationOk: true,
    verificationReasons: [],
    rolledBack: false,
    commitSucceeded: true,
    providerCalls: 0,
    blockers: [],
    error: null,
    ...extra,
  };
}

function missedChild(captureRunId: string): GenericShadowT30ClosingChildSummary {
  return {
    captureRunId,
    modelDefinitionId: 'candidate_b_roster_prior_v1',
    observedTimestamp: AFTER_KICKOFF,
    existingCount: 0,
    futureCount: 0,
    dueCount: 0,
    missedCount: 1,
    plannedInsertCount: 0,
    plannedAvailableCount: 0,
    plannedUnavailableCount: 0,
    writeSafe: true,
    transactionStarted: true,
    transactionalNoOp: true,
    persistenceStatus: 'NOT_PERSISTED',
    persistenceCommitted: true,
    mutationsInvoked: false,
    insertedClosingCount: 0,
    insertedClosingIds: [],
    verificationOk: true,
    verificationReasons: [],
    rolledBack: false,
    commitSucceeded: true,
    providerCalls: 0,
    blockers: [],
    error: null,
  };
}

function existingChild(captureRunId: string): GenericShadowT30ClosingChildSummary {
  return {
    ...missedChild(captureRunId),
    observedTimestamp: DUE_AT,
    existingCount: 1,
    missedCount: 0,
    transactionalNoOp: true,
  };
}

async function runCycle(options: {
  mode?: 'PLAN' | 'COMMIT';
  confirmation?: string;
  timestamps?: Date[];
  framesByCall?: GenericShadowT30OperationalFrame[][];
  children?: Record<string, GenericShadowT30ClosingChildSummary | (() => Promise<GenericShadowT30ClosingChildSummary>)>;
}) {
  const framesByCall = options.framesByCall ?? [[frame()]];
  let discoverCalls = 0;
  const invoked: string[] = [];
  const confirmations: string[] = [];
  const report = await runGenericShadowT30ClosingCommitCycle({
    season: 2026,
    week: 3,
    mode: options.mode ?? 'COMMIT',
    confirmation: options.confirmation ?? CONFIRM,
    repoCommitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    githubRef: 'refs/heads/main',
    childReportDir: 'reports',
    now: nowQueue(options.timestamps ?? [DUE_AT, DUE_AT, DUE_AT]),
    discover: async () => {
      discoverCalls += 1;
      const frames = framesByCall[Math.min(discoverCalls - 1, framesByCall.length - 1)];
      return discovery(frames);
    },
    runClosingCommit: async (request: GenericShadowT30ClosingCommitRequest) => {
      invoked.push(request.captureRunId);
      confirmations.push(request.confirmation);
      const supplied = options.children?.[request.captureRunId];
      if (typeof supplied === 'function') return supplied();
      if (supplied) return supplied;
      return persistedChild(request.captureRunId);
    },
  });
  return { report, discoverCalls, invoked, confirmations };
}

describe('Generic Shadow T-30 Automation V1 — closing-commit cycle', () => {
  it('PLAN before target does not invoke the writer and reports zero mutations', async () => {
    const { report, invoked } = await runCycle({
      mode: 'PLAN',
      confirmation: '',
      timestamps: [BEFORE_TARGET],
      framesByCall: [[frame()]],
    });
    expect(report.outcome).toBe('NO_ACTION');
    expect(report.closingCommitRequested).toBe(false);
    expect(invoked).toEqual([]);
    expect(report.mutationTargetsInvoked).toEqual([]);
    expect(report.closingRowsInserted).toBe(0);
    expect(report.providerCalls).toBe(0);
    expect(report.scheduleEnabled).toBe(false);
  });

  it('PLAN with one DUE capture run reports work without invoking the writer', async () => {
    const { report, invoked } = await runCycle({
      mode: 'PLAN',
      confirmation: '',
      framesByCall: [[frame()]],
    });
    expect(report.outcome).toBe('PREVIEW_ONLY');
    expect(report.dueCaptureRunIds).toEqual(['run-a']);
    expect(report.closingCommitRequested).toBe(false);
    expect(invoked).toEqual([]);
    expect(report.mutationTargetsInvoked).toEqual([]);
    expect(report.reportKind).toBe('PLAN');
  });

  it('COMMIT with one DUE supported run invokes the child closing boundary exactly once', async () => {
    const { report, invoked, confirmations } = await runCycle({
      framesByCall: [[frame()], [frame('run-a', { existingClosings: [existingClosing('run-a')] })]],
    });
    expect(invoked).toEqual(['run-a']);
    expect(confirmations).toEqual([expectedGenericShadowT30WriteConfirmation(3, 'run-a')]);
    expect(report.outcome).toBe('CLOSINGS_CAPTURED');
    expect(report.mutationTargetsInvoked).toEqual(['ShadowModelClosingMarketSnapshot']);
    expect(report.closingRowsInserted).toBe(1);
    expect(report.providerCalls).toBe(0);
    expect(report.requestedMode).toBe('COMMIT');
    expect(report.reportKind).toBe('TERMINAL');
  });

  it('invokes two DUE capture runs for the same physical game in captureRunId order', async () => {
    const dual = [
      frame('run-b', {}, 'core_v1_shadow_baseline_v1'),
      frame('run-a', {}, 'candidate_b_roster_prior_v1'),
    ];
    const { report, invoked } = await runCycle({
      framesByCall: [dual, dual],
      children: {
        'run-a': persistedChild('run-a', { modelDefinitionId: 'candidate_b_roster_prior_v1' }),
        'run-b': persistedChild('run-b', { modelDefinitionId: 'core_v1_shadow_baseline_v1' }),
      },
    });
    expect(invoked).toEqual(['run-a', 'run-b']);
    expect(report.dueCaptureRunIds).toEqual(['run-a', 'run-b']);
    expect(report.closingRowsInserted).toBe(2);
    expect(report.mutationTargetsInvoked).toEqual(['ShadowModelClosingMarketSnapshot']);
  });

  it('does not invoke the writer for EXISTING-only runs', async () => {
    const { report, invoked } = await runCycle({
      framesByCall: [[frame('run-a', { existingClosings: [existingClosing('run-a')] })]],
    });
    expect(invoked).toEqual([]);
    expect(report.outcome).toBe('NO_ACTION');
    expect(report.mutationTargetsInvoked).toEqual([]);
    expect(report.closingRowsInserted).toBe(0);
    expect(report.reportKind).toBe('TERMINAL');
  });

  it('does not invoke the writer or backfill for MISSED-only runs', async () => {
    const { report, invoked } = await runCycle({
      timestamps: [AFTER_KICKOFF],
      framesByCall: [[frame()]],
    });
    expect(invoked).toEqual([]);
    expect(report.outcome).toBe('MISSED_TARGET_PRESENT');
    expect(report.closingRowsInserted).toBe(0);
    expect(report.missedCount).toBe(1);
  });

  it('keeps zero inserts when the child transaction now observes MISSED', async () => {
    const { report, invoked } = await runCycle({
      children: { 'run-a': missedChild('run-a') },
    });
    expect(invoked).toEqual(['run-a']);
    expect(report.runResults[0].missedCount).toBe(1);
    expect(report.runResults[0].insertedClosingCount).toBe(0);
    expect(report.runResults[0].persistenceStatus).toBe('NOT_PERSISTED');
    expect(report.outcome).toBe('MISSED_TARGET_PRESENT');
    expect(report.mutationTargetsInvoked).toEqual([]);
  });

  it('keeps EXISTING when another process inserted before the child transaction', async () => {
    const { report, invoked } = await runCycle({
      children: { 'run-a': existingChild('run-a') },
    });
    expect(invoked).toEqual(['run-a']);
    expect(report.runResults[0].existingCount).toBe(1);
    expect(report.runResults[0].insertedClosingCount).toBe(0);
    expect(report.runResults[0].transactionalNoOp).toBe(true);
    expect(report.mutationTargetsInvoked).toEqual([]);
  });

  it('retains a successful AVAILABLE persist and verification PASS', async () => {
    const { report } = await runCycle({});
    expect(report.runResults[0].persistenceStatus).toBe('PERSISTED');
    expect(report.runResults[0].insertedClosingCount).toBe(1);
    expect(report.runResults[0].verificationOk).toBe(true);
    expect(report.postwriteVerificationStatus).toBe('PASSED');
    expect(report.closingAvailableCount).toBe(1);
  });

  it('retains a legitimate UNAVAILABLE DUE persist without missing-to-zero', async () => {
    const { report } = await runCycle({
      framesByCall: [[frame('run-a', { marketLines: [] })]],
      children: {
        'run-a': persistedChild('run-a', {
          plannedAvailableCount: 0,
          plannedUnavailableCount: 1,
          plannedInsertCount: 1,
        }),
      },
    });
    expect(report.outcome).toBe('CLOSINGS_CAPTURED');
    expect(report.runResults[0].plannedUnavailableCount).toBe(1);
    expect(report.runResults[0].insertedClosingCount).toBe(1);
    expect(report.closingUnavailableCount).toBe(1);
    expect(report.mutationTargetsInvoked).toEqual(['ShadowModelClosingMarketSnapshot']);
  });

  it('fails closed on child count mismatch without claiming that child committed', async () => {
    const { report, invoked } = await runCycle({
      children: {
        'run-a': persistedChild('run-a', {
          persistenceStatus: 'NOT_PERSISTED',
          persistenceCommitted: false,
          mutationsInvoked: true,
          rolledBack: true,
          commitSucceeded: false,
          verificationOk: false,
          insertedClosingCount: 0,
          insertedClosingIds: [],
          verificationReasons: ['in_transaction_closing_count_mismatch'],
          error: 'in_transaction_closing_count_mismatch',
        }),
      },
    });
    expect(invoked).toEqual(['run-a']);
    expect(report.outcome).toBe('FAILED');
    expect(report.runResults[0].rolledBack).toBe(true);
    expect(report.runResults[0].insertedClosingCount).toBe(0);
    expect(report.mutationTargetsInvoked).toEqual([]);
    expect(report.writeSafe).toBe(false);
  });

  it('fails closed on child frozen-field/readback verification failure with rollback', async () => {
    const { report } = await runCycle({
      children: {
        'run-a': persistedChild('run-a', {
          persistenceStatus: 'NOT_PERSISTED',
          persistenceCommitted: false,
          mutationsInvoked: true,
          rolledBack: true,
          commitSucceeded: false,
          verificationOk: false,
          insertedClosingCount: 0,
          insertedClosingIds: [],
          verificationReasons: ['committed_closing_hash_mismatch'],
          error: 'in_transaction_verification_failed: committed_closing_hash_mismatch',
        }),
      },
    });
    expect(report.outcome).toBe('FAILED');
    expect(report.runResults[0].rolledBack).toBe(true);
    expect(report.postwriteVerificationStatus).toBe('FAILED');
  });

  it('retains the first child persist when the second child fails', async () => {
    const dual = [
      frame('run-a', {}, 'candidate_b_roster_prior_v1'),
      frame('run-b', {}, 'core_v1_shadow_baseline_v1'),
    ];
    const { report, invoked } = await runCycle({
      framesByCall: [dual],
      children: {
        'run-a': persistedChild('run-a', { insertedClosingCount: 2, insertedClosingIds: ['a1', 'a2'] }),
        'run-b': persistedChild('run-b', {
          persistenceStatus: 'NOT_PERSISTED',
          persistenceCommitted: false,
          mutationsInvoked: true,
          rolledBack: true,
          commitSucceeded: false,
          verificationOk: false,
          insertedClosingCount: 0,
          insertedClosingIds: [],
          error: 'in_transaction_closing_count_mismatch',
        }),
      },
    });
    expect(invoked).toEqual(['run-a', 'run-b']);
    expect(report.runResults[0].insertedClosingCount).toBe(2);
    expect(report.closingRowsInserted).toBe(2);
    expect(report.mutationTargetsInvoked).toEqual(['ShadowModelClosingMarketSnapshot']);
    expect(report.outcome).toBe('FAILED');
    expect(report.writeSafe).toBe(false);
  });

  it('encodes UNKNOWN persistence as null mutationTargetsInvoked when no persist is proven', async () => {
    const { report, invoked } = await runCycle({
      children: {
        'run-a': async () => {
          throw new Error('child_report_missing');
        },
      },
    });
    expect(invoked).toEqual(['run-a']);
    expect(report.runResults[0].persistenceStatus).toBe('UNKNOWN');
    expect(report.runResults[0].persistenceCommitted).toBeNull();
    expect(report.mutationTargetsInvoked).toBeNull();
    expect(report.outcome).toBe('FAILED');
    expect(report.writeSafe).toBe(false);
    expect(report.blockers.some((value) => value.indexOf('persistence_state_unknown') >= 0)).toBe(
      true
    );
  });

  it('stops additional child invocations after the first UNKNOWN persistence', async () => {
    const dual = [
      frame('run-a', {}, 'candidate_b_roster_prior_v1'),
      frame('run-b', {}, 'core_v1_shadow_baseline_v1'),
    ];
    const { report, invoked } = await runCycle({
      framesByCall: [dual],
      children: {
        'run-a': async () => {
          throw new Error('child_unreadable');
        },
        'run-b': persistedChild('run-b'),
      },
    });
    expect(invoked).toEqual(['run-a']);
    expect(report.runResults[0].persistenceStatus).toBe('UNKNOWN');
    expect(report.runResults[1].invocationAttempted).toBe(false);
    expect(report.runResults[1].skippedAfterPriorChildFailure).toBe(true);
    expect(report.mutationTargetsInvoked).toBeNull();
    expect(report.outcome).toBe('FAILED');
  });

  it('does not invoke the writer on invalid outer confirmation', async () => {
    const { report, invoked } = await runCycle({
      confirmation: 'CAPTURE_2026_WEEK_3_SHADOW_MODEL_T30_run-a',
    });
    expect(invoked).toEqual([]);
    expect(report.outcome).toBe('BLOCKED');
    expect(report.blockers).toContain('closing_commit_confirmation_invalid');
    expect(report.closingCommitRequested).toBe(false);
  });

  it('always reports providerCalls=0 and never writes MarketLine', async () => {
    const { report } = await runCycle({});
    expect(report.providerCalls).toBe(0);
    expect(report.mutationTargetsInvoked).not.toContain('MarketLine' as never);
    expect(report.mutationTargetsInvoked).toEqual(['ShadowModelClosingMarketSnapshot']);
  });
});
