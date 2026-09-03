/**
 * Week Archive API — persisted 2026 Game frame + official_flat_100 Bet truth.
 *
 * GET/read-only. Does not query live market lines or model-output tables, or
 * recalculate result / PnL / CLV. Canonical 2026 production writes remain
 * guarded GitHub Actions.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { OfficialCardIntegrityError, officialCardPrismaSelect, type OfficialCardBetInput } from '@/lib/official-card';
import {
  WEEK_ARCHIVE_MIN_SEASON,
  WeekArchiveIntegrityError,
  buildWeekArchiveBetWhere,
  buildWeekArchiveView,
  parseWeekArchiveSeasonParam,
  parseWeekArchiveWeekParam,
  weekArchiveGamePrismaSelect,
  type WeekArchiveGameInput,
} from '@/lib/week-archive';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const season = parseWeekArchiveSeasonParam(searchParams.get('season'));
    const week = parseWeekArchiveWeekParam(searchParams.get('week'));

    if (season == null) {
      return NextResponse.json(
        {
          ok: false,
          error: `season must be an integer >= ${WEEK_ARCHIVE_MIN_SEASON}`,
        },
        { status: 400 }
      );
    }
    if (week == null) {
      return NextResponse.json(
        { ok: false, error: 'week must be an integer from 1 to 16' },
        { status: 400 }
      );
    }

    const [gameRows, betRows] = await Promise.all([
      prisma.game.findMany({
        where: { season, week },
        select: weekArchiveGamePrismaSelect(),
        orderBy: { date: 'asc' },
      }),
      prisma.bet.findMany({
        where: buildWeekArchiveBetWhere(season, week),
        select: officialCardPrismaSelect(),
      }),
    ]);

    const { summary, games } = buildWeekArchiveView(
      gameRows as unknown as WeekArchiveGameInput[],
      betRows as unknown as OfficialCardBetInput[],
      season,
      week
    );

    return NextResponse.json({
      ok: true,
      season,
      week,
      summary,
      games,
    });
  } catch (error) {
    if (error instanceof OfficialCardIntegrityError) {
      return NextResponse.json(
        {
          ok: false,
          error: `Week archive data integrity error: ${error.message}`,
          duplicates: error.duplicates,
        },
        { status: 409 }
      );
    }
    if (error instanceof WeekArchiveIntegrityError) {
      return NextResponse.json(
        {
          ok: false,
          error: `Week archive data integrity error: ${error.message}`,
          issues: error.issues,
        },
        { status: 409 }
      );
    }

    console.error('WEEK_ARCHIVE_API_ERROR', error);
    return NextResponse.json(
      {
        ok: false,
        error: 'Unable to load Week Archive',
        detail: String((error as Error)?.message ?? error),
      },
      { status: 500 }
    );
  }
}
