import * as fs from 'fs';
import * as path from 'path';
import {
  buildHistoricalFeatureV1,
  type HistoricalFeatureV1Input,
} from '../src/research/historical-feature-v1';

type AnyRow = Record<string, any>;

function seasonTeams(season: 2022 | 2023, count: number): string[] {
  const teams = Array.from(
    { length: count },
    (_, index) => `Team ${season} ${String(index + 1).padStart(3, '0')}`
  );
  if (season === 2022) {
    teams[0] = 'James Madison';
    teams[1] = 'Florida International';
  } else {
    teams[0] = 'Jacksonville State';
    teams[1] = 'Sam Houston';
    teams[2] = 'Florida International';
  }
  return teams;
}

function makeSeason(
  season: 2022 | 2023,
  gameCount: number,
  teamCount: number,
  extraFcsRows: number
): {
  gameFrames: AnyRow[];
  staticPriors: AnyRow[];
  advancedHistory: AnyRow[];
  historyEligibility: AnyRow[];
} {
  const teams = seasonTeams(season, teamCount);
  const gameFrames: AnyRow[] = [];
  const advancedHistory: AnyRow[] = [];
  const canonicalRowsByTeam = new Map<string, AnyRow[]>();

  const gamesPerWeek = Math.ceil(gameCount / 15);

  for (let index = 0; index < gameCount; index += 1) {
    const gameId = season * 1_000_000 + index + 1;
    const week = Math.min(15, Math.floor(index / gamesPerWeek) + 1);
    const homeIndex = (index * 2) % teamCount;
    let awayIndex = (homeIndex + 1 + Math.floor(index / teamCount)) % teamCount;
    if (awayIndex === homeIndex) awayIndex = (awayIndex + 1) % teamCount;
    const homeTeam = teams[homeIndex];
    const awayTeam = teams[awayIndex];

    gameFrames.push({
      season,
      gameId,
      week,
      startDate: `${season}-09-${String(((index % 28) + 1)).padStart(
        2,
        '0'
      )}T12:00:00.000Z`,
      homeTeam,
      awayTeam,
      neutralSite: index % 25 === 0,
      homeElo: {
        status: 'AVAILABLE',
        value: 1400 + homeIndex + week,
        sourceRequestId:
          week === 1 ? 'elo-preseason' : `elo-week-${String(week - 1).padStart(2, '0')}`,
        sourceWeek: week === 1 ? null : week - 1,
        row: { year: season, team: homeTeam, elo: 1400 + homeIndex + week },
      },
      awayElo: {
        status: 'AVAILABLE',
        value: 1400 + awayIndex + week,
        sourceRequestId:
          week === 1 ? 'elo-preseason' : `elo-week-${String(week - 1).padStart(2, '0')}`,
        sourceWeek: week === 1 ? null : week - 1,
        row: { year: season, team: awayTeam, elo: 1400 + awayIndex + week },
      },
    });

    for (const [team, opponent, sign] of [
      [homeTeam, awayTeam, 1],
      [awayTeam, homeTeam, -1],
    ] as const) {
      const rowId = `advanced:${season}:${gameId}:${team}`;
      const history = {
        rowId,
        season,
        week,
        gameId,
        team,
        row: {
          gameId,
          season,
          seasonType: 'regular',
          week,
          team,
          opponent,
          offense: {
            ppa: sign * (0.05 + (index % 10) / 100),
            successRate: 0.4 + (index % 10) / 100,
            explosiveness: 1.1 + (index % 5) / 10,
          },
          defense: {
            ppa: -sign * (0.03 + (index % 7) / 100),
            successRate: 0.38 + (index % 8) / 100,
            explosiveness: 1.0 + (index % 4) / 10,
          },
        },
      };
      advancedHistory.push(history);
      const list = canonicalRowsByTeam.get(team) ?? [];
      list.push(history);
      canonicalRowsByTeam.set(team, list);
    }
  }

  const fcsRowsByTeam = new Map<string, AnyRow[]>();
  for (let index = 0; index < extraFcsRows; index += 1) {
    const team = teams[index % teamCount];
    const week = (index % 5) + 1;
    const gameId = season * 1_000_000 + 900_000 + index;
    const rowId = `advanced:${season}:${gameId}:${team}`;
    const row = {
      rowId,
      season,
      week,
      gameId,
      team,
      row: {
        gameId,
        season,
        seasonType: 'regular',
        week,
        team,
        opponent: `Synthetic FCS ${index}`,
        offense: { ppa: 9.9, successRate: 0.99 },
        defense: { ppa: -9.9, successRate: 0.01 },
      },
    };
    advancedHistory.push(row);
    const list = fcsRowsByTeam.get(team) ?? [];
    list.push(row);
    fcsRowsByTeam.set(team, list);
  }

  const historyEligibility = gameFrames.map((frame) => {
    const refsFor = (team: string): string[] => {
      const canonical = (canonicalRowsByTeam.get(team) ?? [])
        .filter((row) => row.week < frame.week)
        .map((row) => row.rowId);
      const fcs = (fcsRowsByTeam.get(team) ?? [])
        .filter((row) => row.week < frame.week)
        .map((row) => row.rowId);
      return [...canonical, ...fcs];
    };

    return {
      season,
      gameId: frame.gameId,
      week: frame.week,
      historyCutoffWeekExclusive: frame.week,
      homeTeam: frame.homeTeam,
      awayTeam: frame.awayTeam,
      homeAdvancedRowIds: refsFor(frame.homeTeam),
      awayAdvancedRowIds: refsFor(frame.awayTeam),
      homePpaRowIds: [],
      awayPpaRowIds: [],
    };
  });

  const returningMissing =
    season === 2022
      ? new Set(['James Madison'])
      : new Set(['Jacksonville State', 'Sam Houston']);

  const staticPriors = teams.map((team, index) => {
    const recruiting = [];
    for (let year = season - 3; year <= season; year += 1) {
      const missing = year === 2022 && team === 'Florida International';
      recruiting.push({
        year,
        status: missing ? 'SOURCE_ROW_UNAVAILABLE' : 'AVAILABLE',
        row: missing
          ? null
          : {
              year,
              team,
              rank: index + 1,
              points: 100 + index + (year - (season - 3)) * 5,
            },
      });
    }

    return {
      season,
      team,
      talent: {
        status: 'AVAILABLE',
        row: {
          year: season,
          team,
          talent: index === teamCount - 1 ? 0 : 500 + index,
        },
      },
      returningProduction: returningMissing.has(team)
        ? { status: 'SOURCE_ROW_UNAVAILABLE', row: null }
        : {
            status: 'AVAILABLE',
            row: {
              season,
              team,
              percentPPA: 0.45 + (index % 20) / 100,
              percentPassingPPA: 0.5,
              percentRushingPPA: 0.5,
            },
          },
      recruiting,
    };
  });

  return { gameFrames, staticPriors, advancedHistory, historyEligibility };
}

