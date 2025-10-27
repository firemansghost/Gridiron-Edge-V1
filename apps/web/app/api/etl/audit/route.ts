/**
 * ETL Audit API Route
 * 
 * Provides detailed audit information for ETL data quality monitoring.
 * Returns counts, fill ratios, and data freshness metrics.
 * 
 * Usage:
 *   GET /api/etl/audit?season=2024&week=1
 *   GET /api/etl/audit?season=2025
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';

interface AuditResult {
  season: number;
  week?: number;
  timestamp: string;
  
  // Data counts
  recordsJson: number;
  resolvedTeams: number;
  resolvedGames: number;
  upserts: number;
  skippedNoGame: number;
  skippedNoTeam: number;
  
  // Fill ratios for key fields
  fillRatios: {
    yppOff: number;
    yppDef: number;
    successOff: number;
    successDef: number;
    epaOff: number;
    epaDef: number;
    paceOff: number;
    paceDef: number;
  };
  
  // Data freshness
  lastUpdated: string | null;
  dataAge: number | null; // hours since last update
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const season = parseInt(searchParams.get('season') || '2025');
    const week = searchParams.get('week') ? parseInt(searchParams.get('week')!) : undefined;

    console.log(`[ETL_AUDIT] Auditing season ${season}${week ? ` week ${week}` : ''}`);

    // Get team game stats data
    const whereClause = week 
      ? { season, week }
      : { season };

    const teamGameStats = await prisma.teamGameStat.findMany({
      where: whereClause,
      select: {
        yppOff: true,
        yppDef: true,
        successOff: true,
        successDef: true,
        epaOff: true,
        epaDef: true,
        pace: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    // Calculate fill ratios
    const totalRecords = teamGameStats.length;
    const fillRatios = {
      yppOff: totalRecords > 0 ? (teamGameStats.filter(r => r.yppOff !== null).length / totalRecords) * 100 : 0,
      yppDef: totalRecords > 0 ? (teamGameStats.filter(r => r.yppDef !== null).length / totalRecords) * 100 : 0,
      successOff: totalRecords > 0 ? (teamGameStats.filter(r => r.successOff !== null).length / totalRecords) * 100 : 0,
      successDef: totalRecords > 0 ? (teamGameStats.filter(r => r.successDef !== null).length / totalRecords) * 100 : 0,
      epaOff: totalRecords > 0 ? (teamGameStats.filter(r => r.epaOff !== null).length / totalRecords) * 100 : 0,
      epaDef: totalRecords > 0 ? (teamGameStats.filter(r => r.epaDef !== null).length / totalRecords) * 100 : 0,
      paceOff: totalRecords > 0 ? (teamGameStats.filter(r => r.pace !== null).length / totalRecords) * 100 : 0,
      paceDef: 0, // Not available in TeamGameStat schema
    };

    // Calculate data freshness
    const lastUpdated = teamGameStats.length > 0 
      ? new Date(Math.max(...teamGameStats.map(r => r.updatedAt.getTime())))
      : null;
    
    const dataAge = lastUpdated 
      ? Math.round((Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60)) // hours
      : null;

    // Get additional counts for context
    const recruitingCount = await prisma.recruiting.count({
      where: { season }
    });

    const seasonStatsCount = await prisma.teamSeasonStat.count({
      where: { season }
    });

    const ratingsCount = await prisma.teamSeasonRating.count({
      where: { season }
    });

    const auditResult: AuditResult = {
      season,
      week,
      timestamp: new Date().toISOString(),
      
      // Data counts (using team game stats as proxy for ETL activity)
      recordsJson: totalRecords,
      resolvedTeams: totalRecords, // All records have resolved teams
      resolvedGames: totalRecords, // All records have resolved games
      upserts: totalRecords,
      skippedNoGame: 0, // Would need to track this during ETL
      skippedNoTeam: 0, // Would need to track this during ETL
      
      fillRatios,
      lastUpdated: lastUpdated?.toISOString() || null,
      dataAge,
    };

    // Get season stats data for additional context
    let seasonStatsData = null;
    try {
      const seasonStats = await prisma.teamSeasonStat.findMany({
        where: { season },
        select: {
          yppOff: true,
          successOff: true,
          epaOff: true,
          paceOff: true,
          createdAt: true,
        }
      });
      
      seasonStatsData = {
        count: seasonStats.length,
        fillRatios: {
          yppOff: seasonStats.length > 0 ? (seasonStats.filter(s => s.yppOff !== null).length / seasonStats.length) * 100 : 0,
          successOff: seasonStats.length > 0 ? (seasonStats.filter(s => s.successOff !== null).length / seasonStats.length) * 100 : 0,
          epaOff: seasonStats.length > 0 ? (seasonStats.filter(s => s.epaOff !== null).length / seasonStats.length) * 100 : 0,
          paceOff: seasonStats.length > 0 ? (seasonStats.filter(s => s.paceOff !== null).length / seasonStats.length) * 100 : 0,
        },
        lastUpdated: seasonStats.length > 0 ? new Date(Math.max(...seasonStats.map(s => s.createdAt.getTime()))) : null,
      };
    } catch (error) {
      console.warn('team_season_stats not accessible:', error);
    }

    // Add context counts
    const context = {
      recruiting: recruitingCount,
      seasonStats: seasonStatsCount,
      ratings: ratingsCount,
      seasonStatsData,
    };

    console.log(`[ETL_AUDIT] Found ${totalRecords} team game stats, fill ratios:`, fillRatios);

    return NextResponse.json({
      audit: auditResult,
      context,
    });

  } catch (error) {
    console.error('[ETL_AUDIT] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to audit ETL data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
