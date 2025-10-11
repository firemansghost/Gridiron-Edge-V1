/**
 * M3 Seed Slate API Route
 * 
 * Returns this week's seed games with implied vs market data and confidence tiers.
 * Reads from database (Prisma client) to prove end-to-end wiring.
 */

import { prisma } from '@/lib/prisma';
import { computeSpreadPick, computeTotalPick } from '@/lib/pick-helpers';

export async function GET() {
  try {
    // Get this week's games (seed week 1, 2024)
    const games = await prisma.game.findMany({
      where: {
        season: 2024,
        week: 1
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        marketLines: true,
        matchupOutputs: {
          where: {
            modelVersion: 'v0.0.1'
          }
        }
      },
      orderBy: {
        date: 'asc'
      }
    });

    // Format response with implied vs market data
    const slate = games.map(game => {
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
        
        // Team information
        homeTeam: {
          id: game.homeTeam.id,
          name: game.homeTeam.name,
          conference: game.homeTeam.conference,
          division: game.homeTeam.division,
          city: game.homeTeam.city,
          state: game.homeTeam.state,
          mascot: game.homeTeam.mascot,
          logoUrl: game.homeTeam.logoUrl,
          primaryColor: game.homeTeam.primaryColor,
          secondaryColor: game.homeTeam.secondaryColor
        },
        awayTeam: {
          id: game.awayTeam.id,
          name: game.awayTeam.name,
          conference: game.awayTeam.conference,
          division: game.awayTeam.division,
          city: game.awayTeam.city,
          state: game.awayTeam.state,
          mascot: game.awayTeam.mascot,
          logoUrl: game.awayTeam.logoUrl,
          primaryColor: game.awayTeam.primaryColor,
          secondaryColor: game.awayTeam.secondaryColor
        },
        
        // Market data
        marketSpread,
        marketTotal,
        
        // Implied data
        impliedSpread,
        impliedTotal,
        
        // Edge analysis (keep existing for backward compatibility)
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

    return Response.json({
      success: true,
      week: 1,
      season: 2024,
      modelVersion: 'v0.0.1',
      games: slate,
      summary: {
        totalGames: slate.length,
        confidenceBreakdown: {
          A: slate.filter(g => g.confidence === 'A').length,
          B: slate.filter(g => g.confidence === 'B').length,
          C: slate.filter(g => g.confidence === 'C').length
        }
      },
      signConvention: {
        spread: 'home_minus_away',
        hfaPoints: 2.0
      }
    });

  } catch (error) {
    console.error('Error fetching seed slate:', error);
    return Response.json(
      { 
        success: false, 
        error: 'Failed to fetch seed slate data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
