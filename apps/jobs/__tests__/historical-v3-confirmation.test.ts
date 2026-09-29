import {
  HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER,
  type HistoricalModelV3Candidate,
} from '../src/research/historical-model-v3';
import {
  auditHistoricalV3PreScoreInputs,
  fitHistoricalV3Baselines,
  runHistoricalV3Confirmation,
} from '../src/research/historical-v3-confirmation';
import type {
  HistoricalV3PredictiveGameInput,
  HistoricalV3PredictiveInputQa,
} from '../src/research/historical-v3-predictive-inputs';

function available(value: number, n = 1) {
  return { value, status: 'AVAILABLE', n };
}

function developmentFixture() {
  const featureRows: any[] = [];
  const outcomeRows: any[] = [];
  let gameId = 1;

  for (const [season, count] of [
    [2022, 734],
    [2023, 750],
  ] as const) {
    for (let index = 0; index < count; index += 1) {
      const week = 1 + (index % 15);
      const neutralSite = index % 7 === 0;
      const homeElo = 1200 + ((index * 7) % 400);
      const awayElo = 1200 + ((index * 11 + 37) % 400);
      const featureTeam = (elo: number, shift: number) => ({
        eloRaw: available(elo),
        talentRaw: available(500 + shift),
        returningPercentPPA: available(50 + (shift % 20)),
        recruitingPointsY0: available(200 + shift),
        recruitingPointsY1: available(190 + shift),
        recruitingPointsY2: available(180 + shift),
        recruitingPointsY3: available(170 + shift),
        priorFbsGames: available(index % 12),
        ppaNet: available(((shift % 9) - 4) / 10),
        successNet: available(((shift % 7) - 3) / 20),
      });

      featureRows.push({
        season,
        gameId,
        week,
        neutralSite,
        homeTeam: `Home ${gameId}`,
        awayTeam: `Away ${gameId}`,
        home: featureTeam(homeElo, index % 80),
        away: featureTeam(awayElo, (index * 3) % 80),
      });

      const homeMargin =
        1.75 +
        (neutralSite ? 0 : 2.25) +
        0.012 * (homeElo - awayElo) +
        ((index % 5) - 2) * 0.4;
      outcomeRows.push({
        season,
        gameId,
        homeTeam: `Home ${gameId}`,
        awayTeam: `Away ${gameId}`,
        homeMargin,
      });
      gameId += 1;
    }
  }

  return { featureRows, outcomeRows };
}

function candidate(intercept = 5): HistoricalModelV3Candidate {
  return {
    status: 'HISTORICAL_V3_CANDIDATE_FROZEN',
    modelDefinitionId: 'historical_ridge_margin_v3',
    featureDefinitionId: 'historical_source_resilient_feature_v3',
    lambda: 100,
    coefficientOrder: [...HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER],
    coefficients: HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER.map(
      (_, index) => (index === 0 ? intercept : 0)
    ),
    scaler: {
      elo: { mean: 1400, populationSd: 100, availableCount: 2968, disabledZeroVariance: false },
      talent: { mean: 500, populationSd: 50, availableCount: 2968, disabledZeroVariance: false },
      returning: { mean: 50, populationSd: 10, availableCount: 2968, disabledZeroVariance: false },
      recruitY0: { mean: 200, populationSd: 30, availableCount: 2968, disabledZeroVariance: false },
      recruitY1: { mean: 190, populationSd: 30, availableCount: 2968, disabledZeroVariance: false },
      recruitY2: { mean: 180, populationSd: 30, availableCount: 2968, disabledZeroVariance: false },
      recruitY3: { mean: 170, populationSd: 30, availableCount: 2968, disabledZeroVariance: false },
      priorFbsGames: { mean: 5, populationSd: 3, availableCount: 2968, disabledZeroVariance: false },
      ppaNet: { mean: 0, populationSd: 0.3, availableCount: 2968, disabledZeroVariance: false },
      successNet: { mean: 0, populationSd: 0.2, availableCount: 2968, disabledZeroVariance: false },
    },
    trainGameIds: Array.from({ length: 1484 }, (_, i) => i + 1),
    trainSeasonWeeks: {
      '2022': Array.from({ length: 15 }, (_, i) => i + 1),
      '2023': Array.from({ length: 15 }, (_, i) => i + 1),
    },
    developmentGames: 1484,
    sourceGapDevelopmentColumnsAllZero: true,
  };
}

