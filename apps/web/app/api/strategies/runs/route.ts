/**
 * M6 Strategy Runs API
 * 
 * CRUD operations for strategy run results
 */

import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/strategies/runs - List all strategy runs
export async function GET() {
  try {
    const runs = await prisma.strategyRun.findMany({
      include: {
        ruleset: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({
      success: true,
      runs,
    });
  } catch (error) {
    console.error('Error fetching strategy runs:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch strategy runs' },
      { status: 500 }
    );
  }
}

// POST /api/strategies/runs - Save a new strategy run
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rulesetId, season, week, totalBets, avgEdge, confidenceBreakdown } = body;

    if (!rulesetId || !season || !week) {
      return NextResponse.json(
        { success: false, error: 'RulesetId, season, and week are required' },
        { status: 400 }
      );
    }

    // Create date range for this week
    const startDate = new Date(season, 0, 1 + (week - 1) * 7);
    const endDate = new Date(season, 0, 1 + week * 7);

    // For seed mode, use placeholder values for win rate, ROI, CLV
    // These would be calculated from actual bet results in production
    const strategyRun = await prisma.strategyRun.create({
      data: {
        rulesetId,
        startDate,
        endDate,
        totalBets: totalBets || 0,
        winRate: 0.0, // Placeholder - would calculate from results
        roi: 0.0, // Placeholder - would calculate from results
        clv: avgEdge || 0.0, // Use average edge as proxy for CLV in seed mode
      },
    });

    return NextResponse.json({
      success: true,
      strategyRun,
    });
  } catch (error) {
    console.error('Error creating strategy run:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create strategy run' },
      { status: 500 }
    );
  }
}
