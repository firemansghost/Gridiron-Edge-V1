import {
  HISTORICAL_V2_RECOVERY_GAME_IDS,
  HISTORICAL_V2_SOURCE_EQUIVALENCE_TOLERANCE,
  bulkAdvancedMetricsForCalibrationGame,
  compareHistoricalV2GameEquivalence,
  parseAdvancedBoxCandidateMetrics,
  recoveredAdvancedRowsFromBox,
  selectHistoricalV2CalibrationGames,
} from '../src/research/historical-source-resolution-v2';

describe('historical source resolution v2', () => {
  const frames = [
    { season: 2022, gameId: 22, week: 1, homeTeam: 'A', awayTeam: 'B' },
    { season: 2022, gameId: 11, week: 1, homeTeam: 'C', awayTeam: 'D' },
    { season: 2022, gameId: 61, week: 6, homeTeam: 'E', awayTeam: 'F' },
    { season: 2022, gameId: 121, week: 12, homeTeam: 'G', awayTeam: 'H' },
    { season: 2022, gameId: 151, week: 15, homeTeam: 'I', awayTeam: 'J' },
    { season: 2023, gameId: 31, week: 1, homeTeam: 'K', awayTeam: 'L' },
    { season: 2023, gameId: 62, week: 6, homeTeam: 'M', awayTeam: 'N' },
    { season: 2023, gameId: 122, week: 12, homeTeam: 'O', awayTeam: 'P' },
    { season: 2023, gameId: 152, week: 15, homeTeam: 'Q', awayTeam: 'R' },
  ];

  it('selects the frozen deterministic calibration cohort', () => {
    expect(selectHistoricalV2CalibrationGames(frames)).toEqual([
      {
        season: 2022,
        gameId: 11,
        week: 1,
        bucket: 'W1',
        homeTeam: 'C',
        awayTeam: 'D',
      },
      {
        season: 2022,
        gameId: 61,
        week: 6,
        bucket: 'W6',
        homeTeam: 'E',
        awayTeam: 'F',
      },
      {
        season: 2022,
        gameId: 121,
        week: 12,
        bucket: 'W12',
        homeTeam: 'G',
        awayTeam: 'H',
      },
      {
        season: 2022,
        gameId: 151,
        week: 15,
        bucket: 'FINAL',
        homeTeam: 'I',
        awayTeam: 'J',
      },
      {
        season: 2023,
        gameId: 31,
        week: 1,
        bucket: 'W1',
        homeTeam: 'K',
        awayTeam: 'L',
      },
      {
        season: 2023,
        gameId: 62,
        week: 6,
        bucket: 'W6',
        homeTeam: 'M',
        awayTeam: 'N',
      },
      {
        season: 2023,
        gameId: 122,
        week: 12,
        bucket: 'W12',
        homeTeam: 'O',
        awayTeam: 'P',
      },
      {
        season: 2023,
        gameId: 152,
        week: 15,
        bucket: 'FINAL',
        homeTeam: 'Q',
        awayTeam: 'R',
      },
    ]);
  });

  it('maps advanced-box PPA and success rates into candidate offense/defense metrics', () => {
    const game = {
      season: 2022 as const,
      gameId: 11,
      week: 1,
      bucket: 'W1' as const,
      homeTeam: 'C',
      awayTeam: 'D',
    };
    const box = {
      gameInfo: { id: 11 },
      teams: {
        ppa: [
          { team: 'C', overall: { total: 0.21 } },
          { team: 'D', overall: { total: -0.08 } },
        ],
        successRates: [
          { team: 'C', overall: { total: 0.47 } },
          { team: 'D', overall: { total: 0.39 } },
        ],
      },
      players: {},
    };

    expect(parseAdvancedBoxCandidateMetrics(box, game)).toEqual(
      new Map([
        [
          'C',
          {
            team: 'C',
            opponent: 'D',
            offensePpa: 0.21,
            defensePpa: -0.08,
            offenseSuccessRate: 0.47,
            defenseSuccessRate: 0.39,
          },
        ],
        [
          'D',
          {
            team: 'D',
            opponent: 'C',
            offensePpa: -0.08,
            defensePpa: 0.21,
            offenseSuccessRate: 0.39,
            defenseSuccessRate: 0.47,
          },
        ],
      ])
    );
  });

  it('passes only exact-within-tolerance bulk equivalence', () => {
    const game = {
      season: 2022 as const,
      gameId: 11,
      week: 1,
      bucket: 'W1' as const,
      homeTeam: 'C',
      awayTeam: 'D',
    };
    const advancedHistory = [
      {
        season: 2022,
        week: 1,
        gameId: 11,
        team: 'C',
        row: {
          team: 'C',
          opponent: 'D',
          offense: { ppa: 0.21, successRate: 0.47 },
          defense: { ppa: -0.08, successRate: 0.39 },
        },
      },
      {
        season: 2022,
        week: 1,
        gameId: 11,
        team: 'D',
        row: {
          team: 'D',
          opponent: 'C',
          offense: { ppa: -0.08, successRate: 0.39 },
          defense: { ppa: 0.21, successRate: 0.47 },
        },
      },
    ];
    const box = {
      teams: {
        ppa: [
          { team: 'C', overall: { total: 0.21 } },
          { team: 'D', overall: { total: -0.08 } },
        ],
        success_rates: [
          { team: 'C', overall: { total: 0.47 } },
          { team: 'D', overall: { total: 0.39 } },
        ],
      },
    };

    const bulk = bulkAdvancedMetricsForCalibrationGame(advancedHistory, game);
    const fallback = parseAdvancedBoxCandidateMetrics(box, game);
    const pass = compareHistoricalV2GameEquivalence(game, bulk, fallback);
    expect(pass.pass).toBe(true);
    expect(pass.maxAbsoluteDifference).toBe(0);

    const changed = parseAdvancedBoxCandidateMetrics(
      {
        teams: {
          ppa: [
            { team: 'C', overall: { total: 0.21 + 2e-9 } },
            { team: 'D', overall: { total: -0.08 } },
          ],
          successRates: [
            { team: 'C', overall: { total: 0.47 } },
            { team: 'D', overall: { total: 0.39 } },
          ],
        },
      },
      game
    );
    const fail = compareHistoricalV2GameEquivalence(game, bulk, changed);
    expect(fail.pass).toBe(false);
    expect(fail.maxAbsoluteDifference).toBeGreaterThan(
      HISTORICAL_V2_SOURCE_EQUIVALENCE_TOLERANCE
    );
  });

  it('emits only minimal recovered advanced fields plus source provenance', () => {
    const rows = recoveredAdvancedRowsFromBox(
      {
        gameInfo: { gameId: HISTORICAL_V2_RECOVERY_GAME_IDS[0] },
        teams: {
          ppa: [
            { team: 'Home', overall: { total: 0.4 } },
            { team: 'Away', overall: { total: -0.2 } },
          ],
          successRates: [
            { team: 'Home', overall: { total: 0.51 } },
            { team: 'Away', overall: { total: 0.37 } },
          ],
        },
      },
      {
        season: 2024,
        gameId: HISTORICAL_V2_RECOVERY_GAME_IDS[0],
        week: 4,
        homeTeam: 'Home',
        awayTeam: 'Away',
      }
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      gameId: HISTORICAL_V2_RECOVERY_GAME_IDS[0],
      season: 2024,
      seasonType: 'regular',
      week: 4,
      team: 'Home',
      opponent: 'Away',
      offense: { ppa: 0.4, successRate: 0.51 },
      defense: { ppa: -0.2, successRate: 0.37 },
      sourceProvenance: 'ADVANCED_BOX_EQUIVALENT_FALLBACK',
    });
  });

  it('fails closed on ambiguous or incomplete advanced-box team metrics', () => {
    expect(() =>
      parseAdvancedBoxCandidateMetrics(
        {
          teams: {
            ppa: [{ team: 'C', overall: { total: 0.2 } }],
            successRates: [
              { team: 'C', overall: { total: 0.4 } },
              { team: 'D', overall: { total: 0.3 } },
            ],
          },
        },
        { gameId: 11, homeTeam: 'C', awayTeam: 'D' }
      )
    ).toThrow(/advanced_box_missing_ppa_team/);
  });
});
