/**
 * M3 Seed Slate API Route
 * 
 * Returns this week's seed games with implied vs market data and confidence tiers.
 * Reads from database (Prisma client) to prove end-to-end wiring.
 */

import { prisma } from '@/lib/prisma';

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

      return {
        gameId: game.id,
        matchup: `${game.awayTeam.name} @ ${game.homeTeam.name}`,
        kickoff: kickoffTime,
        venue: game.venue,
        neutralSite: game.neutralSite,
        
        // Market data
        marketSpread: spreadLine?.closingLine || 0,
        marketTotal: totalLine?.closingLine || 45,
        
        // Implied data
        impliedSpread: matchupOutput?.impliedSpread || 0,
        impliedTotal: matchupOutput?.impliedTotal || 45,
        
        // Edge analysis
        spreadEdge: matchupOutput ? Math.abs(matchupOutput.impliedSpread - (spreadLine?.closingLine || 0)) : 0,
        totalEdge: matchupOutput ? Math.abs(matchupOutput.impliedTotal - (totalLine?.closingLine || 45)) : 0,
        maxEdge: matchupOutput ? Math.max(
          Math.abs(matchupOutput.impliedSpread - (spreadLine?.closingLine || 0)),
          Math.abs(matchupOutput.impliedTotal - (totalLine?.closingLine || 45))
        ) : 0,
        
        // Confidence tier
        confidence: matchupOutput?.edgeConfidence || 'C',
        
        // Model info
        modelVersion: matchupOutput?.modelVersion || 'v0.0.1'
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
