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
import { FeatureLoader, DataSourceSummary } from '../../../../apps/jobs/src/ratings/feature-loader';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const season = parseInt(searchParams.get('season') || '2025');

    console.log(`[DATA_SOURCES] Getting data source summary for season ${season}`);

    const loader = new FeatureLoader(prisma);
    const summary = await loader.getDataSourceSummary(season);

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
