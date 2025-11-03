import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { pickMarketLine, getLineValue } from '@/lib/market-line-helpers';
import { getCurrentSeasonWeek } from '@/lib/current-week';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * My Card API - Returns tracked bets with current best lines and CLV
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const season = searchParams.get('season');
    const week = searchParams.get('week');
    const status = searchParams.get('status'); // 'pending', 'graded', 'all'
    const marketType = searchParams.get('marketType');

    // Default to current week if not specified
    const current = getCurrentSeasonWeek();
    const filterSeason = season ? parseInt(season) : current.season;
    const filterWeek = week ? parseInt(week) : current.week;

    // Build where clause
    const where: any = {
      season: filterSeason,
    };

    if (filterWeek) {
      where.week = filterWeek;
    }

    if (marketType) {
      where.marketType = marketType;
    }

    if (status === 'pending') {
      where.result = null;
    } else if (status === 'graded') {
      where.result = { not: null };
    }

    // Get bets with game and market lines
    const bets = await prisma.bet.findMany({
      where,
      include: {
        game: {
          include: {
            homeTeam: { select: { id: true, name: true } },
            awayTeam: { select: { id: true, name: true } },
            marketLines: true,
          },
        },
      },
      orderBy: [
        { week: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    // Enrich bets with current best lines and CLV
    const enrichedBets = bets.map(bet => {
      // Get current best line for the bet's market type
      const bestLine = pickMarketLine(bet.game.marketLines, bet.marketType as 'spread' | 'total' | 'moneyline');
      const currentLine = getLineValue(bestLine);

      // Calculate CLV (Closing Line Value)
      // CLV = (bet line - closing line) for spreads/totals
      // For moneyline, CLV = implied prob difference
      let clv: number | null = null;
      if (bet.closePrice !== null && bet.modelPrice !== null && currentLine !== null) {
        const betLine = Number(bet.modelPrice);
        const closingLine = Number(bet.closePrice);
        
        if (bet.marketType === 'moneyline') {
          // For moneyline, CLV is the difference in implied probabilities
          // Positive CLV means we got better odds than closing
          const betProb = betLine > 0 
            ? 100 / (betLine + 100) 
            : (-betLine) / (-betLine + 100);
          const closingProb = closingLine > 0
            ? 100 / (closingLine + 100)
            : (-closingLine) / (-closingLine + 100);
          clv = betProb - closingProb; // Positive = we got better odds
        } else {
          // For spread/total: CLV = betLine - closingLine
          // Positive CLV = we got better line (more points for favorite, fewer for underdog)
          clv = betLine - closingLine;
        }
      }

      // Calculate edge vs current line
      let edgeVsCurrent: number | null = null;
      if (currentLine !== null && bet.modelPrice !== null) {
        const modelLine = Number(bet.modelPrice);
        edgeVsCurrent = modelLine - currentLine;
      }

      return {
        ...bet,
        modelPrice: Number(bet.modelPrice),
        closePrice: bet.closePrice ? Number(bet.closePrice) : null,
        stake: Number(bet.stake),
        pnl: bet.pnl ? Number(bet.pnl) : null,
        clv: clv ?? (bet.clv ? Number(bet.clv) : null), // Use calculated CLV if available, otherwise use stored
        currentBestLine: currentLine,
        currentBestLineBook: bestLine?.bookName || null,
        currentBestLineTimestamp: bestLine?.timestamp || null,
        edgeVsCurrent,
        gameStatus: bet.game.status,
        gameDate: bet.game.date,
      };
    });

    // Calculate summary stats
    const pendingBets = enrichedBets.filter(b => b.result === null);
    const gradedBets = enrichedBets.filter(b => b.result !== null);
    const totalStake = enrichedBets.reduce((sum, b) => sum + Number(b.stake), 0);
    const totalPnL = gradedBets.reduce((sum, b) => sum + (b.pnl || 0), 0);
    const winCount = gradedBets.filter(b => b.result === 'win').length;
    const lossCount = gradedBets.filter(b => b.result === 'loss').length;
    const pushCount = gradedBets.filter(b => b.result === 'push').length;
    const hitRate = gradedBets.length > 0 ? winCount / gradedBets.length : 0;

    return NextResponse.json({
      success: true,
      season: filterSeason,
      week: filterWeek,
      bets: enrichedBets,
      summary: {
        total: enrichedBets.length,
        pending: pendingBets.length,
        graded: gradedBets.length,
        totalStake,
        totalPnL,
        winCount,
        lossCount,
        pushCount,
        hitRate,
      },
    });

  } catch (error) {
    console.error('MY_CARD_API_ERROR', error);
    return NextResponse.json(
      { success: false, error: 'Internal error', detail: String((error as Error)?.message ?? error) },
      { status: 500 }
    );
  }
}

