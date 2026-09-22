import {
  GENERIC_SHADOW_CORE_EVAL_V1_DEFINITION_HASH,
  GENERIC_SHADOW_CORE_EVAL_V1_DEFINITION_MANIFEST,
  evaluateGenericShadowCoreEvalV1,
  type GenericShadowCoreEvalFrame,
  type GenericShadowEvalClosing,
  type GenericShadowEvalPrediction,
} from '../../web/lib/generic-shadow-core-eval-v1';
import {
  GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH,
  GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID,
} from '../../web/lib/shadow-model-t30-closing-v1';
import { sha256CanonicalJson } from '../../web/lib/shadow-model-capture-v1';

function prediction(overrides: Partial<GenericShadowEvalPrediction> = {}): GenericShadowEvalPrediction {
  return {
    id: 'pred-1',
    captureRunId: 'run-1',
    gameId: 'game-1',
    season: 2026,
    week: 5,
    homeTeamId: 'home',
    awayTeamId: 'away',
    kickoffTimestamp: '2026-10-03T17:00:00.000Z',
    predictionTimestamp: '2026-10-01T15:00:00.000Z',
    predictionStatus: 'AVAILABLE',
    unavailableReasons: [],
    marketType: 'SPREAD',
    selectedSide: 'HOME',
    selectedTeamId: 'home',
    predictionPickValue: -3.5,
    ...overrides,
  };
}

function closing(overrides: Partial<GenericShadowEvalClosing> = {}): GenericShadowEvalClosing {
  return {
    id: 'close-1',
    predictionId: 'pred-1',
    gameId: 'game-1',
    evaluationProtocol: 'CORE_EVAL_V1',
    closingDefinitionId: GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID,
    closingDefinitionHash: GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH,
    status: 'AVAILABLE',
    unavailableReason: null,
    canonicalMarketHma: 4,
    ...overrides,
  };
}

function frame(overrides: Partial<GenericShadowCoreEvalFrame> = {}): GenericShadowCoreEvalFrame {
  const predictions = overrides.predictions ?? [prediction()];
  return {
    captureRun: {
      id: 'run-1',
      season: 2026,
      week: 5,
      captureContext: 'week5_test',
      evaluationProtocol: 'CORE_EVAL_V1',
      modelFamily: 'test',
      modelDefinitionId: 'candidate_b_elo_prior_v1',
      modelDefinitionHash: 'model-hash',
      featureDefinitionId: 'feature-v1',
      featureDefinitionHash: 'feature-hash',
      policyDefinitionId: 'policy-v1',
      policyDefinitionHash: 'policy-hash',
      repoCommitSha: 'a'.repeat(40),
      captureTimestamp: '2026-10-01T15:00:00.000Z',
      expectedGameIds: predictions.map((p) => p.gameId),
      totalGames: predictions.length,
      availableCount: predictions.filter((p) => p.predictionStatus === 'AVAILABLE').length,
      unavailableCount: predictions.filter((p) => p.predictionStatus !== 'AVAILABLE').length,
      selectionCount: predictions.filter(
        (p) =>
          p.predictionStatus === 'AVAILABLE' &&
          (p.selectedSide === 'HOME' || p.selectedSide === 'AWAY')
      ).length,
      noSelectionCount: predictions.filter(
        (p) => p.predictionStatus === 'AVAILABLE' && p.selectedSide === 'NO_SELECTION'
      ).length,
      status: 'COMPLETE',
    },
    predictions,
    closings: overrides.closings ?? [closing()],
    games: overrides.games ?? [
      {
        id: 'game-1',
        season: 2026,
        week: 5,
        homeTeamId: 'home',
        awayTeamId: 'away',
        status: 'final',
        homeScore: 28,
        awayScore: 21,
      },
    ],
    ...overrides,
    captureRun: overrides.captureRun ?? {
      id: 'run-1',
      season: 2026,
      week: 5,
      captureContext: 'week5_test',
      evaluationProtocol: 'CORE_EVAL_V1',
      modelFamily: 'test',
      modelDefinitionId: 'candidate_b_elo_prior_v1',
      modelDefinitionHash: 'model-hash',
      featureDefinitionId: 'feature-v1',
      featureDefinitionHash: 'feature-hash',
      policyDefinitionId: 'policy-v1',
      policyDefinitionHash: 'policy-hash',
      repoCommitSha: 'a'.repeat(40),
      captureTimestamp: '2026-10-01T15:00:00.000Z',
      expectedGameIds: predictions.map((p) => p.gameId),
      totalGames: predictions.length,
      availableCount: predictions.filter((p) => p.predictionStatus === 'AVAILABLE').length,
      unavailableCount: predictions.filter((p) => p.predictionStatus !== 'AVAILABLE').length,
      selectionCount: predictions.filter(
        (p) =>
          p.predictionStatus === 'AVAILABLE' &&
          (p.selectedSide === 'HOME' || p.selectedSide === 'AWAY')
      ).length,
      noSelectionCount: predictions.filter(
        (p) => p.predictionStatus === 'AVAILABLE' && p.selectedSide === 'NO_SELECTION'
      ).length,
      status: 'COMPLETE',
    },
  };
}

