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
  // Basic mascot removal (some teams need explicit mapping)
  'arizona wildcats': 'arizona',
  'houston cougars': 'houston',
  'utsa roadrunners': 'utsa',
  
  // Miami variations
  'miami fl': 'miami-fl',
  'miami florida': 'miami-fl',
  'miami hurricanes': 'miami-fl',
  
  // Pitt/Pittsburgh
  'pitt': 'pittsburgh',
  'pitt panthers': 'pittsburgh',
  
  // Ole Miss
  'ole miss': 'mississippi',
  'ole miss rebels': 'mississippi',
  
  // UCF
  'ucf': 'central-florida',
  'ucf knights': 'central-florida',
  
  // UNLV
  'unlv rebels': 'unlv',
  
  // Appalachian State
  'appalachian st': 'app-state',
  'appalachian mountaineers': 'app-state',
  
  // Texas A&M
  'texas am': 'texas-a-m',
  'texas am aggies': 'texas-a-m',
  
  // Louisiana variants
  'louisiana-lafayette': 'louisiana',
  'louisiana ragin cajuns': 'louisiana',
  'louisiana monroe': 'ul-monroe',
  'ul monroe': 'ul-monroe',
  'ul monroe warhawks': 'ul-monroe',
  
  // Other abbreviations
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
  'umass': 'massachusetts',
  'umass minutemen': 'massachusetts',
  'unc': 'north-carolina',
  
  // State schools
  'nc state': 'nc-state',
  'nc state wolfpack': 'nc-state',
  'florida state': 'florida-state',
  'florida state seminoles': 'florida-state',
  'ohio state': 'ohio-state',
  'ohio state buckeyes': 'ohio-state',
  'penn state': 'penn-state',
  'penn nittany lions': 'penn-state',
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
  'arizona sun devils': 'arizona-state',
  'michigan state': 'michigan-state',
  'michigan state spartans': 'michigan-state',
  'mississippi state': 'mississippi-state',
  'mississippi state bulldogs': 'mississippi-state',
  'san jose state': 'san-jose-state',
  'san jose spartans': 'san-jose-state',
  'kent state': 'kent-state',
  'kent golden flashes': 'kent-state',
  
  // Unique mascots that need mapping
  'delaware blue hens': 'delaware',
  'california golden bears': 'california',
  'hawaii rainbow warriors': 'hawaii',
  'minnesota golden gophers': 'minnesota',
  'nevada wolf pack': 'nevada',
  'north carolina tar heels': 'north-carolina',
  'rutgers scarlet knights': 'rutgers',
  'texas tech red raiders': 'texas-tech',
  'tulane green wave': 'tulane',
  'tulsa golden hurricane': 'tulsa',
  'north texas mean green': 'north-texas',
  'southern mississippi golden eagles': 'southern-mississippi',
  'marshall thundering herd': 'marshall',
  'army black knights': 'army',
  'georgia tech yellow jackets': 'georgia-tech',
};

interface OddsApiConfig {
  baseUrl: string;
  timeoutMs: number;
  markets: string[];
}

interface TeamIndex {
  byId: Record<string, any>;
  byNameSlug: Record<string, string>;
  byMascotSlug: Record<string, string>;
  byNameMascotSlug: Record<string, string>;
  allTeams: Array<{id: string, name: string, mascot: string | null}>;
}

