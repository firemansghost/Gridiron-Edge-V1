import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    // Check if seeding is enabled
    if (process.env.ENABLE_BETS_SEED !== 'true') {
      return NextResponse.json({ error: 'Seeding not enabled' }, { status: 403 });
    }

    // Find real Week 9 games
    const games = await prisma.game.findMany({
      where: {
        season: 2025,
        week: 9,
      },
      select: { id: true, homeTeamId: true, awayTeamId: true },
      take: 5,
    });

    if (games.length === 0) {
      return NextResponse.json({ error: 'No Week 9 games found' }, { status: 404 });
    }

    const demoBets = [
      {
        season: 2025,
        week: 9,
        gameId: games[0]?.id,
        marketType: 'spread' as const,
        side: 'away' as const,
        modelPrice: -7.5,
        stake: 100,
        strategyTag: 'demo_seed',
        source: 'strategy_run' as const,
        notes: 'Demo bet 1',
      },
      {
        season: 2025,
        week: 9,
        gameId: games[1]?.id,
        marketType: 'total' as const,
        side: 'over' as const,
        modelPrice: 55.0,
        stake: 100,
        strategyTag: 'demo_seed',
        source: 'strategy_run' as const,
        notes: 'Demo bet 2',
      },
      {
        season: 2025,
        week: 9,
        gameId: games[2]?.id,
        marketType: 'moneyline' as const,
        side: 'home' as const,
        modelPrice: -150,
        stake: 100,
        strategyTag: 'demo_seed',
        source: 'strategy_run' as const,
        notes: 'Demo bet 3',
      },
    ].filter(bet => bet.gameId); // Only include bets with valid gameIds

    const insertedBets = [];
    for (const betData of demoBets) {
      const newBet = await prisma.bet.create({
        data: betData,
      });
      insertedBets.push({
        ...newBet,
        modelPrice: Number(newBet.modelPrice),
        closePrice: newBet.closePrice ? Number(newBet.closePrice) : null,
        stake: Number(newBet.stake),
        pnl: newBet.pnl ? Number(newBet.pnl) : null,
        clv: newBet.clv ? Number(newBet.clv) : null,
      });
    }

    return NextResponse.json({
      success: true,
      inserted: insertedBets.length,
      bets: insertedBets,
    });

  } catch (error) {
    console.error('BETS_API_ERROR seed', error);
    return NextResponse.json(
      { error: 'Internal error', detail: String((error as Error)?.message ?? error) },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
