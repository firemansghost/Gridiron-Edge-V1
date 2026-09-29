import {
  HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER,
  type HistoricalModelV3Candidate,
} from '../src/research/historical-model-v3';
import {
  HISTORICAL_V3_KNOWN_MISSING_BULK_GAME_IDS,
  buildHistoricalV3PredictiveInputs,
  type HistoricalV3PredictiveInputBuildInput,
} from '../src/research/historical-v3-predictive-inputs';

const TEAM_COUNT = 134;
const GAME_COUNT = 752;

function teams(): string[] {
  return [
    'Florida International',
    'Kennesaw State',
    ...Array.from({ length: TEAM_COUNT - 2 }, (_, index) =>
      `Team ${String(index + 2).padStart(3, '0')}`
    ),
  ];
}

function candidate(): HistoricalModelV3Candidate {
  const scalerNames = [
    'elo',
    'talent',
    'returning',
    'recruitY0',
    'recruitY1',
    'recruitY2',
    'recruitY3',
    'priorFbsGames',
    'ppaNet',
    'successNet',
  ] as const;

  const scaler = Object.fromEntries(
    scalerNames.map((name) => [
      name,
      {
        mean: 0,
        populationSd: 1,
        availableCount: 100,
        disabledZeroVariance: false,
      },
    ])
  ) as HistoricalModelV3Candidate['scaler'];

  return {
    status: 'HISTORICAL_V3_CANDIDATE_FROZEN',
    modelDefinitionId: 'historical_ridge_margin_v3',
    featureDefinitionId: 'historical_source_resilient_feature_v3',
    lambda: 100,
    coefficientOrder: [...HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER],
    coefficients: HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER.map(() => 0),
    scaler,
    trainGameIds: [],
    trainSeasonWeeks: { '2022': [], '2023': [] },
    developmentGames: 1484,
    sourceGapDevelopmentColumnsAllZero: true,
  };
}

function makeFixture(options: { includeAllBulk?: boolean } = {}): {
  input: HistoricalV3PredictiveInputBuildInput;
  gameRows: any[];
  advancedRows: any[];
} {
  const teamNames = teams();
  const knownMissing = new Set<number>(
    HISTORICAL_V3_KNOWN_MISSING_BULK_GAME_IDS as readonly number[]
  );

  const gameRows: any[] = [];
  const advancedRows: any[] = [];

  for (let index = 0; index < GAME_COUNT; index += 1) {
    const gameId =
      index < HISTORICAL_V3_KNOWN_MISSING_BULK_GAME_IDS.length
        ? HISTORICAL_V3_KNOWN_MISSING_BULK_GAME_IDS[index]
        : 500_000_000 + index;
    const week = 1 + (index % 16);
    const homeTeam = teamNames[(2 * index) % TEAM_COUNT];
    const awayTeam = teamNames[(2 * index + 1) % TEAM_COUNT];

    gameRows.push({
      id: gameId,
      season: 2024,
      week,
      seasonType: 'regular',
      completed: true,
      homeClassification: 'fbs',
      awayClassification: 'fbs',
      startDate: `2024-09-${String(1 + (index % 28)).padStart(2, '0')}T12:00:00Z`,
      homeTeam,
      awayTeam,
      neutralSite: index % 13 === 0,
      homePoints: 99,
      awayPoints: 98,
    });

    if (!knownMissing.has(gameId) || options.includeAllBulk) {
      const metricBase = 0.01 * (1 + (index % 20));
      advancedRows.push(
        {
          gameId,
          season: 2024,
          week,
          seasonType: 'regular',
          team: homeTeam,
          opponent: awayTeam,
          offense: { ppa: metricBase + 0.1, successRate: 0.45 },
          defense: { ppa: metricBase - 0.05, successRate: 0.38 },
        },
        {
          gameId,
          season: 2024,
          week,
          seasonType: 'regular',
          team: awayTeam,
          opponent: homeTeam,
          offense: { ppa: metricBase + 0.06, successRate: 0.41 },
          defense: { ppa: metricBase - 0.02, successRate: 0.4 },
        }
      );
    }
  }

  const talentRows = teamNames.map((team, index) => ({
    team,
    talent: 400 + index,
  }));
  const returningProductionRows = teamNames
    .filter((team) => team !== 'Kennesaw State')
    .map((team, index) => ({
      team,
      percentPPA: 40 + (index % 30),
    }));

  const recruitingByYear: Record<number, unknown[]> = {};
  for (const year of [2021, 2022, 2023, 2024]) {
    recruitingByYear[year] = teamNames
      .filter(
        (team) =>
          !(
            year === 2022 &&
            (team === 'Florida International' || team === 'Kennesaw State')
          )
      )
      .map((team, index) => ({
        team,
        points: 100 + (year - 2020) * 10 + index * 0.1,
      }));
  }

  const eloPreseasonRows = teamNames.map((team, index) => ({
    team,
    elo: 1200 + index,
  }));
  const eloByWeek: Record<number, unknown[]> = {};
  for (let week = 1; week <= 15; week += 1) {
    eloByWeek[week] = teamNames.map((team, index) => ({
      team,
      elo: 1200 + index + week,
    }));
  }

  return {
    input: {
      games: gameRows,
      advancedBulkRows: advancedRows,
      talentRows,
      returningProductionRows,
      recruitingByYear,
      eloPreseasonRows,
      eloByWeek,
      candidate: candidate(),
      backcompatStatus: 'HISTORICAL_V3_BACKCOMPAT_PASS',
    },
    gameRows,
    advancedRows,
  };
}

