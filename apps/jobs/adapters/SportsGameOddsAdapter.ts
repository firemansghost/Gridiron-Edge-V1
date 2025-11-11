/**
 * SportsGameOdds Adapter
 * 
 * Fetches NCAAF spreads, totals, and moneylines from SportsGameOdds API.
 * Requires SGO_API_KEY environment variable.
 * Supports league auto-discovery and date range filtering for historical data.
 */

import { DataSourceAdapter, Team, Game, MarketLine, TeamBranding } from './DataSourceAdapter';
import { normalizeBookmakerName } from '../lib/bookmaker-normalizer';

interface SportsGameOddsConfig {
  baseUrl: string;
  league: string;
  books: string[];
  timeoutMs: number;
  defaultDateWindowDays?: number;
}

interface SGOLeague {
  leagueID?: string;
  id?: string;
  name?: string;
  slug?: string;
  sport?: string;
}

interface SGOEvent {
  eventID?: string;
  id?: string;
  homeTeam?: string;
  awayTeam?: string;
  home_team?: string;
  away_team?: string;
  startTime?: string;
  commence_time?: string;
  leagueID?: string;
}

interface SGOOddsMarket {
  marketID?: string;
  key?: string;
  name?: string;
  bookmakers?: Array<{
    bookmakerID?: string;
    key?: string;
    title?: string;
    name?: string;
    outcomes?: Array<{
      name: string;
      price?: number;
      point?: number;
      side?: string;
    }>;
  }>;
}

export class SportsGameOddsAdapter implements DataSourceAdapter {
  private config: SportsGameOddsConfig;
  private apiKey: string;
  private baseUrl: string;
  private cachedLeagueId: string | null = null;

  constructor(config: SportsGameOddsConfig) {
    this.config = config;
    
    // Check for API key
    this.apiKey = process.env.SGO_API_KEY || '';
    if (!this.apiKey) {
      throw new Error(
        'SGO_API_KEY environment variable is required for SportsGameOdds adapter.\n' +
        'Get your API key from https://sportsgameodds.com and add it to your .env file.'
      );
    }

    // Use env override or config
    this.baseUrl = process.env.SGO_BASE_URL || config.baseUrl;
    console.log(`[SGO] Base URL: ${this.baseUrl}`);
  }

