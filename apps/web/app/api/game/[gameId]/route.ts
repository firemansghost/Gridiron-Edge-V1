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
          season_teamId_modelVersion: {
            season: game.season,
            teamId: game.homeTeamId,
            modelVersion: 'v1',
          },
        },
      }),
      prisma.teamSeasonRating.findUnique({
        where: {
          season_teamId_modelVersion: {
            season: game.season,
            teamId: game.awayTeamId,
            modelVersion: 'v1',
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

    // Get initial values from matchupOutput if available
    const initialSpread = matchupOutput?.impliedSpread || 0;
    const initialTotal = matchupOutput?.impliedTotal || 45;
    
    // Compute model spread and total if ratings are available
    let computedSpread = initialSpread;
    let computedTotal = initialTotal;
    
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

    // Helper to convert Prisma Decimal to number
    const toNumber = (value: any): number | null => {
      if (value === null || value === undefined) return null;
      if (typeof value === 'number') return value;
      if (typeof value === 'string') return parseFloat(value);
      if (value && typeof value.toNumber === 'function') return value.toNumber();
      return null;
    };

    // Load team features with fallback hierarchy (replicating FeatureLoader logic)
    const loadTeamFeatures = async (teamId: string, season: number): Promise<any> => {
      // Try game-level features first
      const gameStats = await prisma.teamGameStat.findMany({
        where: {
          teamId,
          season,
          OR: [
            { yppOff: { not: null } },
            { yppDef: { not: null } },
            { successOff: { not: null } },
            { successDef: { not: null } },
          ]
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      });

      if (gameStats.length > 0) {
        const validStats = gameStats.filter(s => s.yppOff !== null || s.successOff !== null);
        if (validStats.length > 0) {
          const sums = validStats.reduce((acc, stat) => ({
            yppOff: acc.yppOff + (toNumber(stat.yppOff) || 0),
            passYpaOff: acc.passYpaOff + (toNumber(stat.passYpaOff) || 0),
            rushYpcOff: acc.rushYpcOff + (toNumber(stat.rushYpcOff) || 0),
            successOff: acc.successOff + (toNumber(stat.successOff) || 0),
            epaOff: acc.epaOff + (toNumber(stat.epaOff) || 0),
            paceOff: acc.paceOff + (toNumber(stat.pace) || 0),
            yppDef: acc.yppDef + (toNumber(stat.yppDef) || 0),
            passYpaDef: acc.passYpaDef + (toNumber(stat.passYpaDef) || 0),
            rushYpcDef: acc.rushYpcDef + (toNumber(stat.rushYpcDef) || 0),
            successDef: acc.successDef + (toNumber(stat.successDef) || 0),
            epaDef: acc.epaDef + (toNumber(stat.epaDef) || 0),
          }), { yppOff: 0, passYpaOff: 0, rushYpcOff: 0, successOff: 0, epaOff: 0, paceOff: 0, yppDef: 0, passYpaDef: 0, rushYpcDef: 0, successDef: 0, epaDef: 0 });
          
          const count = validStats.length;
          return {
            teamId,
            season,
            yppOff: sums.yppOff / count,
            passYpaOff: sums.passYpaOff / count,
            rushYpcOff: sums.rushYpcOff / count,
            successOff: sums.successOff / count,
            epaOff: sums.epaOff / count,
            paceOff: sums.paceOff / count,
            yppDef: sums.yppDef / count,
            passYpaDef: sums.passYpaDef / count,
            rushYpcDef: sums.rushYpcDef / count,
            successDef: sums.successDef / count,
            epaDef: sums.epaDef / count,
            dataSource: 'game',
            confidence: Math.min(1.0, count / 8),
            gamesCount: count,
            lastUpdated: validStats[0]?.updatedAt || null,
          };
        }
      }

      // Fallback to season-level features
      const seasonStats = await prisma.teamSeasonStat.findUnique({
        where: { season_teamId: { season, teamId } }
      });

      if (seasonStats) {
        return {
          teamId,
          season,
          yppOff: toNumber(seasonStats.yppOff),
          passYpaOff: toNumber(seasonStats.passYpaOff),
          rushYpcOff: toNumber(seasonStats.rushYpcOff),
          successOff: toNumber(seasonStats.successOff),
          epaOff: toNumber(seasonStats.epaOff),
          paceOff: toNumber(seasonStats.paceOff),
          yppDef: toNumber(seasonStats.yppDef),
          passYpaDef: toNumber(seasonStats.passYpaDef),
          rushYpcDef: toNumber(seasonStats.rushYpcDef),
          successDef: toNumber(seasonStats.successDef),
          epaDef: toNumber(seasonStats.epaDef),
          dataSource: 'season',
          confidence: 0.7,
          gamesCount: 0,
          lastUpdated: seasonStats.createdAt,
        };
      }

      // Last resort: baseline ratings
      const baselineRating = await prisma.teamSeasonRating.findUnique({
        where: { season_teamId_modelVersion: { season, teamId, modelVersion: 'v1' } }
      });

      if (baselineRating) {
        const offenseRating = toNumber(baselineRating.offenseRating) || 0;
        const defenseRating = toNumber(baselineRating.defenseRating) || 0;
        return {
          teamId,
          season,
          yppOff: offenseRating > 0 ? offenseRating / 10 : null,
          successOff: null,
          epaOff: offenseRating > 0 ? offenseRating / 20 : null,
          paceOff: null,
          passYpaOff: null,
          rushYpcOff: null,
          yppDef: defenseRating > 0 ? defenseRating / 10 : null,
          successDef: null,
          epaDef: defenseRating > 0 ? defenseRating / 20 : null,
          paceDef: null,
          passYpaDef: null,
          rushYpcDef: null,
          dataSource: 'baseline',
          confidence: 0.3,
          gamesCount: 0,
          lastUpdated: baselineRating.createdAt,
        };
      }

      // No data available
      return {
        teamId,
        season,
        yppOff: null,
        successOff: null,
        epaOff: null,
        paceOff: null,
        passYpaOff: null,
        rushYpcOff: null,
        yppDef: null,
        successDef: null,
        epaDef: null,
        paceDef: null,
        passYpaDef: null,
        rushYpcDef: null,
        dataSource: 'missing',
        confidence: 0,
        gamesCount: 0,
        lastUpdated: null,
      };
    };

    // Compute Top Factors for each team
    const computeTopFactors = async (teamId: string, season: number): Promise<Array<{factor: string; contribution: number; weight: number; zScore: number}>> => {
      try {
        // Load all FBS teams for the season
        const fbsMemberships = await prisma.teamMembership.findMany({
          where: { season, level: 'fbs' },
          select: { teamId: true }
        });
        const fbsTeamIds = Array.from(new Set(fbsMemberships.map(m => m.teamId.toLowerCase())));

        // Load features for all FBS teams
        const allFeatures: any[] = [];
        for (const tid of fbsTeamIds) {
          const features = await loadTeamFeatures(tid, season);
          allFeatures.push(features);
        }

        // Calculate z-score statistics across all teams
        const calculateZScores = (features: any[], getValue: (f: any) => number | null) => {
          const values = features
            .map(f => getValue(f))
            .filter(v => v !== null && v !== undefined && !isNaN(v))
            .map(v => v!);
          
          if (values.length === 0) {
            return { mean: 0, stdDev: 1 };
          }
          
          const sum = values.reduce((acc, v) => acc + v, 0);
          const mean = sum / values.length;
          const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
          const stdDev = Math.sqrt(variance) || 1;
          
          return { mean, stdDev };
        };

        const getZScore = (value: number | null, mean: number, stdDev: number): number => {
          if (value === null || value === undefined || isNaN(value)) return 0;
          return (value - mean) / stdDev;
        };

        const zStats = {
          yppOff: calculateZScores(allFeatures, f => f.yppOff ?? null),
          passYpaOff: calculateZScores(allFeatures, f => f.passYpaOff ?? null),
          rushYpcOff: calculateZScores(allFeatures, f => f.rushYpcOff ?? null),
          successOff: calculateZScores(allFeatures, f => f.successOff ?? null),
          epaOff: calculateZScores(allFeatures, f => f.epaOff ?? null),
          yppDef: calculateZScores(allFeatures, f => f.yppDef ?? null),
          passYpaDef: calculateZScores(allFeatures, f => f.passYpaDef ?? null),
          rushYpcDef: calculateZScores(allFeatures, f => f.rushYpcDef ?? null),
          successDef: calculateZScores(allFeatures, f => f.successDef ?? null),
          epaDef: calculateZScores(allFeatures, f => f.epaDef ?? null),
        };

        // Load features for the specific team
        const teamFeatures = await loadTeamFeatures(teamId, season);

        // Define weights (matching compute_ratings_v1.ts)
        const offensiveWeights = {
          yppOff: 0.30,
          passYpaOff: 0.20,
          rushYpcOff: 0.15,
          successOff: 0.20,
          epaOff: 0.15,
        };

        const hasDefensiveYards = teamFeatures.yppDef !== null || teamFeatures.passYpaDef !== null || teamFeatures.rushYpcDef !== null;
        const defensiveWeights = hasDefensiveYards ? {
          yppDef: 0.20,
          passYpaDef: 0.20,
          rushYpcDef: 0.15,
          successDef: 0.25,
          epaDef: 0.20,
        } : {
          successDef: 0.25 / (0.25 + 0.20),
          epaDef: 0.20 / (0.25 + 0.20),
          yppDef: 0,
          passYpaDef: 0,
          rushYpcDef: 0,
        };

        // Calculate contributions for all features
        const factors: Array<{factor: string; contribution: number; weight: number; zScore: number}> = [];

        // Offensive factors
        for (const [factor, weight] of Object.entries(offensiveWeights)) {
          if (weight > 0) {
            const value = teamFeatures[factor as keyof typeof teamFeatures] as number | null | undefined;
            const stats = zStats[factor as keyof typeof zStats];
            const zScore = getZScore(value ?? null, stats.mean, stats.stdDev);
            const contribution = weight * zScore;
            factors.push({ factor, contribution, weight, zScore });
          }
        }

        // Defensive factors (contribution is inverted for defense)
        for (const [factor, weight] of Object.entries(defensiveWeights)) {
          if (weight > 0) {
            const value = teamFeatures[factor as keyof typeof teamFeatures] as number | null | undefined;
            const stats = zStats[factor as keyof typeof zStats];
            const zScore = getZScore(value ?? null, stats.mean, stats.stdDev);
            // For defense, lower is better, so invert the contribution
            const contribution = -weight * zScore;
            factors.push({ factor, contribution, weight, zScore });
          }
        }

        // Sort by absolute contribution and return top 5
        return factors
          .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
          .slice(0, 5);
      } catch (error) {
        console.error(`Error computing top factors for team ${teamId}:`, error);
        return [];
      }
    };

    // Compute top factors for both teams
    const [homeFactors, awayFactors] = await Promise.all([
      computeTopFactors(game.homeTeamId, game.season),
      computeTopFactors(game.awayTeamId, game.season)
    ]);

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
          factors: homeFactors
        },
        away: {
          team: game.awayTeam.name,
          rating: awayRating ? Number(awayRating.powerRating || awayRating.rating || 0) : 0,
          confidence: awayRating ? Number(awayRating.confidence || 0) : 0,
          factors: awayFactors
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
