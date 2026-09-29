import {
  HISTORICAL_MODEL_V3_FULL_COEFFICIENT_ORDER,
  type HistoricalModelV3Candidate,
} from '../src/research/historical-model-v3';
import {
  evaluateHistoricalFinalHoldoutRequiredInputs,
  type HistoricalFinalHoldoutRequiredInputPreflightInput,
} from '../src/research/historical-final-holdout-v1-preflight';

const TEAM_COUNT = 136;
const GAME_COUNT = 762;

function teams(): string[] {
  return [
    'Air Force',
    'Navy',
    'UNLV',
    ...Array.from({ length: TEAM_COUNT - 3 }, (_, index) =>
      `Team ${String(index + 3).padStart(3, '0')}`
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

function fixture(): HistoricalFinalHoldoutRequiredInputPreflightInput {
  const names = teams();
  const games: any[] = [];

  for (let index = 0; index < GAME_COUNT; index += 1) {
    const homeTeam = names[(2 * index) % TEAM_COUNT];
    const awayTeam = names[(2 * index + 1) % TEAM_COUNT];
    games.push({
      id: 600_000_000 + index,
      season: 2025,
      week: 1 + (index % 16),
      seasonType: 'regular',
      completed: true,
      homeClassification: 'fbs',
      awayClassification: 'fbs',
      homeTeam,
      awayTeam,
      neutralSite: index % 17 === 0,
      homePoints: 99,
      awayPoints: 98,
    });
  }

  const talentRows = names.map((team, index) => ({
    team,
    talent: 500 + index,
  }));
  const eloPreseasonRows = names.map((team, index) => ({
    team,
    elo: 1300 + index,
  }));
  const eloByWeek: Record<number, unknown[]> = {};
  for (let week = 1; week <= 15; week += 1) {
    eloByWeek[week] = names.map((team, index) => ({
      team,
      elo: 1300 + index + week,
    }));
  }

  return {
    games,
    talentRows,
    eloPreseasonRows,
    eloByWeek,
    candidate: candidate(),
    backcompatStatus: 'HISTORICAL_V3_BACKCOMPAT_PASS',
  };
}

describe('Historical Final Holdout V1 required-input preflight', () => {
  it('clears when the exact 762-game / 136-team universe has all required talent and PIT Elo', () => {
    const result = evaluateHistoricalFinalHoldoutRequiredInputs(fixture());

    expect(result.status).toBe(
      'HISTORICAL_FINAL_HOLDOUT_REQUIRED_FEATURE_PREFLIGHT_CLEAR'
    );
    expect(result.canonicalGames).toBe(762);
    expect(result.canonicalTeams).toBe(136);
    expect(result.teamSides).toBe(1524);
    expect(result.blockers).toEqual([]);
    expect(result.missingTalentTeams).toEqual([]);
    expect(result.missingEloSides).toEqual([]);
    expect(result.outcomeFieldsUsed).toBe(false);
    expect(result.modelPredictionsComputed).toBe(false);
    expect(result.providerCalls).toBe(0);
    expect(result.marketReads).toBe(0);
    expect(result.databaseReads).toBe(false);
    expect(result.databaseWrites).toBe(false);
  });

  it('blocks on missing required talent without inventing a holdout-era repair', () => {
    const input = fixture();
    input.talentRows = (input.talentRows as any[]).filter(
      (row) => row.team !== 'Air Force' && row.team !== 'Navy'
    );

    const result = evaluateHistoricalFinalHoldoutRequiredInputs(input);

    expect(result.status).toBe('HISTORICAL_FINAL_HOLDOUT_INPUT_BLOCKED');
    expect(result.missingTalentTeams).toEqual(['Air Force', 'Navy']);
    expect(result.missingTalentSides).toBeGreaterThan(0);
    expect(result.blockers).toContain('required_talent_missing:Air Force');
    expect(result.blockers).toContain('required_talent_missing:Navy');
    expect(result.modelPredictionsComputed).toBe(false);
    expect(result.outcomeFieldsUsed).toBe(false);
  });

  it('blocks when missing preseason Elo is required by a Week 1 canonical side', () => {
    const input = fixture();
    const unlvGame = (input.games as any[]).find(
      (game) => game.homeTeam === 'UNLV' || game.awayTeam === 'UNLV'
    );
    expect(unlvGame).toBeDefined();
    unlvGame.week = 1;
    input.eloPreseasonRows = (input.eloPreseasonRows as any[]).filter(
      (row) => row.team !== 'UNLV'
    );

    const result = evaluateHistoricalFinalHoldoutRequiredInputs(input);

    const unlvWeekOne = result.missingEloSides.filter(
      (row) => row.team === 'UNLV' && row.week === 1
    );
    expect(unlvWeekOne.length).toBeGreaterThan(0);
    expect(
      unlvWeekOne.every((row) => row.requiredSource === 'PRESEASON')
    ).toBe(true);
    expect(result.status).toBe('HISTORICAL_FINAL_HOLDOUT_INPUT_BLOCKED');
  });

  it('does not require preseason Elo for a team whose first canonical target is after Week 1', () => {
    const input = fixture();
    const games = input.games as any[];

    for (const game of games) {
      if (
        game.week === 1 &&
        (game.homeTeam === 'UNLV' || game.awayTeam === 'UNLV')
      ) {
        game.week = 2;
      }
    }
    input.eloPreseasonRows = (input.eloPreseasonRows as any[]).filter(
      (row) => row.team !== 'UNLV'
    );

    const result = evaluateHistoricalFinalHoldoutRequiredInputs(input);

    expect(result.missingEloSides.filter((row) => row.team === 'UNLV')).toEqual(
      []
    );
    expect(result.status).toBe(
      'HISTORICAL_FINAL_HOLDOUT_REQUIRED_FEATURE_PREFLIGHT_CLEAR'
    );
  });

  it('is invariant to final score fields', () => {
    const first = fixture();
    const second = fixture();

    for (const game of second.games as any[]) {
      game.homePoints = game.homePoints + 37;
      game.awayPoints = game.awayPoints - 19;
      game.homeScore = 1234;
      game.awayScore = -99;
    }

    expect(evaluateHistoricalFinalHoldoutRequiredInputs(second)).toEqual(
      evaluateHistoricalFinalHoldoutRequiredInputs(first)
    );
  });

  it('blocks on a canonical-universe count mismatch without producing predictions', () => {
    const input = fixture();
    (input.games as any[]).pop();

    const result = evaluateHistoricalFinalHoldoutRequiredInputs(input);

    expect(result.status).toBe('HISTORICAL_FINAL_HOLDOUT_INPUT_BLOCKED');
    expect(
      result.blockers.some((entry) =>
        entry.startsWith('canonical_game_count_mismatch:')
      )
    ).toBe(true);
    expect(result.modelPredictionsComputed).toBe(false);
  });

  it('fails closed when the frozen V3 backcompat prerequisite is not PASS', () => {
    const input = fixture();
    input.backcompatStatus = 'HISTORICAL_V3_BACKCOMPAT_FAILED';

    expect(() => evaluateHistoricalFinalHoldoutRequiredInputs(input)).toThrow(
      /final_holdout_v1_backcompat_not_pass/
    );
  });
});