function predictiveFixture(): {
  rows: HistoricalV3PredictiveGameInput[];
  qa: HistoricalV3PredictiveInputQa;
  outcomes: any[];
} {
  const teams = Array.from({ length: 134 }, (_, i) => `Team ${i + 1}`);
  const rows: HistoricalV3PredictiveGameInput[] = [];
  const outcomes: any[] = [];
  let sourceGapSides = 0;
  let naturalSides = 0;

  for (let index = 0; index < 752; index += 1) {
    const gameId = 900000 + index;
    const week = 1 + (index % 16);
    const homeTeam = teams[(index * 2) % teams.length];
    const awayTeam = teams[(index * 2 + 1) % teams.length];

    const side = (
      team: string,
      elo: number,
      formMissing: 0 | 1,
      sourceGap: 0 | 1
    ) => {
      if (formMissing) naturalSides += 1;
      if (sourceGap) sourceGapSides += 1;
      return {
        team,
        features: {
          elo: available(elo),
          talent: available(500),
          returning: available(50),
          recruitY0: available(200),
          recruitY1: available(190),
          recruitY2: available(180),
          recruitY3: available(170),
          priorFbsGames: available(week - 1),
          ppaNet:
            formMissing || sourceGap
              ? { value: null, status: formMissing ? 'NO_PRIOR_FBS_GAMES' : 'SOURCE_HISTORY_INCOMPLETE', n: 0 }
              : available(0.1),
          successNet:
            formMissing || sourceGap
              ? { value: null, status: formMissing ? 'NO_PRIOR_FBS_GAMES' : 'SOURCE_HISTORY_INCOMPLETE', n: 0 }
              : available(0.05),
        },
        standardized: {
          elo: 0,
          talent: 0,
          returning: 0,
          recruitY0: 0,
          recruitY1: 0,
          recruitY2: 0,
          recruitY3: 0,
          priorFbsGames: 0,
          ppaNet: 0,
          successNet: 0,
        },
        missingFlags: {
          returning: 0 as const,
          recruitY0: 0 as const,
          recruitY1: 0 as const,
          recruitY2: 0 as const,
          recruitY3: 0 as const,
          formMissing,
          formSourceGap: sourceGap,
        },
        formAudit: {
          priorFbsGames: week - 1,
          observedAdvancedGames: sourceGap ? Math.max(0, week - 2) : week - 1,
          missingAdvancedGames: sourceGap ? 1 : 0,
          missingPriorGameIds: sourceGap ? [700000 + index] : [],
          sourceProvenanceCounts: {
            BULK_ADVANCED_FULL_SEASON_PRIMARY: sourceGap ? Math.max(0, week - 2) : week - 1,
            BULK_ADVANCED_WEEK_SCOPED_RECOVERY: 0,
          },
        },
      };
    };

    const natural = week === 1 ? 1 : 0;
    const sourceGap = week > 1 && index % 37 === 0 ? 1 : 0;
    const home = side(homeTeam, 1450 + (index % 40), natural, sourceGap);
    const away = side(awayTeam, 1400 + (index % 30), natural, 0);

    const modelInputs = Object.fromEntries(
      HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER.map((name) => [
        name,
        name === 'intercept'
          ? 1
          : name === 'homeFieldIndicator'
            ? 1
            : 0,
      ])
    );

    rows.push({
      season: 2024,
      gameId,
      week,
      startDate: null,
      homeTeam,
      awayTeam,
      neutralSite: false,
      home: home as any,
      away: away as any,
      modelInputs,
    });

    outcomes.push({
      id: gameId,
      season: 2024,
      week,
      seasonType: 'regular',
      completed: true,
      homeClassification: 'fbs',
      awayClassification: 'fbs',
      homeTeam,
      awayTeam,
      homePoints: 30,
      awayPoints: 25,
    });
  }

  const qa: HistoricalV3PredictiveInputQa = {
    canonicalGames: 752,
    canonicalTeams: 134,
    teamSides: 1504,
    bulkAdvancedValidTeamGameRows: 1496,
    bulkAdvancedMalformedTeamGameRows: 0,
    recoveryRowsAccepted: 0,
    recoveryRowsSupplied: 0,
    naturalNoPriorFormSides: naturalSides,
    sourceGapFormSides: sourceGapSides,
    exactMissingPriorGameIds: [],
    missingReturningTeams: [],
    missingRecruitingTeamsBySlot: { Y0: [], Y1: [], Y2: [], Y3: [] },
    requiredEloMissingSides: 0,
    requiredTalentMissingSides: 0,
    sameWeekOrLaterHistoryReferences: 0,
    marketReads: 0,
    ppaSidecarReads: 0,
    portalReads: 0,
    outcomeFieldsUsed: false,
    modelPredictionsComputed: false,
    holdout2025Reads: 0,
  };

  return { rows, qa, outcomes };
}

