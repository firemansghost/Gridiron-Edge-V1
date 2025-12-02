/**
 * SGO Team Season Stats Sync
 * 
 * Fetches team season stats from SportsGameOdds API and stores them
 * in team_season_stats.raw_json.sgo_stats.
 * 
 * This data is Labs-only and used for future V5 model development.
 * 
 * Usage:
 *   npx tsx apps/jobs/src/sgo/sync_team_sgo_stats.ts --season 2024
 *   npx tsx apps/jobs/src/sgo/sync_team_sgo_stats.ts --season 2024 --conference SEC
 */

import { PrismaClient } from '@prisma/client';
import { SGOClient } from './sgo-client';
import { TeamResolver } from '../../adapters/TeamResolver';

const prisma = new PrismaClient();

// Curated stat IDs we care about
const STAT_IDS = {
  // Red zone
  offense_redZoneTrips: 'offense_redZoneTrips',
  offense_redZoneTouchdowns: 'offense_redZoneTouchdowns',
  
  // Penalties
  penalty_count: 'penalty_count',
  penalty_yards: 'penalty_yards',
  penalty_firstDowns: 'penalty_firstDowns',
  
  // Offense pressure
  passing_sacksTaken: 'passing_sacksTaken',
  passing_interceptions: 'passing_interceptions',
  
  // Defense pressure/havoc
  defense_sacks: 'defense_sacks',
  defense_tacklesForLoss: 'defense_tacklesForLoss',
  defense_qbHits: 'defense_qbHits',
  defense_interceptions: 'defense_interceptions',
  defense_fumblesForced: 'defense_fumblesForced',
  
  // Special teams
  punting_netYards: 'punting_netYards',
  punting_puntsInside20: 'punting_puntsInside20',
  kickoffReturn_yardsPerReturn: 'kickoffReturn_yardsPerReturn',
  puntReturn_yardsPerReturn: 'puntReturn_yardsPerReturn',
  fieldGoals_percentMade: 'fieldGoals_percentMade',
  fieldGoals_50PlusYardsMade: 'fieldGoals_50PlusYardsMade',
  
  // Game script
  largestLead: 'largestLead',
  secondsInLead: 'secondsInLead',
  leadChanges: 'leadChanges',
  longestScoringRun: 'longestScoringRun',
  timesTied: 'timesTied',
} as const;

interface SGOStatValue {
  statId: string;
  value: number;
}

interface SGOTeamStatRow {
  teamId?: string;
  team_id?: string;
  teamName?: string;
  team_name?: string;
  season?: number;
  stats?: SGOStatValue[];
  games?: number;
  [key: string]: any;
}

interface SGOStats {
  redZone: {
    trips: number;
    tds: number;
    tdRate: number;
  };
  penalties: {
    count: number;
    yards: number;
    firstDowns: number;
    perGame: number | null;
    yardsPerGame: number | null;
    firstDownsPerGame: number | null;
  };
  pressureHavoc: {
    offenseSacksTaken: number;
    offenseInts: number;
    defenseSacks: number;
    tfl: number;
    qbHits: number;
    defenseInts: number;
    defenseFumblesForced: number;
    pressureRate: number | null;
    havocRate: number | null;
  };
  specialTeams: {
    netPuntYards: number;
    puntsInside20: number;
    koYardsPerReturn: number;
    prYardsPerReturn: number;
    fgPercent: number;
    fg50PlusMade: number;
    stComposite: number | null;
  };
  gameScript: {
    largestLead: number;
    secondsInLead: number;
    leadChanges: number;
    longestScoringRun: number;
    timesTied: number;
  };
}

/**
 * Parse command line arguments
 */
function parseArgs(): { season: number; conference?: string } {
  const args = process.argv.slice(2);
  let season: number | undefined;
  let conference: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && i + 1 < args.length) {
      season = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--conference' && i + 1 < args.length) {
      conference = args[i + 1];
      i++;
    }
  }

  if (!season || isNaN(season)) {
    console.error('Error: --season is required');
    console.error('Usage: npx tsx apps/jobs/src/sgo/sync_team_sgo_stats.ts --season 2024 [--conference SEC]');
    process.exit(1);
  }

  return { season, conference };
}

/**
 * Extract stat value from SGO row
 */
