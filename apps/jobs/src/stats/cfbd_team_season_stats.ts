#!/usr/bin/env node

/**
 * CFBD Team Season Stats Ingestion
 * Fetches season-level team statistics from CFBD API and aggregates them by team
 */

import { PrismaClient } from '@prisma/client';
import { TeamResolver } from '../../adapters/TeamResolver';

const prisma = new PrismaClient();
const teamResolver = new TeamResolver();

// CFBD /stats/season returns multiple records per team with different stat categories
interface CFBDSeasonStatRecord {
  team: string;
  conference: string;
  season: number;
  statName: string;
  statValue: number;
  // Additional fields that might be present
  category?: string;
  subcategory?: string;
}

// Aggregated team season stats
interface AggregatedTeamStats {
  team: string;
  season: number;
  conference: string;
  
  // Raw stats we collect from CFBD
  totalYardsOff?: number;
  passAttemptsOff?: number;
  passCompletionsOff?: number;
  passingYardsOff?: number;
  rushAttemptsOff?: number;
  rushingYardsOff?: number;
  gamesOff?: number;
  
  totalYardsDef?: number;
  passAttemptsDef?: number;
  passCompletionsDef?: number;
  passingYardsDef?: number;
  rushAttemptsDef?: number;
  rushingYardsDef?: number;
  gamesDef?: number;
  
  // Derived stats (calculated from raw stats)
  yppOff?: number;
  successOff?: number;
  epaOff?: number;
  passYpaOff?: number;
  rushYpcOff?: number;
  paceOff?: number;
  
  yppDef?: number;
  successDef?: number;
  epaDef?: number;
  passYpaDef?: number;
  rushYpcDef?: number;
  paceDef?: number;
  
  // Raw data for debugging
  rawStats: CFBDSeasonStatRecord[];
}

interface TeamSeasonStatData {
  season: number;
  teamId: string;
  yppOff?: number;
  successOff?: number;
  passYpaOff?: number;
  rushYpcOff?: number;
  paceOff?: number;
  yppDef?: number;
  successDef?: number;
  passYpaDef?: number;
  rushYpcDef?: number;
  paceDef?: number;
  epaOff?: number;
  epaDef?: number;
  rawJson?: any;
}

// Helper function to safely convert values to numbers
function safeNumber(value: any): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return isNaN(value) || !isFinite(value) ? null : value;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) || !isFinite(parsed) ? null : parsed;
  }
  return null;
}

