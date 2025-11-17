import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOfficialStrategyTagsForFilter, isExcludedStrategyTag } from '@/lib/config/official-strategies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const season = searchParams.get('season');
    const week = searchParams.get('week');
    const strategy = searchParams.get('strategy');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    // Build where clause
    // Note: when "All Strategies" is selected we intentionally
    // omit strategyTag from the where clause instead of using
    // `not: null`, because Prisma groupBy doesn't allow `not: null`
    // and we just want "all tags" anyway.
    const where: any = {};
    if (season) where.season = parseInt(season);
    if (week) where.week = parseInt(week);
    
    // Always filter to only official Trust-Market strategies (exclude demo/test)
    // Get official strategy tags from active rulesets
    const officialTags = await getOfficialStrategyTagsForFilter();
    
    // Only filter by strategy if it's provided and not empty (not "All Strategies")
    if (strategy && strategy.trim() !== '' && strategy !== 'all') {
      // Verify the selected strategy is official (not demo/test)
      if (!isExcludedStrategyTag(strategy) && officialTags.includes(strategy)) {
        where.strategyTag = strategy;
      } else {
        // If selected strategy is not official, return empty results
        where.strategyTag = '__nonexistent__'; // This will match nothing
      }
    } else {
      // "All Strategies" - filter to only official tags
      if (officialTags.length > 0) {
        where.strategyTag = { in: officialTags };
      } else {
        // No official strategies configured - return empty results
        where.strategyTag = '__nonexistent__';
      }
    }
    
    // Always filter to strategy-run bets (not manual entries)
    where.source = 'strategy_run';

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
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.bet.count({ where }),
    ]);

    // Calculate summary statistics
    const allBets = await prisma.bet.findMany({
      where,
      select: {
        result: true,
        pnl: true,
        clv: true,
        modelPrice: true,
        closePrice: true,
        marketType: true,
        stake: true,
      },
    });

    // Calculate metrics
    const gradedBets = allBets.filter(bet => bet.result !== null);
    const hitRate = gradedBets.length > 0 
      ? gradedBets.filter(bet => bet.result === 'win').length / gradedBets.length 
      : 0;

    const totalPnL = allBets.reduce((sum, bet) => sum + Number(bet.pnl || 0), 0);
    const totalStake = allBets.reduce((sum, bet) => sum + Number(bet.stake), 0);
    const roi = totalStake > 0 ? (totalPnL / totalStake) * 100 : 0;

    const clvValues = allBets
      .filter(bet => bet.clv !== null)
      .map(bet => Number(bet.clv));
    const avgCLV = clvValues.length > 0 
      ? clvValues.reduce((sum, clv) => sum + clv, 0) / clvValues.length 
      : 0;

    // Calculate average edge (modelPrice vs closePrice)
    const edgeValues = allBets
      .filter(bet => bet.closePrice !== null)
      .map(bet => {
        const modelPrice = Number(bet.modelPrice);
        const closePrice = Number(bet.closePrice);
        
        if (bet.marketType === 'moneyline') {
          // For moneyline, calculate implied probability difference
          const modelImplied = modelPrice > 0 ? 100 / (modelPrice + 100) : Math.abs(modelPrice) / (Math.abs(modelPrice) + 100);
          const closeImplied = closePrice > 0 ? 100 / (closePrice + 100) : Math.abs(closePrice) / (Math.abs(closePrice) + 100);
          return modelImplied - closeImplied;
        } else {
          // For spread/total, calculate line difference
          return modelPrice - closePrice;
        }
      });
    const avgEdge = edgeValues.length > 0 
      ? edgeValues.reduce((sum, edge) => sum + edge, 0) / edgeValues.length 
      : 0;

    // Group by strategy if no specific strategy requested
    // Note: The where clause already filters to official strategies only
    let strategyBreakdown = null;
    if (!strategy || strategy.trim() === '' || strategy === 'all') {
      const strategies = await prisma.bet.groupBy({
        by: ['strategyTag'],
        where: where, // Already filtered to official strategies only
        _count: { _all: true },
        _sum: { pnl: true },
      });

      // Filter out null strategyTags and ensure we only include official tags
      strategyBreakdown = strategies
        .filter(s => s.strategyTag !== null && !isExcludedStrategyTag(s.strategyTag))
        .map(s => ({
          strategy: s.strategyTag,
          count: s._count._all,
          totalPnL: s._sum.pnl ? Number(s._sum.pnl) : 0,
        }));
    }

    return NextResponse.json({
      success: true,
      pagination: {
        currentPage: page,
        pageSize: limit,
        totalItems: total,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        totalBets: allBets.length,
        gradedBets: gradedBets.length,
        hitRate: Math.round(hitRate * 100) / 100,
        roi: Math.round(roi * 100) / 100,
        totalPnL: Math.round(totalPnL * 100) / 100,
        avgEdge: Math.round(avgEdge * 100) / 100,
        avgCLV: Math.round(avgCLV * 100) / 100,
      },
      strategyBreakdown,
      bets: bets.map(bet => ({
        ...bet,
        modelPrice: Number(bet.modelPrice),
        closePrice: bet.closePrice ? Number(bet.closePrice) : null,
        stake: Number(bet.stake),
        pnl: bet.pnl ? Number(bet.pnl) : null,
        clv: bet.clv ? Number(bet.clv) : null,
      })),
    });

  } catch (error) {
    console.error('BETS_API_ERROR summary', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Internal error', 
        detail: errorMessage 
      },
      { status: 500 }
    );
  }
}
