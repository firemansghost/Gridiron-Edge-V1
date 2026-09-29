/**
 * Betting Ticket API — read-only synthesis.
 *
 * Sources:
 * - persisted Official Card Bet rows (frozen model price / locked wager truth)
 * - current persisted MarketLine snapshots
 *
 * No Core recalculation. No Bet/MarketLine writes.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSeasonWeek } from '@/lib/current-week';
import {
  OFFICIAL_CARD_SEASON,
  OfficialCardIntegrityError,
  buildOfficialCardView,
  buildOfficialCardWhere,
  formatKickoffChicago,
  officialCardPrismaSelect,
  parseOfficialCardWeekParam,
  type OfficialCardBetInput,
  type OfficialCardGameView,
  type OfficialCardWager,
} from '@/lib/official-card';
import {
  indexGameMarketSelections,
  type GameMarketSelection,
  type MarketLineObservation,
} from '@/lib/market-line-snapshot';
import {
  classifyBettingTicketWager,
  formatTicketPrice,
  type BettingTicketBucket,
} from '@/lib/betting-ticket';

function currentPriceForWager(
  wager: OfficialCardWager,
  selection: GameMarketSelection | null
): { price: number | null; book: string | null; timestamp: string | null } {
  if (!selection) return { price: null, book: null, timestamp: null };

  if (wager.marketType === 'spread') {
    const snap = selection.displaySpread;
    if (!snap) return { price: null, book: null, timestamp: null };
    const price =
      wager.side === 'home'
        ? snap.homeLine
        : wager.side === 'away'
          ? snap.awayLine
          : null;
    return { price, book: snap.bookName, timestamp: snap.timestamp };
  }

  if (wager.marketType === 'moneyline') {
    const snap = selection.displayMoneyline;
    if (!snap) return { price: null, book: null, timestamp: null };
    const price =
      wager.side === 'home'
        ? snap.homePrice
        : wager.side === 'away'
          ? snap.awayPrice
          : null;
    return { price, book: snap.bookName, timestamp: snap.timestamp };
  }

  if (wager.marketType === 'total') {
    const snap = selection.displayTotal;
    if (!snap) return { price: null, book: null, timestamp: null };
    return { price: snap.total, book: snap.bookName, timestamp: snap.timestamp };
  }

  return { price: null, book: null, timestamp: null };
}

function lockedEdgeOrValue(wager: OfficialCardWager): number | null {
  if (!wager.notesMeta.metadataAvailable) return null;
  if (wager.marketType === 'spread') return wager.notesMeta.edgePts;
  if (wager.marketType === 'moneyline') return wager.notesMeta.valuePercent;
  if (wager.marketType === 'total') return wager.notesMeta.ouEdgePts;
  return null;
}

function movementLabel(
  marketType: string,
  movement: number | null
): string {
  if (movement === null || !Number.isFinite(movement)) return 'Movement unavailable';
  const abs = Math.abs(movement);
  if (abs < 1e-9) return 'Same as lock';
  const direction = movement > 0 ? 'Better' : 'Worse';
  if (marketType === 'moneyline') {
    return `${direction} by ${abs.toFixed(1)}% implied`;
  }
  return `${direction} by ${abs.toFixed(1)} pts`;
}

function bucketOrder(bucket: BettingTicketBucket): number {
  if (bucket === 'bet') return 0;
  if (bucket === 'watch') return 1;
  return 2;
}

function ticketItem(
  game: OfficialCardGameView,
  wager: OfficialCardWager,
  selection: GameMarketSelection | null,
  nowIso: string
) {
  const current = currentPriceForWager(wager, selection);
  const classification = classifyBettingTicketWager({
    marketType: wager.marketType,
    side: wager.side,
    modelPrice: wager.modelPrice,
    lockedPrice: wager.closePrice,
    lockedGrade: wager.notesMeta.grade,
    currentPrice: current.price,
    gameStatus: game.status,
    kickoffIso: game.kickoffIso,
    nowIso,
  });

  const marketAgeMinutes =
    current.timestamp == null
      ? null
      : Math.max(
          0,
          (new Date(nowIso).getTime() - new Date(current.timestamp).getTime()) /
            60000
        );

  return {
    betId: wager.id,
    gameId: game.gameId,
    season: game.season,
    week: game.week,
    kickoffIso: game.kickoffIso,
    kickoffChicago: formatKickoffChicago(game.kickoffIso),
    status: game.status,
    awayTeamId: game.awayTeamId,
    awayTeamName: game.awayTeamName,
    homeTeamId: game.homeTeamId,
    homeTeamName: game.homeTeamName,
    marketType: wager.marketType,
    side: wager.side,
    selectedTeamName: wager.selectedTeamName,
    pickLabel: wager.pickLabel,
    modelPrice: wager.modelPrice,
    modelPriceLabel: wager.modelLineLabel,
    lockedPrice: wager.closePrice,
    lockedPriceLabel: wager.lockedLineLabel,
    lockedGrade: wager.notesMeta.grade,
    lockedEdgeOrValue: lockedEdgeOrValue(wager),
    currentPrice: current.price,
    currentPriceLabel: formatTicketPrice(wager.marketType, current.price),
    currentBook: current.book,
    currentTimestamp: current.timestamp,
    marketAgeMinutes:
      marketAgeMinutes !== null && Number.isFinite(marketAgeMinutes)
        ? Math.round(marketAgeMinutes * 10) / 10
        : null,
    currentEdgeOrValue:
      classification.currentEdgeOrValue !== null
        ? Math.round(classification.currentEdgeOrValue * 10) / 10
        : null,
    currentGrade: classification.currentGrade,
    movement:
      classification.movement !== null
        ? Math.round(classification.movement * 10) / 10
        : null,
    movementLabel: movementLabel(wager.marketType, classification.movement),
    priceNotWorse: classification.priceNotWorse,
    playableToPrice: classification.playableToPrice,
    playableToLabel: formatTicketPrice(
      wager.marketType,
      classification.playableToPrice
    ),
    priorityPrice: classification.priorityPrice,
    priorityPriceLabel: formatTicketPrice(
      wager.marketType,
      classification.priorityPrice
    ),
    bucket: classification.bucket,
    reason: classification.reason,
    actionLabel: classification.actionLabel,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedWeek = parseOfficialCardWeekParam(searchParams.get('week'));
    let week = requestedWeek;
    if (week == null) {
      const current = await getCurrentSeasonWeek(prisma);
      week = parseOfficialCardWeekParam(String(current.week)) ?? 1;
    }

    const officialRows = await prisma.bet.findMany({
      where: buildOfficialCardWhere(week),
      select: officialCardPrismaSelect(),
      orderBy: [{ game: { date: 'asc' } }, { marketType: 'asc' }, { createdAt: 'asc' }],
    });

    const { summary: officialSummary, games } = buildOfficialCardView(
      officialRows as unknown as OfficialCardBetInput[]
    );

    if (games.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          season: OFFICIAL_CARD_SEASON,
          week,
          generatedAt: new Date().toISOString(),
          policy: {
            bet: 'Locked A + current A + current price not worse than lock',
            watch: 'Current A/B value outside the strict BET NOW filter',
            pass: 'Current C/no qualifying value, unavailable market, or kickoff gate',
            playableTo: 'B-grade threshold from frozen persisted modelPrice',
          },
          summary: { total: 0, bet: 0, watch: 0, pass: 0 },
          officialSummary,
          items: [],
        },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const gameIds = games.map((game) => game.gameId);
    const marketRows = await prisma.marketLine.findMany({
      where: { gameId: { in: gameIds } },
      select: {
        id: true,
        gameId: true,
        lineType: true,
        lineValue: true,
        closingLine: true,
        bookName: true,
        timestamp: true,
        teamId: true,
        source: true,
      },
    });

    const marketSelections = indexGameMarketSelections({
      rows: marketRows.map(
        (row): MarketLineObservation => ({
          id: row.id,
          gameId: row.gameId,
          lineType: String(row.lineType),
          lineValue: Number(row.lineValue),
          closingLine:
            row.closingLine == null ? null : Number(row.closingLine),
          bookName: row.bookName,
          timestamp: row.timestamp,
          teamId: row.teamId,
          source: row.source,
        })
      ),
      games: games.map((game) => ({
        gameId: game.gameId,
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
        kickoff: game.kickoffIso,
        status: game.status,
      })),
    });

    const nowIso = new Date().toISOString();
    const items = games
      .flatMap((game) =>
        game.markets.map((wager) =>
          ticketItem(
            game,
            wager,
            marketSelections.get(game.gameId) ?? null,
            nowIso
          )
        )
      )
      .sort((a, b) => {
        const bucket = bucketOrder(a.bucket) - bucketOrder(b.bucket);
        if (bucket !== 0) return bucket;
        const kickoff =
          new Date(a.kickoffIso).getTime() - new Date(b.kickoffIso).getTime();
        if (kickoff !== 0) return kickoff;
        const market = a.marketType.localeCompare(b.marketType);
        if (market !== 0) return market;
        return a.pickLabel.localeCompare(b.pickLabel);
      });

    const summary = items.reduce(
      (acc, item) => {
        acc.total += 1;
        acc[item.bucket] += 1;
        return acc;
      },
      { total: 0, bet: 0, watch: 0, pass: 0 }
    );

    return NextResponse.json(
      {
        ok: true,
        season: OFFICIAL_CARD_SEASON,
        week,
        generatedAt: nowIso,
        policy: {
          bet: 'Locked A + current A + current price not worse than lock',
          watch: 'Current A/B value outside the strict BET NOW filter',
          pass: 'Current C/no qualifying value, unavailable market, or kickoff gate',
          playableTo: 'B-grade threshold from frozen persisted modelPrice',
        },
        summary,
        officialSummary,
        items,
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    if (error instanceof OfficialCardIntegrityError) {
      return NextResponse.json(
        { ok: false, error: error.message, duplicates: error.duplicates },
        { status: 409, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    console.error('BETTING_TICKET_API_ERROR', error);
    return NextResponse.json(
      {
        ok: false,
        error: 'Unable to load Betting Ticket',
        detail: String((error as Error)?.message ?? error),
      },
      { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
