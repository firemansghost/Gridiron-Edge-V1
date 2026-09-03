/**
 * Official Card API — persisted 2026 official_flat_100 Bet rows only.
 *
 * GET/read-only. Canonical 2026 production writes remain guarded GitHub Actions.
 * This route does not recalculate Core V1, query live market lines, or mutate data.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSeasonWeek } from '@/lib/current-week';
import {
  OFFICIAL_CARD_EMPTY_MESSAGE,
  OFFICIAL_CARD_SEASON,
  OfficialCardIntegrityError,
  buildOfficialCardView,
  buildOfficialCardWhere,
  officialCardPrismaSelect,
  parseOfficialCardWeekParam,
  type OfficialCardBetInput,
} from '@/lib/official-card';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedWeek = parseOfficialCardWeekParam(searchParams.get('week'));
    let week = requestedWeek;
    if (week == null) {
      const current = await getCurrentSeasonWeek(prisma);
      week = parseOfficialCardWeekParam(String(current.week)) ?? 1;
    }

    const rows = await prisma.bet.findMany({
      where: buildOfficialCardWhere(week),
      select: officialCardPrismaSelect(),
      orderBy: [{ game: { date: 'asc' } }, { marketType: 'asc' }, { createdAt: 'asc' }],
    });

    const inputs = rows as unknown as OfficialCardBetInput[];
    const { summary, games } = buildOfficialCardView(inputs);
    const empty = summary.totalBets === 0;

    return NextResponse.json({
      ok: true,
      season: OFFICIAL_CARD_SEASON,
      week,
      empty,
      emptyMessage: empty ? OFFICIAL_CARD_EMPTY_MESSAGE(week) : null,
      summary,
      games,
    });
  } catch (error) {
    if (error instanceof OfficialCardIntegrityError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          duplicates: error.duplicates,
        },
        { status: 409 }
      );
    }

    console.error('OFFICIAL_CARD_API_ERROR', error);
    return NextResponse.json(
      {
        ok: false,
        error: 'Unable to load Official Card',
        detail: String((error as Error)?.message ?? error),
      },
      { status: 500 }
    );
  }
}
