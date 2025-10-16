/**
 * M4 Weeks Review API Route
 * 
 * Returns historical week data with filters for season, week, confidence, and market type.
 * Includes profitability analysis if scores are available.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0; // no caching; always run on server


import { prisma } from '@/lib/prisma';
import { computeSpreadPick, computeTotalPick } from '@/lib/pick-helpers';
import { pickMarketLine, getLineValue, pickMoneyline, americanToProb } from '@/lib/market-line-helpers';
import { getSeasonWeekFromParams } from '@/lib/season-week-helpers';
import { getCurrentSeasonWeek } from '@/lib/current-week';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const searchParams = url.searchParams;
    
    // Get season/week from params or auto-detect from database
    let season: number, week: number;
    if (searchParams.get('season') && searchParams.get('week')) {
      const params = getSeasonWeekFromParams(searchParams);
      season = params.season;
      week = params.week;
    } else {
      const current = await getCurrentSeasonWeek(prisma);
      season = current.season;
      week = current.week;
    }
    
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
      filteredGames = games.filter(game => {
        const spreadLine = pickMarketLine(game.marketLines, 'spread');
        const marketSpread = getLineValue(spreadLine) || 0;
        return game.matchupOutputs.some(output => 
          Math.abs(output.impliedSpread - marketSpread) >= 2.0
        );
      });
    } else if (market === 'total') {
      filteredGames = games.filter(game => {
        const totalLine = pickMarketLine(game.marketLines, 'total');
        const marketTotal = getLineValue(totalLine) || 45;
        return game.matchupOutputs.some(output => 
          Math.abs(output.impliedTotal - marketTotal) >= 2.0
        );
      });
    }

    // Format response with pick details
    const weekData = filteredGames.map(game => {
      const matchupOutput = game.matchupOutputs[0];
      
      // Use helper to pick best market lines (prefers SGO, then latest)
      const spreadLine = pickMarketLine(game.marketLines, 'spread');
      const totalLine = pickMarketLine(game.marketLines, 'total');
      
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
      
      // Get line values (prefers closingLine, falls back to lineValue)
      const marketSpread = getLineValue(spreadLine) || 0;
      const marketTotal = getLineValue(totalLine) || 45;

      // Extract market metadata for source badges
      const spreadMeta = spreadLine ? {
        source: spreadLine.source ?? null,
        bookName: spreadLine.bookName ?? null,
        timestamp: spreadLine.timestamp ?? null,
      } : null;

      const totalMeta = totalLine ? {
        source: totalLine.source ?? null,
        bookName: totalLine.bookName ?? null,
        timestamp: totalLine.timestamp ?? null,
      } : null;

      // Pick moneyline and extract metadata
      const mlLine = pickMoneyline(game.marketLines);
      const mlVal = getLineValue(mlLine); // American odds (negative favorite, positive dog)
      const mlMeta = mlLine ? {
        source: mlLine.source ?? null,
        bookName: mlLine.bookName ?? null,
        timestamp: mlLine.timestamp ?? null,
      } : null;

      // Only create moneyline object if we have actual moneyline data
      let moneyline = null;
      if (mlVal != null) {
        // Determine moneyline pick label
        const fav = mlVal < 0 ? game.homeTeam.name : game.awayTeam.name;
        const moneylinePickLabel = `${fav} ML`;

        moneyline = {
          price: mlVal,
          pickLabel: moneylinePickLabel,
          impliedProb: americanToProb(mlVal),
          meta: mlMeta
        };
      }

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

      // Calculate result and CLV if scores exist
      let resultSpread = null;
      let clvSpread = null;
      
      if (game.homeScore !== null && game.awayScore !== null) {
        const actualSpread = game.homeScore - game.awayScore;
        const modelLine = spreadPick.modelSpreadPick.line;
        const marketLine = marketSpread;
        
        // Determine result: W/L/Push
        const modelPickWon = (actualSpread > modelLine && actualSpread > marketLine) ||
                            (actualSpread < modelLine && actualSpread < marketLine);
        const push = Math.abs(actualSpread - modelLine) < 0.5;
        
        if (push) {
          resultSpread = 'Push';
        } else if (modelPickWon) {
          resultSpread = 'Win';
        } else {
          resultSpread = 'Loss';
        }
        
        // Calculate CLV (Closing Line Value)
        // Higher absolute edge vs closing line is positive CLV
        const modelEdge = Math.abs(impliedSpread - marketSpread);
        const closingEdge = Math.abs(actualSpread - marketSpread);
        clvSpread = modelEdge - closingEdge; // Positive if model had better edge
      }

      return {
        gameId: game.id,
        matchup: `${game.awayTeam.name} @ ${game.homeTeam.name}`,
        homeTeam: {
          id: game.homeTeam.id,
          name: game.homeTeam.name,
          logoUrl: game.homeTeam.logoUrl,
          primaryColor: game.homeTeam.primaryColor,
        },
        awayTeam: {
          id: game.awayTeam.id,
          name: game.awayTeam.name,
          logoUrl: game.awayTeam.logoUrl,
          primaryColor: game.awayTeam.primaryColor,
        },
        kickoff: kickoffTime,
        venue: game.venue,
        neutralSite: game.neutralSite,
        
        // Market data
        marketSpread,
        marketTotal,
        marketMeta: {
          spread: spreadMeta,
          total: totalMeta,
        },
        moneyline,
        
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
        status: game.status,
        
        // Result and CLV (if scores exist)
        resultSpread,
        clvSpread
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
      roi: null as any,
      avgClv: null as number | null
    };

    // Calculate ROI and CLV if scores are available
    if (summary.hasResults) {
      const spreadPicks = weekData.filter(g => g.spreadEdgePts >= 2.0);
      let wins = 0;
      let losses = 0;
      let pushes = 0;
      let totalClv = 0;
      let clvCount = 0;

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
          
          // Accumulate CLV
          if (game.clvSpread !== null) {
            totalClv += game.clvSpread;
            clvCount++;
          }
        }
      });

      const totalBets = wins + losses;
      const winRate = totalBets > 0 ? wins / totalBets : 0;
      const roi = totalBets > 0 ? (wins * 0.909 - losses) / totalBets : 0; // -110 odds
      const avgClv = clvCount > 0 ? totalClv / clvCount : 0;

      summary.roi = {
        wins,
        losses,
        pushes,
        totalBets,
        winRate,
        roi
      };
      summary.avgClv = avgClv;
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