const EVALUATED_AT = new Date('2026-10-04T12:00:00.000Z');

describe('Generic Shadow CORE_EVAL_V1 pure evaluator', () => {
  it('pins a deterministic evaluator definition hash', () => {
    expect(GENERIC_SHADOW_CORE_EVAL_V1_DEFINITION_HASH).toBe(
      sha256CanonicalJson(GENERIC_SHADOW_CORE_EVAL_V1_DEFINITION_MANIFEST)
    );
  });

  it('grades a HOME win, side-specific CLV, and research ROI', () => {
    const report = evaluateGenericShadowCoreEvalV1({
      frame: frame(),
      evaluatedAt: EVALUATED_AT,
    });
    expect(report.reportValid).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.counts.atsWinCount).toBe(1);
    expect(report.counts.atsGradedCount).toBe(1);
    expect(report.counts.clvAvailableCount).toBe(1);
    expect(report.atsWinRate).toBe(1);
    expect(report.totalGradedStake).toBe(100);
    expect(report.totalResearchPnl).toBeCloseTo(90.9, 10);
    expect(report.researchRoi).toBeCloseTo(0.909, 10);
    expect(report.averageClvPoints).toBeCloseTo(0.5, 10);

    const row = report.perPrediction[0];
    expect(row.sideMargin).toBe(7);
    expect(row.coverMargin).toBeCloseTo(3.5, 10);
    expect(row.atsResult).toBe('WIN');
    expect(row.closingTeamLine).toBe(-4);
    expect(row.clvPoints).toBeCloseTo(0.5, 10);
    expect(row.shadowStake).toBe(100);
    expect(row.shadowPnl).toBeCloseTo(90.9, 10);
  });

  it('uses AWAY side margin and team-sided closing line', () => {
    const p = prediction({
      selectedSide: 'AWAY',
      selectedTeamId: 'away',
      predictionPickValue: 6.5,
    });
    const report = evaluateGenericShadowCoreEvalV1({
      frame: frame({
        predictions: [p],
        closings: [closing({ canonicalMarketHma: 6 })],
        games: [{
          id: 'game-1',
          season: 2026,
          week: 5,
          homeTeamId: 'home',
          awayTeamId: 'away',
          status: 'final',
          homeScore: 30,
          awayScore: 27,
        }],
      }),
      evaluatedAt: EVALUATED_AT,
    });
    const row = report.perPrediction[0];
    expect(row.sideMargin).toBe(-3);
    expect(row.coverMargin).toBeCloseTo(3.5, 10);
    expect(row.atsResult).toBe('WIN');
    expect(row.closingTeamLine).toBe(6);
    expect(row.clvPoints).toBeCloseTo(0.5, 10);
  });

  it('settles only exact/epsilon-zero as PUSH and never uses a half-point push band', () => {
    const exact = evaluateGenericShadowCoreEvalV1({
      frame: frame({
        predictions: [prediction({ predictionPickValue: -7 })],
      }),
      evaluatedAt: EVALUATED_AT,
    });
    expect(exact.perPrediction[0].atsResult).toBe('PUSH');
    expect(exact.perPrediction[0].coverMargin).toBe(0);
    expect(exact.perPrediction[0].shadowStake).toBe(100);
    expect(exact.perPrediction[0].shadowPnl).toBe(0);

    const half = evaluateGenericShadowCoreEvalV1({
      frame: frame({
        predictions: [prediction({ predictionPickValue: -6.5 })],
      }),
      evaluatedAt: EVALUATED_AT,
    });
    expect(half.perPrediction[0].coverMargin).toBeCloseTo(0.5, 10);
    expect(half.perPrediction[0].atsResult).toBe('WIN');
  });

  it('keeps NO_SELECTION in the denominator but out of ATS/CLV/ROI stake', () => {
    const p = prediction({
      selectedSide: 'NO_SELECTION',
      selectedTeamId: null,
      predictionPickValue: null,
    });
    const report = evaluateGenericShadowCoreEvalV1({
      frame: frame({ predictions: [p], closings: [] }),
      evaluatedAt: EVALUATED_AT,
    });
    const row = report.perPrediction[0];
    expect(row.atsResult).toBe('NOT_APPLICABLE');
    expect(row.clvStatus).toBe('NOT_APPLICABLE');
    expect(row.shadowStake).toBeNull();
    expect(row.shadowPnl).toBeNull();
    expect(report.counts.totalPredictions).toBe(1);
    expect(report.counts.noSelectionCount).toBe(1);
    expect(report.counts.atsGradedCount).toBe(0);
    expect(report.researchRoi).toBeNull();
  });

  it('keeps UNAVAILABLE predictions explicit and ungraded', () => {
    const p = prediction({
      predictionStatus: 'UNAVAILABLE',
      unavailableReasons: ['missing_market'],
      selectedSide: null,
      selectedTeamId: null,
      predictionPickValue: null,
    });
    const report = evaluateGenericShadowCoreEvalV1({
      frame: frame({ predictions: [p], closings: [] }),
      evaluatedAt: EVALUATED_AT,
    });
    const row = report.perPrediction[0];
    expect(row.atsResult).toBe('UNAVAILABLE');
    expect(row.clvStatus).toBe('UNAVAILABLE');
    expect(row.shadowStake).toBeNull();
    expect(report.counts.predictionUnavailableCount).toBe(1);
    expect(report.counts.atsUnavailableCount).toBe(1);
  });

  it('grades ATS/ROI even when legitimate T-30 evidence is missing, leaving CLV unavailable', () => {
    const report = evaluateGenericShadowCoreEvalV1({
      frame: frame({ closings: [] }),
      evaluatedAt: EVALUATED_AT,
    });
    const row = report.perPrediction[0];
    expect(row.atsResult).toBe('WIN');
    expect(row.shadowPnl).toBeCloseTo(90.9, 10);
    expect(row.clvStatus).toBe('UNAVAILABLE');
    expect(row.clvPoints).toBeNull();
    expect(row.validationReasons).toContain('missing_t30_closing');
    expect(report.averageClvPoints).toBeNull();
  });

  it('keeps ATS unavailable without a final canonical result even when CLV exists', () => {
    const report = evaluateGenericShadowCoreEvalV1({
      frame: frame({
        games: [{
          id: 'game-1',
          season: 2026,
          week: 5,
          homeTeamId: 'home',
          awayTeamId: 'away',
          status: 'scheduled',
          homeScore: null,
          awayScore: null,
        }],
      }),
      evaluatedAt: EVALUATED_AT,
    });
    const row = report.perPrediction[0];
    expect(row.atsResult).toBe('UNAVAILABLE');
    expect(row.validationReasons).toContain('final_score_unavailable');
    expect(row.shadowStake).toBeNull();
    expect(row.clvStatus).toBe('AVAILABLE');
    expect(row.clvPoints).toBeCloseTo(0.5, 10);
  });

  it('treats an explicitly UNAVAILABLE T-30 close as CLV unavailable, never repaired', () => {
    const report = evaluateGenericShadowCoreEvalV1({
      frame: frame({
        closings: [closing({
          status: 'UNAVAILABLE',
          unavailableReason: 'missing_market_at_or_before_t30',
          canonicalMarketHma: null,
        })],
      }),
      evaluatedAt: EVALUATED_AT,
    });
    const row = report.perPrediction[0];
    expect(row.clvStatus).toBe('UNAVAILABLE');
    expect(row.clvPoints).toBeNull();
    expect(row.validationReasons).toContain(
      't30_closing_unavailable:missing_market_at_or_before_t30'
    );
    expect(report.counts.closingUnavailableCount).toBe(1);
  });

  it('fails the report closed on capture-run count/set contradictions', () => {
    const f = frame();
    f.captureRun.totalGames = 2;
    f.captureRun.expectedGameIds = ['game-1', 'game-2'];
    const report = evaluateGenericShadowCoreEvalV1({
      frame: f,
      evaluatedAt: EVALUATED_AT,
    });
    expect(report.reportValid).toBe(false);
    expect(report.blockers).toContain('capture_run_total_games_mismatch');
    expect(report.blockers).toContain('capture_run_prediction_game_set_mismatch');
  });

  it('fails closed on canonical game identity contradictions', () => {
    const report = evaluateGenericShadowCoreEvalV1({
      frame: frame({
        games: [{
          id: 'game-1',
          season: 2026,
          week: 5,
          homeTeamId: 'wrong-home',
          awayTeamId: 'away',
          status: 'final',
          homeScore: 28,
          awayScore: 21,
        }],
      }),
      evaluatedAt: EVALUATED_AT,
    });
    expect(report.reportValid).toBe(false);
    expect(report.blockers).toContain('canonical_game_team_identity_mismatch:game-1');
    expect(report.perPrediction[0].atsResult).toBe('UNAVAILABLE');
  });

  it('aggregates W/L/P, CLV, and ROI without hiding missing evidence', () => {
    const p1 = prediction({ id: 'p1', gameId: 'g1' });
    const p2 = prediction({
      id: 'p2',
      gameId: 'g2',
      homeTeamId: 'h2',
      awayTeamId: 'a2',
      selectedSide: 'AWAY',
      selectedTeamId: 'a2',
      predictionPickValue: 2.5,
    });
    const p3 = prediction({
      id: 'p3',
      gameId: 'g3',
      homeTeamId: 'h3',
      awayTeamId: 'a3',
      selectedSide: 'NO_SELECTION',
      selectedTeamId: null,
      predictionPickValue: null,
    });

    const report = evaluateGenericShadowCoreEvalV1({
      frame: frame({
        predictions: [p1, p2, p3],
        closings: [
          closing({ id: 'c1', predictionId: 'p1', gameId: 'g1', canonicalMarketHma: 4 }),
          closing({ id: 'c2', predictionId: 'p2', gameId: 'g2', canonicalMarketHma: 3 }),
        ],
        games: [
          { id: 'g1', season: 2026, week: 5, homeTeamId: 'home', awayTeamId: 'away', status: 'final', homeScore: 28, awayScore: 21 },
          { id: 'g2', season: 2026, week: 5, homeTeamId: 'h2', awayTeamId: 'a2', status: 'final', homeScore: 31, awayScore: 27 },
          { id: 'g3', season: 2026, week: 5, homeTeamId: 'h3', awayTeamId: 'a3', status: 'final', homeScore: 17, awayScore: 14 },
        ],
      }),
      evaluatedAt: EVALUATED_AT,
    });

    expect(report.reportValid).toBe(true);
    expect(report.counts.totalPredictions).toBe(3);
    expect(report.counts.atsWinCount).toBe(1);
    expect(report.counts.atsLossCount).toBe(1);
    expect(report.counts.atsNotApplicableCount).toBe(1);
    expect(report.counts.atsGradedCount).toBe(2);
    expect(report.atsWinRate).toBeCloseTo(0.5, 10);
    expect(report.totalGradedStake).toBe(200);
    expect(report.totalResearchPnl).toBeCloseTo(-9.1, 10);
    expect(report.researchRoi).toBeCloseTo(-0.0455, 10);
    expect(report.counts.clvAvailableCount).toBe(2);
    expect(report.counts.clvNotApplicableCount).toBe(1);
    expect(report.averageClvPoints).toBeCloseTo(0, 10);
  });
});
