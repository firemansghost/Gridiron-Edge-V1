import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { gradeAvailableBets } from '@/lib/grading/grading-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

/**
 * POST /api/bets/grade
 * Delegates settlement to gradeAvailableBets() (2C-2J-6A).
 * Preserves UI gate, validation, diagnostics, and summary shape.
 */
export async function POST(request: NextRequest) {
  try {
    if (process.env.NEXT_PUBLIC_ENABLE_GRADE_UI !== 'true') {
      return NextResponse.json({ error: 'Grading UI not enabled' }, { status: 403 });
    }

    const { season, week } = await request.json();

    if (!season) {
      return NextResponse.json({ error: 'Season is required' }, { status: 400 });
    }

    const seasonNum = parseInt(season, 10);
    const weekNum = week != null && week !== '' ? parseInt(week, 10) : undefined;

    if (!Number.isFinite(seasonNum)) {
      return NextResponse.json({ error: 'Season must be a number' }, { status: 400 });
    }

    const totalBets = await prisma.bet.count({
      where: {
        season: seasonNum,
        week: weekNum,
        source: 'strategy_run',
      },
    });

    const byTag = await prisma.bet.groupBy({
      by: ['strategyTag'],
      where: {
        season: seasonNum,
        week: weekNum,
        source: 'strategy_run',
      },
      _count: { _all: true },
    });

    console.log(
      `[GRADING] ${seasonNum} Week ${weekNum ?? 'all'}: Total strategy_run bets: ${totalBets}`
    );
    for (const group of byTag) {
      console.log(`[GRADING]   ${group.strategyTag || '(no tag)'}: ${group._count._all}`);
    }

    const ungradedCount = await prisma.bet.count({
      where: {
        season: seasonNum,
        ...(weekNum != null ? { week: weekNum } : {}),
        source: 'strategy_run',
        result: null,
        game: {
          status: 'final',
          homeScore: { not: null },
          awayScore: { not: null },
        },
      },
    });

    const summary = await gradeAvailableBets({
      season: seasonNum,
      week: weekNum,
      force: false,
    });

    return NextResponse.json({
      success: true,
      summary: {
        graded: summary.graded,
        pushes: summary.pushes,
        failed: summary.failed,
        filledClosePrice: summary.filledClosePrice,
        total: ungradedCount,
      },
    });
  } catch (error) {
    console.error('BETS_API_ERROR grade', error);
    return NextResponse.json(
      { error: 'Internal error', detail: String((error as Error)?.message ?? error) },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
