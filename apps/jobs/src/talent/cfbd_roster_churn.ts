/**
 * CFBD Roster Churn Job
 * 
 * Fetches returning production and transfer portal data from CollegeFootballData API
 * and stores it in TeamSeasonStat.rawJson.roster_churn.
 * 
 * This data is used for future V5 model work (off-season adjustments, mid-season recalibration).
 * 
 * Endpoints:
 *   - Returning Production: /player/returning?year={season}&team=...
 *   - Transfer Portal: /recruiting/transfers?year={season}&team=...
 * 
 * Usage:
 *   npx tsx apps/jobs/src/talent/cfbd_roster_churn.ts --season 2025
 *   npx tsx apps/jobs/src/talent/cfbd_roster_churn.ts --season 2025 --conference SEC
 */

import { PrismaClient } from '@prisma/client';
import { CFBDClient } from '../cfbd/cfbd-client';
import { CFBDTeamMapper } from '../cfbd/team-mapper';
import { TeamResolver } from '../../adapters/TeamResolver';

const prisma = new PrismaClient();

interface CFBDReturningProduction {
  team?: string;
  season?: number;
  totalPPA?: number;
  totalReturningPPA?: number;
  percentPPA?: number;
  totalPassingPPA?: number;
  totalReturningPassingPPA?: number;
  percentPassingPPA?: number;
  totalRushingPPA?: number;
  totalReturningRushingPPA?: number;
  percentRushingPPA?: number;
  totalReceivingPPA?: number;
  totalReturningReceivingPPA?: number;
  percentReceivingPPA?: number;
  totalDefensePPA?: number;
  totalReturningDefensePPA?: number;
  percentDefensePPA?: number;
  [key: string]: any; // CFBD may have additional fields
}

interface CFBDTransferPortal {
  season?: number;
  firstName?: string;
  lastName?: string;
  position?: string;
  origin?: string;
  destination?: string;
  transferDate?: string;
  rating?: number;
  stars?: number;
  eligibility?: string;
  [key: string]: any; // CFBD may have additional fields
}

interface RosterChurn {
  returningProduction?: {
    overall?: number;
    offense?: number;
    defense?: number;
    passing?: number;
    rushing?: number;
    receiving?: number;
  };
  transferPortal?: {
    inCount: number;
    outCount: number;
    netCount: number;
  };
}

/**
 * Parse command line arguments
 */
function parseArgs(): { season: number; conference?: string } {
  const args = process.argv.slice(2);
  let season: number | null = null;
  let conference: string | undefined = undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--season' && i + 1 < args.length) {
      season = parseInt(args[i + 1]);
      i++;
    } else if (arg === '--conference' && i + 1 < args.length) {
      conference = args[i + 1];
      i++;
    }
  }

  if (!season || isNaN(season)) {
    console.error('Usage: npx tsx apps/jobs/src/talent/cfbd_roster_churn.ts --season <YEAR> [--conference <CONF>]');
    console.error('Example: npx tsx apps/jobs/src/talent/cfbd_roster_churn.ts --season 2025');
    console.error('Example: npx tsx apps/jobs/src/talent/cfbd_roster_churn.ts --season 2025 --conference SEC');
    process.exit(1);
  }

  return { season, conference };
}

/**
 * Fetch returning production from CFBD API
 */
async function fetchReturningProduction(
  client: CFBDClient,
  season: number,
  team?: string
): Promise<CFBDReturningProduction[]> {
  try {
    const data = await client.getReturningProduction(season, team);
    return data as CFBDReturningProduction[];
  } catch (error: any) {
    console.warn(`   [CFBD] Error fetching returning production for ${team || 'all teams'}: ${error.message}`);
    return [];
  }
}

/**
 * Fetch transfer portal data from CFBD API
 */
async function fetchTransferPortal(
  client: CFBDClient,
  season: number,
  team?: string
): Promise<CFBDTransferPortal[]> {
  try {
    const data = await client.getTransferPortal(season, team);
    return data as CFBDTransferPortal[];
  } catch (error: any) {
    console.warn(`   [CFBD] Error fetching transfer portal for ${team || 'all teams'}: ${error.message}`);
    return [];
  }
}

/**
 * Map CFBD returning production to our format
 */
function mapReturningProduction(cfbd: CFBDReturningProduction): RosterChurn['returningProduction'] | null {
  if (!cfbd.percentPPA && !cfbd.percentPassingPPA && !cfbd.percentRushingPPA && !cfbd.percentReceivingPPA && !cfbd.percentDefensePPA) {
    return null; // No data
  }

  return {
    overall: cfbd.percentPPA ?? undefined,
    offense: cfbd.percentPPA ?? undefined, // CFBD may not have separate offense/defense overall
    defense: cfbd.percentDefensePPA ?? undefined,
    passing: cfbd.percentPassingPPA ?? undefined,
    rushing: cfbd.percentRushingPPA ?? undefined,
    receiving: cfbd.percentReceivingPPA ?? undefined,
  };
}

/**
 * Process roster churn for a season
 */
