/**
 * M4 Weeks Review API Route
 * 
 * Returns historical week data with filters for season, week, confidence, and market type.
 * Includes profitability analysis if scores are available.
 */

import { prisma } from '@/lib/prisma';
import { computeSpreadPick, computeTotalPick } from '@/lib/pick-helpers';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const searchParams = url.searchParams;
    const season = parseInt(searchParams.get('season') || '2024');
    const week = parseInt(searchParams.get('week') || '1');
    const confidence = searchParams.get('confidence') || '';
    const market = searchParams.get('market') || '';

    // Build where clause for filters
    const whereClause: any = {
      season,
      week
    };

    if (confidence) {
      whereClause.edgeConfidence = confidence;
    }

    // Get games with matchup outputs
    const games = await prisma.game.findMany({
      where: {
        season,
        week
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        marketLines: true,
        matchupOutputs: {
          where: {
            modelVersion: 'v0.0.1',
            ...(confidence ? { edgeConfidence: confidence as 'A' | 'B' | 'C' } : {})
          }
        }
      },
      orderBy: {
        date: 'asc'
      }
    });

    // Filter by market type if specified
    let filteredGames = games;
    if (market === 'spread') {
      filteredGames = games.filter(game => 
        game.matchupOutputs.some(output => 
          Math.abs(output.impliedSpread - (game.marketLines.find(line => line.lineType === 'spread')?.closingLine || 0)) >= 2.0
        )
      );
    } else if (market === 'total') {
      filteredGames = games.filter(game => 
        game.matchupOutputs.some(output => 
          Math.abs(output.impliedTotal - (game.marketLines.find(line => line.lineType === 'total')?.closingLine || 45)) >= 2.0
        )
      );
    }

    // Format response with pick details
    const weekData = filteredGames.map(game => {
      const matchupOutput = game.matchupOutputs[0];
      const spreadLine = game.marketLines.find(line => line.lineType === 'spread');
      const totalLine = game.marketLines.find(line => line.lineType === 'total');
      
      // Convert date to America/Chicago timezone
      const kickoffTime = new Date(game.date).toLocaleString('en-US', {
        timeZone: 'America/Chicago',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      const impliedSpread = matchupOutput?.impliedSpread || 0;
      const impliedTotal = matchupOutput?.impliedTotal || 45;
      const marketSpread = spreadLine?.closingLine || 0;
      const marketTotal = totalLine?.closingLine || 45;

      // Compute spread pick details
      const spreadPick = computeSpreadPick(
        impliedSpread,
        game.homeTeam.name,
        game.awayTeam.name,
        game.homeTeamId,
        game.awayTeamId
      );

      // Compute total pick details
      const totalPick = computeTotalPick(impliedTotal, marketTotal);

      // Calculate edge points
      const spreadEdgePts = Math.abs(impliedSpread - marketSpread);
      const totalEdgePts = Math.abs(impliedTotal - marketTotal);

      return {
        gameId: game.id,
        matchup: `${game.awayTeam.name} @ ${game.homeTeam.name}`,
        kickoff: kickoffTime,
        venue: game.venue,
        neutralSite: game.neutralSite,
        
        // Market data
        marketSpread,
        marketTotal,
        
        // Implied data
        impliedSpread,
        impliedTotal,
        
        // Edge analysis
        spreadEdge: spreadEdgePts,
        totalEdge: totalEdgePts,
        maxEdge: Math.max(spreadEdgePts, totalEdgePts),
        
        // New explicit pick fields
        ...spreadPick,
        spreadEdgePts,
        ...totalPick,
        totalEdgePts,
        
        // Confidence tier
        confidence: matchupOutput?.edgeConfidence || 'C',
        
        // Model info
        modelVersion: matchupOutput?.modelVersion || 'v0.0.1',
        
        // Game results (if available)
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        status: game.status
      };
    });

    // Calculate summary statistics
    const summary = {
      totalGames: weekData.length,
      confidenceBreakdown: {
        A: weekData.filter(g => g.confidence === 'A').length,
        B: weekData.filter(g => g.confidence === 'B').length,
        C: weekData.filter(g => g.confidence === 'C').length
      },
      hasResults: weekData.some(g => g.homeScore !== null && g.awayScore !== null),
      roi: null as any
    };

    // Calculate ROI if scores are available
    if (summary.hasResults) {
      const spreadPicks = weekData.filter(g => g.spreadEdgePts >= 2.0);
      let wins = 0;
      let losses = 0;
      let pushes = 0;

      spreadPicks.forEach(game => {
        if (game.homeScore !== null && game.awayScore !== null) {
          const actualSpread = game.homeScore - game.awayScore;
          const modelLine = game.modelSpreadPick.line;
          const marketLine = game.marketSpread;
          
          // Determine if model pick won
          const modelPickWon = (actualSpread > modelLine && actualSpread > marketLine) ||
                              (actualSpread < modelLine && actualSpread < marketLine);
          const push = Math.abs(actualSpread - modelLine) < 0.5;
          
          if (push) {
            pushes++;
          } else if (modelPickWon) {
            wins++;
          } else {
            losses++;
          }
        }
      });

      const totalBets = wins + losses;
      const winRate = totalBets > 0 ? wins / totalBets : 0;
      const roi = totalBets > 0 ? (wins * 0.909 - losses) / totalBets : 0; // -110 odds

      summary.roi = {
        wins,
        losses,
        pushes,
        totalBets,
        winRate,
        roi
      };
    }

    return Response.json({
      success: true,
      season,
      week,
      filters: {
        confidence: confidence || null,
        market: market || null
      },
      games: weekData,
      summary
    });

  } catch (error) {
    console.error('Error fetching weeks data:', error);
    return Response.json(
      { 
        success: false, 
        error: 'Failed to fetch weeks data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
