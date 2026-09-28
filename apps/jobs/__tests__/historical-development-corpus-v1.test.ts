import * as fs from 'fs';
import * as path from 'path';
import {
  buildHistoricalDevelopmentCorpus,
  buildHistoricalDevelopmentSeasonCorpus,
  type HistoricalDevelopmentSeasonSource,
} from '../src/research/historical-development-corpus-v1';

function makeSource(
  season: 2022 | 2023,
  gameCount: number,
  teamCount: number
): HistoricalDevelopmentSeasonSource {
  const teams = Array.from(
    { length: teamCount },
    (_, index) => `Team ${String(index + 1).padStart(3, '0')}`
  );
  if (season === 2022) {
    teams[0] = 'James Madison';
    teams[1] = 'Florida International';
  } else {
    teams[0] = 'Jacksonville State';
    teams[1] = 'Sam Houston';
    teams[2] = 'Florida International';
  }

  const games: any[] = [];
  const lines: any[] = [];
  const advanced: any[] = [];
  const ppa: any[] = [];

  for (let index = 0; index < gameCount; index += 1) {
    const gameId = season * 1_000_000 + index + 1;
    const week = (index % 15) + 1;
    const homeIndex = index % teamCount;
    let awayIndex = (index * 7 + 1) % teamCount;
    if (awayIndex === homeIndex) awayIndex = (awayIndex + 1) % teamCount;
    const homeTeam = teams[homeIndex];
    const awayTeam = teams[awayIndex];

    games.push({
      id: gameId,
      season,
      week,
      seasonType: 'regular',
      startDate: `${season}-09-${String(((index % 28) + 1)).padStart(
        2,
        '0'
      )}T12:00:00.000Z`,
      completed: true,
      neutralSite: index % 20 === 0,
      homeTeam,
      awayTeam,
      homeClassification: 'fbs',
      awayClassification: 'fbs',
      homePoints: 30 + (index % 10),
      awayPoints: 20 + (index % 7),
    });

    lines.push({
      id: gameId,
      season,
      seasonType: 'regular',
      week,
      homeTeam,
      awayTeam,
      lines: [{ provider: 'Synthetic Book', spread: -3.5 }],
    });

    advanced.push(
      {
        gameId,
        season,
        seasonType: 'regular',
        week,
        team: homeTeam,
        opponent: awayTeam,
        offense: { ppa: 0.1 },
        defense: { ppa: -0.1 },
      },
      {
        gameId,
        season,
        seasonType: 'regular',
        week,
        team: awayTeam,
        opponent: homeTeam,
        offense: { ppa: -0.1 },
        defense: { ppa: 0.1 },
      }
    );

    ppa.push(
      {
        gameId,
        season,
        seasonType: 'regular',
        week,
        team: homeTeam,
        opponent: awayTeam,
        offense: { overall: 0.1 },
        defense: { overall: -0.1 },
      },
      {
        gameId,
        season,
        seasonType: 'regular',
        week,
        team: awayTeam,
        opponent: homeTeam,
        offense: { overall: -0.1 },
        defense: { overall: 0.1 },
      }
    );
  }

  // Captured FBS-vs-FCS history is allowed as source history for the FBS team,
  // but because it is Week 1 it must never appear in a Week 1 target's refs.
  const fcsGameId = season * 1_000_000 + 900_001;
  games.push({
    id: fcsGameId,
    season,
    week: 1,
    seasonType: 'regular',
    startDate: `${season}-08-20T12:00:00.000Z`,
    completed: true,
    neutralSite: false,
    homeTeam: teams[0],
    awayTeam: 'Synthetic FCS',
    homeClassification: 'fbs',
    awayClassification: 'fcs',
    homePoints: 42,
    awayPoints: 7,
  });
  advanced.push({
    gameId: fcsGameId,
    season,
    seasonType: 'regular',
    week: 1,
    team: teams[0],
    opponent: 'Synthetic FCS',
    offense: { ppa: 0.5 },
    defense: { ppa: -0.5 },
  });
  ppa.push({
    gameId: fcsGameId,
    season,
    seasonType: 'regular',
    week: 1,
    team: teams[0],
    opponent: 'Synthetic FCS',
    offense: { overall: 0.5 },
    defense: { overall: -0.5 },
  });

  const talent = teams.map((team, index) => ({
    year: season,
    team,
    talent: 500 + index,
  }));
  const frozenReturningMissing =
    season === 2022
      ? new Set(['James Madison'])
      : new Set(['Jacksonville State', 'Sam Houston']);
  const returningProduction = teams
    .filter((team) => !frozenReturningMissing.has(team))
    .map((team, index) => ({
      season,
      team,
      percentPPA: 0.4 + (index % 20) / 100,
    }));

  const recruitingByYear: Record<number, unknown[]> = {};
  for (let year = season - 3; year <= season; year += 1) {
    recruitingByYear[year] = teams
      .filter((team) => !(year === 2022 && team === 'Florida International'))
      .map((team, index) => ({
        year,
        team,
        rank: index + 1,
        points: 300 - index / 10,
      }));
  }

  const eloPreseason = teams.map((team, index) => ({
    year: season,
    team,
    elo: 1400 + index,
  }));
  const eloByWeek: Record<number, unknown[]> = {};
  for (let week = 1; week <= 15; week += 1) {
    eloByWeek[week] = teams.map((team, index) => ({
      year: season,
      team,
      elo: 1400 + index + week,
    }));
  }

  return {
    season,
    games,
    lines,
    advanced,
    ppa,
    talent,
    returningProduction,
    recruitingByYear,
    eloPreseason,
    eloByWeek,
  };
}

