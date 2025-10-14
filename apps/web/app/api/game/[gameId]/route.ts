/**
 * M3 Game Detail API Route
 * 
 * Returns detailed game information including factor breakdown from components_json.
 */

import { prisma } from '@/lib/prisma';
import { computeSpreadPick, computeTotalPick } from '@/lib/pick-helpers';
import { pickMarketLine, getLineValue, pickMoneyline, americanToProb } from '@/lib/market-line-helpers';

export async function GET(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  try {
    const { gameId } = params;

    // Get game with all related data
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        homeTeam: true,
        awayTeam: true,
        marketLines: true,
        matchupOutputs: {
          where: {
            modelVersion: 'v0.0.1'
          }
        },
        teamGameStats: {
          include: {
            team: true
          }
        }
      }
    });

    if (!game) {
      return Response.json(
        { success: false, error: 'Game not found' },
        { status: 404 }
      );
    }

    const matchupOutput = game.matchupOutputs[0];
    
    // Use helper to pick best market lines (prefers SGO, then latest)
    const spreadLine = pickMarketLine(game.marketLines, 'spread');
    const totalLine = pickMarketLine(game.marketLines, 'total');

    const impliedSpread = matchupOutput?.impliedSpread || 0;
    const impliedTotal = matchupOutput?.impliedTotal || 45;
    
    // Get line values (prefers closingLine, falls back to lineValue)
    const marketSpread = getLineValue(spreadLine) ?? 0;
    const marketTotal = getLineValue(totalLine) ?? 45;

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

    // Get power ratings for both teams
    const homeRating = await prisma.powerRating.findFirst({
      where: {
        teamId: game.homeTeamId,
        season: 2024,
        week: 1,
        modelVersion: 'v0.0.1'
      }
    });

    const awayRating = await prisma.powerRating.findFirst({
      where: {
        teamId: game.awayTeamId,
        season: 2024,
        week: 1,
        modelVersion: 'v0.0.1'
      }
    });

    // Convert date to America/Chicago timezone
    const kickoffTime = new Date(game.date).toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    // Extract factor breakdown from components
    const getFactorBreakdown = (rating: any) => {
      if (!rating?.features) return [];
      
      const factors = Object.entries(rating.features)
        .filter(([key, value]: [string, any]) => key !== 'talent_index' && key !== 'pace') // Skip unused factors
        .map(([key, value]: [string, any]) => ({
          factor: key,
          zScore: value.z_score,
          weight: value.weight,
          contribution: value.contribution,
          absContribution: Math.abs(value.contribution)
        }))
        .sort((a, b) => b.absContribution - a.absContribution)
        .slice(0, 3); // Top 3 contributing factors
      
      return factors;
    };

    const response = {
      success: true,
      game: {
        id: game.id,
        matchup: `${game.awayTeam.name} @ ${game.homeTeam.name}`,
        kickoff: kickoffTime,
        venue: game.venue,
        city: game.city,
        neutralSite: game.neutralSite,
        conferenceGame: game.conferenceGame,
        status: game.status,
        homeScore: game.homeScore,
        awayScore: game.awayScore
      },
      
      // Market data
      market: {
        spread: marketSpread,
        total: marketTotal,
        source: spreadLine?.bookName || 'Unknown',
        meta: {
          spread: spreadMeta,
          total: totalMeta,
        },
        moneyline
      },
      
      // Implied data
      implied: {
        spread: impliedSpread,
        total: impliedTotal,
        confidence: matchupOutput?.edgeConfidence || 'C'
      },
      
      // Edge analysis
      edge: {
        spreadEdge: spreadEdgePts,
        totalEdge: totalEdgePts,
        maxEdge: Math.max(spreadEdgePts, totalEdgePts)
      },

      // New explicit pick fields
      picks: {
        spread: {
          ...spreadPick,
          edgePts: spreadEdgePts
        },
        total: {
          ...totalPick,
          edgePts: totalEdgePts
        }
      },
      
      // Power ratings
      ratings: {
        home: {
          team: game.homeTeam.name,
          rating: homeRating?.rating || 0,
          confidence: homeRating?.confidence || 0,
          factors: getFactorBreakdown(homeRating)
        },
        away: {
          team: game.awayTeam.name,
          rating: awayRating?.rating || 0,
          confidence: awayRating?.confidence || 0,
          factors: getFactorBreakdown(awayRating)
        }
      },
      
      // Model info
      model: {
        version: matchupOutput?.modelVersion || 'v0.0.1',
        hfa: 2.0, // Constant HFA for v1
        thresholds: {
          A: 4.0,
          B: 3.0,
          C: 2.0
        }
      },

      // Sign convention
      signConvention: {
        spread: 'home_minus_away',
        hfaPoints: 2.0
      }
    };

    return Response.json(response);

  } catch (error) {
    console.error('Error fetching game detail:', error);
    return Response.json(
      { 
        success: false, 
        error: 'Failed to fetch game detail',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
