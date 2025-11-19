/**
 * CFBD Sync Service
 * 
 * Serverless-friendly CFBD game results sync logic extracted from cfbd-game-results.ts script.
 * Fetches final scores from CollegeFootballData API and updates games in the database.
 * 
 * This service can be called directly from API routes without spawning child processes.
 */

import { prisma } from '../prisma';

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

export interface SyncResult {
  success: boolean;
  gamesUpdated: number;
  gamesNotFound: number;
  error?: string;
}

/**
 * Normalize team name to slug format (matches CFBDAdapter logic)
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

  console.log(`[CFBD_SERVICE] Fetching game results for ${season} Week ${week}...`);
  console.log(`[CFBD_SERVICE] URL: ${url.toString()}`);

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
      console.error(`[CFBD_SERVICE] HTTP ${response.status} ${response.statusText}`);
      console.error(`[CFBD_SERVICE] Error body: ${errorBody}`);
      throw new Error(`CFBD API error: ${response.status} ${response.statusText}`);
    }

    const data: CFBDGame[] = await response.json();
    console.log(`[CFBD_SERVICE] Fetched ${data.length} games for ${season} Week ${week}`);
    
    return data;
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === 'AbortError') {
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
    console.warn(`[CFBD_SERVICE] Invalid team IDs: home="${homeTeamId}", away="${awayTeamId}" for ${cfbdGame.homeTeam} vs ${cfbdGame.awayTeam}`);
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
        console.log(`[CFBD_SERVICE] ✅ Updated ${result.gameId}: ${result.awayScore} @ ${result.homeScore}`);
      } else {
        notFound++;
        console.warn(`[CFBD_SERVICE] ⚠️  Game not found: ${result.gameId}`);
      }
    } catch (error) {
      console.error(`[CFBD_SERVICE] ❌ Failed to update ${result.gameId}:`, error);
      notFound++;
    }
  }

  return { updated, notFound };
}

/**
 * Sync games for a specific week from CFBD API
 * 
 * @param season - The season year (e.g., 2025)
 * @param week - The week number
 * @returns Summary of sync operation
 */
export async function syncGamesForWeek(season: number, week: number): Promise<SyncResult> {
  try {
    console.log(`[CFBD_SERVICE] Starting sync for ${season} Week ${week}...`);

    // Fetch game results from CFBD
    const cfbdGames = await fetchGameResults(season, week);
    
    // Map to our format
    const results: GameResult[] = [];
    for (const cfbdGame of cfbdGames) {
      const result = mapCFBDGameToResult(cfbdGame);
      if (result) {
        results.push(result);
      }
    }

    console.log(`[CFBD_SERVICE] Found ${results.length} completed games with scores`);

    if (results.length === 0) {
      return {
        success: true,
        gamesUpdated: 0,
        gamesNotFound: 0
      };
    }

    // Update database
    const { updated, notFound } = await updateGameResults(results);
    
    console.log(`[CFBD_SERVICE] ✅ Updated ${updated} games, ${notFound} not found`);

    return {
      success: true,
      gamesUpdated: updated,
      gamesNotFound: notFound
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[CFBD_SERVICE] ❌ Sync failed for ${season} Week ${week}:`, errorMessage);
    
    return {
      success: false,
      gamesUpdated: 0,
      gamesNotFound: 0,
      error: errorMessage
    };
  }
}

