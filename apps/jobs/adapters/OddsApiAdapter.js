"use strict";
/**
 * The Odds API Adapter
 *
 * Fetches NCAAF spreads, totals, and moneylines from The Odds API.
 * Requires ODDS_API_KEY environment variable.
 * Supports both live and historical odds data.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OddsApiAdapter = void 0;
class OddsApiAdapter {
    constructor(config) {
        this.config = config;
        // Check for API key
        this.apiKey = process.env.ODDS_API_KEY || '';
        if (!this.apiKey) {
            throw new Error('ODDS_API_KEY environment variable is required for Odds API adapter.\n' +
                'Get your API key from https://the-odds-api.com and add it to your .env file.');
        }
        // Use env override or config
        this.baseUrl = process.env.ODDS_API_BASE_URL || config.baseUrl;
        console.log(`[ODDSAPI] Base URL: ${this.baseUrl}`);
    }
    getName() {
        return 'TheOddsAPI';
    }
    async isAvailable() {
        return !!this.apiKey;
    }
    /**
     * Odds API doesn't provide team roster
     */
    async getTeams(season) {
        console.log('⚠️  Odds API adapter does not provide team data. Teams will be created from games.');
        return [];
    }
    /**
     * Odds API doesn't provide schedules separately
     */
    async getSchedules(season, weeks) {
        console.log('⚠️  Odds API adapter does not provide schedule data. Use CFBD or another adapter for schedules.');
        return [];
    }
    /**
     * Fetch market lines (spreads, totals, moneylines) from The Odds API
     */
    async getMarketLines(season, weeks, options) {
        const allLines = [];
        for (const week of weeks) {
            console.log(`📥 Fetching Odds API odds for ${season} Week ${week}...`);
            try {
                const lines = await this.fetchOddsForWeek(season, week, options);
                allLines.push(...lines);
                // Count spreads, totals, and moneylines
                const spreads = lines.filter(l => l.lineType === 'spread').length;
                const totals = lines.filter(l => l.lineType === 'total').length;
                const moneylines = lines.filter(l => l.lineType === 'moneyline').length;
                console.log(`   [ODDSAPI] Parsed counts — spread: ${spreads}, total: ${totals}, moneyline: ${moneylines}`);
                console.log(`   ✅ Fetched ${spreads} spreads, ${totals} totals, ${moneylines} moneylines (oddsapi)`);
            }
            catch (error) {
                console.error(`   ❌ Error fetching Odds API odds for week ${week}:`, error.message);
                // Continue with other weeks
            }
        }
        return allLines;
    }
    /**
     * Return empty array for team branding
     */
    async getTeamBranding() {
        return [];
    }
    /**
     * Fetch odds for a specific week
     */
    async fetchOddsForWeek(season, week, options) {
        const lines = [];
        // Determine if we need historical data
        const isHistorical = season < new Date().getFullYear() || options?.startDate;
        if (isHistorical && options?.startDate) {
            // Use historical endpoint
            console.log(`   [ODDSAPI] Using historical data endpoint for ${season} week ${week}`);
            return await this.fetchHistoricalOdds(season, week, options.startDate, options.endDate);
        }
        else {
            // Use live odds endpoint
            console.log(`   [ODDSAPI] Using live odds endpoint for ${season} week ${week}`);
            return await this.fetchLiveOdds(season, week);
        }
    }
    /**
     * Fetch live odds from The Odds API
     */
    async fetchLiveOdds(season, week) {
        const lines = [];
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
            const events = await response.json();
            console.log(`   [ODDSAPI] Found ${events.length} events`);
            // Parse each event's odds
            for (const event of events) {
                const eventLines = this.parseEventOdds(event, season, week);
                lines.push(...eventLines);
            }
        }
        catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw error;
        }
        return lines;
    }
    /**
     * Fetch historical odds from The Odds API
     */
    async fetchHistoricalOdds(season, week, startDate, endDate) {
        console.warn(`   [ODDSAPI] Historical endpoint requires a paid tier. Attempting to use live endpoint filtered by date...`);
        // For now, try the live endpoint - historical requires paid tier
        // In a production scenario, you would use:
        // GET /v4/historical/sports/americanfootball_ncaaf/odds?date={timestamp}&regions=us&markets={markets}
        const lines = [];
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
            const events = await response.json();
            // Filter events by date range if provided
            const filteredEvents = events.filter(event => {
                if (!startDate)
                    return true;
                const eventDate = new Date(event.commence_time);
                const start = new Date(startDate);
                const end = endDate ? new Date(endDate) : new Date(startDate);
                end.setDate(end.getDate() + 7); // Add 7 days if no end date
                return eventDate >= start && eventDate <= end;
            });
            console.log(`   [ODDSAPI] Found ${events.length} total events, ${filteredEvents.length} in date range`);
            // Parse each event's odds
            for (const event of filteredEvents) {
                const eventLines = this.parseEventOdds(event, season, week);
                lines.push(...eventLines);
            }
        }
        catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw error;
        }
        return lines;
    }
    /**
     * Parse event odds into MarketLine objects
     */
    parseEventOdds(event, season, week) {
        const lines = [];
        // Create a stable gameId from team names (match CFBD format)
        const homeTeam = event.home_team.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const awayTeam = event.away_team.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const gameId = `${season}-wk${week}-${awayTeam}-${homeTeam}`;
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
                        }
                        else {
                            // Debug: log missing price
                            console.warn(`   [ODDSAPI] Skipping moneyline outcome with undefined/null price: ${JSON.stringify(outcome).slice(0, 100)}`);
                        }
                    }
                }
                else if (market.key === 'spreads') {
                    // Spread
                    for (const outcome of market.outcomes) {
                        if (outcome.point !== undefined) {
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
                }
                else if (market.key === 'totals') {
                    // Total
                    for (const outcome of market.outcomes) {
                        if (outcome.point !== undefined) {
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
exports.OddsApiAdapter = OddsApiAdapter;