describe('historical development corpus v1', () => {
  it('builds the frozen 2022 universe without same-week history leakage', () => {
    const source = makeSource(2022, 734, 131);
    const corpus = buildHistoricalDevelopmentSeasonCorpus(source);

    expect(corpus.gameFrames).toHaveLength(734);
    expect(corpus.outcomes).toHaveLength(734);
    expect(corpus.qa.canonicalTeams).toBe(131);
    expect(corpus.qa.canonicalAdvancedTeamGames).toBe(1468);
    expect(corpus.qa.canonicalPpaTeamGames).toBe(1468);
    expect(corpus.qa.canonicalLineGames).toBe(734);

    // One additional FBS-side row from the synthetic FBS-vs-FCS source game.
    expect(corpus.advancedHistory).toHaveLength(1469);
    expect(corpus.ppaHistory).toHaveLength(1469);

    expect(corpus.qa.weekOneHistoryReferenceCount).toBe(0);
    expect(corpus.qa.sameWeekHistoryReferenceCount).toBe(0);

    const advancedWeekById = new Map(
      corpus.advancedHistory.map((row) => [row.rowId, row.week])
    );
    const ppaWeekById = new Map(
      corpus.ppaHistory.map((row) => [row.rowId, row.week])
    );

    for (const eligibility of corpus.historyEligibility) {
      const allAdvanced = [
        ...eligibility.homeAdvancedRowIds,
        ...eligibility.awayAdvancedRowIds,
      ];
      const allPpa = [
        ...eligibility.homePpaRowIds,
        ...eligibility.awayPpaRowIds,
      ];

      for (const rowId of allAdvanced) {
        expect(advancedWeekById.get(rowId)).toBeLessThan(eligibility.week);
      }
      for (const rowId of allPpa) {
        expect(ppaWeekById.get(rowId)).toBeLessThan(eligibility.week);
      }

      if (eligibility.week === 1) {
        expect(allAdvanced).toEqual([]);
        expect(allPpa).toEqual([]);
      }
    }

    const weekOneFrame = corpus.gameFrames.find((row) => row.week === 1)!;
    expect(weekOneFrame.homeElo.sourceRequestId).toBe('elo-preseason');
    expect(weekOneFrame.homeElo.sourceWeek).toBeNull();

    const weekTwoFrame = corpus.gameFrames.find((row) => row.week === 2)!;
    expect(weekTwoFrame.homeElo.sourceRequestId).toBe('elo-week-01');
    expect(weekTwoFrame.homeElo.sourceWeek).toBe(1);

    expect('finalHomePoints' in (weekOneFrame as any)).toBe(false);
    expect('homeMargin' in (weekOneFrame as any)).toBe(false);

    const jamesMadison = corpus.staticPriors.find(
      (row) => row.team === 'James Madison'
    )!;
    expect(jamesMadison.returningProduction.status).toBe(
      'SOURCE_ROW_UNAVAILABLE'
    );
    expect(corpus.qa.missingReturningProductionTeams).toEqual([
      'James Madison',
    ]);
    expect(corpus.qa.missingRecruitingTeamsByYear['2022']).toEqual([
      'Florida International',
    ]);
  });

  it('builds only the combined 2022-2023 development universe', () => {
    const corpus = buildHistoricalDevelopmentCorpus([
      makeSource(2022, 734, 131),
      makeSource(2023, 750, 133),
    ]);

    expect(corpus.seasons).toEqual([2022, 2023]);
    expect(corpus.gameFrames).toHaveLength(1484);
    expect(corpus.outcomes).toHaveLength(1484);
    expect(corpus.historyEligibility).toHaveLength(1484);
    expect(corpus.qa.canonicalGames).toBe(1484);
    expect(corpus.qa.canonicalTeamsBySeason).toEqual({
      '2022': 131,
      '2023': 133,
    });
    expect(corpus.qa.weekOneHistoryReferenceCount).toBe(0);
    expect(corpus.qa.sameWeekHistoryReferenceCount).toBe(0);
  });

  it('fails closed if either development season is absent', () => {
    expect(() =>
      buildHistoricalDevelopmentCorpus([makeSource(2022, 734, 131)])
    ).toThrow(/requires_2022_and_2023/);
  });

  it('keeps the builder CLI and workflow provider-free and database-free', () => {
    const cli = fs.readFileSync(
      path.resolve(
        process.cwd(),
        'apps/jobs/build-historical-development-corpus-v1.ts'
      ),
      'utf8'
    );
    expect(cli).not.toMatch(/PrismaClient|DATABASE_URL|DIRECT_URL/);
    expect(cli).not.toMatch(
      /CFBD_API_KEY|ODDS_API_KEY|SGO_API_KEY|VISUALCROSSING/i
    );
    expect(cli).not.toMatch(/\bfetch\s*\(/);

    const workflow = fs.readFileSync(
      path.resolve(
        process.cwd(),
        '.github/workflows/build-historical-development-corpus-v1.yml'
      ),
      'utf8'
    );

    expect(workflow).toMatch(/workflow_dispatch/);
    expect(workflow).toMatch(/expected_main_sha/);
    expect(workflow).toMatch(
      /BUILD_2022_2023_HISTORICAL_DEVELOPMENT_CORPUS_V1/
    );
    expect(workflow).toMatch(/actions: read/);
    expect(workflow).toMatch(/contents: read/);
    expect(workflow).toMatch(/10988661299/);
    expect(workflow).toMatch(/10990949531/);
    expect(workflow).toMatch(
      /7a5b76b681b0ef1873853956cdc5b39cb3581675cf84e6ca6f972141ea2dfe99/
    );
    expect(workflow).toMatch(
      /479d5dc4481a6f7ab7b2c034976b8845814121cfc0f11c0b18a8166c61fc5bd4/
    );
    expect(workflow).toMatch(/npm ci --ignore-scripts/);
    expect(workflow).toMatch(/npx tsc/);
    expect(workflow).toMatch(
      /node \.tmp\/historical-development-corpus-v1\/build-historical-development-corpus-v1\.js/
    );
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
