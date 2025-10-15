/**
 * The Odds API Adapter
 * 
 * Fetches NCAAF spreads, totals, and moneylines from The Odds API.
 * Requires ODDS_API_KEY environment variable.
 * Supports both live and historical odds data.
 */

import { DataSourceAdapter, Team, Game, MarketLine, TeamBranding } from './DataSourceAdapter';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Team name aliases for common variations
const TEAM_ALIASES: Record<string, string> = {
  'arizona wildcats': 'arizona',
  'houston cougars': 'houston',
  'utsa roadrunners': 'utsa',
  'miami fl': 'miami-fl',
  'miami florida': 'miami-fl',
  'miami hurricanes': 'miami-fl',
  'pitt': 'pittsburgh',
  'pitt panthers': 'pittsburgh',
  'ole miss': 'mississippi',
  'ole miss rebels': 'mississippi',
  'ucf': 'central-florida',
  'ucf knights': 'central-florida',
  'unlv rebels': 'unlv',
  'appalachian st': 'appalachian-state',
  'texas a&m': 'texas-a-m',
  'texas a&m aggies': 'texas-a-m',
  'louisiana-lafayette': 'louisiana',
  'louisiana monroe': 'ul-monroe',
  'ul monroe': 'ul-monroe',
  'uab': 'uab',
  'uab blazers': 'uab',
  'usc': 'usc',
  'usc trojans': 'usc',
  'smu': 'smu',
  'smu mustangs': 'smu',
  'tcu': 'tcu',
  'tcu horned frogs': 'tcu',
  'byu': 'byu',
  'byu cougars': 'byu',
  'nc state': 'nc-state',
  'nc state wolfpack': 'nc-state',
  'florida state': 'florida-state',
  'florida state seminoles': 'florida-state',
  'ohio state': 'ohio-state',
  'ohio state buckeyes': 'ohio-state',
  'penn state': 'penn-state',
  'penn state nittany lions': 'penn-state',
  'iowa state': 'iowa-state',
  'iowa state cyclones': 'iowa-state',
  'kansas state': 'kansas-state',
  'kansas state wildcats': 'kansas-state',
  'oklahoma state': 'oklahoma-state',
  'oklahoma state cowboys': 'oklahoma-state',
  'oregon state': 'oregon-state',
  'oregon state beavers': 'oregon-state',
  'washington state': 'washington-state',
  'washington state cougars': 'washington-state',
  'arizona state': 'arizona-state',
  'arizona state sun devils': 'arizona-state',
  'michigan state': 'michigan-state',
  'michigan state spartans': 'michigan-state',
  'mississippi state': 'mississippi-state',
  'mississippi state bulldogs': 'mississippi-state',
};

interface OddsApiConfig {
  baseUrl: string;
  timeoutMs: number;
  markets: string[];
}

interface TeamIndex {
  byId: Record<string, any>;
  bySlug: Record<string, string>;
  allTeams: Array<{id: string, name: string, mascot: string | null}>;
}

interface OddsApiEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Array<{
    key: string;
    title: string;
    last_update: string;
    markets: Array<{
      key: string;
      last_update: string;
      outcomes: Array<{
        name: string;
        price?: number;
        point?: number;
      }>;
    }>;
  }>;
}

export class OddsApiAdapter implements DataSourceAdapter {
  private config: OddsApiConfig;
  private apiKey: string;
  private baseUrl: string;
  private teamIndex: TeamIndex | null = null;
  private matchStats = {
    exactSlug: 0,
    alias: 0,
    fuzzy: 0,
    failed: 0
  };

  constructor(config: OddsApiConfig) {
    this.config = config;
    
    // Check for API key
    this.apiKey = process.env.ODDS_API_KEY || '';
    if (!this.apiKey) {
      throw new Error(
        'ODDS_API_KEY environment variable is required for Odds API adapter.\n' +
        'Get your API key from https://the-odds-api.com and add it to your .env file.'
      );
    }

    // Use env override or config
    this.baseUrl = process.env.ODDS_API_BASE_URL || config.baseUrl;
    console.log(`[ODDSAPI] Base URL: ${this.baseUrl}`);
  }