function getStatValue(row: SGOTeamStatRow, statId: string): number | null {
  // If stats is an array of { statId, value }
  if (row.stats && Array.isArray(row.stats)) {
    const stat = row.stats.find((s: SGOStatValue) => s.statId === statId);
    return stat ? stat.value : null;
  }
  
  // If stats are flat properties on the row
  if (row[statId] !== undefined) {
    return typeof row[statId] === 'number' ? row[statId] : null;
  }
  
  return null;
}

/**
 * Build structured SGO stats object from raw SGO row
 */
function buildSGOStats(row: SGOTeamStatRow): SGOStats | null {
  const games = row.games || null;
  
  // Red zone
  const redZoneTrips = getStatValue(row, STAT_IDS.offense_redZoneTrips) ?? 0;
  const redZoneTds = getStatValue(row, STAT_IDS.offense_redZoneTouchdowns) ?? 0;
  const tdRate = redZoneTrips > 0 ? redZoneTds / redZoneTrips : 0;
  
  // Penalties
  const penaltyCount = getStatValue(row, STAT_IDS.penalty_count) ?? 0;
  const penaltyYards = getStatValue(row, STAT_IDS.penalty_yards) ?? 0;
  const penaltyFirstDowns = getStatValue(row, STAT_IDS.penalty_firstDowns) ?? 0;
  const penaltyPerGame = games && games > 0 ? penaltyCount / games : null;
  const penaltyYardsPerGame = games && games > 0 ? penaltyYards / games : null;
  const penaltyFirstDownsPerGame = games && games > 0 ? penaltyFirstDowns / games : null;
  
  // Offense pressure
  const offenseSacksTaken = getStatValue(row, STAT_IDS.passing_sacksTaken) ?? 0;
  const offenseInts = getStatValue(row, STAT_IDS.passing_interceptions) ?? 0;
  
  // Defense pressure/havoc
  const defenseSacks = getStatValue(row, STAT_IDS.defense_sacks) ?? 0;
  const tfl = getStatValue(row, STAT_IDS.defense_tacklesForLoss) ?? 0;
  const qbHits = getStatValue(row, STAT_IDS.defense_qbHits) ?? 0;
  const defenseInts = getStatValue(row, STAT_IDS.defense_interceptions) ?? 0;
  const defenseFumblesForced = getStatValue(row, STAT_IDS.defense_fumblesForced) ?? 0;
  
  // Rough pressure/havoc rate approximations
  // pressureRate: (sacks + qbHits) / (sacks + qbHits + tfl) - very rough
  const totalPressure = defenseSacks + qbHits;
  const totalHavoc = totalPressure + tfl;
  const pressureRate = totalHavoc > 0 ? totalPressure / totalHavoc : null;
  
  // havocRate: (sacks + tfl + ints + fumbles) / total defensive plays - rough approximation
  // Since we don't have total plays, we'll use a simple ratio
  const totalHavocPlays = defenseSacks + tfl + defenseInts + defenseFumblesForced;
  const havocRate = totalHavocPlays > 0 ? totalHavocPlays / (totalHavocPlays + 100) : null; // Very rough
  
  // Special teams
  const netPuntYards = getStatValue(row, STAT_IDS.punting_netYards) ?? 0;
  const puntsInside20 = getStatValue(row, STAT_IDS.punting_puntsInside20) ?? 0;
  const koYardsPerReturn = getStatValue(row, STAT_IDS.kickoffReturn_yardsPerReturn) ?? 0;
  const prYardsPerReturn = getStatValue(row, STAT_IDS.puntReturn_yardsPerReturn) ?? 0;
  const fgPercent = getStatValue(row, STAT_IDS.fieldGoals_percentMade) ?? 0;
  const fg50PlusMade = getStatValue(row, STAT_IDS.fieldGoals_50PlusYardsMade) ?? 0;
  
  // Simple ST composite: normalize each component and sum
  // This is a placeholder - actual composite should be more sophisticated
  const stComposite = null; // TODO: Implement proper composite calculation
  
  // Game script
  const largestLead = getStatValue(row, STAT_IDS.largestLead) ?? 0;
  const secondsInLead = getStatValue(row, STAT_IDS.secondsInLead) ?? 0;
  const leadChanges = getStatValue(row, STAT_IDS.leadChanges) ?? 0;
  const longestScoringRun = getStatValue(row, STAT_IDS.longestScoringRun) ?? 0;
  const timesTied = getStatValue(row, STAT_IDS.timesTied) ?? 0;
  
  return {
    redZone: {
      trips: redZoneTrips,
      tds: redZoneTds,
      tdRate,
    },
    penalties: {
      count: penaltyCount,
      yards: penaltyYards,
      firstDowns: penaltyFirstDowns,
      perGame: penaltyPerGame,
      yardsPerGame: penaltyYardsPerGame,
      firstDownsPerGame: penaltyFirstDownsPerGame,
    },
    pressureHavoc: {
      offenseSacksTaken,
      offenseInts,
      defenseSacks,
      tfl,
      qbHits,
      defenseInts,
      defenseFumblesForced,
      pressureRate,
      havocRate,
    },
    specialTeams: {
      netPuntYards,
      puntsInside20,
      koYardsPerReturn,
      prYardsPerReturn,
      fgPercent,
      fg50PlusMade,
      stComposite,
    },
    gameScript: {
      largestLead,
      secondsInLead,
      leadChanges,
      longestScoringRun,
      timesTied,
    },
  };
}

