import {
  isGenericShadowT30AutomationMarketRefreshWindowOpen,
  planGenericShadowT30Automation,
} from '@/lib/generic-shadow-t30-automation-v1';
import type { GenericShadowT30OperationalFrame } from '@/lib/shadow-model-t30-closing-v1';

const KICKOFF = new Date('2026-09-19T20:00:00.000Z');
const OBSERVED = new Date('2026-09-19T19:20:00.000Z');

function frame(): GenericShadowT30OperationalFrame {
  return {
    captureRun: {
      id: 'run-window',
      season: 2026,
      week: 3,
      captureContext: 'window-test',
      evaluationProtocol: 'CORE_EVAL_V1',
      modelDefinitionId: 'candidate_b_roster_prior_v1',
      modelDefinitionHash: 'model-hash',
      featureDefinitionHash: 'feature-hash',
      policyDefinitionHash: 'policy-hash',
      expectedGameIds: ['game-window'],
      totalGames: 1,
      availableCount: 1,
      unavailableCount: 0,
      selectionCount: 1,
      noSelectionCount: 0,
      status: 'COMPLETE',
      failureReason: null,
    },
    predictions: [
      {
        id: 'prediction-window',
        captureRunId: 'run-window',
        gameId: 'game-window',
        season: 2026,
        week: 3,
        homeTeamId: 'home-window',
        awayTeamId: 'away-window',
        kickoffTimestamp: KICKOFF,
        predictionTimestamp: new Date('2026-09-17T15:00:00.000Z'),
        predictionStatus: 'AVAILABLE',
        marketType: 'SPREAD',
        selectedSide: 'HOME',
      },
    ],
    games: [
      {
        id: 'game-window',
        homeTeamId: 'home-window',
        awayTeamId: 'away-window',
        kickoffTimestamp: KICKOFF,
      },
    ],
    marketLines: [],
    existingClosings: [],
  };
}

describe('Generic Shadow T-30 Automation V1 — refresh-window integration', () => {
  it('opens the pure T-45..T-35 predicate at T-40', () => {
    expect(isGenericShadowT30AutomationMarketRefreshWindowOpen(KICKOFF, OBSERVED)).toBe(true);
  });

  it('keeps a T-40 observation FUTURE while grouping the target and opening refresh work', () => {
    const result = planGenericShadowT30Automation({
      season: 2026,
      week: 3,
      observedTimestamp: OBSERVED,
      frames: [frame()],
    });
    const prediction = result.runPlans[0]?.predictions[0];

    expect({
      blockers: result.blockers,
      futureCount: result.counts.futureCount,
      state: prediction?.state,
      closingKickoff: prediction?.closingKickoffTimestamp.toISOString(),
      target: prediction?.targetTimestamp.toISOString(),
      upcomingTargetGroupsCount: result.upcomingTargetGroups.length,
      marketRefreshWindowOpenCount: result.marketRefreshWindowOpenCount,
      marketRefreshNeeded: result.marketRefreshNeeded,
    }).toEqual({
      blockers: [],
      futureCount: 1,
      state: 'FUTURE',
      closingKickoff: '2026-09-19T20:00:00.000Z',
      target: '2026-09-19T19:30:00.000Z',
      upcomingTargetGroupsCount: 1,
      marketRefreshWindowOpenCount: 1,
      marketRefreshNeeded: true,
    });
  });
});
