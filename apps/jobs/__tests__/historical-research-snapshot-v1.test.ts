import * as fs from 'fs';
import * as path from 'path';
import {
  HISTORICAL_SNAPSHOT_MAX_PROVIDER_CALLS,
  buildCfbdUrl,
  buildHistoricalGamesRequest,
  buildHistoricalSnapshotPlan,
  countCompletedFbsVsFbsRegularGames,
  deriveFbsVsFbsRegularWeeks,
  historicalSnapshotConfirmation,
  historicalSnapshotSeasonRole,
  isCompletedFbsVsFbsRegularGame,
} from '../src/research/historical-research-snapshot-v1';

describe('historical research snapshot v1', () => {
  const games = [
    {
      id: 1,
      season: 2025,
      week: 1,
      seasonType: 'regular',
      homeClassification: 'fbs',
      awayClassification: 'fbs',
      completed: true,
    },
    {
      id: 2,
      season: 2025,
      week: 2,
      seasonType: 'regular',
      homeClassification: 'fbs',
      awayClassification: 'fbs',
      completed: true,
    },
    {
      id: 3,
      season: 2025,
      week: 2,
      seasonType: 'regular',
      homeClassification: 'fbs',
      awayClassification: 'fcs',
      completed: true,
    },
    {
      id: 4,
      season: 2025,
      week: 3,
      seasonType: 'postseason',
      homeClassification: 'fbs',
      awayClassification: 'fbs',
      completed: true,
    },
  ];

  it('derives canonical weeks from completed regular FBS-vs-FBS games only', () => {
    const withIncomplete = [
      ...games,
      {
        id: 5,
        season: 2025,
        week: 9,
        seasonType: 'regular',
        homeClassification: 'fbs',
        awayClassification: 'fbs',
        completed: false,
      },
    ];

    expect(deriveFbsVsFbsRegularWeeks(withIncomplete, 2025)).toEqual([1, 2]);
    expect(countCompletedFbsVsFbsRegularGames(withIncomplete, 2025)).toBe(2);
    expect(isCompletedFbsVsFbsRegularGame(withIncomplete[4], 2025)).toBe(false);
    expect(isCompletedFbsVsFbsRegularGame(withIncomplete[0], 2025)).toBe(true);
  });

  it('builds a bounded research-only provider plan', () => {
    const plan = buildHistoricalSnapshotPlan(2025, games);

    // Base plan = 12 calls (games + 6 other season endpoints + 4 recruiting
    // classes + preseason Elo), then one Elo call per observed week.
    expect(plan.providerCallCount).toBe(14);
    expect(plan.providerCallCount).toBeLessThanOrEqual(
      HISTORICAL_SNAPSHOT_MAX_PROVIDER_CALLS
    );
    expect(plan.observedFbsVsFbsRegularWeeks).toEqual([1, 2]);

    expect(plan.requests.map((request) => request.id)).toEqual([
      'games',
      'lines',
      'advanced-game-stats',
      'ppa-games',
      'talent',
      'returning-production',
      'transfer-portal',
      'recruiting-teams-2022',
      'recruiting-teams-2023',
      'recruiting-teams-2024',
      'recruiting-teams-2025',
      'elo-preseason',
      'elo-week-01',
      'elo-week-02',
    ]);
  });

  it('builds the documented CFBD games request without credentials', () => {
    const req = buildHistoricalGamesRequest(2025);
    const url = buildCfbdUrl('https://api.collegefootballdata.com', req);

    expect(url).toContain('/games?');
    expect(url).toContain('year=2025');
    expect(url).toContain('seasonType=regular');
    expect(url).toContain('classification=fbs');
    expect(url).not.toMatch(/token|key|authorization/i);
  });

  it('authorizes audited development/holdout paths plus guarded 2024 validation capture planning', () => {
    const games2022 = games.map((game) => ({ ...game, season: 2022 }));
    const plan2022 = buildHistoricalSnapshotPlan(2022, games2022);

    expect(plan2022.season).toBe(2022);
    expect(plan2022.requests.map((request) => request.id)).toEqual([
      'games',
      'lines',
      'advanced-game-stats',
      'ppa-games',
      'talent',
      'returning-production',
      'transfer-portal',
      'recruiting-teams-2019',
      'recruiting-teams-2020',
      'recruiting-teams-2021',
      'recruiting-teams-2022',
      'elo-preseason',
      'elo-week-01',
      'elo-week-02',
    ]);
    expect(historicalSnapshotConfirmation(2022)).toBe(
      'CAPTURE_2022_HISTORICAL_RESEARCH_SNAPSHOT_PREVIEW'
    );
    expect(historicalSnapshotSeasonRole(2022)).toBe(
      'AUDITED_DEVELOPMENT_SOURCE_SEASON_NEW_CAPTURE_REQUIRES_AUDIT'
    );

    const games2023 = games.map((game) => ({ ...game, season: 2023 }));
    const plan2023 = buildHistoricalSnapshotPlan(2023, games2023);

    expect(plan2023.season).toBe(2023);
    expect(plan2023.requests.map((request) => request.id)).toEqual([
      'games',
      'lines',
      'advanced-game-stats',
      'ppa-games',
      'talent',
      'returning-production',
      'transfer-portal',
      'recruiting-teams-2020',
      'recruiting-teams-2021',
      'recruiting-teams-2022',
      'recruiting-teams-2023',
      'elo-preseason',
      'elo-week-01',
      'elo-week-02',
    ]);
    expect(historicalSnapshotConfirmation(2023)).toBe(
      'CAPTURE_2023_HISTORICAL_RESEARCH_SNAPSHOT_PREVIEW'
    );
    expect(historicalSnapshotSeasonRole(2023)).toBe(
      'AUDITED_DEVELOPMENT_SOURCE_SEASON_NEW_CAPTURE_REQUIRES_AUDIT'
    );

    const games2024 = games.map((game) => ({ ...game, season: 2024 }));
    const plan2024 = buildHistoricalSnapshotPlan(2024, games2024);

    expect(plan2024.season).toBe(2024);
    expect(plan2024.requests.map((request) => request.id)).toEqual([
      'games',
      'lines',
      'advanced-game-stats',
      'ppa-games',
      'talent',
      'returning-production',
      'transfer-portal',
      'recruiting-teams-2021',
      'recruiting-teams-2022',
      'recruiting-teams-2023',
      'recruiting-teams-2024',
      'elo-preseason',
      'elo-week-01',
      'elo-week-02',
    ]);
    expect(historicalSnapshotConfirmation(2024)).toBe(
      'CAPTURE_2024_HISTORICAL_RESEARCH_SNAPSHOT_PREVIEW'
    );
    expect(historicalSnapshotSeasonRole(2024)).toBe(
      'VALIDATION_SOURCE_SEASON_CAPTURE_REQUIRES_EXPLICIT_AUTHORIZATION_AND_AUDIT'
    );
  });

  it('fails closed if the dynamic weekly Elo plan would exceed the call ceiling', () => {
    const tooManyWeeks = Array.from({ length: 25 }, (_, index) => ({
      id: index + 1,
      season: 2025,
      week: index + 1,
      seasonType: 'regular',
      homeClassification: 'fbs',
      awayClassification: 'fbs',
      completed: true,
    }));

    expect(() => buildHistoricalSnapshotPlan(2025, tooManyWeeks)).toThrow(
      /provider call budget exceeded/
    );
  });

  it('keeps snapshot QA denominators on completed canonical games', () => {
    const cli = fs.readFileSync(
      path.resolve(
        process.cwd(),
        'apps/jobs/capture-historical-research-snapshot-v1.ts'
      ),
      'utf8'
    );

    expect(cli).not.toContain(
      "qaFindings.push('incomplete_fbs_vs_fbs_regular_games_present')"
    );
    expect(cli).toMatch(
      /advancedCanonicalUniqueGames[^]*completedFbsVsFbsRegularGames/
    );
    expect(cli).toMatch(
      /ppaCanonicalUniqueGames[^]*completedFbsVsFbsRegularGames/
    );
    expect(cli).toContain('isCompletedFbsVsFbsRegularGame');
  });

  it('keeps the GitHub workflow provider-only and database-free', () => {
    const workflow = fs.readFileSync(
      path.resolve(
        process.cwd(),
        '.github/workflows/capture-historical-research-snapshot-v1.yml'
      ),
      'utf8'
    );

    expect(workflow).toMatch(/CFBD_API_KEY/);
    expect(workflow).toMatch(/expected_main_sha/);
    expect(workflow).toMatch(/CAPTURE_2025_HISTORICAL_RESEARCH_SNAPSHOT_PREVIEW/);
    expect(workflow).toMatch(/npm ci --ignore-scripts/);
    expect(workflow).toMatch(/npx tsc/);
    expect(workflow).toMatch(
      /node \.tmp\/historical-research-snapshot-v1\/capture-historical-research-snapshot-v1\.js/
    );
    expect(workflow).not.toMatch(/npx tsx/);
    expect(workflow).not.toMatch(/DIRECT_URL|DATABASE_URL/);
    expect(workflow).not.toMatch(
      /npx prisma|npm run prisma|prisma migrate|prisma db/i
    );
    expect(workflow).not.toMatch(/ODDS_API_KEY|SGO_API_KEY|VISUALCROSSING/i);

    const workflow2022 = fs.readFileSync(
      path.resolve(
        process.cwd(),
        '.github/workflows/capture-historical-research-snapshot-v1-2022.yml'
      ),
      'utf8'
    );
    expect(workflow2022).toMatch(/CFBD_API_KEY/);
    expect(workflow2022).toMatch(/expected_main_sha/);
    expect(workflow2022).toMatch(
      /CAPTURE_2022_HISTORICAL_RESEARCH_SNAPSHOT_PREVIEW/
    );
    expect(workflow2022).toMatch(/npm ci --ignore-scripts/);
    expect(workflow2022).toMatch(/npx tsc/);
    expect(workflow2022).toMatch(
      /node \.tmp\/historical-research-snapshot-v1\/capture-historical-research-snapshot-v1\.js/
    );
    expect(workflow2022).not.toMatch(/npx tsx/);
    expect(workflow2022).not.toMatch(/DIRECT_URL|DATABASE_URL/);
    expect(workflow2022).not.toMatch(
      /npx prisma|npm run prisma|prisma migrate|prisma db/i
    );
    expect(workflow2022).not.toMatch(
      /ODDS_API_KEY|SGO_API_KEY|VISUALCROSSING/i
    );


    const workflow2023 = fs.readFileSync(
      path.resolve(
        process.cwd(),
        '.github/workflows/capture-historical-research-snapshot-v1-2023.yml'
      ),
      'utf8'
    );
    expect(workflow2023).toMatch(/CFBD_API_KEY/);
    expect(workflow2023).toMatch(/expected_main_sha/);
    expect(workflow2023).toMatch(
      /CAPTURE_2023_HISTORICAL_RESEARCH_SNAPSHOT_PREVIEW/
    );
    expect(workflow2023).toMatch(/npm ci --ignore-scripts/);
    expect(workflow2023).toMatch(/npx tsc/);
    expect(workflow2023).toMatch(
      /node \.tmp\/historical-research-snapshot-v1\/capture-historical-research-snapshot-v1\.js/
    );
    expect(workflow2023).not.toMatch(/npx tsx/);
    expect(workflow2023).not.toMatch(/DIRECT_URL|DATABASE_URL/);
    expect(workflow2023).not.toMatch(
      /npx prisma|npm run prisma|prisma migrate|prisma db/i
    );
    expect(workflow2023).not.toMatch(
      /ODDS_API_KEY|SGO_API_KEY|VISUALCROSSING/i
    );

    const workflow2024 = fs.readFileSync(
      path.resolve(
        process.cwd(),
        '.github/workflows/capture-historical-research-snapshot-v1-2024.yml'
      ),
      'utf8'
    );
    expect(workflow2024).toMatch(/CFBD_API_KEY/);
    expect(workflow2024).toMatch(/expected_main_sha/);
    expect(workflow2024).toMatch(
      /CAPTURE_2024_HISTORICAL_RESEARCH_SNAPSHOT_PREVIEW/
    );
    expect(workflow2024).toMatch(/season=2024/);
    expect(workflow2024).toMatch(/npm ci --ignore-scripts/);
    expect(workflow2024).toMatch(/npx tsc/);
    expect(workflow2024).toMatch(
      /node \.tmp\/historical-research-snapshot-v1\/capture-historical-research-snapshot-v1\.js/
    );
    expect(workflow2024).not.toMatch(/npx tsx/);
    expect(workflow2024).not.toMatch(/DIRECT_URL|DATABASE_URL/);
    expect(workflow2024).not.toMatch(
      /npx prisma|npm run prisma|prisma migrate|prisma db/i
    );
    expect(workflow2024).not.toMatch(
      /ODDS_API_KEY|SGO_API_KEY|VISUALCROSSING/i
    );

    const cli = fs.readFileSync(
      path.resolve(
        process.cwd(),
        'apps/jobs/capture-historical-research-snapshot-v1.ts'
      ),
      'utf8'
    );
    expect(cli).not.toMatch(/PrismaClient|DIRECT_URL|DATABASE_URL/);
  });
});
