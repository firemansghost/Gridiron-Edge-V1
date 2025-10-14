/**
 * SportsGameOdds Adapter
 * 
 * Fetches NCAAF spreads and totals from SportsGameOdds API.
 * Requires SGO_API_KEY environment variable.
 */

import { DataSourceAdapter, Team, Game, MarketLine } from './DataSourceAdapter';

interface SportsGameOddsConfig {
  baseUrl: string;
  league: string;
  books: string[];
  timeoutMs: number;
}

interface SGOGame {
  game_id?: string;
  id?: string;
  home_team?: string;
  away_team?: string;
  commence_time?: string;
  bookmakers?: Array<{
    key: string;
    title: string;
    markets: Array<{
      key: string;
      outcomes?: Array<{
        name: string;
        price?: number;
        point?: number;
      }>;
    }>;
  }>;
}

export class SportsGameOddsAdapter implements DataSourceAdapter {
  private config: SportsGameOddsConfig;
  private apiKey: string;
  private baseUrl: string;

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
  async getMarketLines(season: number, weeks: number[]): Promise<MarketLine[]> {
    const allLines: any[] = [];

    for (const week of weeks) {
      console.log(`📥 Fetching SGO odds for ${season} Week ${week}...`);
      
      try {
        const lines = await this.fetchOddsForWeek(season, week);
        allLines.push(...lines);
        
        // Count spreads, totals, and moneylines
        const spreads = lines.filter(l => l.lineType === 'spread').length;
        const totals = lines.filter(l => l.lineType === 'total').length;
        const moneylines = lines.filter(l => l.lineType === 'moneyline').length;
        console.log(`   ✅ Upserted ${spreads} spreads, ${totals} totals, ${moneylines} moneylines (sgo)`);
      } catch (error) {
        console.error(`   ❌ Error fetching SGO odds for week ${week}:`, (error as Error).message);
        // Continue with other weeks
      }
    }

    return allLines;
  }

  /**
   * Fetch odds for a specific week
   */
  private async fetchOddsForWeek(season: number, week: number): Promise<any[]> {
    const lines: any[] = [];
    
    // Counters for parsed lines
    let spreads = 0;
    let totals = 0;
    let moneylines = 0;
    
    // Track unique market keys for logging (first 3 games only)
    const marketKeysLogged = new Set<string>();
    let gamesProcessed = 0;

    // SGO API endpoint structure (adjust based on actual API docs)
    // Example: GET /v2/odds?league=NCAAF&season=2024&week=1
    // Include markets parameter to explicitly request all market types
    const url = `${this.baseUrl}/odds?league=${this.config.league}&season=${season}&week=${week}&markets=spreads,totals,h2h`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Api-Key': this.apiKey,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`SGO API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const games: SGOGame[] = Array.isArray(data) ? data : data.games || [];

    // Process each game
    for (const game of games) {
      const gameId = this.buildGameId(game, season, week);
      
      if (!gameId) {
        console.warn(`   ⚠️  Skipping game with missing teams: ${JSON.stringify(game)}`);
        continue;
      }

      gamesProcessed++;
      const logMarketKeys = gamesProcessed <= 3;

      // Process bookmakers
      const bookmakers = game.bookmakers || [];
      for (const bookmaker of bookmakers) {
        const bookName = this.normalizeBookName(bookmaker.key || bookmaker.title);
        
        // Skip if not in our configured books list
        if (this.config.books.length > 0 && !this.config.books.includes(bookName)) {
          continue;
        }

        // Process markets (spreads, totals, moneylines)
        const markets = bookmaker.markets || [];
        for (const market of markets) {
          const marketKey = market.key || 'unknown';
          
          // Log market keys for first 3 games
          if (logMarketKeys && !marketKeysLogged.has(marketKey)) {
            console.log(`   [SGO] Market key detected: "${marketKey}"`);
            marketKeysLogged.add(marketKey);
          }
          
          const marketLines = this.parseMarket(
            market,
            gameId,
            season,
            week,
            bookName,
            game.commence_time
          );
          
          // Count by type
          for (const line of marketLines) {
            if (line.lineType === 'spread') spreads++;
            else if (line.lineType === 'total') totals++;
            else if (line.lineType === 'moneyline') moneylines++;
          }
          
          lines.push(...marketLines);
        }
      }
    }

    // Log parsed counts
    console.log(`   [SGO] Parsed counts — spread: ${spreads}, total: ${totals}, moneyline: ${moneylines}`);

    return lines;
  }