describe('historical V3 pre-score freeze and confirmation', () => {
  it('fits deterministic development-only HFA and Elo+HFA baselines', () => {
    const baselines = fitHistoricalV3Baselines(developmentFixture());
    expect(baselines.developmentGames).toBe(1484);
    expect(baselines.hfaOnly.coefficients).toHaveLength(2);
    expect(baselines.eloHfa.coefficients).toHaveLength(3);
    expect(baselines.eloHfa.lambda).toBe(100);
    expect(baselines.eloHfa.trainGameIds).toHaveLength(1484);
    expect(
      baselines.eloHfa.coefficients.every(Number.isFinite)
    ).toBe(true);
  });

  it('freezes canonical IDs and explicit missingness/source-gap audit state', () => {
    const fixture = predictiveFixture();
    const audit = auditHistoricalV3PreScoreInputs(fixture.rows, fixture.qa);
    expect(audit.canonicalGames).toBe(752);
    expect(audit.canonicalTeams).toBe(134);
    expect(audit.canonicalGameIds).toHaveLength(752);
    expect(audit.sourceGapFormSides).toBe(fixture.qa.sourceGapFormSides);
    expect(audit.naturalFormMissingSides).toBe(
      fixture.qa.naturalNoPriorFormSides
    );
    expect(audit.allModelInputsFinite).toBe(true);
  });

  it('returns PASS when all frozen performance gates are satisfied', () => {
    const fixture = predictiveFixture();
    const result = runHistoricalV3Confirmation({
      predictiveRows: fixture.rows,
      outcomeRows: fixture.outcomes,
      candidate: candidate(5),
      baselines: fitHistoricalV3Baselines(developmentFixture()),
      exactCandidateBackcompatState: true,
      sourceStateVerified: true,
      marketReads: 0,
      holdout2025Reads: 0,
      leakageBlockerAbsent: true,
    });

    expect(result.status).toBe('HISTORICAL_V3_CONFIRMATION_PASS');
    expect(result.primaryPredictions).toHaveLength(752);
    expect(result.primaryMetrics?.mae).toBe(0);
    expect(result.gateChecks.primaryMaeBeatsHfaOnly).toBe(true);
    expect(result.gateChecks.primaryMaeBeatsEloHfa).toBe(true);
  });

  it('returns FAIL without redesign when inputs are valid but performance gate fails', () => {
    const fixture = predictiveFixture();
    const result = runHistoricalV3Confirmation({
      predictiveRows: fixture.rows,
      outcomeRows: fixture.outcomes,
      candidate: candidate(50),
      baselines: fitHistoricalV3Baselines(developmentFixture()),
      exactCandidateBackcompatState: true,
      sourceStateVerified: true,
      marketReads: 0,
      holdout2025Reads: 0,
      leakageBlockerAbsent: true,
    });

    expect(result.status).toBe('HISTORICAL_V3_CONFIRMATION_FAIL');
    expect(result.inputBlockedReasons).toEqual([]);
    expect(result.primaryPredictions).toHaveLength(752);
  });

  it('returns INPUT_BLOCKED before opening outcomes when frozen source state is invalid', () => {
    const fixture = predictiveFixture();
    const result = runHistoricalV3Confirmation({
      predictiveRows: fixture.rows,
      outcomeRows: [{ deliberately: 'invalid outcome evidence' }],
      candidate: candidate(5),
      baselines: fitHistoricalV3Baselines(developmentFixture()),
      exactCandidateBackcompatState: true,
      sourceStateVerified: false,
      marketReads: 0,
      holdout2025Reads: 0,
      leakageBlockerAbsent: true,
    });

    expect(result.status).toBe(
      'HISTORICAL_V3_CONFIRMATION_INPUT_BLOCKED'
    );
    expect(result.inputBlockedReasons).toContain('source_state_unverified');
    expect(result.primaryPredictions).toEqual([]);
  });

  it('blocks market or 2025 leakage before scoring', () => {
    const fixture = predictiveFixture();
    const result = runHistoricalV3Confirmation({
      predictiveRows: fixture.rows,
      outcomeRows: [],
      candidate: candidate(5),
      baselines: fitHistoricalV3Baselines(developmentFixture()),
      exactCandidateBackcompatState: true,
      sourceStateVerified: true,
      marketReads: 1,
      holdout2025Reads: 1,
      leakageBlockerAbsent: false,
    });

    expect(result.status).toBe(
      'HISTORICAL_V3_CONFIRMATION_INPUT_BLOCKED'
    );
    expect(result.inputBlockedReasons).toEqual(
      expect.arrayContaining([
        'market_leakage',
        'holdout_2025_read',
        'leakage_blocker_present',
      ])
    );
  });
});
