"use strict";
/**
 * College Football Data (CFBD) Adapter
 *
 * Fetches real NCAAF schedules from CollegeFootballData API.
 * Requires CFBD_API_KEY environment variable.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CFBDAdapter = void 0;
class CFBDAdapter {
    constructor(config) {
        this.config = config;
        // Check for API key
        this.apiKey = process.env.CFBD_API_KEY || '';
        if (!this.apiKey) {
            throw new Error('CFBD_API_KEY environment variable is required for CFBD adapter.\n' +
                'Get your API key from https://collegefootballdata.com and add it to your .env file.');
        }
        this.baseUrl = process.env.CFBD_BASE_URL || config.baseUrl;
    }
    getName() {
        return 'CollegeFootballData';
    }
    async isAvailable() {
        return !!this.apiKey;
    }
    /**
     * CFBD doesn't provide a simple teams list endpoint in the way we need
     * Return empty array - teams will be created from schedules
     */
    async getTeams(season) {
        console.log('⚠️  CFBD adapter does not provide team data. Teams will be created from schedules.');
        return [];
    }
    /**
     * Fetch game schedules from CFBD API
     */
    async getSchedules(season, weeks) {
        const allGames = [];
        for (const week of weeks) {
            console.log(`📥 Fetching CFBD schedules for ${season} Week ${week}...`);
            try {
                const games = await this.fetchGamesForWeek(season, week);
                allGames.push(...games);
                console.log(`   ✅ Found ${games.length} games (cfbd)`);
            }
            catch (error) {
                console.error(`   ❌ Error fetching CFBD schedules for week ${week}:`, error.message);
            }
        }
        return allGames;
    }
    /**
     * CFBD doesn't provide market lines
     */
    async getMarketLines(season, weeks) {
        console.log('⚠️  CFBD adapter does not provide market lines. Use SGO or another adapter for odds.');
        return [];
    }
    /**
     * Fetch games for a specific week
     */
    async fetchGamesForWeek(season, week) {
        const games = [];
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
            const data = await response.json();
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
                    }
                    else {
                        console.warn(`   [CFBD] Skipping game ${cfbdGame.homeTeam} vs ${cfbdGame.awayTeam} - mapping returned null`);
                    }
                }
                catch (error) {
                    console.warn(`   ⚠️  Skipping game ${cfbdGame.homeTeam} vs ${cfbdGame.awayTeam}:`, error.message);
                }
            }
        }
        catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw error;
        }
        return games;
    }
    /**
     * Fetch venue details to get city/state information
     */
    async fetchVenues() {
        const venueMap = new Map();
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
                const venues = await response.json();
                for (const venue of venues) {
                    venueMap.set(venue.name.toLowerCase(), venue);
                }
            }
        }
        catch (error) {
            console.warn('   ⚠️  Could not fetch venue details, city/state may be missing');
        }
        return venueMap;
    }
    /**
     * Map CFBD game to our Game interface
     */
    mapCFBDGameToGame(cfbdGame, venueMap) {
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
        let status = 'scheduled';
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
            }
            else {
                console.warn(`   [CFBD] Venue details not found for: ${venueName}`);
            }
        }
        else {
            console.warn(`   [CFBD] No venue specified for game: ${cfbdGame.homeTeam} vs ${cfbdGame.awayTeam}`);
        }
        // Parse date
        const date = new Date(cfbdGame.startDate);
        const game = {
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
    normalizeTeamId(teamName) {
        if (!teamName)
            return '';
        return teamName
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }
}
exports.CFBDAdapter = CFBDAdapter;
