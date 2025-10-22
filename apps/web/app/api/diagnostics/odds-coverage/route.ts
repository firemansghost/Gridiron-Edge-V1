import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const season = parseInt(searchParams.get('season') || '2025');
    const week = parseInt(searchParams.get('week') || '9');

    // Get total games for the week
    const totalGames = await prisma.game.count({
      where: { season, week }
    });

    // Get odds coverage breakdown by book and line type
    const oddsCoverage = await prisma.$queryRaw`
      SELECT 
        g.season,
        g.week,
        ml.book_name,
        ml.line_type,
        COUNT(*) AS rows,
        MAX(ml.timestamp) AS last_timestamp
      FROM market_lines ml
      JOIN games g ON g.id = ml.game_id
      WHERE g.season = ${season} AND g.week = ${week}
      GROUP BY g.season, g.week, ml.book_name, ml.line_type
      ORDER BY ml.book_name, ml.line_type
    `;

    // Calculate total odds rows
    const oddsRowCount = Array.isArray(oddsCoverage) 
      ? oddsCoverage.reduce((sum: number, row: any) => sum + parseInt(row.rows), 0)
      : 0;

    // Get unique books for the season
    const booksThisSeason = await prisma.$queryRaw`
      SELECT DISTINCT ml.book_name 
      FROM market_lines ml 
      JOIN games g ON g.id = ml.game_id 
      WHERE g.season = ${season}
      ORDER BY ml.book_name
    `;

    return NextResponse.json({
      success: true,
      season,
      week,
      totalGames,
      oddsRowCount,
      oddsCoverage,
      booksThisSeason: Array.isArray(booksThisSeason) 
        ? booksThisSeason.map((row: any) => row.book_name)
        : [],
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in odds coverage diagnostics:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch odds coverage data',
      details: error instanceof Error ? error.message : 'Unknown error',
      season: parseInt(request.nextUrl.searchParams.get('season') || '2025'),
      week: parseInt(request.nextUrl.searchParams.get('week') || '9')
    }, { status: 500 });
  }
}
