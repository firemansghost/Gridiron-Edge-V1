/**
 * Data Sources API Route
 * 
 * Provides data source distribution for ratings system.
 * Shows how many teams have game-level, season-level, or baseline-only data.
 * 
 * Usage:
 *   GET /api/ratings/data-sources?season=2025
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
// Import types only - we'll implement the logic directly here to avoid cross-workspace imports
interface DataSourceSummary {
  gameFeatures: number;
  seasonFeatures: number;
  baselineOnly: number;
  missing: number;
  total: number;
}

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const season = parseInt(searchParams.get('season') || '2025');

    console.log(`[DATA_SOURCES] Getting data source summary for season ${season}`);

    // Get all teams for the season
    const teams = await prisma.team.findMany({
      select: { id: true }
    });

    const summary: DataSourceSummary = {
      gameFeatures: 0,
      seasonFeatures: 0,
      baselineOnly: 0,
      missing: 0,
      total: teams.length,
    };

    // Check each team's data sources
    for (const team of teams) {
      // Check for game-level stats
      const gameStats = await prisma.teamGameStat.findFirst({
        where: {
          teamId: team.id,
          season,
          OR: [
            { yppOff: { not: null } },
            { yppDef: { not: null } },
            { successOff: { not: null } },
            { successDef: { not: null } },
          ]
        }
      });

      if (gameStats) {
        summary.gameFeatures++;
        continue;
      }

      // Check for season-level stats
      const seasonStats = await prisma.teamSeasonStat.findUnique({
        where: {
          season_teamId: {
            season,
            teamId: team.id,
          }
        }
      });

      if (seasonStats) {
        summary.seasonFeatures++;
        continue;
      }

      // Check for baseline ratings
      const baselineRating = await prisma.teamSeasonRating.findUnique({
        where: {
          season_teamId: {
            season,
            teamId: team.id,
          }
        }
      });

      if (baselineRating) {
        summary.baselineOnly++;
      } else {
        summary.missing++;
      }
    }

    // Calculate percentages
    const percentages = {
      gameFeatures: summary.total > 0 ? (summary.gameFeatures / summary.total) * 100 : 0,
      seasonFeatures: summary.total > 0 ? (summary.seasonFeatures / summary.total) * 100 : 0,
      baselineOnly: summary.total > 0 ? (summary.baselineOnly / summary.total) * 100 : 0,
      missing: summary.total > 0 ? (summary.missing / summary.total) * 100 : 0,
    };

    // Calculate data quality score (0-100)
    const qualityScore = Math.round(
      (summary.gameFeatures * 100 + summary.seasonFeatures * 70 + summary.baselineOnly * 30) / 
      Math.max(summary.total, 1)
    );

    const result = {
      season,
      timestamp: new Date().toISOString(),
      summary,
      percentages,
      qualityScore,
      recommendations: generateRecommendations(summary, qualityScore),
    };

    console.log(`[DATA_SOURCES] Summary: ${summary.gameFeatures} game, ${summary.seasonFeatures} season, ${summary.baselineOnly} baseline, ${summary.missing} missing`);

    return NextResponse.json(result);

  } catch (error) {
    console.error('[DATA_SOURCES] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get data source summary',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

function generateRecommendations(summary: DataSourceSummary, qualityScore: number): string[] {
  const recommendations: string[] = [];

  if (summary.missing > 0) {
    recommendations.push(`${summary.missing} teams have no data - consider running ETL jobs`);
  }

  if (summary.baselineOnly > summary.gameFeatures + summary.seasonFeatures) {
    recommendations.push('Most teams only have baseline ratings - prioritize game/season stats ETL');
  }

  if (summary.gameFeatures < summary.total * 0.5) {
    recommendations.push('Less than 50% of teams have game-level features - check CFBD game stats job');
  }

  if (qualityScore < 50) {
    recommendations.push('Overall data quality is low - review ETL pipeline');
  } else if (qualityScore > 80) {
    recommendations.push('Excellent data quality - ratings should be highly accurate');
  }

  if (recommendations.length === 0) {
    recommendations.push('Data quality looks good - no immediate action needed');
  }

  return recommendations;
}
