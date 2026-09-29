import {
  HISTORICAL_V3_RECOVERY_GAME_IDS,
  HISTORICAL_V3_WEEK_QUERY_TOLERANCE,
  buildHistoricalV3QualificationRequests,
  buildHistoricalV3RecoveryRequests,
  collectHistoricalV3RecoveryRows,
  compareHistoricalV3QualificationGame,
  selectHistoricalV3CalibrationGames,
  summarizeHistoricalV3Qualification,
} from '../src/research/historical-v3-week-query-resolution';

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

function rawRow(
  season: number,
  gameId: number,
  week: number,
  team: string,
  opponent: string,
  offset = 0
) {
  return {
    season,
    seasonType: 'regular',
    gameId,
    week,
    team,
    opponent,
    offense: { ppa: 0.21 + offset, successRate: 0.47 + offset },
    defense: { ppa: -0.08 + offset, successRate: 0.39 + offset },
  };
}

function wrappedBulk(
  season: 2022 | 2023,
  gameId: number,
  week: number,
  homeTeam: string,
  awayTeam: string
) {
  return [
    {
      season,
      gameId,
      week,
      team: homeTeam,
      row: rawRow(season, gameId, week, homeTeam, awayTeam),
    },
    {
      season,
      gameId,
      week,
      team: awayTeam,
      row: rawRow(season, gameId, week, awayTeam, homeTeam),
    },
  ];
}

function recoveryGames() {
  return [
    {
      id: HISTORICAL_V3_RECOVERY_GAME_IDS[0],
      season: 2024,
      week: 4,
      seasonType: 'regular',
      completed: true,
      homeClassification: 'fbs',
      awayClassification: 'fbs',
      homeTeam: 'NMSU',
      awayTeam: 'Sam Houston',
    },
    {
      id: HISTORICAL_V3_RECOVERY_GAME_IDS[1],
      season: 2024,
      week: 4,
      seasonType: 'regular',
      completed: true,
      homeClassification: 'fbs',
      awayClassification: 'fbs',
      homeTeam: 'Rice',
      awayTeam: 'Army',
    },
    {
      id: HISTORICAL_V3_RECOVERY_GAME_IDS[2],
      season: 2024,
      week: 12,
      seasonType: 'regular',
      completed: true,
      homeClassification: 'fbs',
      awayClassification: 'fbs',
      homeTeam: 'Kent State',
      awayTeam: 'Miami (OH)',
    },
    {
      id: HISTORICAL_V3_RECOVERY_GAME_IDS[3],
      season: 2024,
      week: 14,
      seasonType: 'regular',
      completed: true,
      homeClassification: 'fbs',
      awayClassification: 'fbs',
      homeTeam: 'Eastern Michigan',
      awayTeam: 'Western Michigan',
    },
  ];
}

