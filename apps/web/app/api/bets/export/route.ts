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
    const strategy = searchParams.get('strategy');

    if (!season) {
      return NextResponse.json({ error: 'Season is required' }, { status: 400 });
    }

    // Build where clause
    const where: any = {
      season: parseInt(season),
    };
    
    if (week) where.week = parseInt(week);
    if (strategy) where.strategyTag = strategy;

    // Get all bets matching the criteria
    const bets = await prisma.bet.findMany({
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
    });

    // Generate CSV content
    const headers = [
      'Season',
      'Week', 
      'Matchup',
      'Market',
      'Side',
      'Model Price',
      'Close Price',
      'CLV',
      'Edge',
      'Result',
      'Stake',
      'PnL',
      'Strategy',
      'Source',
      'Created'
    ];

    const rows = bets.map(bet => {
      const edge = bet.closePrice && bet.marketType !== 'moneyline' 
        ? (Number(bet.modelPrice) - Number(bet.closePrice)).toFixed(1)
        : '';
      
      return [
        bet.season,
        bet.week,
        `${bet.game.awayTeam.name} @ ${bet.game.homeTeam.name}`,
        bet.marketType,
        bet.side,
        bet.modelPrice,
        bet.closePrice || '',
        bet.clv ? bet.clv.toFixed(3) : '',
        edge,
        bet.result || '',
        bet.stake,
        bet.pnl || '',
        bet.strategyTag,
        bet.source,
        new Date(bet.createdAt).toISOString()
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const filename = `bets-${season}${week ? `-w${week}` : ''}${strategy ? `-${strategy}` : ''}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error('BETS_API_ERROR export', error);
    return NextResponse.json(
      { error: 'Internal error', detail: String((error as Error)?.message ?? error) },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
