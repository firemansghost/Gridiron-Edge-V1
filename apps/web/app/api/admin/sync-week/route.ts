/**
 * Admin Sync Week API Route
 * 
 * Expected URL: /api/admin/sync-week
 * 
 * Serverless-friendly endpoint that syncs CFBD scores and optionally grades bets.
 * This replaces the child process approach with direct service calls.
 */

import { NextRequest, NextResponse } from 'next/server';
import { syncGamesForWeek } from '@/lib/cfbd/cfbd-service';
import { gradeAvailableBets } from '@/lib/grading/grading-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { season, week, gradeAfterSync = true } = body;

    if (!season || !week) {
      return NextResponse.json(
        { error: 'season and week are required' },
        { status: 400 }
      );
    }

    const seasonNum = parseInt(season, 10);
    const weekNum = parseInt(week, 10);

    if (isNaN(seasonNum) || isNaN(weekNum)) {
      return NextResponse.json(
        { error: 'season and week must be valid numbers' },
        { status: 400 }
      );
    }

    console.log(`[SYNC_WEEK_API] Syncing ${seasonNum} Week ${weekNum}...`);

    // Step 1: Sync CFBD scores
    const syncResult = await syncGamesForWeek(seasonNum, weekNum);

    if (!syncResult.success) {
      return NextResponse.json(
        {
          ok: false,
          season: seasonNum,
          week: weekNum,
          updatedGames: 0,
          error: syncResult.error || 'CFBD sync failed',
        },
        { status: 500 }
      );
    }

    // Step 2: Optionally grade bets after sync
    let gradeResult = null;
    if (gradeAfterSync) {
      console.log(`[SYNC_WEEK_API] Grading bets after sync...`);
      const gradeCounts = await gradeAvailableBets({
        season: seasonNum,
        week: weekNum,
        limit: 500,
        force: false,
      });

      gradeResult = {
        graded: gradeCounts.graded,
        pushes: gradeCounts.pushes,
        failed: gradeCounts.failed,
        filledClosePrices: gradeCounts.filledClosePrice,
      };
    }

    return NextResponse.json({
      ok: true,
      season: seasonNum,
      week: weekNum,
      updatedGames: syncResult.gamesUpdated,
      gamesNotFound: syncResult.gamesNotFound,
      ...(gradeResult && {
        graded: gradeResult.graded,
        pushes: gradeResult.pushes,
        failed: gradeResult.failed,
        filledClosePrices: gradeResult.filledClosePrices,
      }),
    });

  } catch (error) {
    console.error('[SYNC_WEEK_API] Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        ok: false,
        error: 'Internal error',
        detail: errorMessage,
      },
      { status: 500 }
    );
  }
}

