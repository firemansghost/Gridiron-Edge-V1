/**
 * Phase 2C-2H-5 repair — Balanced writer behavior-preservation vs main contract.
 * No production DB. No providers. No Odds.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  parseBalancedRatingsSeason,
  persistBalancedRatings,
} from '../src/ratings/compute_ratings_balanced';
import {
  BALANCED_V1_CALIBRATION_FACTOR,
  BALANCED_WEIGHT_EPA,
  BALANCED_WEIGHT_NET_POINTS,
  BALANCED_WEIGHT_TALENT,
  BALANCED_WEIGHT_WIN_PCT,
  aggregateBalancedGameStats,
  computeBalancedV1Ratings,
} from '../src/ratings/compute_balanced_v1';

const WRITER_PATH = path.join(
  __dirname,
  '../src/ratings/compute_ratings_balanced.ts'
);

function writerSrc(): string {
  return fs.readFileSync(WRITER_PATH, 'utf8');
}

/** Extract the loadTeamMetrics function body for query-shape assertions. */
function loadTeamMetricsBody(): string {
  const src = writerSrc();
  const start = src.indexOf('async function loadTeamMetrics');
  const end = src.indexOf('export function parseBalancedRatingsSeason');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('Balanced writer main-contract preservation', () => {
  it('uses TeamMembership(season, level=fbs), not Team.classification', () => {
    const body = loadTeamMetricsBody();
    expect(body).toMatch(
      /teamMembership\.findMany\(\s*\{\s*where:\s*\{\s*season,\s*level:\s*'fbs'\s*\}/
    );
    expect(body).not.toMatch(/classification:\s*['"]fbs['"]/);
    expect(body).not.toMatch(/team\.findMany\(\s*\{\s*where:\s*\{\s*classification/);
  });

  it('talent query is season + FBS team IDs', () => {
    const body = loadTeamMetricsBody();
    expect(body).toMatch(
      /teamSeasonTalent\.findMany\(\s*\{\s*where:\s*\{\s*season,\s*teamId:\s*\{\s*in:\s*Array\.from\(fbsTeamIds\)\s*\}/
    );
  });

  it('game query is season + status=final + OR FBS participant without non-null score filter', () => {
    const body = loadTeamMetricsBody();
    expect(body).toMatch(/status:\s*'final'/);
    expect(body).toMatch(
      /OR:\s*\[\s*\{\s*homeTeamId:\s*\{\s*in:\s*Array\.from\(fbsTeamIds\)\s*\}\s*\},\s*\{\s*awayTeamId:\s*\{\s*in:\s*Array\.from\(fbsTeamIds\)\s*\}\s*\}/
    );
    expect(body).not.toMatch(/homeScore:\s*\{\s*not:\s*null\s*\}/);
    expect(body).not.toMatch(/awayScore:\s*\{\s*not:\s*null\s*\}/);
  });

  it('EPA query is season + FBS IDs + game.status=final', () => {
    const body = loadTeamMetricsBody();
    expect(body).toMatch(/teamGameStat\.findMany\(/);
    expect(body).toMatch(
      /season,\s*teamId:\s*\{\s*in:\s*Array\.from\(fbsTeamIds\)\s*\},\s*game:\s*\{\s*status:\s*'final'\s*,?\s*\}/
    );
    expect(body).not.toMatch(/game:\s*\{\s*season\s*\}/);
  });

  it('null final-game scores preserve historical || 0 semantics', () => {
    const body = loadTeamMetricsBody();
    expect(body).toMatch(/const homeScore = game\.homeScore \|\| 0/);
    expect(body).toMatch(/const awayScore = game\.awayScore \|\| 0/);

    const agg = aggregateBalancedGameStats(
      [
        {
          homeTeamId: 'a',
          awayTeamId: 'b',
          homeScore: null,
          awayScore: null,
        },
      ],
      new Set(['a', 'b'])
    );
    expect(agg.get('a')!.pointsFor).toBe(0);
    expect(agg.get('a')!.pointsAgainst).toBe(0);
    expect(agg.get('a')!.games).toBe(1);
  });

  it('CLI accepts --season 2025 and --season=2025', () => {
    expect(parseBalancedRatingsSeason(['--season', '2025'])).toBe(2025);
    expect(parseBalancedRatingsSeason(['--season=2025'])).toBe(2025);
  });

  it('CLI accepts --season 2026 / --season=2026 and never silently falls back to 2025', () => {
    expect(parseBalancedRatingsSeason(['--season', '2026'])).toBe(2026);
    expect(parseBalancedRatingsSeason(['--season=2026'])).toBe(2026);
  });

  it('CLI defaults to 2025 and does not require --persist', () => {
    expect(parseBalancedRatingsSeason([])).toBe(2025);
    const src = writerSrc();
    expect(src).not.toMatch(/\.option\(\s*['"]persist['"]/);
    expect(src).not.toMatch(/\.option\(\s*['"]dry-run['"]/);
    expect(src).not.toMatch(/args\.includes\(['"]--persist['"]\)/);
    // Automatic persistence path still present
    expect(src).toMatch(/Persisting balanced ratings to database/);
    expect(src).toMatch(/persistBalancedRatings\(prisma,\s*ratings\)/);
  });

  it('still uses prisma.teamSeasonRating.upsert with historical selector/fields', async () => {
    const calls: unknown[] = [];
    const client = {
      teamSeasonRating: {
        upsert: jest.fn(async (args: unknown) => {
          calls.push(args);
          return {};
        }),
      },
    };

    const result = await persistBalancedRatings(client, [
      { season: 2025, teamId: 't1', powerRating: 12.5, games: 12 },
    ]);

    expect(result).toEqual({ upserted: 1, errors: 0 });
    expect(client.teamSeasonRating.upsert).toHaveBeenCalledTimes(1);
    const args = calls[0] as {
      where: { season_teamId_modelVersion: object };
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    };
    expect(args.where).toEqual({
      season_teamId_modelVersion: {
        season: 2025,
        teamId: 't1',
        modelVersion: 'v1',
      },
    });
    expect(Object.keys(args.update).sort()).toEqual([
      'games',
      'powerRating',
      'rating',
    ]);
    expect(args.update).toEqual({
      powerRating: 12.5,
      rating: 12.5,
      games: 12,
    });
    expect(args.create).toEqual({
      season: 2025,
      teamId: 't1',
      modelVersion: 'v1',
      powerRating: 12.5,
      rating: 12.5,
      games: 12,
      offenseRating: 0,
      defenseRating: 0,
      confidence: 0.5,
      dataSource: 'balanced',
    });
  });

  it('one row upsert failure does not prevent subsequent rows', async () => {
    const attempted: string[] = [];
    const client = {
      teamSeasonRating: {
        upsert: jest.fn(async (args: {
          where: { season_teamId_modelVersion: { teamId: string } };
        }) => {
          const id = args.where.season_teamId_modelVersion.teamId;
          attempted.push(id);
          if (id === 'fail') throw new Error('boom');
          return {};
        }),
      },
    };

    const result = await persistBalancedRatings(client, [
      { season: 2025, teamId: 'ok1', powerRating: 1, games: 1 },
      { season: 2025, teamId: 'fail', powerRating: 2, games: 1 },
      { season: 2025, teamId: 'ok2', powerRating: 3, games: 1 },
    ]);

    expect(attempted).toEqual(['ok1', 'fail', 'ok2']);
    expect(result).toEqual({ upserted: 2, errors: 1 });
  });

  it('pure formula remains 25/25/25/25 × 14.0', () => {
    expect(BALANCED_WEIGHT_TALENT).toBe(0.25);
    expect(BALANCED_WEIGHT_EPA).toBe(0.25);
    expect(BALANCED_WEIGHT_NET_POINTS).toBe(0.25);
    expect(BALANCED_WEIGHT_WIN_PCT).toBe(0.25);
    expect(BALANCED_V1_CALIBRATION_FACTOR).toBe(14.0);
    const ratings = computeBalancedV1Ratings([
      {
        teamId: 'a',
        teamName: 'A',
        talentScore: 10,
        epaOverall: 1,
        netPointsPerGame: 5,
        winPct: 1,
        gamesPlayed: 10,
      },
      {
        teamId: 'b',
        teamName: 'B',
        talentScore: 0,
        epaOverall: -1,
        netPointsPerGame: -5,
        winPct: 0,
        gamesPlayed: 10,
      },
    ]);
    for (const r of ratings) {
      expect(r.zComposite).toBeCloseTo(
        r.talentZ * 0.25 +
          r.epaZ * 0.25 +
          r.netPointsZ * 0.25 +
          r.winPctZ * 0.25,
        12
      );
      expect(r.powerRating).toBeCloseTo(r.zComposite * 14.0, 12);
    }
    expect(writerSrc()).toMatch(/computeBalancedV1Ratings\(metrics\)/);
  });
});
