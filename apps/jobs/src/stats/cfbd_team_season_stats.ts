#!/usr/bin/env node

/**
 * CFBD Team Season Stats Ingestion
 * Fetches season-level team statistics from CFBD API
 */

import { PrismaClient } from '@prisma/client';
import { TeamResolver } from '../../adapters/TeamResolver';

const prisma = new PrismaClient();
const teamResolver = new TeamResolver();

interface CFBDTeamSeasonStats {
  team: string;
  season: number;
  games: number;
  plays: number;
  yards: number;
  successRate: number;
  epa: number;
  explosiveness: number;
  passing: {
    plays: number;
    yards: number;
    successRate: number;
    epa: number;
    explosiveness: number;
  };
  rushing: {
    plays: number;
    yards: number;
    successRate: number;
    epa: number;
    explosiveness: number;
  };
  defense: {
    plays: number;
    yards: number;
    successRate: number;
    epa: number;
    explosiveness: number;
    passing: {
      plays: number;
      yards: number;
      successRate: number;
      epa: number;
      explosiveness: number;
    };
    rushing: {
      plays: number;
      yards: number;
      successRate: number;
      epa: number;
      explosiveness: number;
    };
  };
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
  rawJson: any;
}

/**
 * Fetch team season stats from CFBD API
 */
async function fetchTeamSeasonStats(season: number): Promise<CFBDTeamSeasonStats[]> {
  const apiKey = process.env.CFBD_API_KEY;
  if (!apiKey) {
    throw new Error('CFBD_API_KEY environment variable is required');
  }

  const baseUrl = process.env.CFBD_BASE_URL || 'https://api.collegefootballdata.com';
  const url = new URL(`${baseUrl}/stats/season/team`);
  url.searchParams.set('year', season.toString());
  url.searchParams.set('excludeGarbageTime', 'true');
  
  // Debug: Log the exact URL being called
  console.log(`   [CFBD] Full URL: ${url.toString()}`);

  console.log(`   [CFBD] Fetching team season stats for ${season}...`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'User-Agent': 'gridiron-edge-jobs/1.0'
      },
      signal: controller.signal,
      redirect: 'manual'
    });

    clearTimeout(timeout);

    if (process.env.DEBUG_CFBD === '1') {
      console.log(`   [CFBD] Response status: ${response.status}`);
      console.log(`   [CFBD] Response URL: ${response.url}`);
    }

    // Handle redirects
    if (response.status === 301 || response.status === 302) {
      const location = response.headers.get('location');
      console.error(`   [CFBD] Redirect detected: ${response.status} to ${location}`);
      console.error(`   [CFBD] Original URL: ${url.toString()}`);
      throw new Error(`CFBD API redirected: ${response.status} to ${location}`);
    }

    // Check content-type first
    const contentType = response.headers.get('content-type');
    const body = await response.text();
    
    if (!response.ok) {
      console.error(`   [CFBD] HTTP ${response.status} ${response.statusText}`);
      console.error(`   [CFBD] Content-Type: ${contentType}`);
      console.error(`   [CFBD] Response body (first 200 bytes): ${body.substring(0, 200)}...`);
      
      if (response.status === 401) {
        throw new Error(`CFBD API unauthorized (401) - check API key`);
      } else if (response.status === 403) {
        throw new Error(`CFBD API forbidden (403) - check API permissions`);
      } else if (response.status === 404) {
        throw new Error(`CFBD API not found (404) - check endpoint URL`);
      } else {
        throw new Error(`CFBD API error: ${response.status} ${response.statusText}`);
      }
    }

    if (!contentType || !contentType.includes('application/json')) {
      const preview = body.substring(0, 200);
      console.error(`   [CFBD] Invalid content-type: ${contentType}`);
      console.error(`   [CFBD] Response body (first 200 bytes): ${preview}...`);
      throw new Error(`CFBD non-JSON (status=${response.status}, type=${contentType}): ${preview}`);
    }

    console.log(`   [CFBD] Raw response length: ${body.length}`);
    
    // Check if response is HTML (error page)
    if (body.trim().startsWith('<')) {
      console.error(`   [CFBD] Received HTML response instead of JSON`);
      console.error(`   [CFBD] Response preview: ${body.substring(0, 200)}...`);
      throw new Error('CFBD API returned HTML instead of JSON - likely an error page');
    }

    let data: CFBDTeamSeasonStats[];
    try {
      data = JSON.parse(body) as CFBDTeamSeasonStats[];
    } catch (parseError) {
      console.error(`   [CFBD] JSON parse error: ${parseError}`);
      console.error(`   [CFBD] Response preview: ${body.substring(0, 200)}...`);
      throw new Error(`Failed to parse JSON response: ${parseError}`);
    }
    console.log(`   [CFBD] Fetched ${data.length} team season stats for ${season}`);
    
    return data;
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error('CFBD API request timed out after 30 seconds');
    }
    throw error;
  }
}

/**
 * Map CFBD team season stats to our database format
 */