describe('historical V3 same-endpoint week query resolution', () => {
  it('selects the exact deterministic eight-game cohort and eight qualification requests', () => {
    const games = selectHistoricalV3CalibrationGames(frames);
    expect(games).toHaveLength(8);
    expect(games[0]).toMatchObject({
      season: 2022,
      week: 1,
      gameId: 11,
      homeTeam: 'C',
      awayTeam: 'D',
    });

    const requests = buildHistoricalV3QualificationRequests(games);
    expect(requests).toHaveLength(8);
    expect(
      requests.every(
        (entry) =>
          entry.endpoint === '/stats/game/advanced' &&
          entry.query.seasonType === 'regular'
      )
    ).toBe(true);
  });

  it('qualifies only when every scalar matches within 1e-12', () => {
    const games = selectHistoricalV3CalibrationGames(frames);
    const qualifications = games.map((game) => {
      const bulk = wrappedBulk(
        game.season,
        game.gameId,
        game.week,
        game.homeTeam,
        game.awayTeam
      );
      const payload = [
        rawRow(
          game.season,
          game.gameId,
          game.week,
          game.homeTeam,
          game.awayTeam
        ),
        rawRow(
          game.season,
          game.gameId,
          game.week,
          game.awayTeam,
          game.homeTeam
        ),
      ];
      return compareHistoricalV3QualificationGame(bulk, payload, game);
    });

    const summary = summarizeHistoricalV3Qualification(qualifications);
    expect(summary.status).toBe('HISTORICAL_V3_WEEK_QUERY_QUALIFIED');
    expect(summary.scalarComparisons).toBe(64);
    expect(summary.passingComparisons).toBe(64);
    expect(summary.maxAbsoluteDifference).toBe(0);
    expect(buildHistoricalV3RecoveryRequests(summary.status)).toHaveLength(3);
  });

  it('rejects qualification when one scalar drifts above the frozen tolerance and plans zero recovery calls', () => {
    const games = selectHistoricalV3CalibrationGames(frames);
    const qualifications = games.map((game, index) => {
      const bulk = wrappedBulk(
        game.season,
        game.gameId,
        game.week,
        game.homeTeam,
        game.awayTeam
      );
      const payload = [
        rawRow(
          game.season,
          game.gameId,
          game.week,
          game.homeTeam,
          game.awayTeam,
          index === 0 ? HISTORICAL_V3_WEEK_QUERY_TOLERANCE * 2 : 0
        ),
        rawRow(
          game.season,
          game.gameId,
          game.week,
          game.awayTeam,
          game.homeTeam
        ),
      ];
      return compareHistoricalV3QualificationGame(bulk, payload, game);
    });

    const summary = summarizeHistoricalV3Qualification(qualifications);
    expect(summary.status).toBe('HISTORICAL_V3_WEEK_QUERY_REJECTED');
    expect(summary.passingComparisons).toBeLessThan(64);
    expect(buildHistoricalV3RecoveryRequests(summary.status)).toEqual([]);
  });

  it('treats missing or malformed selected week rows as qualification rejection rather than data repair', () => {
    const game = selectHistoricalV3CalibrationGames(frames)[0];
    const bulk = wrappedBulk(
      game.season,
      game.gameId,
      game.week,
      game.homeTeam,
      game.awayTeam
    );
    const result = compareHistoricalV3QualificationGame(
      bulk,
      [
        rawRow(
          game.season,
          game.gameId,
          game.week,
          game.homeTeam,
          game.awayTeam
        ),
      ],
      game
    );

    expect(result.pass).toBe(false);
    expect(result.findings).toContain(
      `week_scoped_team_missing:${game.awayTeam}`
    );
  });

  it('accepts partial recovery without turning it into a blocker', () => {
    const games = recoveryGames();
    const first = games[0];
    const recovery = collectHistoricalV3RecoveryRows({
      qualificationStatus: 'HISTORICAL_V3_WEEK_QUERY_QUALIFIED',
      gamesRows: games,
      fullSeasonBulkRows: [],
      weekPayloads: {
        4: [
          rawRow(
            2024,
            first.id,
            first.week,
            first.homeTeam,
            first.awayTeam
          ),
          rawRow(
            2024,
            first.id,
            first.week,
            first.awayTeam,
            first.homeTeam
          ),
        ],
        12: [],
        14: [],
      },
    });

    expect(recovery.recoveryAttempted).toBe(true);
    expect(recovery.recoveryCompleteness).toBe('PARTIAL');
    expect(recovery.acceptedRows).toHaveLength(2);
    expect(recovery.recoveredGameIds).toEqual([first.id]);
    expect(recovery.unresolvedGameIds).toHaveLength(3);
    expect(recovery.acceptedRows[0].sourceProvenance).toBe(
      'BULK_ADVANCED_WEEK_SCOPED_RECOVERY'
    );
  });

  it('makes zero recovery attempt after qualification rejection', () => {
    const recovery = collectHistoricalV3RecoveryRows({
      qualificationStatus: 'HISTORICAL_V3_WEEK_QUERY_REJECTED',
      gamesRows: recoveryGames(),
      fullSeasonBulkRows: [],
      weekPayloads: {},
    });

    expect(recovery.recoveryAttempted).toBe(false);
    expect(recovery.recoveryCompleteness).toBe('NOT_ATTEMPTED');
    expect(recovery.acceptedRows).toEqual([]);
    expect(recovery.unresolvedGameIds).toHaveLength(4);
  });

  it('refuses to overwrite a full-season bulk row', () => {
    const games = recoveryGames();
    const first = games[0];

    expect(() =>
      collectHistoricalV3RecoveryRows({
        qualificationStatus: 'HISTORICAL_V3_WEEK_QUERY_QUALIFIED',
        gamesRows: games,
        fullSeasonBulkRows: [
          rawRow(
            2024,
            first.id,
            first.week,
            first.homeTeam,
            first.awayTeam
          ),
        ],
        weekPayloads: {
          4: [
            rawRow(
              2024,
              first.id,
              first.week,
              first.homeTeam,
              first.awayTeam
            ),
          ],
          12: [],
          14: [],
        },
      })
    ).toThrow(/v3_week_query_recovery_overwrite_forbidden/);
  });
});
