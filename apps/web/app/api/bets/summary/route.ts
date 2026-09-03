import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isExcludedStrategyTag } from '@/lib/config/official-strategies';
import {
  computeMarketBreakdownByMarketType,
  computeWeekReviewMetrics,
  type ReviewBetRow,
} from '@/lib/review-truth-week';

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
    const seasonNum = season ? parseInt(season, 10) : null;
    const weekNum = week ? parseInt(week, 10) : null;
    const isOfficial2026Review =
      seasonNum !== null && seasonNum >= 2026 && strategy === 'official_flat_100';

    // Build where clause
    // NOTE: In the 2025 dev phase we include ALL strategy_run bets (including demo/test)
    // in Week Review for testing. Once official strategies are live, we may re-enable
    // filtering using isOfficialStrategyTag(...) here.
    const where: any = {};
    if (seasonNum !== null) where.season = seasonNum;
    if (weekNum !== null) where.week = weekNum;
    
    // Always filter to strategy-run bets (not manual entries)
    where.source = 'strategy_run';
    
    // Only filter by strategy if it's provided and not empty (not "All Strategies")
    if (strategy && strategy.trim() !== '' && strategy !== 'all') {
      where.strategyTag = strategy;
    }
    // When "All Strategies" is selected, we intentionally omit strategyTag from the where clause

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
        hybridConflictType: true,
      },
    });

    // Get metadata for demo/test awareness
    // Query all strategy_run bets matching the same filters to detect demo/test presence
    const metaWhere: any = {};
    if (seasonNum !== null) metaWhere.season = seasonNum;
    if (weekNum !== null) metaWhere.week = weekNum;
    metaWhere.source = 'strategy_run';
    // Use same strategy filter as main query
    if (strategy && strategy.trim() !== '' && strategy !== 'all') {
      metaWhere.strategyTag = strategy;
    }
    
    const allStrategyRunBets = await prisma.bet.findMany({
      where: metaWhere,
      select: {
        strategyTag: true,
      },
    });

    // Group by tag to identify demo/test tags
    const tagsByCount = new Map<string, number>();
    for (const bet of allStrategyRunBets) {
      tagsByCount.set(bet.strategyTag, (tagsByCount.get(bet.strategyTag) || 0) + 1);
    }

    // Identify demo/test tags that are present
    const demoTagsPresent = Array.from(tagsByCount.keys())
      .filter(tag => isExcludedStrategyTag(tag));

    // Get all distinct strategy tags for this season/week (for strategy selector)
    const strategyTagsForScope = await prisma.bet.findMany({
      where: {
        ...(seasonNum !== null && { season: seasonNum }),
        ...(weekNum !== null && { week: weekNum }),
        source: 'strategy_run',
      },
      select: {
        strategyTag: true,
      },
      distinct: ['strategyTag'],
    });

    const strategyTagsAvailable = Array.from(
      new Set(strategyTagsForScope.map(b => b.strategyTag).filter((tag): tag is string => tag !== null))
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

    const betsWithConflict = allBets.filter(b => b.hybridConflictType !== null);
    if (betsWithConflict.length > 0) {
      const conflictMap = new Map<string, typeof allBets>();
      for (const bet of betsWithConflict) {
        const type = bet.hybridConflictType!;
        if (!conflictMap.has(type)) {
          conflictMap.set(type, []);
        }
        conflictMap.get(type)!.push(bet);
      }

      for (const [type, bets] of Array.from(conflictMap.entries())) {
        const betsForType = bets;
        const wins = betsForType.filter((b: typeof allBets[0]) => b.result === 'win').length;
        const losses = betsForType.filter((b: typeof allBets[0]) => b.result === 'loss').length;
        const pushes = betsForType.filter((b: typeof allBets[0]) => b.result === 'push').length;
        const stake = betsForType.reduce((sum: number, b: typeof allBets[0]) => sum + Number(b.stake), 0);
        const pnl = betsForType.reduce((sum: number, b: typeof allBets[0]) => sum + Number(b.pnl || 0), 0);
        const roi = stake > 0 ? (pnl / stake) * 100 : 0;
        const winRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0;

        conflictBreakdown[type] = {
          bets: betsForType.length,
          wins,
          losses,
          pushes,
          winRate: Math.round(winRate * 100) / 100,
          stake: Math.round(stake * 100) / 100,
          pnl: Math.round(pnl * 100) / 100,
          roi: Math.round(roi * 100) / 100,
        };
      }
    }

    const meta = {
      totalStrategyRunBets: allStrategyRunBets.length,
      demoTagsPresent: demoTagsPresent,
      strategyTagsAvailable: strategyTagsAvailable,
      ...(Object.keys(conflictBreakdown).length > 0 && { conflictBreakdown }),
    };

    // Full matching Bet population → tested pure helpers (pagination is table-only).
    const metricRows: ReviewBetRow[] = allBets.map((bet) => ({
      marketType: String(bet.marketType),
      result: bet.result == null ? null : (bet.result as ReviewBetRow['result']),
      stake: Number(bet.stake),
      pnl: bet.pnl === null ? null : Number(bet.pnl),
      clv: bet.clv === null ? null : Number(bet.clv),
    }));
    const summaryMetrics = computeWeekReviewMetrics(metricRows);
    const byMarketType = computeMarketBreakdownByMarketType(metricRows);
    const {
      totalBets,
      gradedBets,
      pendingBets,
      wins,
      losses,
      pushes,
      gradedStake,
      totalPnL,
      roi,
      hitRate,
      avgCLV,
    } = summaryMetrics;

    // Average edge is only safe as a unit-consistent review metric for a subset.
    // For 2026 official_flat_100, we return null to avoid recomputing from live market.
    let avgEdge: number | null = null;
    if (!isOfficial2026Review) {
      const edgeValues = allBets
        .filter((bet) => bet.closePrice !== null)
        .map((bet) => {
          const modelPrice = Number(bet.modelPrice);
          const closePrice = Number(bet.closePrice);

          if (bet.marketType === 'moneyline') {
            // For moneyline, calculate implied probability difference.
            const modelImplied =
              modelPrice > 0
                ? 100 / (modelPrice + 100)
                : Math.abs(modelPrice) / (Math.abs(modelPrice) + 100);
            const closeImplied =
              closePrice > 0
                ? 100 / (closePrice + 100)
                : Math.abs(closePrice) / (Math.abs(closePrice) + 100);
            return modelImplied - closeImplied;
          }

          // For spread/total, calculate line difference.
          return modelPrice - closePrice;
        });

      avgEdge = edgeValues.length > 0
        ? edgeValues.reduce((sum, edge) => sum + edge, 0) / edgeValues.length
        : 0;
    }

    // Group by strategy if no specific strategy requested
    let strategyBreakdown = null;
    if (!strategy || strategy.trim() === '' || strategy === 'all') {
      const strategies = await prisma.bet.groupBy({
        by: ['strategyTag'],
        where: where, // Includes all strategy-run bets (demo/test included)
        _count: { _all: true },
        _sum: { pnl: true },
      });

      // Filter out null strategyTags
      strategyBreakdown = strategies
        .filter(s => s.strategyTag !== null)
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
        totalBets,
        gradedBets,
        pendingBets,
        wins,
        losses,
        pushes,
        gradedStake,
        hitRate,
        roi,
        totalPnL,
        avgEdge,
        avgCLV,
      },
      byMarketType,
      strategyBreakdown,
      meta,
      bets: bets.map(bet => ({
        ...bet,
        modelPrice: Number(bet.modelPrice),
        closePrice: bet.closePrice === null ? null : Number(bet.closePrice),
        stake: Number(bet.stake),
        pnl: bet.pnl === null ? null : Number(bet.pnl),
        clv: bet.clv === null ? null : Number(bet.clv),
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
