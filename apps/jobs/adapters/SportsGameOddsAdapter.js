"use strict";
/**
 * SportsGameOdds Adapter
 *
 * Fetches NCAAF spreads and totals from SportsGameOdds API.
 * Requires SGO_API_KEY environment variable.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SportsGameOddsAdapter = void 0;
class SportsGameOddsAdapter {
    constructor(config) {
        this.config = config;
        // Check for API key
        this.apiKey = process.env.SGO_API_KEY || '';
        if (!this.apiKey) {
            throw new Error('SGO_API_KEY environment variable is required for SportsGameOdds adapter.\n' +
                'Get your API key from https://sportsgameodds.com and add it to your .env file.');
        }
        // Use env override or config
        this.baseUrl = process.env.SGO_BASE_URL || config.baseUrl;
    }
    getName() {
        return 'SportsGameOdds';
    }
    async isAvailable() {
        return !!this.apiKey;
    }
    /**
     * SGO doesn't provide team roster, so we return empty array.
     * Teams will be created as stubs during game ingestion.
     */
    async getTeams(season) {
        console.log('⚠️  SGO adapter does not provide team data. Teams will be created from games.');
        return [];
    }
    /**
     * SGO doesn't provide schedules, only odds.
     * Return empty array - schedules should come from another adapter.
     */
    async getSchedules(season, weeks) {
        console.log('⚠️  SGO adapter does not provide schedule data. Use CFBD or another adapter for schedules.');
        return [];
    }
    /**
     * Fetch market lines (spreads, totals, moneylines) from SGO API
     */
    async getMarketLines(season, weeks) {
        const allLines = [];
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
            }
            catch (error) {
                console.error(`   ❌ Error fetching SGO odds for week ${week}:`, error.message);
                // Continue with other weeks
            }
        }
        return allLines;
    }
    /**
     * Fetch odds for a specific week
     */
    async fetchOddsForWeek(season, week) {
        const lines = [];
        // SGO API endpoint structure (adjust based on actual API docs)
        // Example: GET /v2/odds?league=NCAAF&season=2024&week=1
        const url = `${this.baseUrl}/odds?league=${this.config.league}&season=${season}&week=${week}`;
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
        const games = Array.isArray(data) ? data : data.games || [];
        // Process each game
        for (const game of games) {
            const gameId = this.buildGameId(game, season, week);
            if (!gameId) {
                console.warn(`   ⚠️  Skipping game with missing teams: ${JSON.stringify(game)}`);
                continue;
            }
            // Process bookmakers
            const bookmakers = game.bookmakers || [];
            for (const bookmaker of bookmakers) {
                const bookName = this.normalizeBookName(bookmaker.key || bookmaker.title);
                // Skip if not in our configured books list
                if (this.config.books.length > 0 && !this.config.books.includes(bookName)) {
                    continue;
                }
                // Process markets (spreads, totals)
                const markets = bookmaker.markets || [];
                for (const market of markets) {
                    const marketLines = this.parseMarket(market, gameId, season, week, bookName, game.commence_time);
                    lines.push(...marketLines);
                }
            }
        }
        return lines;
    }
    /**
     * Build a game ID from team names
     */
    buildGameId(game, season, week) {
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
    normalizeTeamId(teamName) {
        return teamName
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }
    /**
     * Normalize book name
     */
    normalizeBookName(bookKey) {
        const normalized = bookKey.toLowerCase().replace(/[^a-z0-9]+/g, '');
        // Map common variations
        const bookMap = {
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
     * Parse a market (spread, total, or moneyline) into MarketLine objects
     */
    parseMarket(market, gameId, season, week, bookName, commenceTime) {
        const lines = [];
        const marketKey = market.key?.toLowerCase() || '';
        const timestamp = commenceTime ? new Date(commenceTime) : new Date();
        // Determine line type
        let lineType = null;
        if (marketKey.includes('spread') || marketKey.includes('h2h_handicap')) {
            lineType = 'spread';
        }
        else if (marketKey.includes('total') || marketKey.includes('over_under')) {
            lineType = 'total';
        }
        else if (marketKey.includes('h2h') || marketKey === 'moneyline') {
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
        }
        else if (lineType === 'total') {
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
        }
        else if (lineType === 'moneyline') {
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
    async getTeamBranding() {
        return [];
    }
}
exports.SportsGameOddsAdapter = SportsGameOddsAdapter;