function mapCFBDSeasonStatsToTeamSeasonStat(cfbdStats: CFBDTeamSeasonStats): TeamSeasonStatData | null {
  // Use TeamResolver to resolve team name to team ID
  const teamId = teamResolver.resolveTeam(cfbdStats.team, 'college-football', { provider: 'cfbd' });

  if (!teamId) {
    console.warn(`   [CFBD] Could not resolve team: "${cfbdStats.team}"`);
    return null;
  }

  // Calculate derived metrics
  const yppOff = cfbdStats.plays > 0 ? cfbdStats.yards / cfbdStats.plays : null;
  const successOff = cfbdStats.successRate || null;
  const epaOff = cfbdStats.epa || null;
  const paceOff = cfbdStats.games > 0 ? cfbdStats.plays / cfbdStats.games : null;

  // Passing metrics
  const passYpaOff = cfbdStats.passing?.plays > 0 ? cfbdStats.passing.yards / cfbdStats.passing.plays : null;

  // Rushing metrics
  const rushYpcOff = cfbdStats.rushing?.plays > 0 ? cfbdStats.rushing.yards / cfbdStats.rushing.plays : null;

  // Defensive metrics (if available)
  const yppDef = cfbdStats.defense?.plays > 0 ? cfbdStats.defense.yards / cfbdStats.defense.plays : null;
  const successDef = cfbdStats.defense?.successRate || null;
  const epaDef = cfbdStats.defense?.epa || null;
  const paceDef = cfbdStats.games > 0 && cfbdStats.defense?.plays ? cfbdStats.defense.plays / cfbdStats.games : null;
  const passYpaDef = cfbdStats.defense?.passing?.plays > 0 ? cfbdStats.defense.passing.yards / cfbdStats.defense.passing.plays : null;
  const rushYpcDef = cfbdStats.defense?.rushing?.plays > 0 ? cfbdStats.defense.rushing.yards / cfbdStats.defense.rushing.plays : null;

  return {
    season: cfbdStats.season,
    teamId,
    yppOff,
    successOff,
    passYpaOff,
    rushYpcOff,
    paceOff,
    yppDef,
    successDef,
    passYpaDef,
    rushYpcDef,
    paceDef,
    epaOff,
    epaDef,
    rawJson: cfbdStats
  };
}

/**
 * Upsert team season stats to database with FK safety checks
 */
async function upsertTeamSeasonStats(seasonStats: TeamSeasonStatData[]): Promise<{ upserted: number; skippedMissingTeam: number; errors: number }> {
  let upserted = 0;
  let skippedMissingTeam = 0;
  let errors = 0;

  // Check which teams exist in the database
  const teamIds = [...new Set(seasonStats.map(s => s.teamId))];
  const existingTeams = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    select: { id: true }
  });
  const existingTeamIds = new Set(existingTeams.map(t => t.id));

  for (const data of seasonStats) {
    try {
      // Check if team exists before upsert
      if (!existingTeamIds.has(data.teamId)) {
        console.warn(`   [DB] Skipping ${data.teamId} - team not found in database`);
        skippedMissingTeam++;
        continue;
      }

      await prisma.teamSeasonStat.upsert({
        where: {
          season_teamId: {
            season: data.season,
            teamId: data.teamId
          }
        },
        update: {
          yppOff: data.yppOff,
          successOff: data.successOff,
          passYpaOff: data.passYpaOff,
          rushYpcOff: data.rushYpcOff,
          paceOff: data.paceOff,
          yppDef: data.yppDef,
          successDef: data.successDef,
          passYpaDef: data.passYpaDef,
          rushYpcDef: data.rushYpcDef,
          paceDef: data.paceDef,
          epaOff: data.epaOff,
          epaDef: data.epaDef,
          rawJson: data.rawJson
        },
        create: {
          season: data.season,
          teamId: data.teamId,
          yppOff: data.yppOff,
          successOff: data.successOff,
          passYpaOff: data.passYpaOff,
          rushYpcOff: data.rushYpcOff,
          paceOff: data.paceOff,
          yppDef: data.yppDef,
          successDef: data.successDef,
          passYpaDef: data.passYpaDef,
          rushYpcDef: data.rushYpcDef,
          paceDef: data.paceDef,
          epaOff: data.epaOff,
          epaDef: data.epaDef,
          rawJson: data.rawJson
        }
      });
      upserted++;
    } catch (error) {
      console.error(`   [DB] Failed to upsert season stats for ${data.teamId}/${data.season}:`, error);
      errors++;
    }
  }

  return { upserted, skippedMissingTeam, errors };
}

/**
 * Main function
 */
async function main() {
  try {
    const args = process.argv.slice(2);
    const seasonArg = args.find(arg => arg.startsWith('--season='));
    const season = seasonArg ? parseInt(seasonArg.split('=')[1]) : new Date().getFullYear();

    console.log(`🚀 Starting CFBD Team Season Stats ingestion for ${season}...`);

    // Fetch team season stats from CFBD
    const cfbdStats = await fetchTeamSeasonStats(season);

    if (cfbdStats.length === 0) {
      console.log(`   ℹ️  No team season stats found for ${season}`);
      return;
    }

    // Map to our database format
    const seasonStats: TeamSeasonStatData[] = [];
    for (const cfbdStat of cfbdStats) {
      const mapped = mapCFBDSeasonStatsToTeamSeasonStat(cfbdStat);
      if (mapped) {
        seasonStats.push(mapped);
      }
    }

    console.log(`   Found ${seasonStats.length} team season stats records`);

    if (seasonStats.length > 0) {
      // Upsert to database
      const { upserted, skippedMissingTeam, errors } = await upsertTeamSeasonStats(seasonStats);
      
      console.log(`   ✅ Upserted ${upserted} records, skipped ${skippedMissingTeam} missing teams, ${errors} errors`);
      
      console.log('\n📊 Summary:');
      console.log(`   Records upserted: ${upserted}`);
      console.log(`   Skipped missing teams: ${skippedMissingTeam}`);
      console.log(`   Errors: ${errors}`);
      console.log(`   Total processed: ${seasonStats.length}`);
    } else {
      console.log(`   ℹ️  No team season stats data found for ${season}`);
    }

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}
