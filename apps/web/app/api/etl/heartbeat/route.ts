import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Get roster talent data (Phase 3)
    let rosterTalent2025 = 0;
    let rosterTalentLastUpdated = null;
    try {
      rosterTalent2025 = await prisma.teamSeasonTalent.count({
        where: { season: 2025 }
      });
      const rosterTalentData = await prisma.teamSeasonTalent.findFirst({
        where: { season: 2025 },
        orderBy: { sourceUpdatedAt: 'desc' },
        select: { sourceUpdatedAt: true }
      });
      rosterTalentLastUpdated = rosterTalentData?.sourceUpdatedAt || null;
    } catch (error) {
      console.warn('team_season_talent table not accessible:', error);
      rosterTalent2025 = 0;
    }

    // Get recruiting commits data (Phase 3)
    let commits2025 = 0;
    let commitsLastUpdated = null;
    try {
      commits2025 = await prisma.teamClassCommits.count({
        where: { season: 2025 }
      });
      const commitsData = await prisma.teamClassCommits.findFirst({
        where: { season: 2025 },
        orderBy: { sourceUpdatedAt: 'desc' },
        select: { sourceUpdatedAt: true }
      });
      commitsLastUpdated = commitsData?.sourceUpdatedAt || null;
    } catch (error) {
      console.warn('team_class_commits table not accessible:', error);
      commits2025 = 0;
    }

    // Legacy recruiting table (for backward compatibility)
    let recruiting2025 = 0;
    let recruitingLastUpdated = null;
    try {
      const recruitingData = await prisma.recruiting.findFirst({
        where: { season: 2025 },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true }
      });
      recruiting2025 = await prisma.recruiting.count({
        where: { season: 2025 }
      });
      recruitingLastUpdated = recruitingData?.updatedAt?.toISOString() || null;
    } catch (error) {
      console.warn('recruiting table not accessible:', error);
      recruiting2025 = 0;
    }

    // Get team game stats data with timestamp
    const teamGameStatsData = await prisma.teamGameStat.findFirst({
      where: { season: 2025 },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true }
    });
    const teamGameStats2025 = await prisma.teamGameStat.count({
      where: { season: 2025 }
    });

    // Get expected FBS count for 2025 from team_membership
    let expectedFBS2025 = 0;
    try {
      expectedFBS2025 = await prisma.teamMembership.count({
        where: { season: 2025, level: 'fbs' }
      });
    } catch (error) {
      console.warn('team_membership table not accessible:', error);
    }

    // Get team season stats data with timestamp (handle gracefully if table doesn't exist)
    let teamSeasonStats2025 = 0;
    let teamSeasonStatsLastUpdated = null;
    let advancedStatsFilled = { successOff: 0, epaOff: 0 };
    try {
      teamSeasonStats2025 = await prisma.teamSeasonStat.count({
        where: { season: 2025 }
      });
      const seasonStatsData = await prisma.teamSeasonStat.findFirst({
        where: { season: 2025 },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true }
      });
      teamSeasonStatsLastUpdated = seasonStatsData?.createdAt || null;
      
      // Get advanced stats fill counts
      const advancedStats = await prisma.teamSeasonStat.findMany({
        where: { season: 2025 },
        select: { successOff: true, epaOff: true }
      });
      advancedStatsFilled = {
        successOff: advancedStats.filter(s => s.successOff !== null).length,
        epaOff: advancedStats.filter(s => s.epaOff !== null).length,
      };
    } catch (error) {
      console.warn('team_season_stats table not accessible:', error);
      teamSeasonStats2025 = 0;
    }

    // Get baseline ratings data with timestamp (handle gracefully if table doesn't exist)
    let ratings2025 = 0;
    let ratingsLastUpdated = null;
    try {
      ratings2025 = await prisma.teamSeasonRating.count({
        where: { season: 2025 }
      });
      const ratingsData = await prisma.teamSeasonRating.findFirst({
        where: { season: 2025 },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true }
      });
      ratingsLastUpdated = ratingsData?.createdAt || null;
    } catch (error) {
      console.warn('team_season_ratings table not accessible:', error);
      ratings2025 = 0;
    }

    return NextResponse.json({
      recruiting_2025: recruiting2025, // Legacy table
      roster_talent_2025: rosterTalent2025, // Phase 3: team_season_talent
      commits_2025: commits2025, // Phase 3: team_class_commits
      team_game_stats_2025: teamGameStats2025,
      team_season_stats_2025: teamSeasonStats2025,
      expected_fbs_2025: expectedFBS2025,
      advanced_stats_filled: advancedStatsFilled,
      ratings_2025: ratings2025,
      lastUpdated: {
        recruiting: recruitingLastUpdated,
        rosterTalent: rosterTalentLastUpdated?.toISOString() || null, // Phase 3
        commits: commitsLastUpdated?.toISOString() || null, // Phase 3
        teamGameStats: teamGameStatsData?.updatedAt?.toISOString() || null,
        teamSeasonStats: teamSeasonStatsLastUpdated?.toISOString() || null,
        ratings: ratingsLastUpdated?.toISOString() || null,
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('ETL heartbeat error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch ETL status',
        recruiting_2025: 0,
        roster_talent_2025: 0,
        commits_2025: 0,
        team_game_stats_2025: 0,
        team_season_stats_2025: 0,
        ratings_2025: 0,
        lastUpdated: {
          recruiting: null,
          rosterTalent: null,
          commits: null,
          teamGameStats: null,
          teamSeasonStats: null,
          ratings: null,
        },
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
