/**
 * Admin Grading API Route
 * 
 * Expected URL: /api/admin/grade
 * 
 * Serverless-friendly grading endpoint that uses the grading service directly
 * instead of spawning child processes. This is more reliable in Vercel/serverless environments.
 */

import { NextRequest, NextResponse } from 'next/server';
import { gradeAvailableBets, GradeCounts } from '@/lib/grading/grading-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { season, week, limit, force } = body;

    if (!season) {
      return NextResponse.json(
        { error: 'season is required' },
        { status: 400 }
      );
    }

    console.log(`[GRADING_API] Grading bets for season=${season}, week=${week || 'all'}`);

    const counts: GradeCounts = await gradeAvailableBets({
      season: parseInt(season, 10),
      week: week ? parseInt(week, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : 500,
      force: force === true,
    });

    console.log(`[GRADING_API] Completed:`, counts);

    return NextResponse.json({
      success: true,
      summary: {
        graded: counts.graded,
        pushes: counts.pushes,
        failed: counts.failed,
        filledClosePrice: counts.filledClosePrice,
      },
    });

  } catch (error) {
    console.error('[GRADING_API] Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal error',
        detail: errorMessage,
      },
      { status: 500 }
    );
  }
}

