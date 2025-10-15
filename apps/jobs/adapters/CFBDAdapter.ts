/**
 * College Football Data (CFBD) Adapter
 * 
 * Fetches real NCAAF schedules from CollegeFootballData API.
 * Requires CFBD_API_KEY environment variable.
 */

import { DataSourceAdapter, Team, Game, MarketLine, TeamBranding } from './DataSourceAdapter';

interface CFBDConfig {
  baseUrl: string;
  division?: string;
  timeoutMs?: number;
}

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
  awayTeam: string;
  awayId?: number;
  awayConference?: string;
  venue?: string;
  venueId?: number;
  completed?: boolean;
  homePoints?: number;
  awayPoints?: number;
}

interface CFBDVenue {
  id: number;
  name: string;
  city?: string;
  state?: string;
  zip?: string;
  country_code?: string;
  timezone?: string;
  latitude?: number;
  longitude?: number;
  elevation?: number;
  capacity?: number;
  year_constructed?: number;
  grass?: boolean;
  dome?: boolean;
}

export class CFBDAdapter implements DataSourceAdapter {
  private config: CFBDConfig;
  private apiKey: string;
  private baseUrl: string;

  constructor(config: CFBDConfig) {
    this.config = config;
    
    // Check for API key
    this.apiKey = process.env.CFBD_API_KEY || '';
    if (!this.apiKey) {
      throw new Error(
        'CFBD_API_KEY environment variable is required for CFBD adapter.\n' +
        'Get your API key from https://collegefootballdata.com and add it to your .env file.'
      );
    }

    this.baseUrl = process.env.CFBD_BASE_URL || config.baseUrl;
  }