  /**
   * Normalize team name for matching
   */
  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Remove punctuation
      .replace(/\b(university|univ|state|college|the|football)\b/g, '') // Remove common words
      .replace(/\s+/g, ' ') // Collapse whitespace
      .trim();
  }

  /**
   * Slugify team name for ID matching
   */
  private slugifyTeam(name: string): string {
    return this.normalizeName(name)
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Build team index from database
   */
  private async buildTeamIndex(): Promise<void> {
    if (this.teamIndex) return; // Already built

    const teams = await prisma.team.findMany({
      select: { id: true, name: true, mascot: true }
    });

    const byId: Record<string, any> = {};
    const bySlug: Record<string, string> = {};
    const allTeams: Array<{id: string, name: string, mascot: string | null}> = [];

    for (const team of teams) {
      byId[team.id] = team;
      bySlug[this.slugifyTeam(team.name)] = team.id;
      
      // Also index by name + mascot if mascot exists
      if (team.mascot) {
        const withMascot = this.slugifyTeam(`${team.name} ${team.mascot}`);
        if (!bySlug[withMascot]) {
          bySlug[withMascot] = team.id;
        }
      }
      
      allTeams.push(team);
    }

    this.teamIndex = { byId, bySlug, allTeams };
    console.log(`   [ODDSAPI] Built team index with ${allTeams.length} teams`);
  }

  /**
   * Calculate Jaccard similarity between two strings (token-based)
   */
  private jaccardSimilarity(str1: string, str2: string): number {
    const tokens1 = new Set(str1.split(/\s+/));
    const tokens2 = new Set(str2.split(/\s+/));
    
    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);
    
    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  /**
   * Resolve Odds API team name to CFBD team ID
   */
  private resolveTeamId(oddsTeamName: string): string | null {
    if (!this.teamIndex) {
      throw new Error('Team index not built. Call buildTeamIndex() first.');
    }

    const normalized = this.normalizeName(oddsTeamName);
    const slugged = this.slugifyTeam(oddsTeamName);

    // 1. Exact slug match
    if (this.teamIndex.bySlug[slugged]) {
      this.matchStats.exactSlug++;
      return this.teamIndex.bySlug[slugged];
    }

    // 2. Alias map lookup
    if (TEAM_ALIASES[normalized]) {
      const aliasTarget = TEAM_ALIASES[normalized];
      if (this.teamIndex.bySlug[aliasTarget]) {
        this.matchStats.alias++;
        return this.teamIndex.bySlug[aliasTarget];
      }
    }

    // 3. Fuzzy matching with high threshold
    let bestMatch: {id: string, score: number} | null = null;
    const threshold = 0.75; // High threshold for safety

    for (const team of this.teamIndex.allTeams) {
      const teamNormalized = this.normalizeName(team.name);
      const score = this.jaccardSimilarity(normalized, teamNormalized);
      
      if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { id: team.id, score };
      }
    }

    if (bestMatch) {
      this.matchStats.fuzzy++;
      return bestMatch.id;
    }

    // 4. Failed to match
    this.matchStats.failed++;
    console.warn(`   [ODDSAPI] ⚠️  Failed to match team: "${oddsTeamName}" (normalized: "${normalized}")`);
    return null;
  }

  getName(): string {
    return 'TheOddsAPI';
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  /**
   * Odds API doesn't provide team roster
   */
  async getTeams(season: number): Promise<Team[]> {
    console.log('⚠️  Odds API adapter does not provide team data. Teams will be created from games.');
    return [];
  }

  /**
   * Odds API doesn't provide schedules separately
   */
  async getSchedules(season: number, weeks: number[]): Promise<Game[]> {
    console.log('⚠️  Odds API adapter does not provide schedule data. Use CFBD or another adapter for schedules.');
    return [];
  }

  /**
   * Fetch market lines (spreads, totals, moneylines) from The Odds API
   */
  async getMarketLines(season: number, weeks: number[], options?: { startDate?: string; endDate?: string }): Promise<MarketLine[]> {
    // Build team index from database for matching
    await this.buildTeamIndex();
    
    // Reset match stats
    this.matchStats = { exactSlug: 0, alias: 0, fuzzy: 0, failed: 0 };
    
    const allLines: any[] = [];
    let eventsProcessed = 0;
    let gamesMatched = 0;

    for (const week of weeks) {
      console.log(`📥 Fetching Odds API odds for ${season} Week ${week}...`);
      
      try {
        const { lines, eventCount, matchedCount } = await this.fetchOddsForWeek(season, week, options);
        allLines.push(...lines);
        eventsProcessed += eventCount;
        gamesMatched += matchedCount;
        
        // Count spreads, totals, and moneylines
        const spreads = lines.filter(l => l.lineType === 'spread').length;
        const totals = lines.filter(l => l.lineType === 'total').length;
        const moneylines = lines.filter(l => l.lineType === 'moneyline').length;
        
        console.log(`   [ODDSAPI] Parsed counts — spread: ${spreads}, total: ${totals}, moneyline: ${moneylines}`);
        console.log(`   ✅ Fetched ${spreads} spreads, ${totals} totals, ${moneylines} moneylines (oddsapi)`);
      } catch (error) {
        console.error(`   ❌ Error fetching Odds API odds for week ${week}:`, (error as Error).message);
        // Continue with other weeks
      }
    }

    // Log matching statistics
    console.log(`   [ODDSAPI] Team matching stats:`);
    console.log(`     Events processed: ${eventsProcessed}`);
    console.log(`     Games matched: ${gamesMatched}`);
    console.log(`     Exact slug matches: ${this.matchStats.exactSlug}`);
    console.log(`     Alias matches: ${this.matchStats.alias}`);
    console.log(`     Fuzzy matches: ${this.matchStats.fuzzy}`);
    console.log(`     Failed matches: ${this.matchStats.failed}`);

    return allLines;
  }

  /**
   * Return empty array for team branding
   */
  async getTeamBranding(): Promise<TeamBranding[]> {
    return [];
  }

  /**
   * Fetch odds for a specific week
   */
  private async fetchOddsForWeek(season: number, week: number, options?: { startDate?: string; endDate?: string }): Promise<{lines: any[], eventCount: number, matchedCount: number}> {
    // Determine if we need historical data
    const isHistorical = season < new Date().getFullYear() || options?.startDate;
    
    if (isHistorical && options?.startDate) {
      // Use historical endpoint
      console.log(`   [ODDSAPI] Using historical data endpoint for ${season} week ${week}`);
      return await this.fetchHistoricalOdds(season, week, options.startDate, options.endDate);
    } else {
      // Use live odds endpoint
      console.log(`   [ODDSAPI] Using live odds endpoint for ${season} week ${week}`);
      return await this.fetchLiveOdds(season, week);
    }
  }

  /**
   * Fetch live odds from The Odds API
   */
  private async fetchLiveOdds(season: number, week: number): Promise<{lines: any[], eventCount: number, matchedCount: number}> {
    const lines: any[] = [];
    let eventCount = 0;
    let matchedCount = 0;
    
    // Build URL for NCAAF live odds
    const markets = this.config.markets.join(',');
    const url = `${this.baseUrl}/sports/americanfootball_ncaaf/odds?apiKey=${this.apiKey}&regions=us&markets=${markets}&oddsFormat=american`;
    
    console.log(`   [ODDSAPI] URL: ${url.replace(this.apiKey, 'HIDDEN')}`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`   [ODDSAPI] ERROR ${response.status} ${response.statusText} for ${url.replace(this.apiKey, 'HIDDEN')}`);
        console.error(errorBody.slice(0, 800));
        throw new Error(`Odds API error: ${response.status} ${response.statusText}`);
      }

      const events: OddsApiEvent[] = await response.json();
      eventCount = events.length;
      console.log(`   [ODDSAPI] Found ${events.length} events`);

      // Parse each event's odds with team matching
      for (const event of events) {
        const eventLines = this.parseEventOdds(event, season, week);
        if (eventLines.length > 0) {
          lines.push(...eventLines);
          matchedCount++;
        }
      }

    } catch (error) {
      if ((error as any).name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }

    return { lines, eventCount, matchedCount };
  }

  /**
   * Fetch historical odds from The Odds API
   */
  private async fetchHistoricalOdds(season: number, week: number, startDate: string, endDate?: string): Promise<{lines: any[], eventCount: number, matchedCount: number}> {
    console.warn(`   [ODDSAPI] Historical endpoint requires a paid tier. Attempting to use live endpoint filtered by date...`);
    
    // For now, try the live endpoint - historical requires paid tier
    // In a production scenario, you would use:
    // GET /v4/historical/sports/americanfootball_ncaaf/odds?date={timestamp}&regions=us&markets={markets}
    
    const lines: any[] = [];
    let matchedCount = 0;
    let eventCount = 0;
    const markets = this.config.markets.join(',');
    const url = `${this.baseUrl}/sports/americanfootball_ncaaf/odds?apiKey=${this.apiKey}&regions=us&markets=${markets}&oddsFormat=american`;
    
    console.log(`   [ODDSAPI] URL: ${url.replace(this.apiKey, 'HIDDEN')}`);
    console.warn(`   [ODDSAPI] Note: Filtering by date range (${startDate} to ${endDate}) may not work on free tier`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`   [ODDSAPI] ERROR ${response.status} ${response.statusText} for ${url.replace(this.apiKey, 'HIDDEN')}`);
        console.error(errorBody.slice(0, 800));
        throw new Error(`Odds API error: ${response.status} ${response.statusText}`);
      }

      const events: OddsApiEvent[] = await response.json();
      
      // Filter events by date range if provided
      const filteredEvents = events.filter(event => {
        if (!startDate) return true;
        const eventDate = new Date(event.commence_time);
        const start = new Date(startDate);
        const end = endDate ? new Date(endDate) : new Date(startDate);
        end.setDate(end.getDate() + 7); // Add 7 days if no end date
        
        return eventDate >= start && eventDate <= end;
      });
      
      eventCount = filteredEvents.length;
      console.log(`   [ODDSAPI] Found ${events.length} total events, ${filteredEvents.length} in date range`);

      // Parse each event's odds with team matching
      for (const event of filteredEvents) {
        const eventLines = this.parseEventOdds(event, season, week);
        if (eventLines.length > 0) {
          lines.push(...eventLines);
          matchedCount++;
        }
      }

    } catch (error) {
      if ((error as any).name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }

    return { lines, eventCount, matchedCount };
  }

  /**
   * Parse event odds into MarketLine objects
   */
  private parseEventOdds(event: OddsApiEvent, season: number, week: number): any[] {
    const lines: any[] = [];

    // Resolve team names to CFBD team IDs
    const homeTeamId = this.resolveTeamId(event.home_team);
    const awayTeamId = this.resolveTeamId(event.away_team);

    // Skip if either team couldn't be matched
    if (!homeTeamId || !awayTeamId) {
      console.warn(`   [ODDSAPI] Skipping event: ${event.away_team} @ ${event.home_team} (team matching failed)`);
      return [];
    }

    // Create gameId using matched team IDs (match CFBD format)
    const gameId = `${season}-wk${week}-${awayTeamId}-${homeTeamId}`;

    for (const bookmaker of event.bookmakers) {
      const bookName = bookmaker.title || bookmaker.key;
      const timestamp = new Date(bookmaker.last_update);

      for (const market of bookmaker.markets) {
        if (market.key === 'h2h') {
          // Moneyline
          for (const outcome of market.outcomes) {
            if (outcome.price !== undefined && outcome.price !== null) {
              lines.push({
                gameId,
                season,
                week,
                lineType: 'moneyline',
                lineValue: outcome.price,
                closingLine: outcome.price,
                bookName,
                source: 'oddsapi',
                timestamp,
              });
            } else {
              // Debug: log missing price
              console.warn(`   [ODDSAPI] Skipping moneyline outcome with undefined/null price: ${JSON.stringify(outcome).slice(0, 100)}`);
            }
          }
        } else if (market.key === 'spreads') {
          // Spread
          for (const outcome of market.outcomes) {
            if (outcome.point !== undefined && outcome.point !== null) {
              lines.push({
                gameId,
                season,
                week,
                lineType: 'spread',
                lineValue: outcome.point,
                closingLine: outcome.point,
                bookName,
                source: 'oddsapi',
                timestamp,
              });
            }
          }
        } else if (market.key === 'totals') {
          // Total
          for (const outcome of market.outcomes) {
            if (outcome.point !== undefined && outcome.point !== null) {
              lines.push({
                gameId,
                season,
                week,
                lineType: 'total',
                lineValue: outcome.point,
                closingLine: outcome.point,
                bookName,
                source: 'oddsapi',
                timestamp,
              });
            }
          }
        }
      }
    }

    return lines;
  }
}

