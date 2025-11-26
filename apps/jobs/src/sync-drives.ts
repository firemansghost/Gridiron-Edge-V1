#!/usr/bin/env node

/**
 * Sync Drive Data from CFBD
 * 
 * Fetches drive-by-drive data and calculates:
 * - Quality Drives (>= 40 yards)
 * - Drives Per Game (Tempo)
 * - Quality Drive Rate
 * 
 * Stores aggregates in TeamSeasonStat.drive_stats JSON field
 * 
 * Usage:
 *   npx tsx apps/jobs/src/sync-drives.ts --season 2025
 */

import { PrismaClient } from '@prisma/client';
import { CFBDClient } from './cfbd/cfbd-client';
import { CFBDTeamMapper } from './cfbd/team-mapper';

const prisma = new PrismaClient();

interface DriveData {
  id: number;
  offense: string;
  offenseConference?: string;
  defense: string;
  defenseConference?: string;
  gameId: number;
  season: number;
  week?: number;
  yards: number;
  plays: number;
  driveResult?: string;
  isScoringDrive?: boolean;
  elapsed?: {
    minutes?: number;
    seconds?: number;
  };
  startYardline?: number;
  endYardline?: number;
  startPeriod?: number;
  endPeriod?: number;
  timeOfPossession?: string;
}

interface TeamDriveStats {
  teamId: string;
  season: number;
  totalDrives: number;
  qualityDrives: number; // >= 40 yards
  qualityDriveRate: number; // qualityDrives / totalDrives
  drivesPerGame: number;
  totalGames: number;
  totalYards: number;
  totalPlays: number;
  scoringDrives: number;
  pointsPerDrive?: number;
}

/**
 * Check if a drive is a "quality drive" (>= 40 yards)
 */
function isQualityDrive(drive: DriveData): boolean {
  return drive.yards >= 40;
}

/**
 * Aggregate drives by team
 */
function aggregateDrivesByTeam(
  drives: DriveData[],
  teamMapping: Map<string, string>
): Map<string, TeamDriveStats> {
  const teamStats = new Map<string, TeamDriveStats>();

  for (const drive of drives) {
    // Map CFBD team name to internal team ID
    const offenseKey = drive.offense?.toLowerCase();
    if (!offenseKey) continue;

    const teamId = teamMapping.get(offenseKey);
    if (!teamId) {
      // Skip unmapped teams (will be logged)
      continue;
    }

    // Initialize team stats if needed
    if (!teamStats.has(teamId)) {
      teamStats.set(teamId, {
        teamId,
        season: drive.season,
        totalDrives: 0,
        qualityDrives: 0,
        qualityDriveRate: 0,
        drivesPerGame: 0,
        totalGames: 0,
        totalYards: 0,
        totalPlays: 0,
        scoringDrives: 0,
      });
    }

    const stats = teamStats.get(teamId)!;
    stats.totalDrives++;
    stats.totalYards += drive.yards || 0;
    stats.totalPlays += drive.plays || 0;
    
    if (isQualityDrive(drive)) {
      stats.qualityDrives++;
    }
    
    if (drive.isScoringDrive) {
      stats.scoringDrives++;
    }
  }

  // Calculate rates and per-game averages
  // We need to get game counts separately
  return teamStats;
}

/**
 * Get game counts per team for the season
 */
async function getGameCounts(season: number, teamIds: string[]): Promise<Map<string, number>> {
  const gameCounts = new Map<string, number>();

  for (const teamId of teamIds) {
    const count = await prisma.game.count({
      where: {
        season,
        OR: [
          { homeTeamId: teamId },
          { awayTeamId: teamId },
        ],
        status: 'final', // Use status instead of completed
      },
    });
    gameCounts.set(teamId, count);
  }

  return gameCounts;
}

/**
 * Fetch and process drives for a season
 */