/**
 * Process SGO team stats for a season
 */
async function processSGOStats(season: number, conference?: string): Promise<void> {
  console.log(`\n📥 Fetching SGO team stats for ${season}...`);
  
  const client = new SGOClient();
  const resolver = new TeamResolver();
  
  // Load FBS teams for the season
  await resolver.loadFBSTeamsForSeason(season);
  
  // Fetch SGO stats
  const sgoRows = await client.getSeasonTeamStats(season);
  console.log(`   Found ${sgoRows.length} team stat rows from SGO`);
  
  // Get target team IDs (filter by conference if specified)
  let targetTeamIds: string[] = [];
  if (conference) {
    const memberships = await prisma.teamMembership.findMany({
      where: {
        season,
        conference: {
          equals: conference,
          mode: 'insensitive',
        },
      },
      select: { teamId: true },
    });
    targetTeamIds = memberships.map(m => m.teamId);
    console.log(`   Filtering to ${targetTeamIds.length} teams in ${conference}`);
  } else {
    // Get all FBS teams for the season
    const memberships = await prisma.teamMembership.findMany({
      where: { season },
      select: { teamId: true },
    });
    targetTeamIds = memberships.map(m => m.teamId);
    console.log(`   Processing all ${targetTeamIds.length} FBS teams`);
  }
  
  let updated = 0;
  const unmapped: Array<{ name: string; id: string }> = [];
  
  for (const row of sgoRows) {
    // Extract team identifier from SGO row
    const sgoTeamId = row.teamId || row.team_id;
    const sgoTeamName = row.teamName || row.team_name;
    
    if (!sgoTeamId && !sgoTeamName) {
      console.warn(`   ⚠️  Skipping row with no team identifier:`, JSON.stringify(row).substring(0, 200));
      continue;
    }
    
    // Map SGO team to internal team ID
    const teamId = resolver.resolveTeam(
      sgoTeamName || sgoTeamId || '',
      'NCAAF',
      { provider: 'sgo' }
    );
    
    if (!teamId) {
      unmapped.push({
        name: sgoTeamName || 'Unknown',
        id: sgoTeamId || 'Unknown',
      });
      continue;
    }
    
    // Skip if not in target set
    if (targetTeamIds.length > 0 && !targetTeamIds.includes(teamId)) {
      continue;
    }
    
    // Build structured stats
    const sgoStats = buildSGOStats(row);
    if (!sgoStats) {
      console.warn(`   ⚠️  Skipping ${teamId}: could not build stats structure`);
      continue;
    }
    
    // Load existing TeamSeasonStat
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
      sgo_stats: sgoStats,
    };
    
    // Upsert
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
    
    updated++;
  }
  
  console.log(`\n✅ SGO team stats sync complete:`);
  console.log(`   Season: ${season}`);
  console.log(`   Teams updated: ${updated}`);
  if (unmapped.length > 0) {
    console.log(`   Unmapped teams: ${unmapped.length}`);
    unmapped.forEach(u => {
      console.log(`     - ${u.name} (SGO ID: ${u.id})`);
    });
  }
}

/**
 * Main entry point
 */
async function main() {
  try {
    const { season, conference } = parseArgs();
    
    await processSGOStats(season, conference);
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

