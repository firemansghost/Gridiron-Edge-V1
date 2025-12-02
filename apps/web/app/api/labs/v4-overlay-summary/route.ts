/**
 * V4 Overlay Summary API
 * 
 * Returns aggregated statistics for V4 (Labs) and Fade V4 (Labs) strategies
 * across 2024 and 2025 seasons.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface StrategySummary {
  season: number;
  strategy: string;
  bets: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number | null;
  totalStake: number;
  pnl: number;
  roi: number;
  tierABets: number;
  tierARoi: number | null;
}

async function calculateStrategySummary(
  season: number,
  strategyTag: string
): Promise<StrategySummary | null> {
  // Get all graded bets for this strategy
  const gradedBets = await prisma.bet.findMany({
    where: {
      season,
      strategyTag,
      marketType: 'spread',
      result: { in: ['win', 'loss', 'push'] },
    },
    select: {
      modelPrice: true,
      closePrice: true,
      result: true,
      stake: true,
      pnl: true,
    },
  });

  if (gradedBets.length === 0) {
    return null;
  }

  const wins = gradedBets.filter(b => b.result === 'win').length;
  const losses = gradedBets.filter(b => b.result === 'loss').length;
  const pushes = gradedBets.filter(b => b.result === 'push').length;
  const totalStake = gradedBets.reduce((sum, b) => sum + Number(b.stake), 0);
  const totalPnl = gradedBets.reduce((sum, b) => sum + Number(b.pnl || 0), 0);
  const roi = totalStake > 0 ? (totalPnl / totalStake) * 100 : 0;
  const winRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : null;

  // Calculate Tier A stats (edge >= 3.0 points)
  const tierABets = gradedBets.filter(bet => {
    if (!bet.closePrice) return false;
    const edge = Math.abs(Number(bet.modelPrice) - Number(bet.closePrice));
    return edge >= 3.0;
  });

  const tierAStake = tierABets.reduce((sum, b) => sum + Number(b.stake), 0);
  const tierAPnl = tierABets.reduce((sum, b) => sum + Number(b.pnl || 0), 0);
  const tierARoi = tierAStake > 0 ? (tierAPnl / tierAStake) * 100 : null;

  return {
    season,
    strategy: strategyTag,
    bets: gradedBets.length,
    wins,
    losses,
    pushes,
    winRate,
    totalStake,
    pnl: totalPnl,
    roi,
    tierABets: tierABets.length,
    tierARoi,
  };
}

export async function GET() {
  try {
    const seasons = [2024, 2025];
    const strategies = ['v4_labs', 'fade_v4_labs'];
    
    const summaries: StrategySummary[] = [];
    
    for (const season of seasons) {
      for (const strategy of strategies) {
        const summary = await calculateStrategySummary(season, strategy);
        if (summary) {
          summaries.push(summary);
        }
      }
    }

    return NextResponse.json({
      success: true,
      summaries,
    });
  } catch (error) {
    console.error('[v4-overlay-summary] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch V4 overlay summary',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}