async function syncDrives(season: number): Promise<void> {
  console.log(`\n🚀 Syncing Drive Data for ${season}`);
  console.log('='.repeat(70));

  const client = new CFBDClient();
  const mapper = new CFBDTeamMapper();

  // Build team mapping from drives as we fetch them
  console.log('\n📋 Building team mapping and fetching drives...');
  const unmapped: string[] = [];
  const teamMapping = new Map<string, string>();
  const cfbdTeams = new Set<string>();

  // Fetch drives for the season (week by week to avoid rate limits)
  console.log('\n📥 Fetching drives...');
  const allDrives: DriveData[] = [];
  
  // Fetch week by week (weeks 1-15 typically)
  for (let week = 1; week <= 15; week++) {
    try {
      const drives = await client.getDrives(season, week);
      console.log(`   Week ${week}: ${drives.length} drives`);
      
      for (const drive of drives) {
        // Collect team names for mapping
        if (drive.offense) cfbdTeams.add(drive.offense);
        if (drive.defense) cfbdTeams.add(drive.defense);
        
        allDrives.push({
          id: drive.id,
          offense: drive.offense,
          offenseConference: drive.offenseConference,
          defense: drive.defense,
          defenseConference: drive.defenseConference,
          gameId: drive.gameId,
          season: drive.season || season,
          week: drive.week || week,
          yards: drive.yards || 0,
          plays: drive.plays || 0,
          driveResult: drive.driveResult,
          isScoringDrive: drive.isScoringDrive || drive.driveResult === 'TD' || drive.driveResult === 'FG',
          elapsed: drive.elapsed,
          startYardline: drive.startYardline,
          endYardline: drive.endYardline,
          startPeriod: drive.startPeriod,
          endPeriod: drive.endPeriod,
          timeOfPossession: drive.timeOfPossession,
        });
      }
    } catch (error: any) {
      // Some weeks may not have data yet
      if (error.message?.includes('404') || error.message?.includes('400')) {
        console.log(`   Week ${week}: No data available`);
        continue;
      }
      throw error;
    }
  }

  console.log(`   ✅ Total drives fetched: ${allDrives.length}`);

  // Build team mapping from collected team names
  console.log(`\n📋 Mapping ${cfbdTeams.size} teams...`);
  for (const cfbdName of cfbdTeams) {
    const internalId = await mapper.mapToInternal(cfbdName, season);
    if (internalId) {
      teamMapping.set(cfbdName.toLowerCase(), internalId);
    } else {
      if (!unmapped.includes(cfbdName)) {
        unmapped.push(cfbdName);
      }
    }
  }

  if (unmapped.length > 0) {
    console.warn(`   ⚠️  ${unmapped.length} unmapped teams: ${unmapped.slice(0, 5).join(', ')}${unmapped.length > 5 ? '...' : ''}`);
  }
  
  console.log(`   ✅ Mapped ${teamMapping.size} teams`);

  // Aggregate by team
  console.log('\n📊 Aggregating drive stats by team...');
  const teamStatsMap = aggregateDrivesByTeam(allDrives, teamMapping);
  
  // Get game counts
  const teamIds = Array.from(teamStatsMap.keys());
  const gameCounts = await getGameCounts(season, teamIds);

  // Calculate final stats
  for (const [teamId, stats] of teamStatsMap.entries()) {
    const games = gameCounts.get(teamId) || 1; // Avoid division by zero
    stats.totalGames = games;
    stats.drivesPerGame = stats.totalDrives / games;
    stats.qualityDriveRate = stats.totalDrives > 0 
      ? stats.qualityDrives / stats.totalDrives 
      : 0;
  }

  // Save to TeamSeasonStat
  console.log('\n💾 Saving drive stats to TeamSeasonStat...');
  let saved = 0;
  let skipped = 0;

  for (const [teamId, stats] of teamStatsMap.entries()) {
    try {
      const driveStatsJson = {
        total_drives: stats.totalDrives,
        quality_drives: stats.qualityDrives,
        quality_drive_rate: stats.qualityDriveRate,
        drives_per_game: stats.drivesPerGame,
        total_games: stats.totalGames,
        total_yards: stats.totalYards,
        total_plays: stats.totalPlays,
        scoring_drives: stats.scoringDrives,
        points_per_drive: stats.scoringDrives > 0 ? (stats.scoringDrives * 5.0) / stats.totalDrives : 0,
      };

      // Update TeamSeasonStat with drive_stats in rawJson
      // We'll merge with existing rawJson if it exists
      const existing = await prisma.teamSeasonStat.findUnique({
        where: {
          season_teamId: {
            season,
            teamId,
          },
        },
      });

      const updatedRawJson = existing?.rawJson 
        ? { ...(existing.rawJson as any), drive_stats: driveStatsJson }
        : { drive_stats: driveStatsJson };

      await prisma.teamSeasonStat.upsert({
        where: {
          season_teamId: {
            season,
            teamId,
          },
        },
        update: {
          rawJson: updatedRawJson,
        },
        create: {
          season,
          teamId,
          rawJson: updatedRawJson,
        },
      });

      saved++;
    } catch (error: any) {
      console.error(`   ⚠️  Failed to save stats for ${teamId}: ${error.message}`);
      skipped++;
    }
  }

  console.log(`   ✅ Saved: ${saved}, Skipped: ${skipped}`);

  // Log top teams by quality drive rate
  console.log('\n📈 Top 10 Teams by Quality Drive Rate:');
  const sorted = Array.from(teamStatsMap.values())
    .filter(s => s.totalDrives >= 50) // Minimum sample size
    .sort((a, b) => b.qualityDriveRate - a.qualityDriveRate)
    .slice(0, 10);

  for (const stats of sorted) {
    const team = await prisma.team.findUnique({
      where: { id: stats.teamId },
      select: { name: true },
    });
    console.log(`   ${team?.name || stats.teamId}: ${(stats.qualityDriveRate * 100).toFixed(1)}% (${stats.qualityDrives}/${stats.totalDrives} drives, ${stats.drivesPerGame.toFixed(1)} drives/game)`);
  }

  console.log('\n✅ Drive sync complete!\n');
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  let season = 2025;

  // Parse --season flag
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && args[i + 1]) {
      season = parseInt(args[i + 1]);
      break;
    }
  }

  if (isNaN(season)) {
    console.error('Error: Invalid season. Usage: npx tsx apps/jobs/src/sync-drives.ts --season 2025');
    process.exit(1);
  }

  await syncDrives(season);
}

main()
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


