/**
 * M3 Game Detail API Route
 * 
 * Returns detailed game information including factor breakdown from components_json.
 */

import { prisma } from '@/lib/prisma';

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
    const spreadLine = game.marketLines.find(line => line.lineType === 'spread');
    const totalLine = game.marketLines.find(line => line.lineType === 'total');

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
        spread: spreadLine?.closingLine || 0,
        total: totalLine?.closingLine || 45,
        source: spreadLine?.bookName || 'Unknown'
      },
      
      // Implied data
      implied: {
        spread: matchupOutput?.impliedSpread || 0,
        total: matchupOutput?.impliedTotal || 45,
        confidence: matchupOutput?.edgeConfidence || 'C'
      },
      
      // Edge analysis
      edge: {
        spreadEdge: matchupOutput ? Math.abs(matchupOutput.impliedSpread - (spreadLine?.closingLine || 0)) : 0,
        totalEdge: matchupOutput ? Math.abs(matchupOutput.impliedTotal - (totalLine?.closingLine || 45)) : 0,
        maxEdge: matchupOutput ? Math.max(
          Math.abs(matchupOutput.impliedSpread - (spreadLine?.closingLine || 0)),
          Math.abs(matchupOutput.impliedTotal - (totalLine?.closingLine || 45))
        ) : 0
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
