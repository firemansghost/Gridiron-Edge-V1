/**
 * CFBD Game Results Job
 * 
 * Fetches final scores and game results from CollegeFootballData API.
 * Updates games with final scores and status='final' for completed games.
 * 
 * Usage:
 *   node apps/jobs/dist/cfbd-game-results.js --season 2025 --weeks 1-8
 *   node apps/jobs/dist/cfbd-game-results.js --season 2025 --weeks 1..current
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface CFBDGame {
  id: number;
  season: number;
  week: number;
  seasonType: string;
  startDate: string;
  neutralSite: boolean;
  conferenceGame: boolean;
  homeTeam: string;
  homeId?: number;
  homeConference?: string;
  homeClassification?: string;
  awayTeam: string;
  awayId?: number;
  awayConference?: string;
  awayClassification?: string;
  venue?: string;
  venueId?: number;
  completed?: boolean;
  homePoints?: number;
  awayPoints?: number;
}

interface GameResult {
  gameId: string;
  homeScore: number;
  awayScore: number;
  status: 'final';
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  let season: number | null = null;
  let weeks: number[] = [];
  let currentWeek = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--season' && i + 1 < args.length) {
      season = parseInt(args[i + 1]);
      i++;
    } else if (arg === '--weeks' && i + 1 < args.length) {
      const weekStr = args[i + 1];
      
      if (weekStr === 'current') {
        currentWeek = true;
      } else if (weekStr.includes('..')) {
        // Range format: 1..8
        const [start, end] = weekStr.split('..').map(w => parseInt(w));
        if (start && end) {
          for (let w = start; w <= end; w++) {
            weeks.push(w);
          }
        }
      } else if (weekStr.includes('-')) {
        // Range format: 1-8
        const [start, end] = weekStr.split('-').map(w => parseInt(w));
        if (start && end) {
          for (let w = start; w <= end; w++) {
            weeks.push(w);
          }
        }
      } else {
        // Single week or comma-separated
        const weekList = weekStr.split(',').map(w => parseInt(w.trim()));
        weeks.push(...weekList);
      }
      i++;
    }
  }

  // Default to current season if not specified
  if (!season) {
    season = new Date().getFullYear();
  }

  // Default to current week if not specified
  if (weeks.length === 0 && !currentWeek) {
    // Simple current week calculation (in production, this would be more sophisticated)
    const now = new Date();
    const seasonStart = new Date(season, 7, 1); // August 1st
    const weeksSinceStart = Math.floor((now.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
    weeks = [Math.max(1, Math.min(weeksSinceStart, 15))];
  }

  if (currentWeek) {
    const now = new Date();
    const seasonStart = new Date(season, 7, 1); // August 1st
    const weeksSinceStart = Math.floor((now.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
    weeks = [Math.max(1, Math.min(weeksSinceStart, 15))];
  }

  return { season, weeks };
}

/**
 * Get current CFB week (simplified)
 */
