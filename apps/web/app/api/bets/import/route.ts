import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

interface BetImportRequest {
  season: number;
  week: number;
  gameId?: string;
  homeId?: string;
  awayId?: string;
  marketType: 'spread' | 'total' | 'moneyline';
  side: 'home' | 'away' | 'over' | 'under';
  modelPrice: number;
  stake: number;
  strategyTag: string;
  source: 'strategy_run' | 'manual';
  notes?: string;
}

export async function POST(request: NextRequest) {
  try {
    const bets: BetImportRequest[] = await request.json();

    if (!Array.isArray(bets) || bets.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request: expected array of bets' },
        { status: 400 }
      );
    }

    const results = [];

    for (const bet of bets) {
      // Resolve gameId if not provided
      let gameId = bet.gameId;
      if (!gameId && bet.homeId && bet.awayId) {
        const game = await prisma.game.findFirst({
          where: {
            season: bet.season,
            week: bet.week,
            homeTeamId: bet.homeId,
            awayTeamId: bet.awayId,
          },
        });
        if (!game) {
          throw new Error(`Game not found for ${bet.awayId} @ ${bet.homeId} in ${bet.season} W${bet.week}`);
        }
        gameId = game.id;
      }

      if (!gameId) {
        throw new Error('Either gameId or both homeId and awayId must be provided');
      }

      // Find closePrice from market_lines
      let closePrice: number | null = null;
      if (bet.marketType === 'moneyline') {
        // For moneyline, find the latest h2h line
        const latestLine = await prisma.marketLine.findFirst({
          where: {
            gameId,
            lineType: 'moneyline',
            timestamp: { lte: new Date() },
          },
          orderBy: { timestamp: 'desc' },
        });
        closePrice = latestLine?.lineValue || null;
      } else {
        // For spread/total, find the latest line
        const latestLine = await prisma.marketLine.findFirst({
          where: {
            gameId,
            lineType: bet.marketType,
            timestamp: { lte: new Date() },
          },
          orderBy: { timestamp: 'desc' },
        });
        closePrice = latestLine?.lineValue || null;
      }

      // Create the bet
      const createdBet = await prisma.bet.create({
        data: {
          season: bet.season,
          week: bet.week,
          gameId,
          marketType: bet.marketType,
          side: bet.side,
          modelPrice: bet.modelPrice,
          closePrice,
          stake: bet.stake,
          strategyTag: bet.strategyTag,
          source: bet.source,
          notes: bet.notes,
        },
        include: {
          game: {
            include: {
              homeTeam: { select: { name: true } },
              awayTeam: { select: { name: true } },
            },
          },
        },
      });

      results.push(createdBet);
    }

    return NextResponse.json({
      success: true,
      count: results.length,
      bets: results,
    });

  } catch (error) {
    console.error('BETS_API_ERROR import', error);
    return NextResponse.json(
      { error: 'Internal error', detail: String((error as Error)?.message ?? error) },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
