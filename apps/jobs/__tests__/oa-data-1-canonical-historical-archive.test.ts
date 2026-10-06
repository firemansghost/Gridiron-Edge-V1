import {
  buildCanonicalSeasonRows,
  buildOaData1Archive,
  type OaData1AdvancedRow,
  type OaData1GameRow,
  type OaData1SourceMeta,
} from '../src/research/oa-data-1-canonical-historical-archive';

const source: OaData1SourceMeta = {
  season: 2024,
  artifactId: 11008470975,
  artifactZipSha256:
    'b41e934b26952100e7e056a56114dc81df6bbe77f5c787f28b75b646ae7ea544',
  sourceEndpoint: '/stats/game/advanced',
  sourceRawMember: 'raw/003-advanced-game-stats.json',
};

function game(id = 1): OaData1GameRow {
  return {
    id,
    season: 2024,
    week: 4,
    seasonType: 'regular',
    startDate: '2024-09-21T12:00:00.000Z',
    completed: true,
    neutralSite: false,
    homeTeam: 'Home Team',
    awayTeam: 'Away Team',
    homeClassification: 'fbs',
    awayClassification: 'fbs',
  };
}

function advanced(
  gameId: number,
  team: string,
  opponent: string,
  values = { ppaOff: 0.2, ppaDef: -0.1, successOff: 0.45, successDef: 0.37 }
): OaData1AdvancedRow {
  return {
    gameId,
    season: 2024,
    seasonType: 'regular',
    week: 4,
    team,
    opponent,
    offense: {
      ppa: values.ppaOff,
      successRate: values.successOff,
    },
    defense: {
      ppa: values.ppaDef,
      successRate: values.successDef,
    },
  };
}

describe('OA-DATA-1 canonical historical archive planner', () => {
  it('builds exact HOME and AWAY rows from canonical game orientation without provider homeAway', () => {
    const built = buildCanonicalSeasonRows({
      season: 2024,
      games: [game()],
      advancedRows: [
        advanced(1, 'Home Team', 'Away Team'),
        advanced(1, 'Away Team', 'Home Team', {
          ppaOff: -0.05,
          ppaDef: 0.11,
          successOff: 0.38,
          successDef: 0.44,
        }),
      ],
      source,
    });

    expect(built.canonicalGames).toBe(1);
    expect(built.rows).toHaveLength(2);
    expect(built.gaps).toEqual([]);

    expect(built.rows[0]).toMatchObject({
      providerGameId: 1,
      team: 'Home Team',
      opponent: 'Away Team',
      isHome: true,
      status: 'AVAILABLE',
      sourceMethod: 'DIRECT_PROVIDER_ROW',
    });
    expect(built.rows[1]).toMatchObject({
      providerGameId: 1,
      team: 'Away Team',
      opponent: 'Home Team',
      isHome: false,
      status: 'AVAILABLE',
      sourceMethod: 'DIRECT_PROVIDER_ROW',
    });
  });

  it('keeps both canonical sides and emits explicit null SOURCE_UNAVAILABLE rows when a whole game is absent', () => {
    const built = buildCanonicalSeasonRows({
      season: 2024,
      games: [game(401641034)],
      advancedRows: [],
      source,
    });

    expect(built.rows).toHaveLength(2);
    expect(built.gaps).toHaveLength(2);
    expect(
      built.rows.every(
        (row) =>
          row.status === 'SOURCE_UNAVAILABLE' &&
          row.sourceMethod === 'SOURCE_UNAVAILABLE' &&
          row.ppaOff === null &&
          row.ppaDef === null &&
          row.successOff === null &&
          row.successDef === null
      )
    ).toBe(true);
    expect(built.rows.filter((row) => row.isHome)).toHaveLength(1);
    expect(built.rows.filter((row) => !row.isHome)).toHaveLength(1);
  });

  it('fails closed on provider team/opponent orientation mismatch', () => {
    expect(() =>
      buildCanonicalSeasonRows({
        season: 2024,
        games: [game()],
        advancedRows: [
          advanced(1, 'Home Team', 'Wrong Opponent'),
          advanced(1, 'Away Team', 'Home Team'),
        ],
        source,
      })
    ).toThrow('oa_data_1_advanced_orientation_mismatch');
  });

  it('fails closed on duplicate provider game/team rows', () => {
    const row = advanced(1, 'Home Team', 'Away Team');
    expect(() =>
      buildCanonicalSeasonRows({
        season: 2024,
        games: [game()],
        advancedRows: [
          row,
          { ...row },
          advanced(1, 'Away Team', 'Home Team'),
        ],
        source,
      })
    ).toThrow('oa_data_1_duplicate_advanced_keys');
  });

  it('fails closed when an available provider row has a non-finite selected metric', () => {
    expect(() =>
      buildCanonicalSeasonRows({
        season: 2024,
        games: [game()],
        advancedRows: [
          advanced(1, 'Home Team', 'Away Team', {
            ppaOff: Number.NaN,
            ppaDef: -0.1,
            successOff: 0.45,
            successDef: 0.37,
          }),
          advanced(1, 'Away Team', 'Home Team'),
        ],
        source,
      })
    ).toThrow('oa_data_1_nonfinite_selected_metric');
  });

  it('excludes noncanonical games rather than widening the historical universe', () => {
    const nonFbs: OaData1GameRow = {
      ...game(2),
      awayClassification: 'fcs',
      awayTeam: 'FCS Team',
    };
    const incomplete: OaData1GameRow = {
      ...game(3),
      completed: false,
    };

    const built = buildCanonicalSeasonRows({
      season: 2024,
      games: [game(1), nonFbs, incomplete],
      advancedRows: [
        advanced(1, 'Home Team', 'Away Team'),
        advanced(1, 'Away Team', 'Home Team'),
      ],
      source,
    });

    expect(built.canonicalGames).toBe(1);
    expect(built.rows).toHaveLength(2);
  });

  it('requires one build for each frozen season before forming the combined archive', () => {
    const built2024 = buildCanonicalSeasonRows({
      season: 2024,
      games: [game()],
      advancedRows: [
        advanced(1, 'Home Team', 'Away Team'),
        advanced(1, 'Away Team', 'Home Team'),
      ],
      source,
    });

    expect(() => buildOaData1Archive([built2024])).toThrow(
      'oa_data_1_missing_season:2022'
    );
  });
});
