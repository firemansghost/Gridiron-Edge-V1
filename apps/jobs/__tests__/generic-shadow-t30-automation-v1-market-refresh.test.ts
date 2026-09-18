/**
 * Generic Shadow T-30 Automation V1 — market-refresh cycle tests.
 * Injected discover/now/Live Odds fakes only. No real DB, provider, or writes.
 */

import { planGenericShadowT30Automation } from '../../web/lib/generic-shadow-t30-automation-v1';
import {
  expectedGenericShadowT30MarketRefreshConfirmation,
  type GenericShadowT30LiveOddsCommitSummary,
} from '../../web/lib/generic-shadow-t30-automation-v1-market-refresh';
import type {
  GenericShadowT30CaptureRun,
  GenericShadowT30CurrentGame,
  GenericShadowT30OperationalFrame,
  GenericShadowT30Prediction,
} from '../../web/lib/shadow-model-t30-closing-v1';
import type { ShadowModelMarketLineRow } from '../../web/lib/shadow-model-capture-v1';
import { runGenericShadowT30MarketRefreshCycle } from '../src/generic-shadow-t30-automation-v1-market-refresh-adapter';
import type { GenericShadowT30AutomationDiscovery } from '../src/generic-shadow-t30-automation-v1-adapter';

const GAME_ID = 'game-1';
const HOME = 'home';
const AWAY = 'away';
const KICKOFF = new Date('2026-09-19T20:00:00.000Z');
const PRED_TS = new Date('2026-09-17T15:00:00.000Z');
const T0 = new Date('2026-09-19T19:20:00.000Z');
const T_PRE = new Date('2026-09-19T19:20:05.000Z');
const T1 = new Date('2026-09-19T19:20:30.000Z');
const CONFIRM = expectedGenericShadowT30MarketRefreshConfirmation(3);

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
  marketLines: ShadowModelMarketLineRow[] = [],
  runId = 'run-a',
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

function successLiveOdds(): GenericShadowT30LiveOddsCommitSummary {
  return {
    providerCallAttempted: true,
    providerCallSucceeded: true,
    providerCalls: 1,
    providerCredits: {
      requestsLast: '1',
      requestsUsed: '10',
      requestsRemaining: '90',
      requestCreditsLast: 1,
    },
    writeSafe: true,
    blockers: [],
    proposedInsertCount: 8,
    insertedCount: 8,
    persistenceInvoked: true,
    persistenceStatus: 'PERSISTED',
    postwriteVerificationStatus: 'PASSED',
    verificationOk: true,
    error: null,
  };
}

async function runCycle(options: {
  mode?: 'PLAN' | 'COMMIT';
  confirmation?: string;
  timestamps?: Date[];
  framesByCall?: GenericShadowT30OperationalFrame[][];
  liveOdds?: GenericShadowT30LiveOddsCommitSummary | (() => Promise<GenericShadowT30LiveOddsCommitSummary>);
  liveOddsImpl?: () => Promise<GenericShadowT30LiveOddsCommitSummary>;
  throwOnDiscoverCall?: number;
}) {
  const framesByCall = options.framesByCall ?? [[frame()]];
  let discoverCalls = 0;
  let liveOddsCalls = 0;
  const report = await runGenericShadowT30MarketRefreshCycle({
    season: 2026,
    week: 3,
    mode: options.mode ?? 'COMMIT',
    confirmation: options.confirmation ?? CONFIRM,
    repoCommitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    githubRef: 'refs/heads/main',
    liveOddsReportPath: 'reports/fake-live-odds.json',
    now: nowQueue(options.timestamps ?? [T0, T_PRE, T1]),
    discover: async () => {
      discoverCalls += 1;
      if (options.throwOnDiscoverCall === discoverCalls) {
        throw new Error('post_refresh_discovery_boom');
      }
      const frames = framesByCall[Math.min(discoverCalls - 1, framesByCall.length - 1)];
      return discovery(frames);
    },
    runLiveOddsCommit: async () => {
      liveOddsCalls += 1;
      if (options.liveOddsImpl) return options.liveOddsImpl();
      if (typeof options.liveOdds === 'function') return options.liveOdds();
      return options.liveOdds ?? successLiveOdds();
    },
  });
  return { report, discoverCalls, liveOddsCalls };
}

