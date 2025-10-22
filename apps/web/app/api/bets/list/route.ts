import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const season = searchParams.get('season');
    const week = searchParams.get('week');
    const marketType = searchParams.get('marketType');
    const side = searchParams.get('side');
    const strategy = searchParams.get('strategy');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build where clause
    const where: any = {};
    if (season) where.season = parseInt(season);
    if (week) where.week = parseInt(week);
    if (marketType) where.marketType = marketType;
    if (side) where.side = side;
    if (strategy) where.strategyTag = strategy;

    // Get bets with pagination
    const [bets, total] = await Promise.all([
      prisma.bet.findMany({
        where,
        include: {
          game: {
            include: {
              homeTeam: { select: { name: true } },
              awayTeam: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.bet.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      items: bets.map(bet => ({
        ...bet,
        modelPrice: Number(bet.modelPrice),
        closePrice: bet.closePrice ? Number(bet.closePrice) : null,
        stake: Number(bet.stake),
        pnl: bet.pnl ? Number(bet.pnl) : null,
        clv: bet.clv ? Number(bet.clv) : null,
      })),
      total,
    });

  } catch (error) {
    console.error('BETS_API_ERROR list', error);
    return NextResponse.json(
      { error: 'Internal error', detail: String((error as Error)?.message ?? error) },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
