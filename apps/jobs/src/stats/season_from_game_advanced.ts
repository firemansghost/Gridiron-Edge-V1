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
  let upserted = 0;
  
  for (const stat of statsData) {
    try {
      await prisma.teamSeasonStat.upsert({
        where: {
          season_teamId: {
            season: stat.season,
            teamId: stat.team.toLowerCase().replace(/\s+/g, '-'),
          }
        },
        update: {
          successOff: stat.weightedSuccessOff > 0 ? stat.weightedSuccessOff : null,
          epaOff: stat.weightedEpaOff !== 0 ? stat.weightedEpaOff : null,
          successDef: stat.weightedSuccessDef > 0 ? stat.weightedSuccessDef : null,
          epaDef: stat.weightedEpaDef !== 0 ? stat.weightedEpaDef : null,
        },
        create: {
          season: stat.season,
          teamId: stat.team.toLowerCase().replace(/\s+/g, '-'),
          successOff: stat.weightedSuccessOff > 0 ? stat.weightedSuccessOff : null,
          epaOff: stat.weightedEpaOff !== 0 ? stat.weightedEpaOff : null,
          successDef: stat.weightedSuccessDef > 0 ? stat.weightedSuccessDef : null,
          epaDef: stat.weightedEpaDef !== 0 ? stat.weightedEpaDef : null,
        }
      });
      upserted++;
    } catch (error) {
      console.error(`[DB] Failed to upsert advanced stats for ${stat.team}:`, error);
    }
  }
  
  return upserted;
}

async function main() {
  try {
    const args = process.argv.slice(2);
    let season = 2025;
    
    // Parse command line arguments
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--season' && i + 1 < args.length) {
        season = parseInt(args[i + 1]);
        i++;
      }
    }

    console.log(`🚀 Starting CFBD Game Advanced Stats aggregation for ${season}...`);

    // Fetch raw data from CFBD
    const rawRecords = await fetchGameAdvancedStats(season);
    
    // Aggregate by team
    const aggregatedStats = aggregateTeamAdvancedStats(rawRecords);
    console.log(`[AGGREGATION] Aggregated ${rawRecords.length} records into ${aggregatedStats.size} teams`);
    
    // Convert to array for upsert
    const statsArray = Array.from(aggregatedStats.values());
    
    // Upsert to database
    const upserted = await upsertAdvancedStats(statsArray);
    
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
    console.log(`   Records upserted: ${upserted}`);
    console.log(`   Fields fill: success_off=${fillRatios.successOff.toFixed(1)}%, epa_off=${fillRatios.epaOff.toFixed(1)}%, success_def=${fillRatios.successDef.toFixed(1)}%, epa_def=${fillRatios.epaDef.toFixed(1)}%`);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
