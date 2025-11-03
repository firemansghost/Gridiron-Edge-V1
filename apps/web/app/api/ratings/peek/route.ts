/**
 * Ratings Peek API
 * 
 * Debug endpoint to inspect raw features and computed ratings for a team
 * 
 * Query params:
 *   - season: number (required)
 *   - teamId: string (required)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function toNumber(value: any): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value);
  if (value && typeof value.toNumber === 'function') return value.toNumber();
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const season = parseInt(searchParams.get('season') || '');
    const teamId = searchParams.get('teamId');

    if (!season || !teamId) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: season, teamId' },
        { status: 400 }
      );
    }

    // Helper to convert Prisma Decimal to number
    const toNumber = (value: any): number | null => {
      if (value === null || value === undefined) return null;
      if (typeof value === 'number') return value;
      if (typeof value === 'string') return parseFloat(value);
      if (value && typeof value.toNumber === 'function') return value.toNumber();
      return null;
    };

    // Load features - try season stats first (simpler than game-level for peek)
    const seasonStats = await prisma.teamSeasonStat.findUnique({
      where: {
        season_teamId: {
          season,
          teamId,
        },
      },
    });

    // Try game-level stats as fallback
    const gameStats = await prisma.teamGameStat.findMany({
      where: {
        teamId,
        season,
      },
      take: 10,
      orderBy: { updatedAt: 'desc' },
    });

    let features: any = {
      dataSource: 'missing',
      confidence: 0,
      gamesCount: 0,
      lastUpdated: null,
    };

    if (seasonStats) {
      features = {
        yppOff: toNumber(seasonStats.yppOff),
        successOff: toNumber(seasonStats.successOff),
        epaOff: toNumber(seasonStats.epaOff),
        paceOff: toNumber(seasonStats.paceOff),
        passYpaOff: toNumber(seasonStats.passYpaOff),
        rushYpcOff: toNumber(seasonStats.rushYpcOff),
        yppDef: toNumber(seasonStats.yppDef),
        successDef: toNumber(seasonStats.successDef),
        epaDef: toNumber(seasonStats.epaDef),
        paceDef: toNumber(seasonStats.paceDef),
        passYpaDef: toNumber(seasonStats.passYpaDef),
        rushYpcDef: toNumber(seasonStats.rushYpcDef),
        dataSource: seasonStats.successOff !== null && seasonStats.epaOff !== null ? 'season' : 'baseline',
        confidence: 0.7,
        gamesCount: 0,
        lastUpdated: seasonStats.createdAt,
      };
    } else if (gameStats.length > 0) {
      // Calculate averages from game stats
      const validStats = gameStats.filter(s => s.yppOff !== null || s.successOff !== null);
      if (validStats.length > 0) {
        const sums = validStats.reduce((acc, stat) => ({
          yppOff: acc.yppOff + (stat.yppOff || 0),
          successOff: acc.successOff + (stat.successOff || 0),
          epaOff: acc.epaOff + (stat.epaOff || 0),
          paceOff: acc.paceOff + (stat.pace || 0),
          yppDef: acc.yppDef + (stat.yppDef || 0),
          successDef: acc.successDef + (stat.successDef || 0),
          epaDef: acc.epaDef + (stat.epaDef || 0),
        }), { yppOff: 0, successOff: 0, epaOff: 0, paceOff: 0, yppDef: 0, successDef: 0, epaDef: 0 });
        
        const count = validStats.length;
        features = {
          yppOff: sums.yppOff / count,
          successOff: sums.successOff / count,
          epaOff: sums.epaOff / count,
          paceOff: sums.paceOff / count,
          yppDef: sums.yppDef / count,
          successDef: sums.successDef / count,
          epaDef: sums.epaDef / count,
          dataSource: 'game',
          confidence: Math.min(1.0, count / 8),
          gamesCount: count,
          lastUpdated: validStats[0]?.updatedAt || null,
        };
      }
    }

    // Load rating from database
    const rating = await prisma.teamSeasonRating.findUnique({
      where: {
        season_teamId: {
          season,
          teamId,
        },
      },
    });

    // Load team features with fallback hierarchy
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
        where: { season_teamId: { season, teamId } }
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

    // Calculate z-score statistics across all FBS teams for this season
    const calculateZScoreStats = async () => {
      try {
        // Load all FBS teams
        const fbsMemberships = await prisma.teamMembership.findMany({
          where: { season, level: 'fbs' },
          select: { teamId: true }
        });
        const fbsTeamIds = Array.from(new Set(fbsMemberships.map(m => m.teamId.toLowerCase())));

        // Load features for all FBS teams
        const allFeatures: any[] = [];
        for (const tid of fbsTeamIds) {
          const teamFeatures = await loadTeamFeatures(tid, season);
          allFeatures.push(teamFeatures);
        }

        // Calculate z-score statistics for each feature
        const calculateZScores = (features: any[], getValue: (f: any) => number | null) => {
          const values = features
            .map(f => getValue(f))
            .filter(v => v !== null && v !== undefined && !isNaN(v))
            .map(v => v!);
          
          if (values.length === 0) {
            return { mean: 0, stdDev: 1, count: 0 };
          }
          
          const sum = values.reduce((acc, v) => acc + v, 0);
          const mean = sum / values.length;
          const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
          const stdDev = Math.sqrt(variance) || 1;
          
          return { mean, stdDev, count: values.length };
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

        // Calculate z-scores and contributions for the team
        const contributions: Record<string, { zScore: number; weight: number; contribution: number }> = {};

        // Offensive contributions
        for (const [factor, weight] of Object.entries(offensiveWeights)) {
          if (weight > 0) {
            const value = teamFeatures[factor as keyof typeof teamFeatures] as number | null | undefined;
            const stats = zStats[factor as keyof typeof zStats];
            const zScore = getZScore(value ?? null, stats.mean, stats.stdDev);
            const contribution = weight * zScore;
            contributions[factor] = { zScore, weight, contribution };
          }
        }

        // Defensive contributions (inverted)
        for (const [factor, weight] of Object.entries(defensiveWeights)) {
          if (weight > 0) {
            const value = teamFeatures[factor as keyof typeof teamFeatures] as number | null | undefined;
            const stats = zStats[factor as keyof typeof zStats];
            const zScore = getZScore(value ?? null, stats.mean, stats.stdDev);
            const contribution = -weight * zScore; // Inverted for defense
            contributions[factor] = { zScore, weight, contribution };
          }
        }

        return {
          zScoreStats: zStats,
          zScores: Object.fromEntries(
            Object.entries(contributions).map(([factor, data]) => [factor, data.zScore])
          ),
          weights: { ...offensiveWeights, ...defensiveWeights },
          contributions
        };
      } catch (error) {
        console.error('Error calculating z-score stats:', error);
        return null;
      }
    };

    const zScoreData = await calculateZScoreStats();

    return NextResponse.json({
      success: true,
      teamId,
      season,
      features: {
        // Offensive
        yppOff: features.yppOff,
        successOff: features.successOff,
        epaOff: features.epaOff,
        paceOff: features.paceOff,
        passYpaOff: features.passYpaOff,
        rushYpcOff: features.rushYpcOff,
        // Defensive
        yppDef: features.yppDef,
        successDef: features.successDef,
        epaDef: features.epaDef,
        paceDef: features.paceDef,
        passYpaDef: features.passYpaDef,
        rushYpcDef: features.rushYpcDef,
        // Metadata
        dataSource: features.dataSource,
        confidence: features.confidence,
        gamesCount: features.gamesCount,
        lastUpdated: features.lastUpdated?.toISOString() || null,
      },
      rating: rating ? {
        offenseRating: rating.offenseRating ? Number(rating.offenseRating) : null,
        defenseRating: rating.defenseRating ? Number(rating.defenseRating) : null,
        powerRating: rating.powerRating ? Number(rating.powerRating) : rating.rating ? Number(rating.rating) : null,
        confidence: rating.confidence ? Number(rating.confidence) : null,
        dataSource: rating.dataSource || null,
        createdAt: rating.createdAt.toISOString(),
        updatedAt: rating.updatedAt?.toISOString() || null,
      } : null,
      zScoreData: zScoreData ? {
        // Z-score statistics (mean, stdDev, count) for each feature across all FBS teams
        statistics: Object.fromEntries(
          Object.entries(zScoreData.zScoreStats).map(([factor, stats]) => [
            factor,
            {
              mean: stats.mean,
              stdDev: stats.stdDev,
              count: stats.count
            }
          ])
        ),
        // Computed z-scores for this team
        zScores: zScoreData.zScores,
        // Weights used in calculation
        weights: zScoreData.weights,
        // Contribution breakdown (weight × zScore)
        contributions: Object.fromEntries(
          Object.entries(zScoreData.contributions).map(([factor, data]) => [
            factor,
            {
              zScore: data.zScore,
              weight: data.weight,
              contribution: data.contribution
            }
          ])
        )
      } : null,
    });
  } catch (error) {
    console.error('Error in ratings peek:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