// Helper function to normalize stat names (handle different naming conventions)
function normalizeStatName(statName: string): string {
  return statName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

// Map CFBD stat names to our field names
function mapStatNameToField(statName: string, category?: string): string | null {
  const normalized = normalizeStatName(statName);
  
  // Debug logging for first few teams
  if (process.env.DEBUG_CFBD === '1') {
    console.log(`[DEBUG] Mapping stat: "${statName}" -> "${normalized}" (category: ${category})`);
  }
  
  // We need to map basic stats to our derived fields
  // CFBD provides raw counts, we need to calculate rates/efficiency
  
  // Offensive stats
  if (normalized === 'totalyards') {
    return 'totalYardsOff';
  }
  if (normalized === 'passattempts') {
    return 'passAttemptsOff';
  }
  if (normalized === 'passcompletions') {
    return 'passCompletionsOff';
  }
  if (normalized === 'netpassingyards') {
    return 'passingYardsOff';
  }
  if (normalized === 'rushingattempts') {
    return 'rushAttemptsOff';
  }
  if (normalized === 'rushingyards') {
    return 'rushingYardsOff';
  }
  if (normalized === 'games') {
    return 'gamesOff';
  }
  
  // Defensive stats (opponent stats)
  if (normalized === 'totalyardsopponent') {
    return 'totalYardsDef';
  }
  if (normalized === 'passattemptsopponent') {
    return 'passAttemptsDef';
  }
  if (normalized === 'passcompletionsopponent') {
    return 'passCompletionsDef';
  }
  if (normalized === 'netpassingyardsopponent') {
    return 'passingYardsDef';
  }
  if (normalized === 'rushingattemptsopponent') {
    return 'rushAttemptsDef';
  }
  if (normalized === 'rushingyardsopponent') {
    return 'rushingYardsDef';
  }
  if (normalized === 'games') {
    return 'gamesDef';
  }
  
  return null;
}

async function fetchTeamSeasonStats(season: number): Promise<CFBDSeasonStatRecord[]> {
  const baseUrl = process.env.CFBD_BASE_URL || 'https://api.collegefootballdata.com';
  const apiKey = process.env.CFBD_API_KEY;
  
  if (!apiKey) {
    throw new Error('CFBD_API_KEY environment variable is required');
  }

  const url = new URL(`${baseUrl}/stats/season`);
  url.searchParams.set('year', season.toString());
  url.searchParams.set('excludeGarbageTime', 'true');
  
  console.log(`[CFBD] Full URL: ${url.toString()}`);
  console.log(`[CFBD] Fetching team season stats for ${season}...`);

  const response = await fetch(url.toString(), {
    method: 'GET',
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
  console.log(`[CFBD] Raw response length: ${JSON.stringify(data).length}`);
  console.log(`[CFBD] Fetched ${data.length} team season stat records for ${season}`);
  
  if (data.length > 0) {
    console.log(`[CFBD] Sample record:`, JSON.stringify(data[0], null, 2));
  }

  return data;
}

function aggregateTeamStats(records: CFBDSeasonStatRecord[]): Map<string, AggregatedTeamStats> {
  const teamMap = new Map<string, AggregatedTeamStats>();
  let debugCount = 0;
  
  for (const record of records) {
    const teamKey = record.team;
    
    if (!teamMap.has(teamKey)) {
      teamMap.set(teamKey, {
        team: record.team,
        season: record.season,
        conference: record.conference,
        rawStats: []
      });
    }
    
    const teamStats = teamMap.get(teamKey)!;
    teamStats.rawStats.push(record);
    
    // Debug logging for first few teams
    if (process.env.DEBUG_CFBD === '1' && debugCount < 20) {
      console.log(`[DEBUG] Team: ${teamKey}, Stat: "${record.statName}" = ${record.statValue}`);
      debugCount++;
    }
    
    // Map the stat to our field
    const fieldName = mapStatNameToField(record.statName, record.category);
    if (fieldName) {
      const value = safeNumber(record.statValue);
      if (value !== null) {
        (teamStats as any)[fieldName] = value;
        if (process.env.DEBUG_CFBD === '1' && debugCount <= 20) {
          console.log(`[DEBUG] Mapped ${record.statName} -> ${fieldName} = ${value}`);
        }
      }
    }
  }
  
  return teamMap;
}

// Calculate derived stats from raw stats
function calculateDerivedStats(teamStats: AggregatedTeamStats): void {
  // Calculate offensive stats
  if (teamStats.totalYardsOff && teamStats.passAttemptsOff && teamStats.rushAttemptsOff) {
    const totalPlays = teamStats.passAttemptsOff + teamStats.rushAttemptsOff;
    if (totalPlays > 0) {
      teamStats.yppOff = teamStats.totalYardsOff / totalPlays;
    }
  }
  
  if (teamStats.passingYardsOff && teamStats.passAttemptsOff && teamStats.passAttemptsOff > 0) {
    teamStats.passYpaOff = teamStats.passingYardsOff / teamStats.passAttemptsOff;
  }
  
  if (teamStats.rushingYardsOff && teamStats.rushAttemptsOff && teamStats.rushAttemptsOff > 0) {
    teamStats.rushYpcOff = teamStats.rushingYardsOff / teamStats.rushAttemptsOff;
  }
  
  if (teamStats.passAttemptsOff && teamStats.rushAttemptsOff && teamStats.gamesOff && teamStats.gamesOff > 0) {
    const totalPlays = teamStats.passAttemptsOff + teamStats.rushAttemptsOff;
    teamStats.paceOff = totalPlays / teamStats.gamesOff;
  }
  
  // Calculate defensive stats
  if (teamStats.totalYardsDef && teamStats.passAttemptsDef && teamStats.rushAttemptsDef) {
    const totalPlays = teamStats.passAttemptsDef + teamStats.rushAttemptsDef;
    if (totalPlays > 0) {
      teamStats.yppDef = teamStats.totalYardsDef / totalPlays;
    }
  }
  
  if (teamStats.passingYardsDef && teamStats.passAttemptsDef && teamStats.passAttemptsDef > 0) {
    teamStats.passYpaDef = teamStats.passingYardsDef / teamStats.passAttemptsDef;
  }
  
  if (teamStats.rushingYardsDef && teamStats.rushAttemptsDef && teamStats.rushAttemptsDef > 0) {
    teamStats.rushYpcDef = teamStats.rushingYardsDef / teamStats.rushAttemptsDef;
  }
  
  if (teamStats.passAttemptsDef && teamStats.rushAttemptsDef && teamStats.gamesDef && teamStats.gamesDef > 0) {
    const totalPlays = teamStats.passAttemptsDef + teamStats.rushAttemptsDef;
    teamStats.paceDef = totalPlays / teamStats.gamesDef;
  }
  
  // For now, set success rate and EPA to null since CFBD doesn't provide these
  // We'll need to calculate them differently or use a different data source
  teamStats.successOff = null;
  teamStats.epaOff = null;
  teamStats.successDef = null;
  teamStats.epaDef = null;
}

async function mapAggregatedStatsToTeamSeasonStat(aggregatedStats: AggregatedTeamStats): Promise<TeamSeasonStatData | null> {
  // Resolve team name to team ID
  const teamId = teamResolver.resolveTeam(aggregatedStats.team, 'college-football', { provider: 'cfbd' });
  
  if (!teamId) {
    console.warn(`[CFBD] Could not resolve team: "${aggregatedStats.team}"`);
    return null;
  }

  // Calculate pace from seconds per play if available
  const paceOff = aggregatedStats.paceOff && aggregatedStats.paceOff > 0 
    ? 60 / aggregatedStats.paceOff 
    : null;

  const paceDef = aggregatedStats.paceDef && aggregatedStats.paceDef > 0 
    ? 60 / aggregatedStats.paceDef 
    : null;

  return {
    season: aggregatedStats.season,
    teamId,
    yppOff: aggregatedStats.yppOff,
    successOff: aggregatedStats.successOff,
    passYpaOff: aggregatedStats.passYpaOff,
    rushYpcOff: aggregatedStats.rushYpcOff,
    paceOff: safeNumber(paceOff),
    yppDef: aggregatedStats.yppDef,
    successDef: aggregatedStats.successDef,
    passYpaDef: aggregatedStats.passYpaDef,
    rushYpcDef: aggregatedStats.rushYpcDef,
    paceDef: safeNumber(paceDef),
    epaOff: aggregatedStats.epaOff,
    epaDef: aggregatedStats.epaDef,
    rawJson: aggregatedStats.rawStats
  };
}

async function upsertTeamSeasonStats(statsData: TeamSeasonStatData[]): Promise<number> {
  let upserted = 0;
  
  for (const stat of statsData) {
    try {
      await prisma.teamSeasonStat.upsert({
        where: {
          season_teamId: {
            season: stat.season,
            teamId: stat.teamId,
          }
        },
        update: {
          yppOff: stat.yppOff,
          successOff: stat.successOff,
          passYpaOff: stat.passYpaOff,
          rushYpcOff: stat.rushYpcOff,
          paceOff: stat.paceOff,
          yppDef: stat.yppDef,
          successDef: stat.successDef,
          passYpaDef: stat.passYpaDef,
          rushYpcDef: stat.rushYpcDef,
          paceDef: stat.paceDef,
          epaOff: stat.epaOff,
          epaDef: stat.epaDef,
          rawJson: stat.rawJson,
        },
        create: {
          season: stat.season,
          teamId: stat.teamId,
          yppOff: stat.yppOff,
          successOff: stat.successOff,
          passYpaOff: stat.passYpaOff,
          rushYpcOff: stat.rushYpcOff,
          paceOff: stat.paceOff,
          yppDef: stat.yppDef,
          successDef: stat.successDef,
          passYpaDef: stat.passYpaDef,
          rushYpcDef: stat.rushYpcDef,
          paceDef: stat.paceDef,
          epaOff: stat.epaOff,
          epaDef: stat.epaDef,
          rawJson: stat.rawJson,
        }
      });
      upserted++;
    } catch (error) {
      console.error(`[DB] Failed to upsert stats for ${stat.teamId}:`, error);
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

    console.log(`🚀 Starting CFBD Team Season Stats ingestion for ${season}...`);

    // Enable debug mode for first few teams
    if (process.env.DEBUG_CFBD === '1') {
      console.log(`[DEBUG] Debug mode enabled - will show stat mapping details`);
    }

    // Fetch raw data from CFBD
    const rawRecords = await fetchTeamSeasonStats(season);
    
    // Aggregate by team
    const aggregatedStats = aggregateTeamStats(rawRecords);
    console.log(`[AGGREGATION] Aggregated ${rawRecords.length} records into ${aggregatedStats.size} teams`);
    
    // Calculate derived stats for each team
    for (const [teamName, teamStats] of aggregatedStats) {
      calculateDerivedStats(teamStats);
    }
    
    // Convert to our format and resolve teams
    const teamStatsData: TeamSeasonStatData[] = [];
    let teamsResolved = 0;
    let teamsSkipped = 0;
    
    for (const [teamName, stats] of aggregatedStats) {
      const mappedStats = await mapAggregatedStatsToTeamSeasonStat(stats);
      if (mappedStats) {
        teamStatsData.push(mappedStats);
        teamsResolved++;
      } else {
        teamsSkipped++;
      }
    }
    
    console.log(`[TEAM_RESOLVER] Resolved: ${teamsResolved}/${aggregatedStats.size} teams (${teamsSkipped} unknown)`);
    
    // Upsert to database
    const upserted = await upsertTeamSeasonStats(teamStatsData);
    
    // Calculate fill ratios
    const fillRatios = {
      yppOff: teamStatsData.filter(s => s.yppOff !== null).length / teamStatsData.length * 100,
      successOff: teamStatsData.filter(s => s.successOff !== null).length / teamStatsData.length * 100,
      epaOff: teamStatsData.filter(s => s.epaOff !== null).length / teamStatsData.length * 100,
      paceOff: teamStatsData.filter(s => s.paceOff !== null).length / teamStatsData.length * 100,
    };
    
    console.log(`✅ Successfully processed season stats for ${season}`);
    console.log(`📊 Summary:`);
    console.log(`   Records pulled: ${rawRecords.length}`);
    console.log(`   Teams aggregated: ${aggregatedStats.size}`);
    console.log(`   Teams resolved: ${teamsResolved}`);
    console.log(`   Teams skipped: ${teamsSkipped}`);
    console.log(`   Records upserted: ${upserted}`);
    console.log(`   Fields fill: ypp_off=${fillRatios.yppOff.toFixed(1)}%, success_off=${fillRatios.successOff.toFixed(1)}%, epa_off=${fillRatios.epaOff.toFixed(1)}%, pace_off=${fillRatios.paceOff.toFixed(1)}%`);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch(console.error);
}