/**
 * M6 Strategy Run API
 * 
 * Execute a ruleset against a specific week and return qualifying games
 */

import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { computeSpreadPick, computeTotalPick } from '@/lib/pick-helpers';
import { pickMoneyline, getLineValue, americanToProb } from '@/lib/market-line-helpers';
import { abbrevSource } from '@/lib/market-badges';
import { getSeasonWeekFromParams } from '@/lib/season-week-helpers';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const rulesetId = searchParams.get('rulesetId');
    
    // Get season/week from params or use current
    const { season, week } = getSeasonWeekFromParams(searchParams);

    if (!rulesetId) {
      return NextResponse.json(
        { success: false, error: 'RulesetId is required' },
        { status: 400 }
      );
    }

    // Fetch ruleset
    const ruleset = await prisma.ruleset.findUnique({
      where: { id: rulesetId },
    });

    if (!ruleset) {
      return NextResponse.json(
        { success: false, error: 'Ruleset not found' },
        { status: 404 }
      );
    }

    const params = ruleset.parameters as any;
    
    // Default markets to spread and total if not specified
    const markets = params.markets || ['spread', 'total'];

    // Fetch games for the week
    const games = await prisma.game.findMany({
      where: {
        season,
        week,
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        marketLines: true,
        matchupOutputs: {
          where: {
            modelVersion: 'v0.0.1',
          },
        },
      },
      orderBy: {
        date: 'asc',
      },
    });

    // Filter games based on ruleset parameters
    const qualifyingGames = [];

    for (const game of games) {
      const matchupOutput = game.matchupOutputs[0];
      if (!matchupOutput) continue;

      const spreadLine = game.marketLines.find(line => line.lineType === 'spread');
      const totalLine = game.marketLines.find(line => line.lineType === 'total');
      const moneylineLine = pickMoneyline(game.marketLines);

      const impliedSpread = matchupOutput.impliedSpread || 0;
      const impliedTotal = matchupOutput.impliedTotal || 45;
      const marketSpread = spreadLine?.closingLine || 0;
      const marketTotal = totalLine?.closingLine || 45;
      const moneylinePrice = getLineValue(moneylineLine);

      const spreadEdge = Math.abs(impliedSpread - marketSpread);
      const totalEdge = Math.abs(impliedTotal - marketTotal);
      
      // Calculate max edge across selected markets
      const edges = [];
      if (markets.includes('spread')) edges.push(spreadEdge);
      if (markets.includes('total')) edges.push(totalEdge);
      if (markets.includes('moneyline') && moneylinePrice != null) {
        // For moneyline, we'll use a simple approach: include if available
        edges.push(0); // No edge calculation for ML in first pass
      }
      const maxEdge = edges.length > 0 ? Math.max(...edges) : 0;

      // Apply filters
      let qualifies = true;

      // Min edge thresholds - check if any selected market meets threshold
      let meetsEdgeThreshold = false;
      if (markets.includes('spread') && spreadEdge >= (params.minSpreadEdge || 0)) {
        meetsEdgeThreshold = true;
      }
      if (markets.includes('total') && totalEdge >= (params.minTotalEdge || 0)) {
        meetsEdgeThreshold = true;
      }
      if (markets.includes('moneyline') && moneylinePrice != null) {
        // For moneyline, include if available (no edge threshold for now)
        meetsEdgeThreshold = true;
      }
      
      if (!meetsEdgeThreshold) {
        qualifies = false;
      }

      // Confidence filter
      if (params.confidenceIn && params.confidenceIn.length > 0) {
        if (!params.confidenceIn.includes(matchupOutput.edgeConfidence)) {
          qualifies = false;
        }
      }

      // Team filters
      if (params.includeTeams && params.includeTeams.length > 0) {
        if (!params.includeTeams.includes(game.homeTeamId) && !params.includeTeams.includes(game.awayTeamId)) {
          qualifies = false;
        }
      }

      if (params.excludeTeams && params.excludeTeams.length > 0) {
        if (params.excludeTeams.includes(game.homeTeamId) || params.excludeTeams.includes(game.awayTeamId)) {
          qualifies = false;
        }
      }

      if (qualifies) {
        // Convert date to America/Chicago timezone
        const kickoffTime = new Date(game.date).toLocaleString('en-US', {
          timeZone: 'America/Chicago',
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });

        const spreadPick = computeSpreadPick(
          impliedSpread,
          game.homeTeam.name,
          game.awayTeam.name,
          game.homeTeamId,
          game.awayTeamId
        );

        const totalPick = computeTotalPick(impliedTotal, marketTotal);

        // Moneyline data
        let moneylineData = null;
        if (markets.includes('moneyline') && moneylinePrice != null) {
          const favoredTeam = moneylinePrice < 0 ? game.homeTeam.name : game.awayTeam.name;
          const moneylinePickLabel = `${favoredTeam} ML`;
          const impliedProb = americanToProb(moneylinePrice);
          const moneylineSource = moneylineLine?.source ? abbrevSource(moneylineLine.source) : '';

          moneylineData = {
            price: moneylinePrice,
            pickLabel: moneylinePickLabel,
            impliedProb,
            source: moneylineSource,
          };
        }

        qualifyingGames.push({
          gameId: game.id,
          matchup: `${game.awayTeam.name} @ ${game.homeTeam.name}`,
          kickoff: kickoffTime,
          spreadEdge,
          totalEdge,
          maxEdge,
          confidence: matchupOutput.edgeConfidence,
          spreadPickLabel: spreadPick.spreadPickLabel,
          totalPickLabel: totalPick.totalPickLabel,
          moneyline: moneylineData,
        });
      }
    }

    // Apply max games limit
    let finalGames = qualifyingGames;
    if (params.maxGamesPerWeek && qualifyingGames.length > params.maxGamesPerWeek) {
      // Sort by max edge descending and take top N
      finalGames = qualifyingGames
        .sort((a, b) => b.maxEdge - a.maxEdge)
        .slice(0, params.maxGamesPerWeek);
    }

    // Calculate summary
    const summary = {
      totalGames: finalGames.length,
      avgEdge: finalGames.length > 0
        ? finalGames.reduce((sum, g) => sum + g.maxEdge, 0) / finalGames.length
        : 0,
      confidenceBreakdown: {
        A: finalGames.filter(g => g.confidence === 'A').length,
        B: finalGames.filter(g => g.confidence === 'B').length,
        C: finalGames.filter(g => g.confidence === 'C').length,
      },
    };

    return NextResponse.json({
      success: true,
      ruleset: {
        id: ruleset.id,
        name: ruleset.name,
        parameters: ruleset.parameters,
      },
      season,
      week,
      qualifyingGames: finalGames,
      summary,
    });
  } catch (error) {
    console.error('Error running strategy:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to run strategy' },
      { status: 500 }
    );
  }
}
