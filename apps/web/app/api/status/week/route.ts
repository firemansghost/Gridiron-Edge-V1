/**
 * Week Status API
 * 
 * Returns a health check report for the current week's data ingestion.
 * Checks games, odds, stats coverage, ratings, and V2 data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSeasonWeek } from '@/lib/current-week';

export const dynamic = 'force-dynamic';

interface WeekStatus {
  season: number;
  week: number;
  gameData: {
    totalGames: number;
    gamesWithOdds: number;
    gamesWithFinalScores: number;
    gamesWithStats: number;
  };
  statsCoverage: {
    lineYards: number; // percentage
    ppa: number; // percentage
    havoc: number; // percentage
    isoPpp: number; // percentage
  };
  ratings: {
    v1Ratings: boolean;
    v2UnitGrades: boolean;
    v1Count: number;
    v2Count: number;
  };
  v2Data: {
    ppaIngested: boolean;
    effTeamGameIngested: boolean;
    effTeamSeasonIngested: boolean;
    ppaCount: number;
    effGameCount: number;
    effSeasonCount: number;
  };
  lastUpdated: string | null;
}

export async function GET(request: NextRequest) {
  try {
    // Get current season/week
    const { season, week } = await getCurrentSeasonWeek(prisma);

    // Get all games for this week
    const games = await prisma.game.findMany({
      where: { season, week },
      select: {
        id: true,
        status: true,
        homeTeamId: true,
        awayTeamId: true,
      },
    });

    const totalGames = games.length;
    const gameIds = games.map(g => g.id);

    // Count games with odds (any market line)
    const gamesWithOdds = await prisma.marketLine.findMany({
      where: { gameId: { in: gameIds } },
      select: { gameId: true },
      distinct: ['gameId'],
    });
    const gamesWithOddsCount = gamesWithOdds.length;

    // Count games with final scores
    const gamesWithFinalScores = games.filter(g => g.status === 'final').length;

    // Get CFBD game IDs for stats lookup
    const cfbdGames = await prisma.cfbdGame.findMany({
      where: { season, week },
      select: { gameIdCfbd: true },
    });
    const cfbdGameIds = cfbdGames.map(g => g.gameIdCfbd);

    // Count games with stats (CfbdEffTeamGame records)
    const gamesWithStats = cfbdGameIds.length > 0
      ? await prisma.cfbdEffTeamGame.findMany({
          where: { gameIdCfbd: { in: cfbdGameIds } },
          select: { gameIdCfbd: true },
          distinct: ['gameIdCfbd'],
        })
      : [];
    const gamesWithStatsCount = gamesWithStats.length;

    // Calculate stats coverage percentages
    // Expected: 2 records per game (home + away)
    const expectedStatRecords = totalGames * 2;
    
    // Line Yards coverage
    const lineYardsRecords = cfbdGameIds.length > 0
      ? await prisma.cfbdEffTeamGame.count({
          where: {
            gameIdCfbd: { in: cfbdGameIds },
            lineYardsOff: { not: null },
          },
        })
      : 0;
    const lineYardsCoverage = expectedStatRecords > 0
      ? (lineYardsRecords / expectedStatRecords) * 100
      : 0;

    // PPA coverage
    const ppaRecords = cfbdGameIds.length > 0
      ? await prisma.cfbdPpaTeamGame.count({
          where: {
            gameIdCfbd: { in: cfbdGameIds },
            ppaOffense: { not: null },
          },
        })
      : 0;
    const ppaCoverage = expectedStatRecords > 0
      ? (ppaRecords / expectedStatRecords) * 100
      : 0;

    // Havoc coverage (season-level)
    const havocRecords = await prisma.cfbdEffTeamSeason.count({
      where: {
        season,
        havocOff: { not: null },
      },
    });
    // Expected: number of FBS teams (approximate with team count)
    const fbsTeamCount = await prisma.teamMembership.count({
      where: { season, level: 'fbs' },
    });
    const havocCoverage = fbsTeamCount > 0
      ? (havocRecords / fbsTeamCount) * 100
      : 0;

    // IsoPPP coverage
    const isoPppRecords = cfbdGameIds.length > 0
      ? await prisma.cfbdEffTeamGame.count({
          where: {
            gameIdCfbd: { in: cfbdGameIds },
            isoPppOff: { not: null },
          },
        })
      : 0;
    const isoPppCoverage = expectedStatRecords > 0
      ? (isoPppRecords / expectedStatRecords) * 100
      : 0;

    // Check V1 Ratings
    const teamIds = Array.from(new Set(games.flatMap(g => [g.homeTeamId, g.awayTeamId])));
    const v1Ratings = await prisma.teamSeasonRating.count({
      where: {
        season,
        teamId: { in: teamIds },
        modelVersion: 'v1',
      },
    });
    const v1RatingsExist = v1Ratings > 0;

    // Check V2 Unit Grades
    const v2UnitGrades = await prisma.teamUnitGrades.count({
      where: {
        season,
        teamId: { in: teamIds },
      },
    });
    const v2UnitGradesExist = v2UnitGrades > 0;

    // Check V2 Data ingestion
    const ppaCount = cfbdGameIds.length > 0
      ? await prisma.cfbdPpaTeamGame.count({
          where: { gameIdCfbd: { in: cfbdGameIds } },
        })
      : 0;
    const ppaIngested = ppaCount > 0;

    const effGameCount = cfbdGameIds.length > 0
      ? await prisma.cfbdEffTeamGame.count({
          where: { gameIdCfbd: { in: cfbdGameIds } },
        })
      : 0;
    const effTeamGameIngested = effGameCount > 0;

    const effSeasonCount = await prisma.cfbdEffTeamSeason.count({
      where: { season },
    });
    const effTeamSeasonIngested = effSeasonCount > 0;

    // Get last update time (most recent market line timestamp)
    const lastMarketLine = await prisma.marketLine.findFirst({
      where: { gameId: { in: gameIds } },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    });
    const lastUpdated = lastMarketLine?.timestamp.toISOString() ?? null;

    const status: WeekStatus = {
      season,
      week,
      gameData: {
        totalGames,
        gamesWithOdds: gamesWithOddsCount,
        gamesWithFinalScores,
        gamesWithStats: gamesWithStatsCount,
      },
      statsCoverage: {
        lineYards: Math.round(lineYardsCoverage * 10) / 10,
        ppa: Math.round(ppaCoverage * 10) / 10,
        havoc: Math.round(havocCoverage * 10) / 10,
        isoPpp: Math.round(isoPppCoverage * 10) / 10,
      },
      ratings: {
        v1Ratings: v1RatingsExist,
        v2UnitGrades: v2UnitGradesExist,
        v1Count: v1Ratings,
        v2Count: v2UnitGrades,
      },
      v2Data: {
        ppaIngested,
        effTeamGameIngested,
        effTeamSeasonIngested,
        ppaCount,
        effGameCount,
        effSeasonCount,
      },
      lastUpdated,
    };

    return NextResponse.json(status);
  } catch (error) {
    console.error('[STATUS_API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch status' },
      { status: 500 }
    );
  }
}

