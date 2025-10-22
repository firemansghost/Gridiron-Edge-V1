import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const season = searchParams.get('season') || '2025';
    const week = searchParams.get('week') || '9';

    const seasonNum = parseInt(season);
    const weekNum = parseInt(week);

    // Get coverage breakdown by book and line type
    const coverage = await prisma.marketLine.groupBy({
      by: ['bookName', 'lineType'],
      where: {
        season: seasonNum,
        week: weekNum,
      },
      _count: { _all: true },
      _max: { timestamp: true },
    });

    // Get total games with odds
    const gamesWithOdds = await prisma.game.count({
      where: {
        season: seasonNum,
        week: weekNum,
        marketLines: {
          some: {},
        },
      },
    });

    // Get total games for the week
    const totalGames = await prisma.game.count({
      where: {
        season: seasonNum,
        week: weekNum,
      },
    });

    // Get unmatched teams (teams that appear in games but not in market_lines)
    const allGames = await prisma.game.findMany({
      where: {
        season: seasonNum,
        week: weekNum,
      },
      include: {
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        marketLines: {
          select: { id: true },
          take: 1,
        },
      },
    });

    const unmatchedGames = allGames.filter(game => game.marketLines.length === 0);

    // Format coverage data
    const coverageTable = coverage.map(row => ({
      bookName: row.bookName,
      lineType: row.lineType,
      rows: row._count._all,
      lastTimestamp: row._max.timestamp,
    }));

    // Calculate summary stats
    const totalRows = coverage.reduce((sum, row) => sum + row._count._all, 0);
    const coverageRate = totalGames > 0 ? (gamesWithOdds / totalGames) * 100 : 0;

    return NextResponse.json({
      success: true,
      season: seasonNum,
      week: weekNum,
      summary: {
        totalGames,
        gamesWithOdds,
        coverageRate: Math.round(coverageRate * 100) / 100,
        totalRows,
      },
      coverage: coverageTable,
      unmatchedGames: unmatchedGames.map(game => ({
        gameId: game.id,
        homeTeam: game.homeTeam.name,
        awayTeam: game.awayTeam.name,
        date: game.date,
      })),
    });

  } catch (error) {
    console.error('Error fetching odds diagnostics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch odds diagnostics', details: (error as Error).message },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
