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
    // Filter out non-FBS games
    if (cfbdGame.homeClassification !== 'fbs' || cfbdGame.awayClassification !== 'fbs') {
      console.log(`   [CFBD] Skipping non-FBS game: ${cfbdGame.homeTeam} (${cfbdGame.homeClassification}) vs ${cfbdGame.awayTeam} (${cfbdGame.awayClassification})`);
      return null;
    }

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
    // CFBD returns startDate as ISO string
    // Based on investigation, CFBD returns times in venue local time, NOT UTC
    // We need to convert venue local time to UTC for proper storage
    let date: Date;
    const startDateStr = cfbdGame.startDate;
    
    // Check if venue has timezone info
    const venueDetails = venueMap.get(venueName.toLowerCase());
    const venueTimezone = venueDetails?.timezone;
    
    // Helper function to convert local time in a timezone to UTC
    const convertLocalTimeToUTC = (dateStr: string, timezone: string): Date => {
      // Parse the date string (format: "2025-11-01T18:30:00")
      const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{3})?/);
      if (!match) {
        throw new Error(`Invalid date format: ${dateStr}`);
      }
      
      const [, year, month, day, hour, minute, second] = match;
      const localTimeStr = `${year}-${month}-${day}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}`;
      
      // Strategy: We need to find what UTC time produces the desired local time in the venue timezone
      // Use iterative approach: start with a guess and adjust based on the offset
      
      // Start with the date as if it were UTC
      let candidateUtc = new Date(`${localTimeStr}Z`);
      
      // Format what this UTC time would be in the venue timezone
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      
      let formattedLocal = formatter.format(candidateUtc);
      
      // Extract the time from formatted string (format: "M/d/yyyy, HH:mm:ss")
      const parts = formattedLocal.split(', ');
      if (parts.length === 2) {
        const timePart = parts[1]; // "HH:mm:ss"
        const [formattedHour, formattedMinute, formattedSecond] = timePart.split(':').map(Number);
        const targetHour = parseInt(hour);
        const targetMinute = parseInt(minute);
        const targetSecond = parseInt(second);
        
        // Calculate the difference in seconds
        const formattedTotalSeconds = formattedHour * 3600 + formattedMinute * 60 + formattedSecond;
        const targetTotalSeconds = targetHour * 3600 + targetMinute * 60 + targetSecond;
        let diffSeconds = targetTotalSeconds - formattedTotalSeconds;
        
        // Handle day rollover (if target is next day, add 24 hours)
        if (diffSeconds < -43200) { // More than 12 hours earlier - likely next day
          diffSeconds += 86400; // Add 24 hours
        } else if (diffSeconds > 43200) { // More than 12 hours later - likely previous day
          diffSeconds -= 86400; // Subtract 24 hours
        }
        
        // Adjust the UTC date by the difference
        candidateUtc = new Date(candidateUtc.getTime() + diffSeconds * 1000);
        
        // Verify the result
        formattedLocal = formatter.format(candidateUtc);
        const verifyParts = formattedLocal.split(', ');
        if (verifyParts.length === 2) {
          const verifyTime = verifyParts[1];
          const verifyTimeStr = `${targetHour.toString().padStart(2, '0')}:${targetMinute.toString().padStart(2, '0')}:${targetSecond.toString().padStart(2, '0')}`;
          // Allow 1 minute tolerance for DST edge cases
          if (Math.abs(diffSeconds) > 60) {
            // Try one more adjustment
            const verifyMatch = verifyTime.match(/(\d{2}):(\d{2}):(\d{2})/);
            if (verifyMatch) {
              const [, vHour, vMinute, vSecond] = verifyMatch;
              const verifyTotalSeconds = parseInt(vHour) * 3600 + parseInt(vMinute) * 60 + parseInt(vSecond);
              const finalDiff = targetTotalSeconds - verifyTotalSeconds;
              if (Math.abs(finalDiff) > 60) {
                candidateUtc = new Date(candidateUtc.getTime() + finalDiff * 1000);
              }
            }
          }
        }
      }
      
      return candidateUtc;
    };
    
    if (venueTimezone && !startDateStr.includes('Z') && !startDateStr.includes('+') && !startDateStr.match(/-\d{2}:\d{2}$/)) {
      // Venue has timezone and date string has no timezone - convert from venue local to UTC
      try {
        date = convertLocalTimeToUTC(startDateStr, venueTimezone);
        console.log(`   [CFBD] Converted ${cfbdGame.awayTeam} @ ${cfbdGame.homeTeam} from ${venueTimezone} local time to UTC: ${startDateStr} -> ${date.toISOString()}`);
      } catch (error) {
        console.warn(`   [CFBD] Error converting timezone for ${cfbdGame.awayTeam} @ ${cfbdGame.homeTeam}: ${error}. Using date as UTC.`);
        date = new Date(startDateStr + 'Z');
      }
    } else if (startDateStr.includes('Z')) {
      // Already has UTC indicator
      date = new Date(startDateStr);
    } else if (startDateStr.includes('+') || startDateStr.match(/-\d{2}:\d{2}$/)) {
      // Has timezone offset
      date = new Date(startDateStr);
    } else {
      // No timezone info - assume UTC (CFBD documentation)
      date = new Date(startDateStr + 'Z');
      
      // Warn if time looks like it might be local time
      const timeMatch = startDateStr.match(/T(\d{2}):(\d{2})/);
      if (timeMatch) {
        const hour = parseInt(timeMatch[1]);
        if (hour >= 12 && hour <= 23) {
          console.warn(`   [CFBD] No venue timezone available for ${cfbdGame.awayTeam} @ ${cfbdGame.homeTeam}. Time ${hour}:00 may be local time. Treating as UTC.`);
        }
      }
    }

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

