/**
 * Sync Drive Stats from CFBD API
 * 
 * Fetches drive-level data from CFBD and aggregates into TeamSeasonStat.rawJson.drive_stats.
 * 
 * Supports V3 Totals (tempo, quality drives) and V4 Phase 1 metrics:
 * - Finishing Drives: Points per scoring opportunity (drives reaching opponent's 40 or closer)
 * - Available Yards %: Fraction of possible field gained per drive
 * 
 * Usage:
 *   npx tsx apps/jobs/src/sync-drives.ts --season 2025
 *   npx tsx apps/jobs/src/sync-drives.ts --season 2025 --weeks 1
 *   npx tsx apps/jobs/src/sync-drives.ts --season 2025 --weeks 1-4
 *   npx tsx apps/jobs/src/sync-drives.ts --season 2025 --weeks 1,3,5
 */

import { PrismaClient } from '@prisma/client';
import { CFBDClient } from './cfbd/cfbd-client';
import { CFBDTeamMapper } from './cfbd/team-mapper';

const prisma = new PrismaClient();

interface CFBDDrive {
  id?: number;
  gameId?: number;
  team?: string;
  opponent?: string;
  offense?: string;
  defense?: string;
  startYardline?: number;
  startYardLine?: number; // Alternative field name
  endYardline?: number;
  endYardLine?: number; // Alternative field name
  yards?: number;
  plays?: number;
  timeElapsed?: number;
  timeElapsedSeconds?: number;
  result?: string;
  points?: number;
  driveResult?: string;
  // CFBD may use different field names, so we'll handle both
  [key: string]: any;
}

interface DriveStats {
  // V3 Totals fields (preserved)
  tempo?: number; // Drives per game
  qualityDrives?: number; // Drives >= 40 yards
  qualityDriveRate?: number; // qualityDrives / totalDrives
  
  // V4 Phase 1: Finishing Drives
  finishingDrives?: {
    off: {
      scoringOpps: number;
      pointsOnOpps: number;
      pointsPerOpp: number;
    };
    def: {
      scoringOpps: number;
      pointsOnOpps: number;
      pointsPerOpp: number;
    };
  };
  
  // V4 Phase 1: Available Yards
  availableYards?: {
    off: {
      drives: number;
      avgAvailableYards: number;
      avgYardsGained: number;
      avgAvailableYardsPct: number; // 0-1
    };
    def: {
      drives: number;
      avgAvailableYards: number;
      avgYardsGained: number;
      avgAvailableYardsPct: number;
    };
  };
}

/**
 * Normalize yardline to 0-100 scale
 * 
 * CFBD API provides yardline as distance from own goal line (0-100 scale):
 * - 0 = own goal line
 * - 50 = midfield
 * - 100 = opponent goal line
 * 
 * This function ensures the value is in the valid 0-100 range.
 * If CFBD uses a different format (e.g., field position strings), additional
 * parsing would be needed here.
 */
function normalizeYardline(yardline: number | undefined | null): number | null {
  if (yardline === null || yardline === undefined) return null;
  // CFBD typically uses 0-100 scale already, but clamp to be safe
  return Math.max(0, Math.min(100, yardline));
}

/**
 * Determine if a drive reached a scoring opportunity (opponent's 40 or closer)
 * For offense: drive reached opponent's 40-yard line or closer
 * This means: normalized yardline >= 60 (60 yards from own goal = opponent's 40)
 */
function isScoringOpportunity(startYardline: number | null, endYardline: number | null, yards: number | null): boolean {
  // Use end yardline if available, otherwise calculate from start + yards
  let finalYardline: number | null = null;
  
  if (endYardline !== null && endYardline !== undefined) {
    finalYardline = normalizeYardline(endYardline);
  } else if (startYardline !== null && yards !== null && yards !== undefined) {
    const start = normalizeYardline(startYardline);
    if (start !== null) {
      finalYardline = Math.min(100, start + yards);
    }
  }
  
  if (finalYardline === null) return false;
  
  // Scoring opportunity = reached opponent's 40 or closer (yardline >= 60)
  return finalYardline >= 60;
}

/**
 * Calculate available yards percentage for a drive
 * Available Yards % = yards gained / available yards
 * Available yards = 100 - start yardline (distance to opponent goal line)
 */
