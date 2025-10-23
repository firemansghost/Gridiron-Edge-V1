/**
 * CFBD Team Stats Job
 * 
 * Fetches game-by-game team statistics from CollegeFootballData API.
 * Derives core features (YPP, success rate, pace, etc.) and stores in team_game_stats.
 * 
 * Usage:
 *   ts-node apps/jobs/src/stats/cfbd_team_stats.ts --season 2025 --weeks 1-9
 *   ts-node apps/jobs/src/stats/cfbd_team_stats.ts --season 2025 --weeks 9
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface CFBDTeamStats {
  gameId: number;
  team: string;
  conference: string;
  opponent: string;
  opponentConference: string;
  season: number;
  week: number;
  seasonType: string;
  startDate: string;
  homeAway: 'home' | 'away';
  points: number;
  yards: number;
  plays: number;
  yardsPerPlay: number;
  pointsPerPossession: number;
  turnovers: number;
  penalties: number;
  penaltyYards: number;
  timeOfPossession: number;
  rushing: {
    yards: number;
    attempts: number;
    yardsPerRush: number;
    touchdowns: number;
  };
  passing: {
    yards: number;
    completions: number;
    attempts: number;
    completionPercentage: number;
    yardsPerAttempt: number;
    yardsPerCompletion: number;
    touchdowns: number;
    interceptions: number;
    quarterbackRating: number;
  };
  defense: {
    yards: number;
    plays: number;
    yardsPerPlay: number;
    points: number;
    rushing: {
      yards: number;
      attempts: number;
      yardsPerRush: number;
      touchdowns: number;
    };
    passing: {
      yards: number;
      completions: number;
      attempts: number;
      completionPercentage: number;
      yardsPerAttempt: number;
      yardsPerCompletion: number;
      touchdowns: number;
      interceptions: number;
      quarterbackRating: number;
    };
  };
}

interface TeamGameStatData {
  gameId: string;
  teamId: string;
  opponentId: string;
  season: number;
  week: number;
  isHome: boolean;
  
  // Offensive stats
  playsOff?: number;
  yardsOff?: number;
  yppOff?: number;
  successOff?: number;
  epaOff?: number;
  pacePlaysGm?: number;
  passYardsOff?: number;
  rushYardsOff?: number;
  passAttOff?: number;
  rushAttOff?: number;
  passYpaOff?: number;
  rushYpcOff?: number;
  
  // Defensive stats
  playsDef?: number;
  yardsDef?: number;
  yppDef?: number;
  successDef?: number;
  epaDef?: number;
  passYardsDef?: number;
  rushYardsDef?: number;
  passAttDef?: number;
  rushAttDef?: number;
  passYpaDef?: number;
  rushYpcDef?: number;
  
  rawJson?: any;
}

/**
 * Parse command line arguments
 */
function parseArgs(): { season: number; weeks: number[] } {
  const args = process.argv.slice(2);
  let season = 2025;
  let weeks: number[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--season' && i + 1 < args.length) {
      season = parseInt(args[i + 1]);
      i++;
    } else if (arg === '--weeks' && i + 1 < args.length) {
      const weekStr = args[i + 1];
      if (weekStr.includes('-')) {
        const [start, end] = weekStr.split('-').map(Number);
        weeks = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      } else if (weekStr.includes('..')) {
        const [start, end] = weekStr.split('..').map(Number);
        weeks = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      } else {
        weeks = [parseInt(weekStr)];
      }
      i++;
    }
  }

  if (weeks.length === 0) {
    weeks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  }

  return { season, weeks };
}

/**
 * Normalize team name to team ID
 */