interface MatchStats {
  p0_exactId: number;
  p1_nameSlug: number;
  p2_alias: number;
  p3_stripMascot: number;
  p4_nameMascot: number;
  p5_fuzzy: number;
  failed: number;
  unmatchedNames: Set<string>;
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
  private matchStats: MatchStats = {
    p0_exactId: 0,
    p1_nameSlug: 0,
    p2_alias: 0,
    p3_stripMascot: 0,
    p4_nameMascot: 0,
    p5_fuzzy: 0,
    failed: 0,
    unmatchedNames: new Set()
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
   * Build team index from database with mascot awareness
   */
  private async buildTeamIndex(): Promise<void> {
    if (this.teamIndex) return; // Already built

    const teams = await prisma.team.findMany({
      select: { id: true, name: true, mascot: true }
    });

    const byId: Record<string, any> = {};
    const byNameSlug: Record<string, string> = {};
    const byMascotSlug: Record<string, string> = {};
    const byNameMascotSlug: Record<string, string> = {};
    const allTeams: Array<{id: string, name: string, mascot: string | null}> = [];

    for (const team of teams) {
      byId[team.id] = team;
      
      // Index by name slug
      const nameSlug = this.slugifyTeam(team.name);
      byNameSlug[nameSlug] = team.id;
      
      // Index by mascot slug (if exists)
      if (team.mascot) {
        const mascotSlug = this.slugifyTeam(team.mascot);
        if (!byMascotSlug[mascotSlug]) {
          byMascotSlug[mascotSlug] = team.id;
        }
        
        // Index by name + mascot combo
        const comboSlug = this.slugifyTeam(`${team.name} ${team.mascot}`);
        byNameMascotSlug[comboSlug] = team.id;
      }
      
      allTeams.push(team);
    }

    this.teamIndex = { byId, byNameSlug, byMascotSlug, byNameMascotSlug, allTeams };
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
   * Multi-pass team name resolution with mascot awareness
   */
  private resolveTeamId(oddsTeamName: string): string | null {
    if (!this.teamIndex) {
      throw new Error('Team index not built. Call buildTeamIndex() first.');
    }

    const normalized = this.normalizeName(oddsTeamName);
    const slugged = this.slugifyTeam(oddsTeamName);

    // P0: Exact ID match (rare but cheap)
    if (this.teamIndex.byId[oddsTeamName]) {
      this.matchStats.p0_exactId++;
      return oddsTeamName;
    }

    // P1: Exact name slug match
    if (this.teamIndex.byNameSlug[slugged]) {
      this.matchStats.p1_nameSlug++;
      return this.teamIndex.byNameSlug[slugged];
    }

    // P2: Alias → name slug
    if (TEAM_ALIASES[normalized]) {
      const aliasTarget = TEAM_ALIASES[normalized];
      const aliasSlug = this.slugifyTeam(aliasTarget);
      if (this.teamIndex.byNameSlug[aliasSlug]) {
        this.matchStats.p2_alias++;
        return this.teamIndex.byNameSlug[aliasSlug];
      }
    }

    // P3: Strip trailing word (likely mascot)
    // Try removing last word and see if remaining matches a team name
    const tokens = normalized.split(/\s+/);
    if (tokens.length >= 2) {
      const allButLast = tokens.slice(0, -1).join(' ');
      const nameSlug = this.slugifyTeam(allButLast);
      
      if (this.teamIndex.byNameSlug[nameSlug]) {
        this.matchStats.p3_stripMascot++;
        return this.teamIndex.byNameSlug[nameSlug];
      }
    }

    // P4: Name + Mascot combo
    if (this.teamIndex.byNameMascotSlug[slugged]) {
      this.matchStats.p4_nameMascot++;
      return this.teamIndex.byNameMascotSlug[slugged];
    }

    // P5: Conservative fuzzy matching (Jaccard ≥ 0.9)
    let bestMatch: {id: string, score: number} | null = null;
    const threshold = 0.9; // Very high threshold for safety

    for (const team of this.teamIndex.allTeams) {
      const teamNormalized = this.normalizeName(team.name);
      const score = this.jaccardSimilarity(normalized, teamNormalized);
      
      if (score >= threshold) {
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { id: team.id, score };
        } else if (score === bestMatch.score) {
          // Tie detected - reject for safety
          bestMatch = null;
          break;
        }
      }
    }

    if (bestMatch) {
      this.matchStats.p5_fuzzy++;
      return bestMatch.id;
    }

    // Failed to match
    this.matchStats.failed++;
    this.matchStats.unmatchedNames.add(oddsTeamName);
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
    this.matchStats = {
      p0_exactId: 0,
      p1_nameSlug: 0,
      p2_alias: 0,
      p3_stripMascot: 0,
      p4_nameMascot: 0,
      p5_fuzzy: 0,
      failed: 0,
      unmatchedNames: new Set()
    };
    
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
    console.log(`     Games matched: ${gamesMatched} (${Math.round(gamesMatched/eventsProcessed*100) || 0}%)`);
    console.log(`     Match breakdown:`);
    console.log(`       P0 (Exact ID): ${this.matchStats.p0_exactId}`);
    console.log(`       P1 (Name slug): ${this.matchStats.p1_nameSlug}`);
    console.log(`       P2 (Alias): ${this.matchStats.p2_alias}`);
    console.log(`       P3 (Strip mascot): ${this.matchStats.p3_stripMascot}`);
    console.log(`       P4 (Name+Mascot): ${this.matchStats.p4_nameMascot}`);
    console.log(`       P5 (Fuzzy): ${this.matchStats.p5_fuzzy}`);
    console.log(`     Failed: ${this.matchStats.failed}`);

    // Write unmatched report if any
    if (this.matchStats.unmatchedNames.size > 0) {
      await this.writeUnmatchedReport(season, weeks[0], this.matchStats.unmatchedNames);
    }

    return allLines;
  }

  /**
   * Write unmatched teams report
   */
  private async writeUnmatchedReport(season: number, week: number, unmatched: Set<string>): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const reportsDir = path.join(process.cwd(), 'reports');
      await fs.mkdir(reportsDir, { recursive: true });
      
      const report = {
        season,
        week,
        timestamp: new Date().toISOString(),
        unmatched: Array.from(unmatched).sort()
      };
      
      const reportPath = path.join(reportsDir, 'unmatched_oddsapi_teams.json');
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
      
      console.log(`   [ODDSAPI] 📝 Wrote unmatched teams report: ${reportPath}`);
      console.log(`   [ODDSAPI] ${unmatched.size} unmatched teams - review and add to TEAM_ALIASES`);
    } catch (error) {
      console.warn(`   [ODDSAPI] Failed to write unmatched report: ${(error as Error).message}`);
    }
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
    const currentYear = new Date().getFullYear();
    const currentWeek = this.getCurrentCFBWeek();
    const isHistorical = season < currentYear || (season === currentYear && week < currentWeek);
    
    if (isHistorical && options?.startDate) {
      // Use historical endpoint for past weeks
      console.log(`   [ODDSAPI] Using historical data endpoint for ${season} week ${week}`);
      return await this.fetchHistoricalOdds(season, week, options.startDate, options.endDate);
    } else {
      // Use live odds endpoint for current week
      console.log(`   [ODDSAPI] Using live odds endpoint for ${season} week ${week}`);
      console.log(`   [ODDSAPI] Note: Filtering by date range (${options?.startDate || 'N/A'} to ${options?.endDate || 'N/A'}) may not work on free tier`);
      return await this.fetchLiveOdds(season, week, options);
    }
  }

  /**
   * Get current CFB week (simplified - in production this would be more sophisticated)
   */
  private getCurrentCFBWeek(): number {
    // For now, hardcode to week 8 (as per the workflow changes)
    // In production, this would calculate based on the actual CFB calendar
    return 8;
  }

  /**
   * Fetch live odds from The Odds API
   */
  private async fetchLiveOdds(season: number, week: number, options?: { startDate?: string; endDate?: string }): Promise<{lines: any[], eventCount: number, matchedCount: number}> {
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