  getName(): string {
    return 'CollegeFootballData';
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  /**
   * CFBD doesn't provide a simple teams list endpoint in the way we need
   * Return empty array - teams will be created from schedules
   */
  async getTeams(season: number): Promise<Team[]> {
    console.log('⚠️  CFBD adapter does not provide team data. Teams will be created from schedules.');
    return [];
  }

  /**
   * Fetch game schedules from CFBD API
   */
  async getSchedules(season: number, weeks: number[]): Promise<Game[]> {
    const allGames: Game[] = [];

    for (const week of weeks) {
      console.log(`📥 Fetching CFBD schedules for ${season} Week ${week}...`);
      
      try {
        const games = await this.fetchGamesForWeek(season, week);
        allGames.push(...games);
        
        console.log(`   ✅ Found ${games.length} games (cfbd)`);
      } catch (error) {
        console.error(`   ❌ Error fetching CFBD schedules for week ${week}:`, (error as Error).message);
      }
    }

    return allGames;
  }

  /**
   * CFBD doesn't provide market lines
   */
  async getMarketLines(season: number, weeks: number[]): Promise<MarketLine[]> {
    console.log('⚠️  CFBD adapter does not provide market lines. Use SGO or another adapter for odds.');
    return [];
  }

  /**
   * Fetch games for a specific week
   */
  private async fetchGamesForWeek(season: number, week: number): Promise<Game[]> {
    const games: Game[] = [];
    
    // Build URL for games endpoint
    const url = new URL(`${this.baseUrl}/games`);
    url.searchParams.set('year', season.toString());
    url.searchParams.set('week', week.toString());
    url.searchParams.set('seasonType', 'regular');
    url.searchParams.set('division', 'fbs');
    
    // Log the full request URL
    console.log(`   [CFBD] URL: ${url.toString()}`);

    // Make request
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs || 20000);

    try {
      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json'
        }
      });

      clearTimeout(timeout);

      // Log HTTP status and error details if not 2xx
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`   [CFBD] HTTP ${response.status} ${response.statusText}`);
        console.error(`   [CFBD] Error body: ${errorBody}`);
        throw new Error(`CFBD API error: ${response.status} ${response.statusText}`);
      }

      const data: CFBDGame[] = await response.json();
      
      // Log count of games returned
      console.log(`   [CFBD] Parsed ${data.length} games for ${season} wk ${week}`);
      
      // Debug: Log first game structure
      if (data.length > 0) {
        console.log(`   [CFBD] First game structure:`, JSON.stringify(data[0], null, 2));
      }
      
      // Warning if zero games returned
      if (data.length === 0) {
        console.warn(`   [CFBD] WARNING: 0 games returned for year=${season}, week=${week}, seasonType=regular, division=fbs`);
      }

      // Fetch venue details for all games (to get city/state)
      const venueMap = await this.fetchVenues();

      // Process each game
      for (const cfbdGame of data) {
        try {
          const game = this.mapCFBDGameToGame(cfbdGame, venueMap);
          if (game) {
            games.push(game);
          } else {
            console.warn(`   [CFBD] Skipping game ${cfbdGame.homeTeam} vs ${cfbdGame.awayTeam} - mapping returned null`);
          }
        } catch (error) {
          console.warn(`   ⚠️  Skipping game ${cfbdGame.homeTeam} vs ${cfbdGame.awayTeam}:`, (error as Error).message);
        }
      }

    } catch (error) {
      if ((error as any).name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }

    return games;
  }

  /**
   * Fetch venue details to get city/state information
   */
  private async fetchVenues(): Promise<Map<string, CFBDVenue>> {
    const venueMap = new Map<string, CFBDVenue>();

    try {
      const url = `${this.baseUrl}/venues`;
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs || 20000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json'
        }
      });

      clearTimeout(timeout);

      if (response.ok) {
        const venues: CFBDVenue[] = await response.json();
        for (const venue of venues) {
          venueMap.set(venue.name.toLowerCase(), venue);
        }
      }
    } catch (error) {
      console.warn('   ⚠️  Could not fetch venue details, city/state may be missing');
    }

    return venueMap;
  }

  /**
   * Map CFBD game to our Game interface
   */
  private mapCFBDGameToGame(cfbdGame: CFBDGame, venueMap: Map<string, CFBDVenue>): Game | null {
    // Normalize team IDs
    const homeTeamId = this.normalizeTeamId(cfbdGame.homeTeam);
    const awayTeamId = this.normalizeTeamId(cfbdGame.awayTeam);

    if (!homeTeamId || !awayTeamId) {
      console.warn(`   [CFBD] Invalid team IDs: home="${homeTeamId}", away="${awayTeamId}" for ${cfbdGame.homeTeam} vs ${cfbdGame.awayTeam}`);
      return null;
    }

    // Create stable game ID
    const gameId = `${cfbdGame.season}-wk${cfbdGame.week}-${awayTeamId}-${homeTeamId}`;

    // Determine status
    let status: 'scheduled' | 'in_progress' | 'final' = 'scheduled';
    if (cfbdGame.completed) {
      status = 'final';
    }

    // Get venue details (don't fail if venue is missing)
    let city = '';
    let venueName = cfbdGame.venue || '';
    
    if (venueName) {
      const venueDetails = venueMap.get(venueName.toLowerCase());
      if (venueDetails) {
        city = venueDetails.city || '';
        // Note: We don't have a 'state' field in the Game interface, but venue has it
        // The venue name will include location context
      } else {
        console.warn(`   [CFBD] Venue details not found for: ${venueName}`);
      }
    } else {
      console.warn(`   [CFBD] No venue specified for game: ${cfbdGame.homeTeam} vs ${cfbdGame.awayTeam}`);
    }

    // Parse date
    const date = new Date(cfbdGame.startDate);

    const game: Game = {
      id: gameId,
      homeTeamId,
      awayTeamId,
      season: cfbdGame.season,
      week: cfbdGame.week,
      date,
      status,
      venue: venueName,
      city,
      neutralSite: cfbdGame.neutralSite || false,
      conferenceGame: cfbdGame.conferenceGame || false,
      homeScore: cfbdGame.homePoints,
      awayScore: cfbdGame.awayPoints
    };

    return game;
  }

  /**
   * Normalize team name to ID (lowercase, slugified)
   */
  private normalizeTeamId(teamName: string): string {
    if (!teamName) return '';
    
    return teamName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}