function calculateAvailableYards(
  startYardline: number | null,
  endYardline: number | null,
  yards: number | null
): { availableYards: number; yardsGained: number; pct: number } | null {
  const start = normalizeYardline(startYardline);
  if (start === null) return null;
  
  // Available yards = distance to opponent goal line
  const availableYards = Math.max(0, 100 - start);
  if (availableYards <= 0) return null; // Skip if already at goal line
  
  // Yards gained: use explicit yards if available, otherwise calculate from positions
  let yardsGained: number;
  if (yards !== null && yards !== undefined) {
    yardsGained = Math.max(0, yards);
  } else if (endYardline !== null && endYardline !== undefined) {
    const end = normalizeYardline(endYardline);
    if (end === null) return null;
    yardsGained = Math.max(0, end - start);
  } else {
    return null; // Can't calculate without yards or end position
  }
  
  // Calculate percentage and clamp to [0, 1]
  const pct = Math.max(0, Math.min(1, yardsGained / availableYards));
  
  return { availableYards, yardsGained, pct };
}

/**
 * Parse weeks argument from CLI
 * Supports: single (1), range (1-4), comma-separated (1,3,5)
 */
function parseWeeks(weeksArg: string | undefined): number[] | null {
  if (!weeksArg) return null;
  
  const weeks: number[] = [];
  
  if (weeksArg.includes(',')) {
    // Comma-separated list
    weeks.push(...weeksArg.split(',').map(w => parseInt(w.trim())).filter(w => !isNaN(w)));
  } else if (weeksArg.includes('-')) {
    // Range format: 1-4
    const [start, end] = weeksArg.split('-').map(w => parseInt(w.trim()));
    if (!isNaN(start) && !isNaN(end) && start <= end) {
      for (let w = start; w <= end; w++) {
        weeks.push(w);
      }
    }
  } else {
    // Single week
    const week = parseInt(weeksArg.trim());
    if (!isNaN(week)) {
      weeks.push(week);
    }
  }
  
  return weeks.length > 0 ? weeks : null;
}

/**
 * Process drives for a season and aggregate metrics per team
 */
