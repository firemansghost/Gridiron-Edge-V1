/**
 * Labs: Portfolio What-Ifs API
 * 
 * Computes portfolio statistics for various filter scenarios
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface PortfolioStats {
  bets: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
  roi: number;
  pnl: number;
  avgEdge: number | null;
  avgClv: number | null;
}

interface PortfolioScenario {
  name: string;
  description: string;
  stats: PortfolioStats;
}

/**
 * Determine if bet team is dog based on closing price
 */
function isBetTeamDog(closePrice: number | null): boolean {
  if (closePrice === null) return false;
  return Number(closePrice) >= 0;
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const season = parseInt(url.searchParams.get('season') || '2025', 10);

    if (!season) {
      return NextResponse.json(
        { error: 'Invalid season parameter' },
        { status: 400 }
      );
    }

    // Load continuity scores for all teams
    const teamSeasons = await prisma.teamSeasonStat.findMany({
      where: { season },
    });

    const continuityMap = new Map<string, number>();
    for (const ts of teamSeasons) {
      const rawJson = (ts.rawJson as any) || {};
      const portalMeta = rawJson.portal_meta;
      if (portalMeta && typeof portalMeta.continuityScore === 'number') {
        continuityMap.set(ts.teamId, portalMeta.continuityScore);
      }
    }

    const scenarios: PortfolioScenario[] = [];

    // Scenario 1: Official Baseline (all bets)
    const officialBaseline = await prisma.bet.findMany({
      where: {
        season,
        strategyTag: 'official_flat_100',
        marketType: 'spread',
        result: { in: ['win', 'loss', 'push'] },
      },
      include: {
        game: {
          select: {
            homeTeamId: true,
            awayTeamId: true,
          },
        },
      },
    });

    const officialBaselineStats = calculateStats(officialBaseline, continuityMap);
    scenarios.push({
      name: 'Official – Baseline',
      description: 'All graded spread bets for official_flat_100',
      stats: officialBaselineStats,
    });

    // Scenario 2: Official – Drop Low-Continuity Dogs
    const officialFiltered = officialBaseline.filter(bet => {
      const betTeamId = bet.side === 'home' ? bet.game.homeTeamId : bet.game.awayTeamId;
      const betTeamContinuity = continuityMap.get(betTeamId);
      const closePrice = bet.closePrice ? Number(bet.closePrice) : null;
      const isDog = isBetTeamDog(closePrice);
      const isLowContinuityDog = betTeamContinuity !== undefined && betTeamContinuity < 0.60 && isDog;
      return !isLowContinuityDog;
    });

    const officialFilteredStats = calculateStats(officialFiltered, continuityMap);
    scenarios.push({
      name: 'Official – Drop Low-Continuity Dogs',
      description: 'Remove spread bets where bet team continuity < 0.60 AND dog',
      stats: officialFilteredStats,
    });

    // Scenario 3: Official – Drop Hybrid Weak
    // First, get all hybrid_v2 bets to build a game-level conflict type map
    const hybridBets = await prisma.bet.findMany({
      where: {
        season,
        strategyTag: 'hybrid_v2',
        marketType: 'spread',
      },
      select: {
        gameId: true,
        hybridConflictType: true,
      },
    });

    const gameConflictMap = new Map<string, string | null>();
    for (const bet of hybridBets) {
      if (!gameConflictMap.has(bet.gameId)) {
        gameConflictMap.set(bet.gameId, bet.hybridConflictType);
      }
    }

    const officialDropWeak = officialBaseline.filter(bet => {
      const conflictType = gameConflictMap.get(bet.gameId);
      return conflictType !== 'hybrid_weak';
    });

    const officialDropWeakStats = calculateStats(officialDropWeak, continuityMap);
    scenarios.push({
      name: 'Official – Drop Hybrid Weak',
      description: 'Remove bets whose game has hybridConflictType = hybrid_weak',
      stats: officialDropWeakStats,
    });

    // Scenario 4: Hybrid V2 Baseline
    const hybridBaseline = await prisma.bet.findMany({
      where: {
        season,
        strategyTag: 'hybrid_v2',
        marketType: 'spread',
        result: { in: ['win', 'loss', 'push'] },
      },
      include: {
        game: {
          select: {
            homeTeamId: true,
            awayTeamId: true,
          },
        },
      },
    });

    const hybridBaselineStats = calculateStats(hybridBaseline, continuityMap);
    scenarios.push({
      name: 'Hybrid V2 – Baseline',
      description: 'All graded spread bets for hybrid_v2',
      stats: hybridBaselineStats,
    });

    // Scenario 5: Hybrid V2 – Super Tier A Only
    const hybridSuperTierA = hybridBaseline.filter(bet => {
      const absEdge = bet.modelPrice && bet.closePrice
        ? Math.abs(Number(bet.modelPrice) - Number(bet.closePrice))
        : null;
      return bet.hybridConflictType === 'hybrid_strong' && absEdge !== null && absEdge >= 4.0;
    });

    const hybridSuperTierAStats = calculateStats(hybridSuperTierA, continuityMap);
    scenarios.push({
      name: 'Hybrid V2 – Super Tier A Only',
      description: 'hybrid_strong bets with |edge| >= 4.0',
      stats: hybridSuperTierAStats,
    });

    return NextResponse.json({ scenarios, season });

  } catch (error) {
    console.error('Portfolio What-Ifs API error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

function calculateStats(
  bets: any[],
  continuityMap: Map<string, number>
): PortfolioStats {
  const wins = bets.filter(b => b.result === 'win').length;
  const losses = bets.filter(b => b.result === 'loss').length;
  const pushes = bets.filter(b => b.result === 'push').length;
  const totalStake = bets.reduce((sum, b) => sum + Number(b.stake), 0);
  const totalPnL = bets.reduce((sum, b) => sum + Number(b.pnl || 0), 0);
  const roi = totalStake > 0 ? (totalPnL / totalStake) * 100 : 0;
  const winRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0;

  // Calculate average edge and CLV
  let totalEdge = 0;
  let edgeCount = 0;
  let totalClv = 0;
  let clvCount = 0;

  for (const bet of bets) {
    if (bet.modelPrice && bet.closePrice) {
      const modelPrice = Number(bet.modelPrice);
      const closePrice = Number(bet.closePrice);
      const edge = Math.abs(modelPrice - closePrice);
      totalEdge += edge;
      edgeCount++;
    }
    if (bet.clv !== null) {
      totalClv += Number(bet.clv);
      clvCount++;
    }
  }

  const avgEdge = edgeCount > 0 ? totalEdge / edgeCount : null;
  const avgClv = clvCount > 0 ? totalClv / clvCount : null;

  return {
    bets: bets.length,
    wins,
    losses,
    pushes,
    winRate,
    roi,
    pnl: totalPnL,
    avgEdge,
    avgClv,
  };
}