function getCurrentCFBWeek(): number {
  const now = new Date();
  const currentYear = now.getFullYear();
  const seasonStart = new Date(currentYear, 7, 1); // August 1st
  const weeksSinceStart = Math.floor((now.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, Math.min(weeksSinceStart, 15));
}

/**
 * Normalize team name to slug format
 */
function normalizeTeamId(teamName: string): string {
  return teamName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Fetch game results from CFBD API
 */
async function fetchGameResults(season: number, week: number): Promise<CFBDGame[]> {
  const apiKey = process.env.CFBD_API_KEY;
  if (!apiKey) {
    throw new Error('CFBD_API_KEY environment variable is required');
  }

  const baseUrl = process.env.CFBD_BASE_URL || 'https://api.collegefootballdata.com';
  const url = new URL(`${baseUrl}/games`);
  url.searchParams.set('year', season.toString());
  url.searchParams.set('week', week.toString());
  url.searchParams.set('seasonType', 'regular');
  url.searchParams.set('division', 'fbs');

  console.log(`   [CFBD] Fetching game results for ${season} Week ${week}...`);
  console.log(`   [CFBD] URL: ${url.toString()}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

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

    const data: CFBDGame[] = await response.json();
    console.log(`   [CFBD] Fetched ${data.length} games for ${season} Week ${week}`);
    
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
 * Map CFBD game to our game result format
 */
function mapCFBDGameToResult(cfbdGame: CFBDGame): GameResult | null {
  // Only process completed games with scores
  if (!cfbdGame.completed || cfbdGame.homePoints === undefined || cfbdGame.awayPoints === undefined) {
    return null;
  }

  // Filter out non-FBS games
  if (cfbdGame.homeClassification !== 'fbs' || cfbdGame.awayClassification !== 'fbs') {
    return null;
  }

  // Normalize team IDs
  const homeTeamId = normalizeTeamId(cfbdGame.homeTeam);
  const awayTeamId = normalizeTeamId(cfbdGame.awayTeam);

  if (!homeTeamId || !awayTeamId) {
    console.warn(`   [CFBD] Invalid team IDs: home="${homeTeamId}", away="${awayTeamId}" for ${cfbdGame.homeTeam} vs ${cfbdGame.awayTeam}`);
    return null;
  }

  // Create stable game ID (same format as CFBDAdapter)
  const gameId = `${cfbdGame.season}-wk${cfbdGame.week}-${awayTeamId}-${homeTeamId}`;

  return {
    gameId,
    homeScore: cfbdGame.homePoints,
    awayScore: cfbdGame.awayPoints,
    status: 'final'
  };
}

/**
 * Update games with final scores
 */
async function updateGameResults(results: GameResult[]): Promise<{ updated: number; notFound: number }> {
  let updated = 0;
  let notFound = 0;

  for (const result of results) {
    try {
      const updateResult = await prisma.game.updateMany({
        where: { id: result.gameId },
        data: {
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          status: result.status
        }
      });

      if (updateResult.count > 0) {
        updated++;
        console.log(`   ✅ Updated ${result.gameId}: ${result.awayScore} @ ${result.homeScore}`);
      } else {
        notFound++;
        console.warn(`   ⚠️  Game not found: ${result.gameId}`);
      }
    } catch (error) {
      console.error(`   ❌ Failed to update ${result.gameId}:`, error);
      notFound++;
    }
  }

  return { updated, notFound };
}

/**
 * Main function
 */
async function main() {
  try {
    const args = parseArgs();
    
    console.log('🏈 CFBD Game Results Job');
    console.log(`   Season: ${args.season}`);
    console.log(`   Weeks: ${args.weeks.join(', ')}`);

    let totalUpdated = 0;
    let totalNotFound = 0;

    for (const week of args.weeks) {
      console.log(`\n📥 Processing ${args.season} Week ${week}...`);
      
      try {
        // Fetch game results from CFBD
        const cfbdGames = await fetchGameResults(args.season, week);
        
        // Map to our format
        const results: GameResult[] = [];
        for (const cfbdGame of cfbdGames) {
          const result = mapCFBDGameToResult(cfbdGame);
          if (result) {
            results.push(result);
          }
        }

        console.log(`   Found ${results.length} completed games with scores`);

        if (results.length > 0) {
          // Update database
          const { updated, notFound } = await updateGameResults(results);
          totalUpdated += updated;
          totalNotFound += notFound;
          
          console.log(`   ✅ Updated ${updated} games, ${notFound} not found`);
        } else {
          console.log(`   ℹ️  No completed games found for Week ${week}`);
        }

      } catch (error) {
        console.error(`   ❌ Failed to process Week ${week}:`, error);
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   Games updated: ${totalUpdated}`);
    console.log(`   Games not found: ${totalNotFound}`);
    console.log(`   Total processed: ${totalUpdated + totalNotFound}`);

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

export { main };
