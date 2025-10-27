import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface CFBDGameAdvancedStats {
  gameId: number;
  team: string;
  season: number;
  week: number;
  offense: {
    successRate?: number;
    ppa?: number; // Points per attempt (EPA/play)
    plays?: number;
  };
  defense: {
    successRate?: number;
    ppa?: number;
    plays?: number;
  };
}

interface TeamAdvancedStats {
  team: string;
  season: number;
  totalPlaysOff: number;
  totalPlaysDef: number;
  weightedSuccessOff: number;
  weightedEpaOff: number;
  weightedSuccessDef: number;
  weightedEpaDef: number;
}

async function fetchGameAdvancedStats(season: number): Promise<CFBDGameAdvancedStats[]> {
  const baseUrl = process.env.CFBD_BASE_URL || 'https://api.collegefootballdata.com';
  const apiKey = process.env.CFBD_API_KEY;
  
  if (!apiKey) {
    throw new Error('CFBD_API_KEY environment variable is required');
  }

  const url = `${baseUrl}/stats/game/advanced?year=${season}&seasonType=regular`;
  console.log(`[CFBD] Full URL: ${url}`);

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
      'User-Agent': 'gridiron-edge-jobs/1.0'
    },
    redirect: 'manual'
  });

  if (!response.ok) {
    throw new Error(`CFBD API error: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const body = await response.text();
    console.log(`[CFBD] Invalid content-type: ${contentType}`);
    console.log(`[CFBD] Response body (first 200 bytes): ${body.substring(0, 200)}`);
    throw new Error(`CFBD non-JSON (status=${response.status}, type=${contentType}): ${body.substring(0, 200)}`);
  }

  const data = await response.json();
  console.log(`[CFBD] Fetched ${data.length} game advanced stat records for ${season}`);
  
  if (data.length > 0) {
    console.log(`[CFBD] Sample record:`, JSON.stringify(data[0], null, 2));
  }

  return data;
}

function aggregateTeamAdvancedStats(records: CFBDGameAdvancedStats[]): Map<string, TeamAdvancedStats> {
  const teamMap = new Map<string, TeamAdvancedStats>();

  for (const record of records) {
    const teamKey = record.team;
    
    if (!teamMap.has(teamKey)) {
      teamMap.set(teamKey, {
        team: record.team,
        season: record.season,
        totalPlaysOff: 0,
        totalPlaysDef: 0,
        weightedSuccessOff: 0,
        weightedEpaOff: 0,
        weightedSuccessDef: 0,
        weightedEpaDef: 0,
      });
    }

    const teamStats = teamMap.get(teamKey)!;
    
    // Aggregate offensive stats
    if (record.offense?.plays && record.offense.plays > 0) {
      teamStats.totalPlaysOff += record.offense.plays;
      
      if (record.offense.successRate !== undefined && record.offense.successRate !== null) {
        teamStats.weightedSuccessOff += record.offense.successRate * record.offense.plays;
      }
      
      if (record.offense.ppa !== undefined && record.offense.ppa !== null) {
        teamStats.weightedEpaOff += record.offense.ppa * record.offense.plays;
      }
    }

    // Aggregate defensive stats
    if (record.defense?.plays && record.defense.plays > 0) {
      teamStats.totalPlaysDef += record.defense.plays;
      
      if (record.defense.successRate !== undefined && record.defense.successRate !== null) {
        teamStats.weightedSuccessDef += record.defense.successRate * record.defense.plays;
      }
      
      if (record.defense.ppa !== undefined && record.defense.ppa !== null) {
        teamStats.weightedEpaDef += record.defense.ppa * record.defense.plays;
      }
    }
  }

  // Calculate final rates
  for (const [teamKey, teamStats] of teamMap) {
    if (teamStats.totalPlaysOff > 0) {
      teamStats.weightedSuccessOff = teamStats.weightedSuccessOff / teamStats.totalPlaysOff;
      teamStats.weightedEpaOff = teamStats.weightedEpaOff / teamStats.totalPlaysOff;
    }
    
    if (teamStats.totalPlaysDef > 0) {
      teamStats.weightedSuccessDef = teamStats.weightedSuccessDef / teamStats.totalPlaysDef;
      teamStats.weightedEpaDef = teamStats.weightedEpaDef / teamStats.totalPlaysDef;
    }
  }

  return teamMap;
}

async function upsertAdvancedStats(statsData: TeamAdvancedStats[]): Promise<number> {
  let updated = 0;
  
  for (const stat of statsData) {
    try {
      await prisma.teamSeasonStat.update({
        where: {
          season_teamId: {
            season: stat.season,
            teamId: stat.team.toLowerCase().replace(/\s+/g, '-'),
          }
        },
        data: {
          successOff: stat.weightedSuccessOff > 0 ? stat.weightedSuccessOff : null,
          epaOff: stat.weightedEpaOff !== 0 ? stat.weightedEpaOff : null,
          successDef: stat.weightedSuccessDef > 0 ? stat.weightedSuccessDef : null,
          epaDef: stat.weightedEpaDef !== 0 ? stat.weightedEpaDef : null,
        }
      });
      updated++;
    } catch (error) {
      // P2025: record not found -> skip quietly (do not create here)
      if (error.code !== 'P2025') {
        console.error(`[DB] Failed to update advanced stats for ${stat.team}:`, error);
      }
    }
  }
  
  return updated;
}

async function main() {
  try {
    // Parse command line arguments with yargs
    const yargs = require('yargs/yargs');
    const argv = yargs(process.argv.slice(2))
      .option('season', { type: 'number', demandOption: true })
      .parse();
    
    const season = Number(argv.season);
    
    if (isNaN(season) || season < 2000 || season > 2030) {
      throw new Error('Invalid season. Must be between 2000 and 2030');
    }

    console.log(`🚀 Starting CFBD Game Advanced Stats aggregation for season=${season}...`);

    // Get FBS team IDs from database
    const fbsTeams = await prisma.team.findMany({
      select: { id: true }
    });
    const fbsIds = new Set(fbsTeams.map(t => t.id));
    console.log(`📋 Loaded ${fbsIds.size} FBS teams from database`);

    // Fetch raw data from CFBD
    const rawRecords = await fetchGameAdvancedStats(season);
    
    // Aggregate by team
    const aggregatedStats = aggregateTeamAdvancedStats(rawRecords);
    console.log(`[AGGREGATION] Aggregated ${rawRecords.length} records into ${aggregatedStats.size} teams`);
    
    // Convert to array and filter to FBS teams only
    const statsArray = Array.from(aggregatedStats.values()).filter(stat => {
      const teamId = stat.team.toLowerCase().replace(/\s+/g, '-');
      return fbsIds.has(teamId);
    });
    
    console.log(`🔍 Filtered to ${statsArray.length} FBS teams (from ${aggregatedStats.size} total)`);
    
    // Log summary of what we'll update
    const teamsWithSuccessOff = statsArray.filter(s => s.weightedSuccessOff > 0).length;
    const teamsWithEpaOff = statsArray.filter(s => s.weightedEpaOff !== 0).length;
    const teamsWithSuccessDef = statsArray.filter(s => s.weightedSuccessDef > 0).length;
    const teamsWithEpaDef = statsArray.filter(s => s.weightedEpaDef !== 0).length;
    
    console.log(`📊 Update summary: ${teamsWithSuccessOff} teams with success_off, ${teamsWithEpaOff} teams with epa_off`);
    console.log(`📊 Update summary: ${teamsWithSuccessDef} teams with success_def, ${teamsWithEpaDef} teams with epa_def`);
    
    // Update existing records in database
    const updated = await upsertAdvancedStats(statsArray);
    
    // Calculate fill ratios
    const fillRatios = {
      successOff: statsArray.filter(s => s.weightedSuccessOff > 0).length / statsArray.length * 100,
      epaOff: statsArray.filter(s => s.weightedEpaOff !== 0).length / statsArray.length * 100,
      successDef: statsArray.filter(s => s.weightedSuccessDef > 0).length / statsArray.length * 100,
      epaDef: statsArray.filter(s => s.weightedEpaDef !== 0).length / statsArray.length * 100,
    };
    
    console.log(`✅ Successfully processed advanced stats for ${season}`);
    console.log(`📊 Summary:`);
    console.log(`   Records pulled: ${rawRecords.length}`);
    console.log(`   Teams aggregated: ${aggregatedStats.size}`);
    console.log(`   Records updated: ${updated}`);
    console.log(`   Fields fill: success_off=${fillRatios.successOff.toFixed(1)}%, epa_off=${fillRatios.epaOff.toFixed(1)}%, success_def=${fillRatios.successDef.toFixed(1)}%, epa_def=${fillRatios.epaDef.toFixed(1)}%`);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