describe('Generic Shadow T-30 Automation V1 — market-refresh cycle', () => {
  it('does not invoke Live Odds before T-45', async () => {
    const { report, liveOddsCalls } = await runCycle({
      timestamps: [new Date('2026-09-19T19:10:00.000Z')],
      framesByCall: [[frame()]],
    });
    expect(report.outcome).toBe('NO_ACTION');
    expect(report.providerCallAttempted).toBe(false);
    expect(report.persistenceStatus).toBe('NOT_ATTEMPTED');
    expect(report.mutationTargetsInvoked).toEqual([]);
    expect(report.closingRowsInserted).toBe(0);
    expect(report.scheduleEnabled).toBe(false);
    expect(liveOddsCalls).toBe(0);
  });

  it('does not invoke Live Odds when a fresh coherent pair is already present', async () => {
    const { report, liveOddsCalls } = await runCycle({
      framesByCall: [[frame(pair(new Date('2026-09-19T19:18:00.000Z')))]],
    });
    expect(report.outcome).toBe('MARKET_REFRESH_NOT_NEEDED');
    expect(report.requestedMode).toBe('COMMIT');
    expect(report.reportKind).toBe('TERMINAL');
    expect(report.marketRefreshRequested).toBe(false);
    expect(liveOddsCalls).toBe(0);
    expect(report.persistenceStatus).toBe('NOT_ATTEMPTED');
    expect(report.mutationTargetsInvoked).toEqual([]);
  });

  it('invokes Live Odds exactly once when T-45..T-35 evidence is missing', async () => {
    const { report, liveOddsCalls } = await runCycle({
      framesByCall: [
        [frame()],
        [frame()],
        [frame(pair(new Date('2026-09-19T19:20:10.000Z')))],
      ],
    });
    expect(liveOddsCalls).toBe(1);
    expect(report.outcome).toBe('MARKET_REFRESHED');
    expect(report.providerCallAttempted).toBe(true);
    expect(report.providerCallSucceeded).toBe(true);
    expect(report.persistenceStatus).toBe('PERSISTED');
    expect(report.mutationTargetsInvoked).toEqual(['MarketLine']);
    expect(report.closingRowsInserted).toBe(0);
    expect(report.closingWriterInvoked).toBe(false);
  });

  it('replans after a successful refresh with a new observed timestamp', async () => {
    const { report } = await runCycle({
      framesByCall: [
        [frame()],
        [frame()],
        [frame(pair(new Date('2026-09-19T19:20:10.000Z')))],
      ],
    });
    expect(report.initialObservedTimestamp.toISOString()).toBe(T0.toISOString());
    expect(report.postRefreshObservedTimestamp?.toISOString()).toBe(T1.toISOString());
    expect(report.postRefreshObservedTimestamp?.getTime()).not.toBe(
      report.initialObservedTimestamp.getTime()
    );
    expect(report.finalOutcome).toBe('MARKET_REFRESH_NOT_NEEDED');
    expect(report.finalFreshEvidenceStatus[0].freshEvidenceStatus).toBe(
      'fresh_coherent_pair_present'
    );
  });

  it('keeps one Live Odds invocation for two capture runs of the same physical game', async () => {
    const dual = [
      frame([], 'run-a', 'candidate_b_roster_prior_v1'),
      frame([], 'run-b', 'core_v1_shadow_baseline_v1'),
    ];
    const dualFresh = [
      frame(pair(new Date('2026-09-19T19:20:10.000Z')), 'run-a', 'candidate_b_roster_prior_v1'),
      frame(pair(new Date('2026-09-19T19:20:10.000Z')), 'run-b', 'core_v1_shadow_baseline_v1'),
    ];
    const { report, liveOddsCalls } = await runCycle({
      framesByCall: [dual, dual, dualFresh],
    });
    expect(report.marketRefreshNeededGameIds).toEqual([GAME_ID]);
    expect(liveOddsCalls).toBe(1);
    expect(report.mutationTargetsInvoked).toEqual(['MarketLine']);
  });

  it('does not invoke Live Odds when the coordinator is blocked', async () => {
    const { report, liveOddsCalls } = await runCycle({
      framesByCall: [[frame([], 'run-x', 'not_authorized_model')]],
    });
    expect(report.outcome).toBe('BLOCKED');
    expect(liveOddsCalls).toBe(0);
    expect(report.writeSafe).toBe(false);
  });

  it('does not retry Live Odds or write closings when the Live Odds boundary fails', async () => {
    const { report, liveOddsCalls } = await runCycle({
      framesByCall: [[frame()], [frame()]],
      liveOddsImpl: async () => {
        throw new Error('odds_provider_unavailable');
      },
    });
    expect(liveOddsCalls).toBe(1);
    expect(report.outcome).toBe('FAILED');
    expect(report.providerCallSucceeded).toBe(false);
    expect(report.persistenceStatus).toBe('UNKNOWN');
    expect(report.persistenceInvoked).toBeNull();
    expect(report.blockers).toEqual(expect.arrayContaining(['persistence_state_unknown']));
    expect(report.mutationTargetsInvoked).toBeNull();
    expect(report.writeSafe).toBe(false);
    expect(report.closingRowsInserted).toBe(0);
    expect(report.closingWriterInvoked).toBe(false);
    expect(report.postRefreshObservedTimestamp).toBeNull();
  });

  it('encodes UNKNOWN persistence without a false zero-mutation assertion', async () => {
    const { report } = await runCycle({
      framesByCall: [[frame()], [frame()]],
      liveOddsImpl: async () => {
        throw new Error('odds_provider_unavailable');
      },
    });
    expect(report.persistenceStatus).toBe('UNKNOWN');
    expect(report.persistenceInvoked).toBeNull();
    expect(report.mutationTargetsInvoked).toBeNull();
  });

  it('encodes NOT_PERSISTED as zero mutation targets, not UNKNOWN', async () => {
    const { report, liveOddsCalls } = await runCycle({
      framesByCall: [[frame()], [frame()]],
      liveOdds: {
        ...successLiveOdds(),
        persistenceInvoked: false,
        persistenceStatus: 'NOT_PERSISTED',
        insertedCount: null,
        postwriteVerificationStatus: 'COMMIT_BLOCKED',
        verificationOk: null,
        writeSafe: false,
        blockers: ['unresolved_expected_fbs'],
      },
    });
    expect(liveOddsCalls).toBe(1);
    expect(report.outcome).toBe('FAILED');
    expect(report.persistenceStatus).toBe('NOT_PERSISTED');
    expect(report.persistenceInvoked).toBe(false);
    expect(report.mutationTargetsInvoked).toEqual([]);
    expect(report.closingRowsInserted).toBe(0);
    expect(report.closingWriterInvoked).toBe(false);
  });

  it('records persistence and fails closed when postwrite verification fails, without a second provider call', async () => {
    const { report, liveOddsCalls } = await runCycle({
      framesByCall: [[frame()], [frame()]],
      liveOdds: {
        ...successLiveOdds(),
        postwriteVerificationStatus: 'FAILED',
        verificationOk: false,
        error: 'post-write verification failed',
      },
    });
    expect(liveOddsCalls).toBe(1);
    expect(report.outcome).toBe('FAILED');
    expect(report.mutationTargetsInvoked).toEqual(['MarketLine']);
    expect(report.marketLineInsertedCount).toBe(8);
    expect(report.postwriteVerificationStatus).toBe('FAILED');
    expect(report.closingRowsInserted).toBe(0);
  });

  it('PLAN mode never invokes Live Odds even when a refresh would be needed', async () => {
    const { report, liveOddsCalls } = await runCycle({
      mode: 'PLAN',
      confirmation: '',
      timestamps: [T0],
      framesByCall: [[frame()]],
    });
    expect(report.marketRefreshRequested).toBe(true);
    expect(report.providerCallAttempted).toBe(false);
    expect(report.requestedMode).toBe('PLAN');
    expect(report.reportKind).toBe('PLAN');
    expect(liveOddsCalls).toBe(0);
    expect(report.scheduleEnabled).toBe(false);
    expect(report.productionExecutionAuthorized).toBe(false);
  });

  it('does not invoke Live Odds on invalid COMMIT confirmation', async () => {
    const { report, liveOddsCalls } = await runCycle({
      confirmation: 'WRITE_2026_WEEK_3_ODDS',
      framesByCall: [[frame()]],
    });
    expect(report.outcome).toBe('BLOCKED');
    expect(report.blockers).toContain('market_refresh_confirmation_invalid');
    expect(liveOddsCalls).toBe(0);
  });

  it('does not call the provider when the pre-refresh re-plan moves after T-35 but before T-30', async () => {
    const afterWindowBeforeTarget = new Date('2026-09-19T19:26:00.000Z');
    const { report, liveOddsCalls } = await runCycle({
      timestamps: [T0, afterWindowBeforeTarget],
      framesByCall: [[frame()], [frame()]],
    });
    expect(report.initialOutcome).toBe('PREVIEW_ONLY');
    expect(report.marketRefreshRequested).toBe(true);
    expect(liveOddsCalls).toBe(0);
    expect(report.providerCallAttempted).toBe(false);
    expect(report.persistenceStatus).toBe('NOT_ATTEMPTED');
    expect(report.mutationTargetsInvoked).toEqual([]);
    expect(report.closingRowsInserted).toBe(0);
    expect(report.closingWriterInvoked).toBe(false);
    expect(report.finalPlan).toBeTruthy();
    expect(report.finalOutcome).toBe('NO_ACTION');
    expect(report.outcome).toBe('NO_ACTION');
    expect(report.outcome).not.toBe('PREVIEW_ONLY');
    expect(report.requestedMode).toBe('COMMIT');
    expect(report.reportKind).toBe('TERMINAL');
  });

  it('writes a truthful FAILED report if post-refresh discovery throws after MarketLine persistence', async () => {
    const { report, liveOddsCalls } = await runCycle({
      framesByCall: [[frame()], [frame()]],
      throwOnDiscoverCall: 3,
    });
    expect(liveOddsCalls).toBe(1);
    expect(report.outcome).toBe('FAILED');
    expect(report.persistenceStatus).toBe('PERSISTED');
    expect(report.persistenceInvoked).toBe(true);
    expect(report.marketLineInsertedCount).toBe(8);
    expect(report.postwriteVerificationStatus).toBe('PASSED');
    expect(report.mutationTargetsInvoked).toEqual(['MarketLine']);
    expect(report.closingRowsInserted).toBe(0);
    expect(report.writeSafe).toBe(false);
    expect(report.blockers.some((value) => value.startsWith('post_refresh_replan_failed:'))).toBe(
      true
    );
  });
});

describe('Generic Shadow T-30 Automation V1 — market-refresh report contract', () => {
  it('keeps Stage A planner timestamps distinct from the post-refresh re-plan', () => {
    const initial = planGenericShadowT30Automation({
      season: 2026,
      week: 3,
      observedTimestamp: T0,
      frames: [frame()],
    });
    const final = planGenericShadowT30Automation({
      season: 2026,
      week: 3,
      observedTimestamp: T1,
      frames: [frame(pair(new Date('2026-09-19T19:20:10.000Z')))],
    });
    expect(initial.observedTimestamp.getTime()).not.toBe(final.observedTimestamp.getTime());
    expect(final.marketRefreshNeeded).toBe(false);
  });
});