function makeInput(): HistoricalFeatureV1Input {
  const season2022 = makeSeason(2022, 734, 131, 120);
  const season2023 = makeSeason(2023, 750, 133, 118);

  return {
    gameFrames: [...season2022.gameFrames, ...season2023.gameFrames],
    staticPriors: [...season2022.staticPriors, ...season2023.staticPriors],
    advancedHistory: [
      ...season2022.advancedHistory,
      ...season2023.advancedHistory,
    ],
    historyEligibility: [
      ...season2022.historyEligibility,
      ...season2023.historyEligibility,
    ],
  };
}

describe('Historical Feature V1', () => {
  it('builds the frozen 1,484-game feature universe without forbidden transforms', () => {
    const result = buildHistoricalFeatureV1(makeInput());

    expect(result.rows).toHaveLength(1484);
    expect(result.qa.seasonRows).toEqual({ '2022': 734, '2023': 750 });
    expect(result.qa.teamSides).toBe(2968);
    expect(result.qa.staticPriorRows).toBe(264);
    expect(result.qa.advancedHistoryRows).toBe(3206);
    expect(result.qa.sameWeekOrLaterReferences).toBe(0);
    expect(result.qa.fbsVsFcsReferencesExcluded).toBeGreaterThan(0);
    expect(result.qa.canonicalHistoryReferencesUsed).toBeGreaterThan(0);

    expect(result.qa.missingTalentTeams).toEqual({
      '2022': [],
      '2023': [],
    });
    expect(result.qa.missingReturningProductionTeams).toEqual({
      '2022': ['James Madison'],
      '2023': ['Jacksonville State', 'Sam Houston'],
    });
    expect(result.qa.missingRecruitingTeamsByYear['2022']['2022']).toEqual([
      'Florida International',
    ]);
    expect(result.qa.missingRecruitingTeamsByYear['2023']['2022']).toEqual([
      'Florida International',
    ]);

    const weekOneRows = result.rows.filter((row) => row.week === 1);
    expect(weekOneRows.length).toBeGreaterThan(0);
    for (const row of weekOneRows) {
      for (const side of [row.home, row.away]) {
        expect(side.priorFbsGames).toEqual({
          value: 0,
          status: 'AVAILABLE',
          n: null,
        });
        expect(side.ppaOffMean.status).toBe('NO_PRIOR_FBS_GAMES');
        expect(side.ppaDefMean.status).toBe('NO_PRIOR_FBS_GAMES');
        expect(side.ppaNet.status).toBe('NO_PRIOR_FBS_GAMES');
        expect(side.successOffMean.status).toBe('NO_PRIOR_FBS_GAMES');
        expect(side.successDefMean.status).toBe('NO_PRIOR_FBS_GAMES');
        expect(side.successNet.status).toBe('NO_PRIOR_FBS_GAMES');
      }
    }

    const later = result.rows.find((row) => row.week >= 3)!;
    expect(later.home.priorFbsGames.value).toBeGreaterThan(0);
    expect(later.home.ppaOffMean.status).toBe('AVAILABLE');
    expect(later.home.ppaDefMean.status).toBe('AVAILABLE');
    expect(later.home.ppaNet.value).toBeCloseTo(
      (later.home.ppaOffMean.value as number) -
        (later.home.ppaDefMean.value as number),
      12
    );
    expect(later.home.successNet.value).toBeCloseTo(
      (later.home.successOffMean.value as number) -
        (later.home.successDefMean.value as number),
      12
    );

    const zeroTalent = result.rows
      .flatMap((row) => [
        { team: row.homeTeam, features: row.home },
        { team: row.awayTeam, features: row.away },
      ])
      .find((entry) => entry.features.talentRaw.value === 0);
    expect(zeroTalent).toBeDefined();
    expect(zeroTalent!.features.talentRaw.status).toBe('AVAILABLE');

    const jamesMadison = result.rows
      .flatMap((row) => [
        { team: row.homeTeam, features: row.home },
        { team: row.awayTeam, features: row.away },
      ])
      .find((entry) => entry.team === 'James Madison');
    expect(jamesMadison).toBeDefined();
    expect(jamesMadison!.features.returningPercentPPA.status).toBe(
      'SOURCE_ROW_UNAVAILABLE'
    );

    const florida2023 = result.rows
      .filter((row) => row.season === 2023)
      .flatMap((row) => [
        { team: row.homeTeam, features: row.home },
        { team: row.awayTeam, features: row.away },
      ])
      .find((entry) => entry.team === 'Florida International');
    expect(florida2023).toBeDefined();
    expect(florida2023!.features.recruitingPointsY1.status).toBe(
      'SOURCE_ROW_UNAVAILABLE'
    );

    const serialized = JSON.stringify(result.rows);
    expect(serialized).not.toMatch(/homeMargin|finalHomePoints|finalAwayPoints/);
    expect(serialized).not.toMatch(/spread|overUnder|Moneyline/);
    expect(serialized).not.toMatch(/PregameElo|PostgameElo/);
    expect(serialized).not.toMatch(/zScore|zElo|modelHomeMargin|edge/);
  });

  it('excludes FBS-vs-FCS rows even when the corpus eligibility references them', () => {
    const input = makeInput();
    const result = buildHistoricalFeatureV1(input);

    expect(result.qa.fbsVsFcsReferencesExcluded).toBeGreaterThan(0);

    // Synthetic FCS rows carry extreme 9.9 PPA; if they leaked, at least one
    // equal-game mean would escape the modest canonical fixture range.
    const finitePpaMeans = result.rows.flatMap((row) =>
      [row.home.ppaOffMean.value, row.away.ppaOffMean.value].filter(
        (value): value is number => value !== null
      )
    );
    expect(Math.max(...finitePpaMeans)).toBeLessThan(1);
  });

  it('fails closed on a same-week history reference', () => {
    const input = makeInput();
    const target = input.historyEligibility.find((row: any) => row.week === 1) as any;
    const frame = input.gameFrames.find(
      (row: any) => row.season === target.season && row.gameId === target.gameId
    ) as any;
    const sameWeek = input.advancedHistory.find(
      (row: any) =>
        row.season === frame.season &&
        row.gameId === frame.gameId &&
        row.team === frame.homeTeam
    ) as any;

    target.homeAdvancedRowIds = [sameWeek.rowId];

    expect(() => buildHistoricalFeatureV1(input)).toThrow(
      /history_reference_not_prior_week/
    );
  });

  it('keeps the CLI/workflow offline and never opens forbidden source layers', () => {
    const cli = fs.readFileSync(
      path.resolve(process.cwd(), 'apps/jobs/build-historical-feature-v1.ts'),
      'utf8'
    );

    expect(cli).not.toMatch(/PrismaClient|DATABASE_URL|DIRECT_URL/);
    expect(cli).not.toMatch(
      /CFBD_API_KEY|ODDS_API_KEY|SGO_API_KEY|VISUALCROSSING/i
    );
    expect(cli).not.toMatch(/\bfetch\s*\(/);
    expect(cli).not.toContain('readSource(SOURCE_PATHS.outcomes)');
    expect(cli).not.toContain('readSource(SOURCE_PATHS.market)');
    expect(cli).not.toContain('readSource(SOURCE_PATHS.ppaHistory)');
    expect(cli).not.toContain('readSource(SOURCE_PATHS.portal2022)');
    expect(cli).not.toContain('readSource(SOURCE_PATHS.portal2023)');

    const workflow = fs.readFileSync(
      path.resolve(
        process.cwd(),
        '.github/workflows/build-historical-feature-v1.yml'
      ),
      'utf8'
    );

    expect(workflow).toMatch(/workflow_dispatch/);
    expect(workflow).toMatch(/expected_main_sha/);
    expect(workflow).toMatch(/BUILD_2022_2023_HISTORICAL_FEATURE_V1/);
    expect(workflow).toMatch(/10997010171/);
    expect(workflow).toMatch(
      /cea83762d2b6e492caec680a74a085ef5a5e283c36a402ef4b35acbe2ce22b7d/
    );
    expect(workflow).toMatch(/actions: read/);
    expect(workflow).toMatch(/contents: read/);
    expect(workflow).toMatch(/npm ci --ignore-scripts/);
    expect(workflow).toMatch(/npx tsc/);
    expect(workflow).not.toMatch(/npx tsx/);
    expect(workflow).not.toMatch(
      /CFBD_API_KEY|ODDS_API_KEY|SGO_API_KEY|VISUALCROSSING/i
    );
    expect(workflow).not.toMatch(/DATABASE_URL|DIRECT_URL/);
    expect(workflow).not.toMatch(
      /npx prisma|npm run prisma|prisma migrate|prisma db/i
    );
    expect(workflow).not.toMatch(/schedule:/);
  });
});
