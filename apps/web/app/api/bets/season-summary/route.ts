/**
 * Season Summary API Route
 * 
 * Expected URL: /api/bets/season-summary
 * 
 * Returns season-wide performance summary for strategy-run bets.
 * Filters by season, strategyTag (optional), and marketType (optional).
 * Only includes graded bets (result IN ('win', 'loss', 'push')).
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface WeekBreakdown {
  week: number;
  bets: number;
  wins: number;
  losses: number;
  pushes: number;
  stake: number;
  pnl: number;
  roi: number;
}

interface MarketTypeBreakdown {
  marketType: string;
  bets: number;
  wins: number;
  losses: number;
  pushes: number;
  stake: number;
  pnl: number;
  roi: number;
}

interface ConfidenceBreakdown {
  confidence: string;
  bets: number;
  wins: number;
  losses: number;
  pushes: number;
  stake: number;
  pnl: number;
  roi: number;
}

interface SeasonSummaryResponse {
  summary: {
    totalBets: number;
    wins: number;
    losses: number;
    pushes: number;
    totalStake: number;
    totalPnl: number;
    roi: number;
    winRate: number;
    avgEdge: number | null;
  };
  byWeek: WeekBreakdown[];
  byMarketType: MarketTypeBreakdown[];
  meta: {
    seasonsAvailable: number[];
    strategyTagsAvailable: string[];
    pendingBets: number;
    conflictBreakdown?: Record<string, {
      bets: number;
      wins: number;
      losses: number;
      pushes: number;
      winRate: number;
      stake: number;
      pnl: number;
      roi: number;
    }>;
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const seasonParam = searchParams.get('season');
    const strategyTagParam = searchParams.get('strategyTag') || 'all';
    const marketTypeParam = searchParams.get('marketType') || 'ALL';
    
    // Log API hit for debugging
    console.log('[season-summary] API hit', { 
      season: seasonParam, 
      strategyTag: strategyTagParam, 
      marketType: marketTypeParam 
    });
    
    // Map uppercase market type to lowercase (database uses lowercase)
    const marketTypeInputMap: Record<string, string> = {
      'ATS': 'spread',
      'TOTAL': 'total',
      'MONEYLINE': 'moneyline',
      'ALL': 'ALL',
    };
    const dbMarketType = marketTypeParam !== 'ALL' ? marketTypeInputMap[marketTypeParam] || marketTypeParam.toLowerCase() : 'ALL';

    if (!seasonParam) {
      return NextResponse.json(
        { error: 'season parameter is required' },
        { status: 400 }
      );
    }

    const season = parseInt(seasonParam, 10);
    if (isNaN(season)) {
      return NextResponse.json(
        { error: 'season must be a valid number' },
        { status: 400 }
      );
    }

    // Build base where clause
    const where: any = {
      season,
      source: 'strategy_run',
      result: { in: ['win', 'loss', 'push'] },
    };

    // Filter by strategyTag
    if (strategyTagParam !== 'all') {
      where.strategyTag = strategyTagParam;
    }

    // Filter by marketType
    if (dbMarketType !== 'ALL') {
      where.marketType = dbMarketType;
    }

    // Get all graded bets matching filters
    const gradedBets = await prisma.bet.findMany({
      where,
      select: {
        week: true,
        result: true,
        stake: true,
        pnl: true,
        marketType: true,
        modelPrice: true,
        closePrice: true,
        hybridConflictType: true,
      },
    });

    // Get pending bets (same filters but result IS NULL)
    const pendingWhere: any = {
      season,
      source: 'strategy_run',
      result: null,
    };
    if (strategyTagParam !== 'all') {
      pendingWhere.strategyTag = strategyTagParam;
    }
    if (dbMarketType !== 'ALL') {
      pendingWhere.marketType = dbMarketType;
    }
    const pendingBets = await prisma.bet.count({ where: pendingWhere });

    // Calculate summary
    const totalBets = gradedBets.length;
    const wins = gradedBets.filter(b => b.result === 'win').length;
    const losses = gradedBets.filter(b => b.result === 'loss').length;
    const pushes = gradedBets.filter(b => b.result === 'push').length;
    const totalStake = gradedBets.reduce((sum, b) => sum + Number(b.stake), 0);
    const totalPnl = gradedBets.reduce((sum, b) => sum + Number(b.pnl || 0), 0);
    const roi = totalStake > 0 ? totalPnl / totalStake : 0;
    const winRate = (wins + losses) > 0 ? wins / (wins + losses) : 0;

    // Calculate average edge (optional)
    let avgEdge: number | null = null;
    const edgeValues = gradedBets
      .filter(b => b.closePrice !== null)
      .map(b => {
        const modelPrice = Number(b.modelPrice);
        const closePrice = Number(b.closePrice);
        
        if (b.marketType === 'moneyline') {
          // For moneyline, calculate implied probability difference
          const modelImplied = modelPrice > 0 
            ? 100 / (modelPrice + 100) 
            : Math.abs(modelPrice) / (Math.abs(modelPrice) + 100);
          const closeImplied = closePrice! > 0 
            ? 100 / (closePrice! + 100) 
            : Math.abs(closePrice!) / (Math.abs(closePrice!) + 100);
          return modelImplied - closeImplied;
        } else {
          // For spread/total, calculate line difference
          return modelPrice - closePrice!;
        }
      });
    
    if (edgeValues.length > 0) {
      avgEdge = edgeValues.reduce((sum, edge) => sum + edge, 0) / edgeValues.length;
    }

    // Group by week
    const weekMap = new Map<number, typeof gradedBets>();
    for (const bet of gradedBets) {
      if (!weekMap.has(bet.week)) {
        weekMap.set(bet.week, []);
      }
      weekMap.get(bet.week)!.push(bet);
    }

    const byWeek: WeekBreakdown[] = Array.from(weekMap.entries())
      .map(([week, bets]) => {
        const weekWins = bets.filter(b => b.result === 'win').length;
        const weekLosses = bets.filter(b => b.result === 'loss').length;
        const weekPushes = bets.filter(b => b.result === 'push').length;
        const weekStake = bets.reduce((sum, b) => sum + Number(b.stake), 0);
        const weekPnl = bets.reduce((sum, b) => sum + Number(b.pnl || 0), 0);
        const weekRoi = weekStake > 0 ? weekPnl / weekStake : 0;

        return {
          week,
          bets: bets.length,
          wins: weekWins,
          losses: weekLosses,
          pushes: weekPushes,
          stake: weekStake,
          pnl: weekPnl,
          roi: weekRoi,
        };
      })
      .sort((a, b) => a.week - b.week);

    // Group by marketType
    const marketTypeMap = new Map<string, typeof gradedBets>();
    for (const bet of gradedBets) {
      const mt = bet.marketType;
      if (!marketTypeMap.has(mt)) {
        marketTypeMap.set(mt, []);
      }
      marketTypeMap.get(mt)!.push(bet);
    }

    // Map database market types to contract format (uppercase)
    const marketTypeDisplayMap: Record<string, string> = {
      'spread': 'ATS',
      'total': 'TOTAL',
      'moneyline': 'MONEYLINE',
    };

    const byMarketType: MarketTypeBreakdown[] = Array.from(marketTypeMap.entries())
      .map(([marketType, bets]) => {
        const mtWins = bets.filter(b => b.result === 'win').length;
        const mtLosses = bets.filter(b => b.result === 'loss').length;
        const mtPushes = bets.filter(b => b.result === 'push').length;
        const mtStake = bets.reduce((sum, b) => sum + Number(b.stake), 0);
        const mtPnl = bets.reduce((sum, b) => sum + Number(b.pnl || 0), 0);
        const mtRoi = mtStake > 0 ? mtPnl / mtStake : 0;

        return {
          marketType: marketTypeDisplayMap[marketType] || marketType.toUpperCase(),
          bets: bets.length,
          wins: mtWins,
          losses: mtLosses,
          pushes: mtPushes,
          stake: mtStake,
          pnl: mtPnl,
          roi: mtRoi,
        };
      })
      .sort((a, b) => b.bets - a.bets);

    // Get metadata: available seasons and strategy tags
    // Only get strategy tags for the requested season
    const seasonStrategyRunBets = await prisma.bet.findMany({
      where: { 
        source: 'strategy_run',
        season,
      },
      select: {
        strategyTag: true,
      },
      distinct: ['strategyTag'],
    });

    // Get all seasons with strategy_run bets
    const allSeasons = await prisma.bet.findMany({
      where: { source: 'strategy_run' },
      select: {
        season: true,
      },
      distinct: ['season'],
    });

    const seasonsAvailable = Array.from(
      new Set(allSeasons.map(b => b.season))
    ).sort((a, b) => a - b); // Sort ascending as per contract

    const strategyTagsAvailable = Array.from(
      new Set(seasonStrategyRunBets.map(b => b.strategyTag))
    ).sort();

    // Calculate conflict breakdown if applicable
    const conflictBreakdown: Record<string, {
      bets: number;
      wins: number;
      losses: number;
      pushes: number;
      winRate: number;
      stake: number;
      pnl: number;
      roi: number;
    }> = {};

    const betsWithConflict = gradedBets.filter(b => b.hybridConflictType !== null);
    if (betsWithConflict.length > 0) {
      const conflictMap = new Map<string, typeof gradedBets>();
      for (const bet of betsWithConflict) {
        const type = bet.hybridConflictType!;
        if (!conflictMap.has(type)) {
          conflictMap.set(type, []);
        }
        conflictMap.get(type)!.push(bet);
      }

      for (const [type, bets] of Array.from(conflictMap.entries())) {
        const betsForType = bets;
        const typeWins = betsForType.filter((b: typeof gradedBets[0]) => b.result === 'win').length;
        const typeLosses = betsForType.filter((b: typeof gradedBets[0]) => b.result === 'loss').length;
        const typePushes = betsForType.filter((b: typeof gradedBets[0]) => b.result === 'push').length;
        const typeStake = betsForType.reduce((sum: number, b: typeof gradedBets[0]) => sum + Number(b.stake), 0);
        const typePnl = betsForType.reduce((sum: number, b: typeof gradedBets[0]) => sum + Number(b.pnl || 0), 0);
        const typeRoi = typeStake > 0 ? (typePnl / typeStake) * 100 : 0;
        const typeWinRate = (typeWins + typeLosses) > 0 ? (typeWins / (typeWins + typeLosses)) * 100 : 0;

        conflictBreakdown[type] = {
          bets: betsForType.length,
          wins: typeWins,
          losses: typeLosses,
          pushes: typePushes,
          winRate: Math.round(typeWinRate * 100) / 100,
          stake: Math.round(typeStake * 100) / 100,
          pnl: Math.round(typePnl * 100) / 100,
          roi: Math.round(typeRoi * 100) / 100,
        };
      }
    }

    const response: SeasonSummaryResponse = {
      summary: {
        totalBets,
        wins,
        losses,
        pushes,
        totalStake,
        totalPnl,
        roi,
        winRate,
        avgEdge: avgEdge ?? null,
      },
      byWeek,
      byMarketType,
      meta: {
        seasonsAvailable,
        strategyTagsAvailable,
        pendingBets,
        ...(Object.keys(conflictBreakdown).length > 0 && { conflictBreakdown }),
      },
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('SEASON_SUMMARY_API_ERROR', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: 'Internal error',
        detail: errorMessage,
      },
      { status: 500 }
    );
  }
}