function recoveryRowsForGame(
  fixture: ReturnType<typeof makeFixture>,
  gameId: number
): unknown[] {
  const game = fixture.gameRows.find((row) => row.id === gameId)!;
  return [
    {
      gameId,
      season: 2024,
      week: game.week,
      seasonType: 'regular',
      team: game.homeTeam,
      opponent: game.awayTeam,
      offense: { ppa: 0.2, successRate: 0.44 },
      defense: { ppa: 0.05, successRate: 0.36 },
    },
    {
      gameId,
      season: 2024,
      week: game.week,
      seasonType: 'regular',
      team: game.awayTeam,
      opponent: game.homeTeam,
      offense: { ppa: 0.15, successRate: 0.42 },
      defense: { ppa: 0.08, successRate: 0.39 },
    },
  ];
}

describe('historical V3 2024 predictive input builder', () => {
  it('builds the exact 752-game / 134-team source-resilient universe without outcomes or predictions', () => {
    const fixture = makeFixture();
    const result = buildHistoricalV3PredictiveInputs(fixture.input);

    expect(result.version).toBe('historical_v3_predictive_inputs_v1');
    expect(result.season).toBe(2024);
    expect(result.rows).toHaveLength(752);
    expect(result.qa.canonicalGames).toBe(752);
    expect(result.qa.canonicalTeams).toBe(134);
    expect(result.qa.teamSides).toBe(1504);
    expect(result.qa.modelPredictionsComputed).toBe(false);
    expect(result.qa.outcomeFieldsUsed).toBe(false);
    expect(result.qa.marketReads).toBe(0);
    expect(result.qa.ppaSidecarReads).toBe(0);
    expect(result.qa.portalReads).toBe(0);
    expect(result.qa.holdout2025Reads).toBe(0);
    expect(result.qa.sourceGapFormSides).toBeGreaterThan(0);

    const fiuSide = result.rows
      .flatMap((row) => [row.home, row.away])
      .find((side) => side.team === 'Florida International')!;

    expect(fiuSide.features.recruitY2.status).not.toBe('AVAILABLE');
    expect(fiuSide.standardized.recruitY2).toBe(0);
    expect(fiuSide.missingFlags.recruitY2).toBe(1);

    const serialized = JSON.stringify(result.rows);
    expect(serialized).not.toContain('"homePoints"');
    expect(serialized).not.toContain('"awayPoints"');
    expect(serialized).not.toContain('"prediction"');
  });

  it('distinguishes natural no-prior form from source-history incompleteness', () => {
    const fixture = makeFixture();
    const result = buildHistoricalV3PredictiveInputs(fixture.input);

    const weekOneSides = result.rows
      .filter((row) => row.week === 1)
      .flatMap((row) => [row.home, row.away]);

    expect(weekOneSides.length).toBeGreaterThan(0);
    for (const side of weekOneSides) {
      expect(side.formAudit.priorFbsGames).toBe(0);
      expect(side.missingFlags.formMissing).toBe(1);
      expect(side.missingFlags.formSourceGap).toBe(0);
      expect(side.features.ppaNet.status).toBe('NO_PRIOR_FBS_GAMES');
      expect(side.features.successNet.status).toBe('NO_PRIOR_FBS_GAMES');
    }

    const sourceGapSide = result.rows
      .flatMap((row) => [row.home, row.away])
      .find((side) => side.missingFlags.formSourceGap === 1)!;

    expect(sourceGapSide).toBeDefined();
    expect(sourceGapSide.missingFlags.formMissing).toBe(0);
    expect(sourceGapSide.features.ppaNet.status).toBe(
      'SOURCE_HISTORY_INCOMPLETE'
    );
    expect(sourceGapSide.features.successNet.status).toBe(
      'SOURCE_HISTORY_INCOMPLETE'
    );
    expect(sourceGapSide.standardized.ppaNet).toBe(0);
    expect(sourceGapSide.standardized.successNet).toBe(0);
    expect(sourceGapSide.formAudit.missingAdvancedGames).toBeGreaterThan(0);
  });

  it('accepts exact same-endpoint recovery rows only when the bulk row is absent', () => {
    const fixture = makeFixture();
    const gameId = HISTORICAL_V3_KNOWN_MISSING_BULK_GAME_IDS[0];
    const withoutRecovery = buildHistoricalV3PredictiveInputs(fixture.input);

    const withRecovery = buildHistoricalV3PredictiveInputs({
      ...fixture.input,
      recoveryAdvancedRows: recoveryRowsForGame(fixture, gameId),
    });

    expect(withRecovery.qa.recoveryRowsAccepted).toBe(2);
    expect(withRecovery.qa.recoveryRowsSupplied).toBe(2);
    expect(withRecovery.qa.sourceGapFormSides).toBeLessThan(
      withoutRecovery.qa.sourceGapFormSides
    );
  });

  it('refuses a recovery row that would overwrite a full-season bulk row', () => {
    const fixture = makeFixture({ includeAllBulk: true });
    const gameId = HISTORICAL_V3_KNOWN_MISSING_BULK_GAME_IDS[0];

    expect(() =>
      buildHistoricalV3PredictiveInputs({
        ...fixture.input,
        recoveryAdvancedRows: recoveryRowsForGame(fixture, gameId),
      })
    ).toThrow(/v3_predictive_recovery_overwrite_forbidden/);
  });

  it('fails closed when required talent is unavailable', () => {
    const fixture = makeFixture();
    fixture.input.talentRows = (fixture.input.talentRows as any[]).filter(
      (row) => row.team !== 'Florida International'
    );

    expect(() => buildHistoricalV3PredictiveInputs(fixture.input)).toThrow(
      /v3_predictive_required_talent_missing/
    );
  });

  it('fails closed when the V3 backcompat gate is not PASS', () => {
    const fixture = makeFixture();
    fixture.input.backcompatStatus = 'HISTORICAL_V3_BACKCOMPAT_FAILED';

    expect(() => buildHistoricalV3PredictiveInputs(fixture.input)).toThrow(
      /v3_predictive_backcompat_not_pass/
    );
  });
});