  /**
   * Build a game ID from team names
   */
  private buildGameId(game: SGOGame, season: number, week: number): string | null {
    const homeTeam = game.home_team;
    const awayTeam = game.away_team;

    if (!homeTeam || !awayTeam) {
      return null;
    }

    const homeId = this.normalizeTeamId(homeTeam);
    const awayId = this.normalizeTeamId(awayTeam);

    return `${season}-week-${week}-${awayId}-at-${homeId}`;
  }

  /**
   * Normalize team name to ID (lowercase, slugified)
   */
  private normalizeTeamId(teamName: string): string {
    return teamName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Normalize book name
   */
  private normalizeBookName(bookKey: string): string {
    const normalized = bookKey.toLowerCase().replace(/[^a-z0-9]+/g, '');
    
    // Map common variations
    const bookMap: Record<string, string> = {
      'draftkings': 'draftkings',
      'fanduel': 'fanduel',
      'pinnacle': 'pinnacle',
      'consensus': 'consensus',
      'bovada': 'bovada',
      'betmgm': 'betmgm',
      'caesars': 'caesars',
    };

    return bookMap[normalized] || normalized;
  }

  /**
   * Check if a market key represents a moneyline market
   */
  private isMoneylineKey(key: string): boolean {
    const k = key.toLowerCase();
    return (
      k === 'h2h' ||
      k === 'moneyline' ||
      k === 'ml' ||
      k === 'moneyline_2way' ||
      k === 'moneyline-2way' ||
      k.includes('h2h')
    );
  }

  /**
   * Parse a market (spread, total, or moneyline) into MarketLine objects
   */
  private parseMarket(
    market: any,
    gameId: string,
    season: number,
    week: number,
    bookName: string,
    commenceTime?: string
  ): any[] {
    const lines: any[] = [];
    const marketKey = market.key?.toLowerCase() || '';
    const timestamp = commenceTime ? new Date(commenceTime) : new Date();

    // Determine line type
    let lineType: 'spread' | 'total' | 'moneyline' | null = null;
    if (marketKey.includes('spread') || marketKey.includes('h2h_handicap')) {
      lineType = 'spread';
    } else if (marketKey.includes('total') || marketKey.includes('over_under')) {
      lineType = 'total';
    } else if (this.isMoneylineKey(marketKey)) {
      lineType = 'moneyline';
    }

    if (!lineType) {
      return lines; // Skip unknown market types
    }

    const outcomes = market.outcomes || [];

    if (lineType === 'spread') {
      // Spread: typically has home and away outcomes with points
      for (const outcome of outcomes) {
        const point = outcome.point;
        if (point !== undefined && point !== null) {
          // Use the point value as the line
          // For spreads, we typically store the home team's line
          lines.push({
            gameId,
            lineType: 'spread',
            openingLine: Number(point),
            closingLine: Number(point), // SGO may not distinguish opening/closing
            timestamp,
            bookName,
            season,
            week,
          });
          break; // Only need one spread line per book
        }
      }
    } else if (lineType === 'total') {
      // Total: typically has over/under outcomes with the same point value
      const totalPoint = outcomes[0]?.point;
      if (totalPoint !== undefined && totalPoint !== null) {
        lines.push({
          gameId,
          lineType: 'total',
          openingLine: Number(totalPoint),
          closingLine: Number(totalPoint),
          timestamp,
          bookName,
          season,
          week,
        });
      }
    } else if (lineType === 'moneyline') {
      // Moneyline: has home and away outcomes with American odds (price)
      // We'll store both home and away moneylines as separate rows
      for (const outcome of outcomes) {
        const price = outcome.price;
        if (price !== undefined && price !== null) {
          // Store the American odds as the line value
          lines.push({
            gameId,
            lineType: 'moneyline',
            openingLine: Number(price),
            closingLine: Number(price),
            timestamp,
            bookName,
            season,
            week,
          });
        }
      }
    }

    return lines;
  }

  /**
   * Get team branding (not supported by SGO)
   */
  async getTeamBranding(): Promise<any[]> {
    return [];
  }
}

