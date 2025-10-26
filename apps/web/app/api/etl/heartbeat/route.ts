import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Get recruiting count for 2025
    const recruiting2025 = await prisma.recruiting.count({
      where: { season: 2025 }
    });

    // Get team game stats count for 2025
    const teamGameStats2025 = await prisma.teamGameStat.count({
      where: { season: 2025 }
    });

    return NextResponse.json({
      recruiting_2025: recruiting2025,
      team_game_stats_2025: teamGameStats2025,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('ETL heartbeat error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch ETL status',
        recruiting_2025: 0,
        team_game_stats_2025: 0,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
