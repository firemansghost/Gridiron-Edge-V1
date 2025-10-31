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

    // Get power ratings from team_season_ratings (Ratings v1)
    const [homeRating, awayRating] = await Promise.all([
      prisma.teamSeasonRating.findUnique({
        where: {
          season_teamId: {
            season: game.season,
            teamId: game.homeTeamId,
          },
        },
      }),
      prisma.teamSeasonRating.findUnique({
        where: {
          season_teamId: {
            season: game.season,
            teamId: game.awayTeamId,
          },
        },
      }),
    ]);

    // Load team stats for pace/EPA calculations
    const [homeStats, awayStats] = await Promise.all([
      prisma.teamSeasonStat.findUnique({
        where: {
          season_teamId: {
            season: game.season,
            teamId: game.homeTeamId,
          },
        },
      }),
      prisma.teamSeasonStat.findUnique({
        where: {
          season_teamId: {
            season: game.season,
            teamId: game.awayTeamId,
          },
        },
      }),
    ]);

    // Compute model spread and total if ratings are available
    let computedSpread = impliedSpread;
    let computedTotal = impliedTotal;
    
    if (homeRating && awayRating) {
      const homePower = Number(homeRating.powerRating || homeRating.rating || 0);
      const awayPower = Number(awayRating.powerRating || awayRating.rating || 0);
      const HFA = game.neutralSite ? 0 : 2.0;
      computedSpread = homePower - awayPower + HFA;

      // Compute total using pace + efficiency
      const homeEpaOff = homeStats?.epaOff ? Number(homeStats.epaOff) : null;
      const awayEpaOff = awayStats?.epaOff ? Number(awayStats.epaOff) : null;
      const homeYppOff = homeStats?.yppOff ? Number(homeStats.yppOff) : null;
      const awayYppOff = awayStats?.yppOff ? Number(awayStats.yppOff) : null;
      
      const homePaceOff = homeStats?.paceOff ? Number(homeStats.paceOff) : 70;
      const awayPaceOff = awayStats?.paceOff ? Number(awayStats.paceOff) : 70;

      const homePpp = homeEpaOff !== null 
        ? Math.max(0, Math.min(1.0, 7 * homeEpaOff))
        : homeYppOff !== null 
          ? 0.8 * homeYppOff
          : 0.4;
      
      const awayPpp = awayEpaOff !== null
        ? Math.max(0, Math.min(1.0, 7 * awayEpaOff))
        : awayYppOff !== null
          ? 0.8 * awayYppOff
          : 0.4;

      computedTotal = (homePpp * homePaceOff) + (awayPpp * awayPaceOff);
    }

    // Use computed values if matchupOutput doesn't exist
    const finalImpliedSpread = matchupOutput?.impliedSpread ?? computedSpread;
    const finalImpliedTotal = matchupOutput?.impliedTotal ?? computedTotal;

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
      finalImpliedSpread,
      game.homeTeam.name,
      game.awayTeam.name,
      game.homeTeamId,
      game.awayTeamId
    );

    // Compute total pick details
    const totalPick = computeTotalPick(finalImpliedTotal, marketTotal);

    // Calculate edge points
    const spreadEdgePts = Math.abs(finalImpliedSpread - marketSpread);
    const totalEdgePts = Math.abs(finalImpliedTotal - marketTotal);

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

    // Extract factor breakdown - for Ratings v1, we'll use a simplified approach
    // In the future, we can enhance this to show top contributing features

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
        spread: finalImpliedSpread,
        total: finalImpliedTotal,
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
      
      // Power ratings (from team_season_ratings)
      ratings: {
        home: {
          team: game.homeTeam.name,
          rating: homeRating ? Number(homeRating.powerRating || homeRating.rating || 0) : 0,
          confidence: homeRating ? Number(homeRating.confidence || 0) : 0,
          factors: [] // Top factors will be computed separately if needed
        },
        away: {
          team: game.awayTeam.name,
          rating: awayRating ? Number(awayRating.powerRating || awayRating.rating || 0) : 0,
          confidence: awayRating ? Number(awayRating.confidence || 0) : 0,
          factors: [] // Top factors will be computed separately if needed
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
