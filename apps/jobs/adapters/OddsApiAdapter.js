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
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
// Team name aliases for common variations
const TEAM_ALIASES = {
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
class OddsApiAdapter {
    constructor(config) {
        this.teamIndex = null;
        this.matchStats = {
            exactSlug: 0,
            alias: 0,
            fuzzy: 0,
            failed: 0
        };
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
    /**
     * Normalize team name for matching
     */
    normalizeName(name) {
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
    slugifyTeam(name) {
        return this.normalizeName(name)
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }
    /**
     * Build team index from database
     */
    async buildTeamIndex() {
        if (this.teamIndex)
            return; // Already built
        const teams = await prisma.team.findMany({
            select: { id: true, name: true, mascot: true }
        });
        const byId = {};
        const bySlug = {};
        const allTeams = [];
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
    jaccardSimilarity(str1, str2) {
        const tokens1 = new Set(str1.split(/\s+/));
        const tokens2 = new Set(str2.split(/\s+/));
        const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
        const union = new Set([...tokens1, ...tokens2]);
        return union.size === 0 ? 0 : intersection.size / union.size;
    }
    /**
     * Resolve Odds API team name to CFBD team ID
     */
    resolveTeamId(oddsTeamName) {
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
        let bestMatch = null;
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
        // Build team index from database for matching
        await this.buildTeamIndex();
        // Reset match stats
        this.matchStats = { exactSlug: 0, alias: 0, fuzzy: 0, failed: 0 };
        const allLines = [];
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
            }
            catch (error) {
                console.error(`   ❌ Error fetching Odds API odds for week ${week}:`, error.message);
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
    async getTeamBranding() {
        return [];
    }
    /**
     * Fetch odds for a specific week
     */
    async fetchOddsForWeek(season, week, options) {
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
            const events = await response.json();
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
        }
        catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw error;
        }
        return { lines, eventCount, matchedCount };
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
        }
        catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw error;
        }
        return { lines, eventCount, matchedCount };
    }
    /**
     * Parse event odds into MarketLine objects
     */
    parseEventOdds(event, season, week) {
        const lines = [];
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
                }
                else if (market.key === 'totals') {
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
exports.OddsApiAdapter = OddsApiAdapter;
