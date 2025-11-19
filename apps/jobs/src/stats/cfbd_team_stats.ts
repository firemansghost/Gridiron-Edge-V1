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
import { TeamResolver } from '../../adapters/TeamResolver';
import { GameLookup } from '../../adapters/GameLookup';

const prisma = new PrismaClient();
const teamResolver = new TeamResolver();
const gameLookup = new GameLookup(prisma);

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

// Interface for /stats/game/advanced endpoint (different structure)
interface CFBDAdvancedStats {
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
  offense?: {
    yardsPerPlay?: number;
    successRate?: number;
    ppa?: number; // points per play = EPA/play
    secondsPerPlay?: number;
    yardsPerPass?: number;
    yardsPerRush?: number;
  };
  defense?: {
    yardsPerPlay?: number;
    successRate?: number;
    ppa?: number;
    secondsPerPlay?: number;
    yardsPerPass?: number;
    yardsPerRush?: number;
    // Legacy defense fields
    yards?: number;
    plays?: number;
    points?: number;
    rushing?: {
      yards?: number;
      attempts?: number;
      yardsPerRush?: number;
      touchdowns?: number;
    };
    passing?: {
      yards?: number;
      completions?: number;
      attempts?: number;
      completionPercentage?: number;
      yardsPerAttempt?: number;
      yardsPerCompletion?: number;
      touchdowns?: number;
      interceptions?: number;
      quarterbackRating?: number;
    };
  };
  // Legacy fields for backward compatibility
  yards?: number;
  plays?: number;
  yardsPerPlay?: number;
  pointsPerPossession?: number;
  turnovers?: number;
  penalties?: number;
  penaltyYards?: number;
  timeOfPossession?: number;
  rushing?: {
    yards?: number;
    attempts?: number;
    yardsPerRush?: number;
    touchdowns?: number;
  };
  passing?: {
    yards?: number;
    completions?: number;
    attempts?: number;
    completionPercentage?: number;
    yardsPerAttempt?: number;
    yardsPerCompletion?: number;
    touchdowns?: number;
    interceptions?: number;
    quarterbackRating?: number;
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
  paceDef?: number;
  
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
      if (weekStr.includes(',')) {
        // Comma-separated list
        weeks = weekStr.split(',').map(w => parseInt(w.trim())).filter(w => !isNaN(w));
      } else if (weekStr.includes('-')) {
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
 * Fetch team stats from CFBD API
 */
async function fetchTeamStats(season: number, week: number): Promise<{ data: CFBDAdvancedStats[]; weeksRequested: number; weeksJson: number; weeksNonJson: number; upserts: number }> {
  const apiKey = process.env.CFBD_API_KEY;
  if (!apiKey) {
    throw new Error('CFBD_API_KEY environment variable is required');
  }

  const baseUrl = process.env.CFBD_BASE_URL || 'https://api.collegefootballdata.com';
  const url = new URL(`${baseUrl}/stats/game/advanced`); // Use advanced stats endpoint
  url.searchParams.set('year', season.toString());
  url.searchParams.set('week', week.toString());
  url.searchParams.set('seasonType', 'regular');
  url.searchParams.set('classification', 'fbs'); // Optional filter to reduce payload
  
  // Debug: Log the exact URL being called
  console.log(`   [CFBD] Full URL: ${url.toString()}`);

  console.log(`   [CFBD] Fetching team stats for ${season} Week ${week}...`);
  console.log(`   [CFBD] URL: ${url.toString()}`);
  console.log(`   [CFBD] API Key present: ${apiKey ? 'Yes' : 'No'}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: 'manual', // Handle redirects manually
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'User-Agent': 'gridiron-edge-jobs/1.0'
      }
    });

    clearTimeout(timeout);

    // Debug logging
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
      console.warn(`   [CFBD] Non-JSON response (status=${response.status}, type=${contentType}): ${preview}`);
      console.warn(`   [CFBD] Skipping week ${week} - endpoint returned non-JSON content`);
      return { data: [], weeksRequested: 1, weeksJson: 0, weeksNonJson: 1, upserts: 0 };
    }

    console.log(`   [CFBD] Raw response length: ${body.length}`);
    
    // Check if response is HTML (error page)
    if (body.trim().startsWith('<')) {
      console.error(`   [CFBD] Received HTML response instead of JSON`);
      console.error(`   [CFBD] Response preview: ${body.substring(0, 200)}...`);
      throw new Error('CFBD API returned HTML instead of JSON - likely an error page');
    }

    let data: CFBDAdvancedStats[];
    try {
      data = JSON.parse(body) as CFBDAdvancedStats[];
    } catch (parseError) {
      console.error(`   [CFBD] JSON parse error: ${parseError}`);
      console.error(`   [CFBD] Response preview: ${body.substring(0, 200)}...`);
      throw new Error(`Failed to parse JSON response: ${parseError}`);
    }
    console.log(`   [CFBD] Fetched ${data.length} team stats for ${season} Week ${week}`);
    
    return { data, weeksRequested: 1, weeksJson: 1, weeksNonJson: 0, upserts: 0 };
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
// New mapping function for advanced stats endpoint
async function mapCFBDAdvancedStatsToTeamGameStat(cfbdStats: CFBDAdvancedStats): Promise<TeamGameStatData | null> {
  // Use TeamResolver to resolve team names to team IDs
  const teamId = teamResolver.resolveTeam(cfbdStats.team, 'college-football', { provider: 'cfbd' });
  const opponentId = teamResolver.resolveTeam(cfbdStats.opponent, 'college-football', { provider: 'cfbd' });

  if (!teamId || !opponentId) {
    console.warn(`   [CFBD] Could not resolve teams: "${cfbdStats.team}" vs "${cfbdStats.opponent}"`);
    return null;
  }

  // Use GameLookup to find the game in our database
  const gameResult = await gameLookup.lookupGame(
    cfbdStats.season,
    cfbdStats.week,
    cfbdStats.homeAway === 'home' ? teamId : opponentId,
    cfbdStats.homeAway === 'home' ? opponentId : teamId
  );

  if (!gameResult.gameId) {
    console.warn(`   [CFBD] Could not find game: ${cfbdStats.team} vs ${cfbdStats.opponent} (${cfbdStats.season} W${cfbdStats.week})`);
    return null;
  }

  // Helper function to safely get numeric values
  const safeNumber = (value: any): number | null => {
    if (value === null || value === undefined || isNaN(value) || !isFinite(value)) {
      return null;
    }
    return Number(value);
  };

  // Calculate pace from seconds per play (if available)
  const paceOff = cfbdStats.offense?.secondsPerPlay && cfbdStats.offense.secondsPerPlay > 0 
    ? 60 / cfbdStats.offense.secondsPerPlay 
    : null;

  const paceDef = cfbdStats.defense?.secondsPerPlay && cfbdStats.defense.secondsPerPlay > 0 
    ? 60 / cfbdStats.defense.secondsPerPlay 
    : null;

  return {
    gameId: gameResult.gameId,
    teamId,
    opponentId,
    season: cfbdStats.season,
    week: cfbdStats.week,
    isHome: cfbdStats.homeAway === 'home',
    
    // Offensive stats (using advanced stats structure)
    yppOff: safeNumber(cfbdStats.offense?.yardsPerPlay),
    successOff: safeNumber(cfbdStats.offense?.successRate),
    epaOff: safeNumber(cfbdStats.offense?.ppa),
    pacePlaysGm: safeNumber(paceOff),
    passYpaOff: safeNumber(cfbdStats.offense?.yardsPerPass),
    rushYpcOff: safeNumber(cfbdStats.offense?.yardsPerRush),
    
    // Defensive stats (using advanced stats structure)
    yppDef: safeNumber(cfbdStats.defense?.yardsPerPlay),
    successDef: safeNumber(cfbdStats.defense?.successRate),
    epaDef: safeNumber(cfbdStats.defense?.ppa),
    paceDef: safeNumber(paceDef),
    passYpaDef: safeNumber(cfbdStats.defense?.yardsPerPass),
    rushYpcDef: safeNumber(cfbdStats.defense?.yardsPerRush),
    
    // Legacy fields for backward compatibility
    playsOff: safeNumber(cfbdStats.plays),
    yardsOff: safeNumber(cfbdStats.yards),
    passYardsOff: safeNumber(cfbdStats.passing?.yards),
    rushYardsOff: safeNumber(cfbdStats.rushing?.yards),
    passAttOff: safeNumber(cfbdStats.passing?.attempts),
    rushAttOff: safeNumber(cfbdStats.rushing?.attempts),
    
    // Defensive legacy fields
    playsDef: safeNumber(cfbdStats.defense?.plays),
    yardsDef: safeNumber(cfbdStats.defense?.yards),
    passYardsDef: safeNumber(cfbdStats.defense?.passing?.yards),
    rushYardsDef: safeNumber(cfbdStats.defense?.rushing?.yards),
    passAttDef: safeNumber(cfbdStats.defense?.passing?.attempts),
    rushAttDef: safeNumber(cfbdStats.defense?.rushing?.attempts),
    
    // Store raw JSON for debugging
    rawJson: cfbdStats
  };
}

// Legacy mapping function for backward compatibility
async function mapCFBDStatsToTeamGameStat(cfbdStats: CFBDTeamStats): Promise<TeamGameStatData | null> {
  // Use TeamResolver to resolve team names to team IDs
  const teamId = teamResolver.resolveTeam(cfbdStats.team, 'college-football', { provider: 'cfbd' });
  const opponentId = teamResolver.resolveTeam(cfbdStats.opponent, 'college-football', { provider: 'cfbd' });

  if (!teamId || !opponentId) {
    console.warn(`   [CFBD] Could not resolve teams: "${cfbdStats.team}" vs "${cfbdStats.opponent}"`);
    return null;
  }

  // Use GameLookup to find the game in our database
  const gameResult = await gameLookup.lookupGame(
    cfbdStats.season,
    cfbdStats.week,
    cfbdStats.homeAway === 'home' ? teamId : opponentId,
    cfbdStats.homeAway === 'home' ? opponentId : teamId
  );

  if (!gameResult.gameId) {
    console.warn(`   [CFBD] Could not find game: ${cfbdStats.team} vs ${cfbdStats.opponent} (${cfbdStats.season} W${cfbdStats.week})`);
    return null;
  }

  // Calculate derived metrics
  const yppOff = cfbdStats.plays > 0 ? cfbdStats.yards / cfbdStats.plays : null;
  const passYpaOff = cfbdStats.passing.attempts > 0 ? cfbdStats.passing.yards / cfbdStats.passing.attempts : null;
  const rushYpcOff = cfbdStats.rushing.attempts > 0 ? cfbdStats.rushing.yards / cfbdStats.rushing.attempts : null;

  // Calculate defensive metrics (opponent's offensive stats)
  const yppDef = cfbdStats.defense.plays > 0 ? cfbdStats.defense.yards / cfbdStats.defense.plays : null;
  const passYpaDef = cfbdStats.defense.passing.attempts > 0 ? cfbdStats.defense.passing.yards / cfbdStats.defense.passing.attempts : null;
  const rushYpcDef = cfbdStats.defense.rushing.attempts > 0 ? cfbdStats.defense.rushing.yards / cfbdStats.defense.rushing.attempts : null;

  return {
    gameId: gameResult.gameId,
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
        offensive_stats: {
          plays: stat.playsOff,
          yards: stat.yardsOff,
          ypp: stat.yppOff,
          success: stat.successOff,
          epa: stat.epaOff,
          pace: stat.pacePlaysGm,
          passYards: stat.passYardsOff,
          rushYards: stat.rushYardsOff,
          passAtt: stat.passAttOff,
          rushAtt: stat.rushAttOff,
          passYpa: stat.passYpaOff,
          rushYpc: stat.rushYpcOff
        },
        defensive_stats: {
          plays: stat.playsDef,
          yards: stat.yardsDef,
          ypp: stat.yppDef,
          success: stat.successDef,
          epa: stat.epaDef,
          passYards: stat.passYardsDef,
          rushYards: stat.rushYardsDef,
          passAtt: stat.passAttDef,
          rushAtt: stat.rushAttDef,
          passYpa: stat.passYpaDef,
          rushYpc: stat.rushYpcDef
        },
        special_teams: {},
        yppOff: stat.yppOff,
        successOff: stat.successOff,
        epaOff: stat.epaOff,
        pace: stat.pacePlaysGm,
        passYpaOff: stat.passYpaOff,
        rushYpcOff: stat.rushYpcOff,
        yppDef: stat.yppDef,
        successDef: stat.successDef,
        epaDef: stat.epaDef,
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
    let totalWeeksRequested = 0;
    let totalWeeksJson = 0;
    let totalWeeksNonJson = 0;

    for (const week of args.weeks) {
      console.log(`\n📥 Processing ${args.season} Week ${week}...`);
      
      try {
        // Fetch team stats from CFBD
        const result = await fetchTeamStats(args.season, week);
        
        totalWeeksRequested += result.weeksRequested;
        totalWeeksJson += result.weeksJson;
        totalWeeksNonJson += result.weeksNonJson;
        
        if (result.weeksNonJson > 0) {
          console.log(`   ⚠️  Week ${week} returned non-JSON content - skipping`);
          continue;
        }
        
        // Map to our format
        const teamGameStats: TeamGameStatData[] = [];
        for (const cfbdStat of result.data) {
          const stat = await mapCFBDAdvancedStatsToTeamGameStat(cfbdStat);
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
        totalErrors++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   Weeks requested: ${totalWeeksRequested}`);
    console.log(`   Weeks with JSON: ${totalWeeksJson}`);
    console.log(`   Weeks with non-JSON: ${totalWeeksNonJson}`);
    console.log(`   Stats upserted: ${totalUpserted}`);
    console.log(`   Errors: ${totalErrors}`);

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