  getName(): string {
    return 'SportsGameOdds';
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  /**
   * SGO doesn't provide team roster, so we return empty array.
   * Teams will be created as stubs during game ingestion.
   */
  async getTeams(season: number): Promise<Team[]> {
    console.log('⚠️  SGO adapter does not provide team data. Teams will be created from games.');
    return [];
  }

  /**
   * SGO doesn't provide schedules, only odds.
   * Return empty array - schedules should come from another adapter.
   */
  async getSchedules(season: number, weeks: number[]): Promise<Game[]> {
    console.log('⚠️  SGO adapter does not provide schedule data. Use CFBD or another adapter for schedules.');
    return [];
  }

  /**
   * Fetch market lines (spreads, totals, moneylines) from SGO API
   */
  async getMarketLines(season: number, weeks: number[], options?: { startDate?: string; endDate?: string }): Promise<MarketLine[]> {
    const allLines: any[] = [];

    // Auto-discover NCAAF league ID
    const leagueId = await this.getNcaafLeagueId();
    if (!leagueId) {
      console.error('   [SGO] Could not find NCAAF league. Check league discovery.');
      return [];
    }

    for (const week of weeks) {
      console.log(`📥 Fetching SGO odds for ${season} Week ${week}...`);
      
      try {
        const lines = await this.fetchOddsForWeek(season, week, options);
        allLines.push(...lines);
        
        // Count spreads, totals, and moneylines
        const spreads = lines.filter(l => l.lineType === 'spread').length;
        const totals = lines.filter(l => l.lineType === 'total').length;
        const moneylines = lines.filter(l => l.lineType === 'moneyline').length;
        
        console.log(`   [SGO] Parsed counts — spread: ${spreads}, total: ${totals}, moneyline: ${moneylines}`);
        console.log(`   ✅ Upserted ${spreads} spreads, ${totals} totals, ${moneylines} moneylines (sgo)`);
      } catch (error) {
        console.error(`   ❌ Error fetching SGO odds for week ${week}:`, (error as Error).message);
        // Continue with other weeks
      }
    }

    return allLines;
  }

  /**
   * Return empty array for team branding (not provided by SGO)
   */
  async getTeamBranding(): Promise<TeamBranding[]> {
    return [];
  }

  /**
   * Auto-discover NCAAF league ID from SGO API
   */
  private async getNcaafLeagueId(): Promise<string | null> {
    if (this.cachedLeagueId) {
      return this.cachedLeagueId;
    }

    try {
      const leagues = await this.fetchLeagues();
      
      // Look for NCAAF league (case-insensitive)
      const ncaafLeague = leagues.find((league: SGOLeague) => {
        const id = league.leagueID || league.id || '';
        const name = league.name || '';
        const slug = league.slug || '';
        
        const searchStr = `${id} ${name} ${slug}`.toLowerCase();
        return searchStr.includes('ncaaf') || 
               searchStr.includes('college football') ||
               searchStr.includes('ncaa football');
      });

      if (ncaafLeague) {
        this.cachedLeagueId = ncaafLeague.leagueID || ncaafLeague.id || null;
        console.log(`   [SGO] NCAAF leagueId: ${this.cachedLeagueId}`);
        return this.cachedLeagueId;
      }

      console.warn('   [SGO] WARNING: Could not find NCAAF league in SGO leagues list');
      return null;
    } catch (error) {
      console.error('   [SGO] Error discovering NCAAF league:', (error as Error).message);
      return null;
    }
  }

  /**
   * Fetch available leagues from SGO API
   */
  private async fetchLeagues(): Promise<SGOLeague[]> {
    const url = `${this.baseUrl}/leagues`;
    
    console.log(`   [SGO] Fetching leagues from: ${url}`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Api-Key': this.apiKey,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`   [SGO] ERROR ${response.status} ${response.statusText} for ${url}`);
        console.error(errorBody.slice(0, 800));
        throw new Error(`SGO API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Handle different response structures
      const leagues = Array.isArray(data) ? data : (data.data || data.leagues || []);
      console.log(`   [SGO] Found ${leagues.length} leagues`);
      
      return leagues;
    } catch (error) {
      if ((error as any).name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  /**
   * Fetch odds for a specific week with optional date range
   */
  private async fetchOddsForWeek(season: number, week: number, options?: { startDate?: string; endDate?: string }): Promise<any[]> {
    const lines: any[] = [];
    
    // Counters for parsed lines
    let spreads = 0;
    let totals = 0;
    let moneylines = 0;

    const leagueId = await this.getNcaafLeagueId();
    if (!leagueId) {
      return [];
    }

    // Build URL with date range if provided
    let url = `${this.baseUrl}/events?leagueID=${leagueId}`;
    
    if (options?.startDate && options?.endDate) {
      url += `&dateFrom=${options.startDate}&dateTo=${options.endDate}`;
    }

    // Log the full request URL
    console.log(`   [SGO] URL: ${url}`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Api-Key': this.apiKey,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`   [SGO] ERROR ${response.status} ${response.statusText} for ${url}`);
        console.error(errorBody.slice(0, 800));
        throw new Error(`SGO API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Debug: Log first part of API response
      console.log(`   [SGO] API Response structure:`, JSON.stringify(data, null, 2).substring(0, 500) + '...');
      
      const events: SGOEvent[] = Array.isArray(data) ? data : (data.data || data.events || []);
      console.log(`   [SGO] Found ${events.length} events`);

      // For each event, fetch its markets/odds
      for (const event of events) {
        const eventId = event.eventID || event.id;
        if (!eventId) continue;

        try {
          const eventLines = await this.fetchEventOdds(eventId, season, week);
          lines.push(...eventLines);
          
          // Update counters
          spreads += eventLines.filter(l => l.lineType === 'spread').length;
          totals += eventLines.filter(l => l.lineType === 'total').length;
          moneylines += eventLines.filter(l => l.lineType === 'moneyline').length;
        } catch (error) {
          console.warn(`   [SGO] Skipping event ${eventId}:`, (error as Error).message);
        }
      }

    } catch (error) {
      if ((error as any).name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }

    console.log(`   [SGO] Parsed counts — spread: ${spreads}, total: ${totals}, moneyline: ${moneylines}`);
    return lines;
  }

  /**
   * Fetch odds/markets for a specific event
   */
  private async fetchEventOdds(eventId: string, season: number, week: number): Promise<any[]> {
    const url = `${this.baseUrl}/events/${eventId}/markets`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Api-Key': this.apiKey,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`   [SGO] ERROR ${response.status} ${response.statusText} for ${url}`);
        console.error(errorBody.slice(0, 800));
        throw new Error(`SGO API error: ${response.status} ${response.statusText}`);
      }

      const markets = await response.json();
      const marketData = Array.isArray(markets) ? markets : (markets.data || markets.markets || []);
      
      // Parse markets into MarketLine objects
      return this.parseMarkets(marketData, season, week);
    } catch (error) {
      if ((error as any).name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  /**
   * Parse market data into MarketLine objects
   */
  private parseMarkets(markets: any[], season: number, week: number): any[] {
    const lines: any[] = [];

    for (const market of markets) {
      const bookmakers = market.bookmakers || [];
      
      for (const book of bookmakers) {
        const rawBookName = book.title || book.name || book.key || 'unknown';
        const bookName = normalizeBookmakerName(rawBookName);
        const outcomes = book.outcomes || [];
        
        // Determine market type
        const marketKey = market.key || market.marketID || '';
        const marketName = market.name || '';
        
        if (this.isSpreadKey(marketKey, marketName)) {
          // Parse spread
          for (const outcome of outcomes) {
            if (outcome.point !== undefined) {
              // CRITICAL: Validate that point is not actually a price value
              const absPoint = Math.abs(outcome.point);
              const absPrice = outcome.price !== undefined && outcome.price !== null ? Math.abs(outcome.price) : null;
              
              // Detect price→point swap: if abs(point) > 70 and price is in 101-500 range, reject
              if (absPoint > 70 && absPrice !== null && absPrice >= 101 && absPrice <= 500) {
                console.error(`   [SGO] ❌ REJECTED: Spread point appears to be a price value. point=${outcome.point}, price=${outcome.price}, book=${bookName}`);
                continue; // Skip this line
              }
              
              // Additional sanity check: reject spreads > 50
              if (absPoint > 50) {
                console.error(`   [SGO] ❌ REJECTED: Spread point exceeds 50 (likely invalid). point=${outcome.point}, book=${bookName}`);
                continue; // Skip this line
              }
              
              lines.push({
                season,
                week,
                lineType: 'spread',
                lineValue: outcome.point,
                closingLine: outcome.point,
                bookName,
                source: 'sgo',
                timestamp: new Date(),
              });
            }
          }
        } else if (this.isTotalKey(marketKey, marketName)) {
          // Parse total
          for (const outcome of outcomes) {
            if (outcome.point !== undefined) {
              // CRITICAL: Totals must be positive and within reasonable range (20-120 for CFB)
              const totalValue = Math.abs(outcome.point); // Always use absolute value for totals
              
              if (totalValue < 20 || totalValue > 120) {
                console.error(`   [SGO] ❌ REJECTED: Total outside valid range (20-120). point=${outcome.point}, book=${bookName}`);
                continue; // Skip this line
              }
              
              lines.push({
                season,
                week,
                lineType: 'total',
                lineValue: totalValue, // Always positive
                closingLine: totalValue, // Always positive
                bookName,
                source: 'sgo',
                timestamp: new Date(),
              });
            }
          }
        } else if (this.isMoneylineKey(marketKey, marketName)) {
          // Parse moneyline
          for (const outcome of outcomes) {
            if (outcome.price !== undefined) {
              lines.push({
                season,
                week,
                lineType: 'moneyline',
                lineValue: outcome.price,
                closingLine: outcome.price,
                bookName,
                source: 'sgo',
                timestamp: new Date(),
              });
            }
          }
        }
      }
    }

    return lines;
  }

  /**
   * Check if market key indicates spread
   */
  private isSpreadKey(key: string, name: string = ''): boolean {
    const searchStr = `${key} ${name}`.toLowerCase();
    return searchStr.includes('spread') || 
           searchStr.includes('handicap') ||
           key.toLowerCase().includes('sp');
  }

  /**
   * Check if market key indicates total
   */
  private isTotalKey(key: string, name: string = ''): boolean {
    const searchStr = `${key} ${name}`.toLowerCase();
    return searchStr.includes('total') || 
           searchStr.includes('over') ||
           searchStr.includes('under') ||
           key.toLowerCase().includes('ou');
  }

  /**
   * Check if market key indicates moneyline
   */
  private isMoneylineKey(key: string, name: string = ''): boolean {
    const searchStr = `${key} ${name}`.toLowerCase();
    return searchStr.includes('h2h') ||
           searchStr.includes('moneyline') ||
           searchStr.includes('money line') ||
           searchStr.includes('ml') ||
           searchStr.includes('moneyline_2way') ||
           searchStr.includes('moneyline-2way');
  }
}