async function processRosterChurn(season: number, conference?: string): Promise<void> {
  console.log(`\n🏈 Processing roster churn for season ${season}...`);
  if (conference) {
    console.log(`   Conference filter: ${conference}`);
  } else {
    console.log('   Conference filter: none (all FBS teams)');
  }

  const client = new CFBDClient();
  const mapper = new CFBDTeamMapper();
  const teamResolver = new TeamResolver();

  // Get FBS teams for this season
  const fbsTeamIds = await teamResolver.loadFBSTeamsForSeason(season);
  console.log(`   Loaded ${fbsTeamIds.size} FBS teams for season ${season}`);

  // Filter by conference if specified
  let targetTeamIds = new Set(fbsTeamIds);
  if (conference) {
    const teams = await prisma.team.findMany({
      where: {
        id: { in: Array.from(fbsTeamIds) },
        conference: conference,
      },
      select: { id: true },
    });
    targetTeamIds = new Set(teams.map(t => t.id.toLowerCase()));
    console.log(`   Filtered to ${targetTeamIds.size} teams in ${conference}`);
  }

  // Fetch returning production for all teams (CFBD doesn't support per-team filtering efficiently)
  console.log('\n   Fetching returning production from CFBD...');
  const returningProductionData = await fetchReturningProduction(client, season);
  console.log(`   Fetched ${returningProductionData.length} returning production records`);

  // Fetch transfer portal data for all teams
  console.log('\n   Fetching transfer portal data from CFBD...');
  const transferPortalData = await fetchTransferPortal(client, season);
  console.log(`   Fetched ${transferPortalData.length} transfer portal records`);

  // Map CFBD team names to internal IDs for returning production
  const returningProductionByTeam = new Map<string, RosterChurn['returningProduction']>();
  for (const rp of returningProductionData) {
    if (!rp.team) continue;
    
    const teamId = await mapper.mapToInternal(rp.team, season);
    if (!teamId || !targetTeamIds.has(teamId.toLowerCase())) {
      continue;
    }

    const mapped = mapReturningProduction(rp);
    if (mapped) {
      returningProductionByTeam.set(teamId.toLowerCase(), mapped);
    }
  }

  // Process transfer portal data: count IN and OUT per team
  const transferPortalByTeam = new Map<string, { inCount: number; outCount: number }>();
  
  for (const transfer of transferPortalData) {
    // Count transfers OUT (origin team)
    if (transfer.origin) {
      const originTeamId = await mapper.mapToInternal(transfer.origin, season);
      if (originTeamId && targetTeamIds.has(originTeamId.toLowerCase())) {
        const key = originTeamId.toLowerCase();
        if (!transferPortalByTeam.has(key)) {
          transferPortalByTeam.set(key, { inCount: 0, outCount: 0 });
        }
        transferPortalByTeam.get(key)!.outCount++;
      }
    }

    // Count transfers IN (destination team)
    if (transfer.destination) {
      const destTeamId = await mapper.mapToInternal(transfer.destination, season);
      if (destTeamId && targetTeamIds.has(destTeamId.toLowerCase())) {
        const key = destTeamId.toLowerCase();
        if (!transferPortalByTeam.has(key)) {
          transferPortalByTeam.set(key, { inCount: 0, outCount: 0 });
        }
        transferPortalByTeam.get(key)!.inCount++;
      }
    }
  }

  // Update TeamSeasonStat for each team
  let updated = 0;
  let withReturningProduction = 0;
  let withTransferPortal = 0;

  for (const teamId of targetTeamIds) {
    const returningProd = returningProductionByTeam.get(teamId);
    const transferPortal = transferPortalByTeam.get(teamId);

    // Build roster_churn object
    const rosterChurn: RosterChurn = {};
    
    if (returningProd) {
      rosterChurn.returningProduction = returningProd;
      withReturningProduction++;
    }

    if (transferPortal && (transferPortal.inCount > 0 || transferPortal.outCount > 0)) {
      rosterChurn.transferPortal = {
        inCount: transferPortal.inCount,
        outCount: transferPortal.outCount,
        netCount: transferPortal.inCount - transferPortal.outCount,
      };
      withTransferPortal++;
    } else {
      // Set to 0 if no portal data (explicit counts)
      rosterChurn.transferPortal = {
        inCount: 0,
        outCount: 0,
        netCount: 0,
      };
    }

    // Skip if no data at all
    if (!returningProd && (!transferPortal || (transferPortal.inCount === 0 && transferPortal.outCount === 0))) {
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

    // Merge with existing rawJson to preserve other fields (like drive_stats)
    const existingRawJson = (existing?.rawJson as any) || {};
    const updatedRawJson = {
      ...existingRawJson,
      roster_churn: rosterChurn,
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

  console.log(`\n✅ Roster churn sync complete:`);
  console.log(`   Updated ${updated} teams`);
  console.log(`   With returning production: ${withReturningProduction}`);
  console.log(`   With transfer portal data: ${withTransferPortal}`);
}

/**
 * Main entry point
 */
async function main() {
  try {
    const args = parseArgs();
    await processRosterChurn(args.season, args.conference);
  } catch (error: any) {
    console.error('\n❌ Error syncing roster churn:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