async function processDrivesForSeason(season: number, weeks: number[] | null): Promise<void> {
  console.log(`\n🏈 Processing drives for season ${season}...`);
  if (weeks) {
    console.log(`   Weeks: ${weeks.join(', ')}`);
  } else {
    console.log('   Weeks: all (fetching entire season)');
  }
  
  const client = new CFBDClient();
  const mapper = new CFBDTeamMapper();
  
  // Fetch drives week-by-week if weeks specified, otherwise fetch all at once
  let allDrives: CFBDDrive[] = [];
  
  if (weeks && weeks.length > 0) {
    // Fetch week-by-week
    for (const week of weeks) {
      console.log(`   Processing season ${season}, week ${week}...`);
      const weekDrives = await client.getDrives(season, week);
      console.log(`   Fetched ${weekDrives.length} drives for week ${week}`);
      allDrives.push(...(weekDrives as CFBDDrive[]));
    }
  } else {
    // Fetch all drives for the season (no week filter to get all weeks)
    console.log('   Fetching drives from CFBD API...');
    const drives = await client.getDrives(season);
    allDrives = drives as CFBDDrive[];
  }
  
  console.log(`   Total drives fetched: ${allDrives.length}`);
  
  if (allDrives.length === 0) {
    console.log('   ⚠️  No drives found for this season/week range');
    return;
  }
  
  // Group drives by team
  const teamDriveMap = new Map<string, {
    offense: CFBDDrive[];
    defense: CFBDDrive[];
  }>();
  
  for (const drive of allDrives) {
    // CFBD may use 'offense'/'defense' or 'team'/'opponent' fields
    const offenseTeam = drive.offense || drive.team;
    const defenseTeam = drive.defense || drive.opponent;
    
    if (!offenseTeam || !defenseTeam) {
      console.warn(`   ⚠️  Skipping drive ${drive.id || 'unknown'}: missing team info`);
      continue;
    }
    
    // Map CFBD team names to internal IDs
    const offenseId = await mapper.mapToInternal(offenseTeam, season);
    const defenseId = await mapper.mapToInternal(defenseTeam, season);
    
    if (!offenseId || !defenseId) {
      // Skip if we can't map teams (likely FCS or other divisions)
      continue;
    }
    
    // Add to offense drives for offense team
    if (!teamDriveMap.has(offenseId)) {
      teamDriveMap.set(offenseId, { offense: [], defense: [] });
    }
    teamDriveMap.get(offenseId)!.offense.push(drive);
    
    // Add to defense drives for defense team (this drive is opponent's offense)
    if (!teamDriveMap.has(defenseId)) {
      teamDriveMap.set(defenseId, { offense: [], defense: [] });
    }
    teamDriveMap.get(defenseId)!.defense.push(drive);
  }
  
  console.log(`   Processing ${teamDriveMap.size} teams...`);
  
  // Process each team
  for (const [teamId, { offense: offenseDrives, defense: defenseDrives }] of teamDriveMap.entries()) {
    // V3 Totals metrics (preserve existing structure)
    const totalDrives = offenseDrives.length;
    const qualityDrives = offenseDrives.filter(d => {
      const yards = d.yards || 0;
      return yards >= 40;
    }).length;
    const qualityDriveRate = totalDrives > 0 ? qualityDrives / totalDrives : 0;
    
    // Calculate tempo (drives per game)
    // We need to count unique games - use gameId if available
    // CFBD may use gameId or game_id field
    const uniqueGames = new Set(
      offenseDrives
        .map(d => d.gameId || d.game_id || d.game)
        .filter(Boolean)
    );
    const games = uniqueGames.size || 1; // Fallback to 1 if no game IDs
    const tempo = games > 0 ? totalDrives / games : 0;
    
    // V4 Phase 1: Finishing Drives (Offense)
    let offScoringOpps = 0;
    let offPointsOnOpps = 0;
    
    for (const drive of offenseDrives) {
      const startYardline = drive.startYardline ?? drive.startYardLine;
      const endYardline = drive.endYardline ?? drive.endYardLine;
      const yards = drive.yards;
      
      if (isScoringOpportunity(startYardline, endYardline, yards)) {
        offScoringOpps++;
        const points = drive.points || 0;
        offPointsOnOpps += points;
      }
    }
    
    const offPointsPerOpp = offScoringOpps > 0 ? offPointsOnOpps / offScoringOpps : 0;
    
    // V4 Phase 1: Finishing Drives (Defense)
    let defScoringOpps = 0;
    let defPointsOnOpps = 0;
    
    for (const drive of defenseDrives) {
      const startYardline = drive.startYardline ?? drive.startYardLine;
      const endYardline = drive.endYardline ?? drive.endYardLine;
      const yards = drive.yards;
      
      if (isScoringOpportunity(startYardline, endYardline, yards)) {
        defScoringOpps++;
        const points = drive.points || 0;
        defPointsOnOpps += points;
      }
    }
    
    const defPointsPerOpp = defScoringOpps > 0 ? defPointsOnOpps / defScoringOpps : 0;
    
    // V4 Phase 1: Available Yards (Offense)
    let offDrivesWithAvail = 0;
    let sumOffAvailableYards = 0;
    let sumOffYardsGained = 0;
    let sumOffAvailableYardsPct = 0;
    
    for (const drive of offenseDrives) {
      const startYardline = drive.startYardline ?? drive.startYardLine;
      const endYardline = drive.endYardline ?? drive.endYardLine;
      const yards = drive.yards;
      
      const avail = calculateAvailableYards(startYardline, endYardline, yards);
      if (avail) {
        offDrivesWithAvail++;
        sumOffAvailableYards += avail.availableYards;
        sumOffYardsGained += avail.yardsGained;
        sumOffAvailableYardsPct += avail.pct;
      }
    }
    
    const offAvgAvailableYards = offDrivesWithAvail > 0 ? sumOffAvailableYards / offDrivesWithAvail : 0;
    const offAvgYardsGained = offDrivesWithAvail > 0 ? sumOffYardsGained / offDrivesWithAvail : 0;
    const offAvgAvailableYardsPct = offDrivesWithAvail > 0 ? sumOffAvailableYardsPct / offDrivesWithAvail : 0;
    
    // V4 Phase 1: Available Yards (Defense)
    let defDrivesWithAvail = 0;
    let sumDefAvailableYards = 0;
    let sumDefYardsGained = 0;
    let sumDefAvailableYardsPct = 0;
    
    for (const drive of defenseDrives) {
      const startYardline = drive.startYardline ?? drive.startYardLine;
      const endYardline = drive.endYardline ?? drive.endYardLine;
      const yards = drive.yards;
      
      const avail = calculateAvailableYards(startYardline, endYardline, yards);
      if (avail) {
        defDrivesWithAvail++;
        sumDefAvailableYards += avail.availableYards;
        sumDefYardsGained += avail.yardsGained;
        sumDefAvailableYardsPct += avail.pct;
      }
    }
    
    const defAvgAvailableYards = defDrivesWithAvail > 0 ? sumDefAvailableYards / defDrivesWithAvail : 0;
    const defAvgYardsGained = defDrivesWithAvail > 0 ? sumDefYardsGained / defDrivesWithAvail : 0;
    const defAvgAvailableYardsPct = defDrivesWithAvail > 0 ? sumDefAvailableYardsPct / defDrivesWithAvail : 0;
    
    // Build drive_stats object (preserve V3 fields, add V4 fields)
    const driveStats: DriveStats = {
      // V3 Totals fields (preserved)
      tempo,
      qualityDrives,
      qualityDriveRate,
      
      // V4 Phase 1: Finishing Drives
      finishingDrives: {
        off: {
          scoringOpps: offScoringOpps,
          pointsOnOpps: offPointsOnOpps,
          pointsPerOpp: offPointsPerOpp,
        },
        def: {
          scoringOpps: defScoringOpps,
          pointsOnOpps: defPointsOnOpps,
          pointsPerOpp: defPointsPerOpp,
        },
      },
      
      // V4 Phase 1: Available Yards
      availableYards: {
        off: {
          drives: offDrivesWithAvail,
          avgAvailableYards: offAvgAvailableYards,
          avgYardsGained: offAvgYardsGained,
          avgAvailableYardsPct: offAvgAvailableYardsPct,
        },
        def: {
          drives: defDrivesWithAvail,
          avgAvailableYards: defAvgAvailableYards,
          avgYardsGained: defAvgYardsGained,
          avgAvailableYardsPct: defAvgAvailableYardsPct,
        },
      },
    };
    
    // Update TeamSeasonStat
    const existing = await prisma.teamSeasonStat.findUnique({
      where: {
        season_teamId: {
          season,
          teamId,
        },
      },
    });
    
    // Merge with existing rawJson to preserve other fields
    const existingRawJson = (existing?.rawJson as any) || {};
    const updatedRawJson = {
      ...existingRawJson,
      drive_stats: driveStats,
    };
    
    await prisma.teamSeasonStat.upsert({
      where: {
        season_teamId: {
          season,
          teamId,
        },
      },
      create: {
        season,
        teamId,
        rawJson: updatedRawJson,
      },
      update: {
        rawJson: updatedRawJson,
      },
    });
  }
  
  console.log(`   ✅ Processed ${teamDriveMap.size} teams`);
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  let season: number | null = null;
  let weeksArg: string | undefined = undefined;
  
  // Parse CLI arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && i + 1 < args.length) {
      season = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--weeks' && i + 1 < args.length) {
      weeksArg = args[i + 1];
      i++;
    }
  }
  
  if (!season || isNaN(season)) {
    console.error('Usage: npx tsx apps/jobs/src/sync-drives.ts --season <YEAR> [--weeks <WEEKS>]');
    console.error('Examples:');
    console.error('  npx tsx apps/jobs/src/sync-drives.ts --season 2025');
    console.error('  npx tsx apps/jobs/src/sync-drives.ts --season 2025 --weeks 1');
    console.error('  npx tsx apps/jobs/src/sync-drives.ts --season 2025 --weeks 1-4');
    console.error('  npx tsx apps/jobs/src/sync-drives.ts --season 2025 --weeks 1,3,5');
    process.exit(1);
  }
  
  const weeks = parseWeeks(weeksArg);
  
  try {
    await processDrivesForSeason(season, weeks);
    console.log('\n✅ Drive stats sync complete');
  } catch (error) {
    console.error('\n❌ Error syncing drive stats:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