function normalizeTeamId(teamName: string): string {
  return teamName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Fetch team stats from CFBD API
 */
async function fetchTeamStats(season: number, week: number): Promise<CFBDTeamStats[]> {
  const apiKey = process.env.CFBD_API_KEY;
  if (!apiKey) {
    throw new Error('CFBD_API_KEY environment variable is required');
  }

  const baseUrl = process.env.CFBD_BASE_URL || 'https://api.collegefootballdata.com';
  const url = new URL(`${baseUrl}/stats/game/team`);
  url.searchParams.set('year', season.toString());
  url.searchParams.set('week', week.toString());
  url.searchParams.set('seasonType', 'regular');

  console.log(`   [CFBD] Fetching team stats for ${season} Week ${week}...`);
  console.log(`   [CFBD] URL: ${url.toString()}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`   [CFBD] HTTP ${response.status} ${response.statusText}`);
      console.error(`   [CFBD] Error body: ${errorBody}`);
      throw new Error(`CFBD API error: ${response.status} ${response.statusText}`);
    }

    const responseText = await response.text();
    console.log(`   [CFBD] Raw response length: ${responseText.length}`);
    
    // Check if response is HTML (error page)
    if (responseText.trim().startsWith('<')) {
      console.error(`   [CFBD] Received HTML response instead of JSON`);
      console.error(`   [CFBD] Response preview: ${responseText.substring(0, 200)}...`);
      throw new Error('CFBD API returned HTML instead of JSON - likely an error page');
    }

    let data: CFBDTeamStats[];
    try {
      data = JSON.parse(responseText) as CFBDTeamStats[];
    } catch (parseError) {
      console.error(`   [CFBD] JSON parse error: ${parseError}`);
      console.error(`   [CFBD] Response preview: ${responseText.substring(0, 200)}...`);
      throw new Error(`Failed to parse JSON response: ${parseError}`);
    }
    console.log(`   [CFBD] Fetched ${data.length} team stats for ${season} Week ${week}`);
    
    return data;
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error('CFBD API request timed out');
    }
    throw error;
  }
}

/**
 * Map CFBD team stats to our database format
 */
function mapCFBDStatsToTeamGameStat(cfbdStats: CFBDTeamStats): TeamGameStatData | null {
  // Normalize team IDs
  const teamId = normalizeTeamId(cfbdStats.team);
  const opponentId = normalizeTeamId(cfbdStats.opponent);

  if (!teamId || !opponentId) {
    console.warn(`   [CFBD] Invalid team IDs: team="${teamId}", opponent="${opponentId}" for ${cfbdStats.team} vs ${cfbdStats.opponent}`);
    return null;
  }

  // Create stable game ID (same format as other jobs)
  const gameId = `${cfbdStats.season}-wk${cfbdStats.week}-${cfbdStats.homeAway === 'away' ? teamId : opponentId}-${cfbdStats.homeAway === 'home' ? teamId : opponentId}`;

  // Calculate derived metrics
  const yppOff = cfbdStats.plays > 0 ? cfbdStats.yards / cfbdStats.plays : null;
  const passYpaOff = cfbdStats.passing.attempts > 0 ? cfbdStats.passing.yards / cfbdStats.passing.attempts : null;
  const rushYpcOff = cfbdStats.rushing.attempts > 0 ? cfbdStats.rushing.yards / cfbdStats.rushing.attempts : null;

  // Calculate defensive metrics (opponent's offensive stats)
  const yppDef = cfbdStats.defense.plays > 0 ? cfbdStats.defense.yards / cfbdStats.defense.plays : null;
  const passYpaDef = cfbdStats.defense.passing.attempts > 0 ? cfbdStats.defense.passing.yards / cfbdStats.defense.passing.attempts : null;
  const rushYpcDef = cfbdStats.defense.rushing.attempts > 0 ? cfbdStats.defense.rushing.yards / cfbdStats.defense.rushing.attempts : null;

  return {
    gameId,
    teamId,
    opponentId,
    season: cfbdStats.season,
    week: cfbdStats.week,
    isHome: cfbdStats.homeAway === 'home',
    
    // Offensive stats
    playsOff: cfbdStats.plays,
    yardsOff: cfbdStats.yards,
    yppOff,
    successOff: null, // CFBD doesn't provide success rate directly
    epaOff: null, // CFBD doesn't provide EPA directly
    pacePlaysGm: cfbdStats.plays, // plays per game proxy
    passYardsOff: cfbdStats.passing.yards,
    rushYardsOff: cfbdStats.rushing.yards,
    passAttOff: cfbdStats.passing.attempts,
    rushAttOff: cfbdStats.rushing.attempts,
    passYpaOff,
    rushYpcOff,
    
    // Defensive stats
    playsDef: cfbdStats.defense.plays,
    yardsDef: cfbdStats.defense.yards,
    yppDef,
    successDef: null, // CFBD doesn't provide success rate directly
    epaDef: null, // CFBD doesn't provide EPA directly
    passYardsDef: cfbdStats.defense.passing.yards,
    rushYardsDef: cfbdStats.defense.rushing.yards,
    passAttDef: cfbdStats.defense.passing.attempts,
    rushAttDef: cfbdStats.defense.rushing.attempts,
    passYpaDef,
    rushYpcDef,
    
    rawJson: cfbdStats
  };
}

/**
 * Upsert team game stats to database
 */
async function upsertTeamGameStats(stats: TeamGameStatData[]): Promise<{ upserted: number; errors: number }> {
  try {
    const result = await prisma.teamGameStat.createMany({
      data: stats.map(stat => ({
        gameId: stat.gameId,
        teamId: stat.teamId,
        season: stat.season,
        week: stat.week,
        opponentId: stat.opponentId,
        isHome: stat.isHome,
        playsOff: stat.playsOff,
        yardsOff: stat.yardsOff,
        yppOff: stat.yppOff,
        successOff: stat.successOff,
        epaOff: stat.epaOff,
        pacePlaysGm: stat.pacePlaysGm,
        passYardsOff: stat.passYardsOff,
        rushYardsOff: stat.rushYardsOff,
        passAttOff: stat.passAttOff,
        rushAttOff: stat.rushAttOff,
        passYpaOff: stat.passYpaOff,
        rushYpcOff: stat.rushYpcOff,
        playsDef: stat.playsDef,
        yardsDef: stat.yardsDef,
        yppDef: stat.yppDef,
        successDef: stat.successDef,
        epaDef: stat.epaDef,
        passYardsDef: stat.passYardsDef,
        rushYardsDef: stat.rushYardsDef,
        passAttDef: stat.passAttDef,
        rushAttDef: stat.rushAttDef,
        passYpaDef: stat.passYpaDef,
        rushYpcDef: stat.rushYpcDef,
        rawJson: stat.rawJson
      })),
      skipDuplicates: true
    });
    
    return { upserted: result.count, errors: 0 };
  } catch (error) {
    console.error(`   [DB] Failed to create team game stats:`, error);
    return { upserted: 0, errors: stats.length };
  }
}

/**
 * Main function
 */
async function main() {
  try {
    const args = parseArgs();
    
    console.log('🏈 CFBD Team Stats Job');
    console.log(`   Season: ${args.season}`);
    console.log(`   Weeks: ${args.weeks.join(', ')}`);

    let totalUpserted = 0;
    let totalErrors = 0;

    for (const week of args.weeks) {
      console.log(`\n📥 Processing ${args.season} Week ${week}...`);
      
      try {
        // Fetch team stats from CFBD
        const cfbdStats = await fetchTeamStats(args.season, week);
        
        // Map to our format
        const teamGameStats: TeamGameStatData[] = [];
        for (const cfbdStat of cfbdStats) {
          const stat = mapCFBDStatsToTeamGameStat(cfbdStat);
          if (stat) {
            teamGameStats.push(stat);
          }
        }

        console.log(`   Found ${teamGameStats.length} team game stats`);

        if (teamGameStats.length > 0) {
          // Upsert to database
          const { upserted, errors } = await upsertTeamGameStats(teamGameStats);
          totalUpserted += upserted;
          totalErrors += errors;
          
          console.log(`   ✅ Upserted ${upserted} stats, ${errors} errors`);
        } else {
          console.log(`   ℹ️  No team stats found for Week ${week}`);
        }

      } catch (error) {
        console.error(`   ❌ Failed to process Week ${week}:`, error);
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   Stats upserted: ${totalUpserted}`);
    console.log(`   Errors: ${totalErrors}`);
    console.log(`   Total processed: ${totalUpserted + totalErrors}`);

  } catch (error) {
    console.error('❌ Job failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}
