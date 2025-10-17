/**
 * The Odds API Adapter
 *
 * Fetches NCAAF spreads, totals, and moneylines from The Odds API.
 * Requires ODDS_API_KEY environment variable.
 * Supports both live and historical odds data.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
// Team name aliases for common variations
const TEAM_ALIASES = {
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
export class OddsApiAdapter {
    constructor(config) {
        this.teamIndex = null;
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
     * Build team index from database with mascot awareness
     */
    buildTeamIndex() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.teamIndex)
                return; // Already built
            const teams = yield prisma.team.findMany({
                select: { id: true, name: true, mascot: true }
            });
            const byId = {};
            const byNameSlug = {};
            const byMascotSlug = {};
            const byNameMascotSlug = {};
            const allTeams = [];
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
            
            // Build set of existing game IDs for filtering
            const games = yield prisma.game.findMany({
                select: { id: true }
            });
            this.existingGameIds = new Set(games.map(g => g.id));
            console.log(`   [ODDSAPI] Built game index with ${games.length} existing games`);
        });
    }
    /**
     * Calculate Jaccard similarity between two strings (token-based)
     */
    jaccardSimilarity(str1, str2) {
        const tokens1 = new Set(str1.split(/\s+/));
        const tokens2 = new Set(str2.split(/\s+/));
        const intersection = new Set(Array.from(tokens1).filter(x => tokens2.has(x)));
        const union = new Set([...Array.from(tokens1), ...Array.from(tokens2)]);
        return union.size === 0 ? 0 : intersection.size / union.size;
    }
    /**
     * Resolve game by season + teams + date proximity (ignores week)
     */
    resolveGameBySeasonAndTeams(season, homeTeamId, awayTeamId, eventStart) {
        return __awaiter(this, void 0, void 0, function* () {
        try {
            // Query games by season only, filter by team match (either order)
            const candidateGames = yield prisma.game.findMany({
                where: {
                    season: season,
                    OR: [
                        { homeTeamId: homeTeamId, awayTeamId: awayTeamId },
                        { homeTeamId: awayTeamId, awayTeamId: homeTeamId }
                    ]
                },
                select: { id: true, date: true, homeTeamId: true, awayTeamId: true }
            });
            
            if (candidateGames.length === 0) {
                console.log(`   [DEBUG] No games found for season ${season}, teams ${awayTeamId} @ ${homeTeamId}`);
                return null;
            }
            
            // Find the game with the closest date to eventStart (within ±7 days)
            const eventDate = new Date(eventStart);
            let bestMatch = null;
            let bestDiff = Infinity;
            
            for (const game of candidateGames) {
                const gameDate = new Date(game.date);
                const diffDays = Math.abs((gameDate.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24));
                
                if (diffDays <= 7 && diffDays < bestDiff) {
                    bestMatch = game;
                    bestDiff = diffDays;
                }
            }
            
            if (bestMatch) {
                console.log(`   [DEBUG] Matched game ${bestMatch.id} (${bestDiff.toFixed(1)} days diff)`);
                return bestMatch.id;
            } else {
                console.log(`   [DEBUG] No games within ±7 days for season ${season}, teams ${awayTeamId} @ ${homeTeamId}, eventStart: ${eventStart}, candidates: ${candidateGames.length}`);
                return null;
            }
        } catch (error) {
            console.error(`   [ERROR] Failed to resolve game: ${error.message}`);
            return null;
        }
        });
    }
    /**
     * Track unmatched events for reporting
     */
    trackUnmatchedEvent(season, event, homeTeamId, awayTeamId) {
        if (!this.unmatchedEvents) {
            this.unmatchedEvents = [];
        }
        this.unmatchedEvents.push({
            season,
            eventStart: event.commence_time,
            oddsapi_home: event.home_team,
            oddsapi_away: event.away_team,
            matched_home_id: homeTeamId,
            matched_away_id: awayTeamId,
            candidateGamesFoundCount: 0 // Will be filled in by resolver if needed
        });
    }
    /**
     * Strip milliseconds from ISO string (Odds API requires no milliseconds)
     */
    toISOStringNoMs(date) {
        const iso = date.toISOString();
        return iso.replace(/\.\d{3}Z$/, 'Z'); // Remove .000Z and add back Z
    }

    /**
     * Fetch historical events for a given snapshot date
     */
    fetchHistoricalEvents(sport, snapshotDate, filters = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Strip milliseconds from snapshot date
                const cleanSnapshotDate = this.toISOStringNoMs(new Date(snapshotDate));
                
                // Build URL for historical events
                const url = `${this.baseUrl}/historical/sports/${sport}/events?apiKey=${this.apiKey}&date=${cleanSnapshotDate}&dateFormat=iso`;
                console.log(`   [HISTORICAL_EVENTS] Fetching events for ${sport} at ${snapshotDate}`);
                console.log(`   [HISTORICAL_EVENTS] URL: ${url.replace(this.apiKey, 'HIDDEN')}`);
                
                const response = yield fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Gridiron-Edge/1.0'
                    }
                });
                
                if (!response.ok) {
                    const errorBody = yield response.text();
                    console.error(`   [HISTORICAL_EVENTS] ERROR ${response.status} ${response.statusText} for ${url.replace(this.apiKey, 'HIDDEN')}`);
                    console.error(errorBody.slice(0, 800));
                    throw new Error(`Historical Events API error: ${response.status} ${response.statusText}`);
                }
                
                const data = yield response.json();
                
                // Log quota usage
                console.log(`   [HISTORICAL_EVENTS] Quota: ${response.headers.get('x-requests-remaining')} remaining, ${response.headers.get('x-requests-used')} used, last call cost: ${response.headers.get('x-requests-last')}`);
                
                // Extract events from response
                const events = data.data || [];
                console.log(`   [HISTORICAL_EVENTS] Found ${events.length} events at snapshot ${data.timestamp}`);
                
                // Apply optional filters
                let filteredEvents = events;
                if (filters.commenceTimeFrom || filters.commenceTimeTo) {
                    const fromTime = filters.commenceTimeFrom ? new Date(filters.commenceTimeFrom) : null;
                    const toTime = filters.commenceTimeTo ? new Date(filters.commenceTimeTo) : null;
                    
                    console.log(`   [HISTORICAL_EVENTS] Time window: ${fromTime ? fromTime.toISOString() : 'none'} to ${toTime ? toTime.toISOString() : 'none'}`);
                    
                    filteredEvents = events.filter(event => {
                        const commenceTime = new Date(event.commence_time);
                        const inWindow = (!fromTime || commenceTime >= fromTime) && (!toTime || commenceTime <= toTime);
                        if (!inWindow) {
                            console.log(`   [HISTORICAL_EVENTS] Filtered out: ${event.away_team} @ ${event.home_team} (${event.commence_time})`);
                        }
                        return inWindow;
                    });
                    
                    console.log(`   [HISTORICAL_EVENTS] Filtered to ${filteredEvents.length} events within time window`);
                }
                
                // Log first 5 events for debugging
                if (filteredEvents.length > 0) {
                    console.log(`   [HISTORICAL_EVENTS] Sample events:`);
                    filteredEvents.slice(0, 5).forEach((event, i) => {
                        console.log(`     ${i+1}. ${event.away_team} @ ${event.home_team} (${event.commence_time})`);
                    });
                }
                
                return {
                    timestamp: data.timestamp,
                    previous_timestamp: data.previous_timestamp,
                    next_timestamp: data.next_timestamp,
                    events: filteredEvents
                };
                
            } catch (error) {
                console.error(`   [HISTORICAL_EVENTS] Error: ${error.message}`);
                throw error;
            }
        });
    }
    /**
     * Fetch historical odds for a specific event
     */
    fetchHistoricalEventOdds(sport, eventId, snapshotDate, options = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const {
                    markets = 'h2h,spreads,totals',
                    regions = 'us',
                    oddsFormat = 'american',
                    dateFormat = 'iso'
                } = options;
                
                // Strip milliseconds from snapshot date
                const cleanSnapshotDate = this.toISOStringNoMs(new Date(snapshotDate));
                
                // Build URL for historical event odds
                const url = `${this.baseUrl}/historical/sports/${sport}/events/${eventId}/odds?apiKey=${this.apiKey}&regions=${regions}&markets=${markets}&oddsFormat=${oddsFormat}&dateFormat=${dateFormat}&date=${cleanSnapshotDate}`;
                console.log(`   [HISTORICAL_ODDS] Fetching odds for event ${eventId} at ${snapshotDate}`);
                console.log(`   [HISTORICAL_ODDS] URL: ${url.replace(this.apiKey, 'HIDDEN')}`);
                
                const response = yield fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Gridiron-Edge/1.0'
                    }
                });
                
                if (!response.ok) {
                    const errorBody = yield response.text();
                    console.error(`   [HISTORICAL_ODDS] ERROR ${response.status} ${response.statusText} for event ${eventId}`);
                    console.error(errorBody.slice(0, 800));
                    throw new Error(`Historical Event Odds API error: ${response.status} ${response.statusText}`);
                }
                
                const data = yield response.json();
                
                // Log quota usage
                const remaining = response.headers.get('x-requests-remaining');
                const used = response.headers.get('x-requests-used');
                const lastCost = response.headers.get('x-requests-last');
                console.log(`   [HISTORICAL_ODDS] Quota: ${remaining} remaining, ${used} used, last call cost: ${lastCost}`);
                
                // Calculate expected cost
                const marketCount = markets.split(',').length;
                const regionCount = regions.split(',').length;
                const expectedCost = 10 * marketCount * regionCount;
                console.log(`   [HISTORICAL_ODDS] Expected cost: ${expectedCost} credits (${marketCount} markets × ${regionCount} regions × 10)`);
                
                return {
                    timestamp: data.timestamp,
                    previous_timestamp: data.previous_timestamp,
                    next_timestamp: data.next_timestamp,
                    event: data.data
                };
                
            } catch (error) {
                console.error(`   [HISTORICAL_ODDS] Error for event ${eventId}: ${error.message}`);
                throw error;
            }
        });
    }
    /**
     * Map historical events to database games using team matching and date proximity
     */
    mapToDbGames(events, season) {
        return __awaiter(this, void 0, void 0, function* () {
            const mappings = [];
            const unmatchedEvents = [];
            
            console.log(`   [MAP_TO_DB] Mapping ${events.length} events to DB games for season ${season}`);
            
            for (const event of events) {
                try {
                    // Use existing team matching logic
                    const homeTeamId = this.resolveTeamId(event.home_team);
                    const awayTeamId = this.resolveTeamId(event.away_team);
                    
                    if (!homeTeamId || !awayTeamId) {
                        console.log(`   [MAP_TO_DB] Team matching failed: Away="${event.away_team}" (${awayTeamId}), Home="${event.home_team}" (${homeTeamId})`);
                        unmatchedEvents.push({
                            eventId: event.id,
                            home_team: event.home_team,
                            away_team: event.away_team,
                            commence_time: event.commence_time,
                            reason: 'team_matching_failed',
                            matched_home_id: homeTeamId,
                            matched_away_id: awayTeamId
                        });
                        continue;
                    }
                    
                    // Use season-only game resolver (ignores week)
                    const eventStart = event.commence_time || new Date().toISOString();
                    const gameId = yield this.resolveGameBySeasonAndTeams(season, homeTeamId, awayTeamId, eventStart);
                    
                    if (!gameId) {
                        console.log(`   [MAP_TO_DB] No game match found for event: ${event.away_team} @ ${event.home_team}`);
                        unmatchedEvents.push({
                            eventId: event.id,
                            home_team: event.home_team,
                            away_team: event.away_team,
                            commence_time: event.commence_time,
                            reason: 'game_resolution_failed',
                            matched_home_id: homeTeamId,
                            matched_away_id: awayTeamId
                        });
                        continue;
                    }
                    
                    // Successful mapping
                    mappings.push({
                        eventId: event.id,
                        gameId: gameId,
                        home_team: event.home_team,
                        away_team: event.away_team,
                        commence_time: event.commence_time,
                        matched_home_id: homeTeamId,
                        matched_away_id: awayTeamId,
                        reason: 'success'
                    });
                    
                    console.log(`   [MAP_TO_DB] Mapped event ${event.id} to game ${gameId}: ${event.away_team} @ ${event.home_team}`);
                    
                } catch (error) {
                    console.error(`   [MAP_TO_DB] Error mapping event ${event.id}: ${error.message}`);
                    unmatchedEvents.push({
                        eventId: event.id,
                        home_team: event.home_team,
                        away_team: event.away_team,
                        commence_time: event.commence_time,
                        reason: 'error',
                        error: error.message
                    });
                }
            }
            
            console.log(`   [MAP_TO_DB] Mapped ${mappings.length} events, ${unmatchedEvents.length} unmatched`);
            
            return {
                mappings,
                unmatchedEvents
            };
        });
    }
    /**
     * Write JSONL audit log for event mappings
     */
    writeEventMappingAudit(season, week, mappings, unmatchedEvents) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const fs = yield import('fs/promises');
                const path = yield import('path');
                
                // Ensure reports/historical directory exists
                const reportsDir = path.join(process.cwd(), 'reports', 'historical');
                yield fs.mkdir(reportsDir, { recursive: true });
                
                const filename = `map_${season}_w${week}.jsonl`;
                const filepath = path.join(reportsDir, filename);
                
                let content = '';
                
                // Write successful mappings
                for (const mapping of mappings) {
                    content += JSON.stringify({
                        type: 'mapping',
                        season,
                        week,
                        eventId: mapping.eventId,
                        gameId: mapping.gameId,
                        home_team: mapping.home_team,
                        away_team: mapping.away_team,
                        commence_time: mapping.commence_time,
                        matched_home_id: mapping.matched_home_id,
                        matched_away_id: mapping.matched_away_id,
                        reason: mapping.reason,
                        timestamp: new Date().toISOString()
                    }) + '\n';
                }
                
                // Write unmatched events
                for (const unmatched of unmatchedEvents) {
                    content += JSON.stringify({
                        type: 'unmatched',
                        season,
                        week,
                        eventId: unmatched.eventId,
                        home_team: unmatched.home_team,
                        away_team: unmatched.away_team,
                        commence_time: unmatched.commence_time,
                        reason: unmatched.reason,
                        matched_home_id: unmatched.matched_home_id,
                        matched_away_id: unmatched.matched_away_id,
                        error: unmatched.error,
                        timestamp: new Date().toISOString()
                    }) + '\n';
                }
                
                yield fs.writeFile(filepath, content);
                console.log(`   [AUDIT] Wrote event mapping audit to ${filepath}`);
                console.log(`   [AUDIT] ${mappings.length} successful mappings, ${unmatchedEvents.length} unmatched events`);
                
            } catch (error) {
                console.error(`   [AUDIT] Failed to write event mapping audit: ${error.message}`);
            }
        });
    }
    /**
     * Write error log for failed events
     */
    writeErrorLog(season, week, errorLog) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const fs = yield import('fs/promises');
                const path = yield import('path');
                
                // Ensure reports/historical directory exists
                const reportsDir = path.join(process.cwd(), 'reports', 'historical');
                yield fs.mkdir(reportsDir, { recursive: true });
                
                const filename = `errors_${season}_w${week}.jsonl`;
                const filepath = path.join(reportsDir, filename);
                
                let content = '';
                for (const error of errorLog) {
                    content += JSON.stringify(error) + '\n';
                }
                
                yield fs.writeFile(filepath, content);
                console.log(`   [ERROR_LOG] Wrote ${errorLog.length} errors to ${filepath}`);
                
            } catch (error) {
                console.error(`   [ERROR_LOG] Failed to write error log: ${error.message}`);
            }
        });
    }
    /**
     * Write unmatched events report
     */
    writeUnmatchedReport(season, week) {
        return __awaiter(this, void 0, void 0, function* () {
        if (!this.unmatchedEvents || this.unmatchedEvents.length === 0) {
            return;
        }
        try {
            const fs = require('fs');
            const path = require('path');
            const reportDir = path.join(process.cwd(), 'reports');
            if (!fs.existsSync(reportDir)) {
                fs.mkdirSync(reportDir, { recursive: true });
            }
            const reportPath = path.join(reportDir, `unmatched_oddsapi_${season}_w${week}.json`);
            const report = {
                season,
                week,
                timestamp: new Date().toISOString(),
                unmatched: this.unmatchedEvents.slice(0, 25) // First 25 misses
            };
            fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
            console.log(`   [ODDSAPI] 📝 Wrote unmatched events report: ${reportPath}`);
            console.log(`   [ODDSAPI] ${this.unmatchedEvents.length} unmatched events - review team matching`);
        } catch (error) {
            console.error(`   [ERROR] Failed to write unmatched report: ${error.message}`);
        }
        });
    }
    /**
     * Multi-pass team name resolution with mascot awareness
     */
    resolveTeamId(oddsTeamName) {
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
        let bestMatch = null;
        const threshold = 0.9; // Very high threshold for safety
        for (const team of this.teamIndex.allTeams) {
            const teamNormalized = this.normalizeName(team.name);
            const score = this.jaccardSimilarity(normalized, teamNormalized);
            if (score >= threshold) {
                if (!bestMatch || score > bestMatch.score) {
                    bestMatch = { id: team.id, score };
                }
                else if (score === bestMatch.score) {
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
    getName() {
        return 'TheOddsAPI';
    }
    isAvailable() {
        return __awaiter(this, void 0, void 0, function* () {
            return !!this.apiKey;
        });
    }
    /**
     * Odds API doesn't provide team roster
     */
    getTeams(season) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('⚠️  Odds API adapter does not provide team data. Teams will be created from games.');
            return [];
        });
    }
    /**
     * Odds API doesn't provide schedules separately
     */
    getSchedules(season, weeks) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('⚠️  Odds API adapter does not provide schedule data. Use CFBD or another adapter for schedules.');
            return [];
        });
    }
    /**
     * Fetch market lines (spreads, totals, moneylines) from The Odds API
     */
    getMarketLines(season, weeks, options) {
        return __awaiter(this, void 0, void 0, function* () {
            // Build team index from database for matching
            yield this.buildTeamIndex();
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
            // Reset unmatched events tracking
            this.unmatchedEvents = [];
            const allLines = [];
            let eventsProcessed = 0;
            let gamesMatched = 0;
            for (const week of weeks) {
                console.log(`📥 Fetching Odds API odds for ${season} Week ${week}...`);
                console.log(`   [DEBUG] About to call fetchOddsForWeek with season=${season}, week=${week}, options=`, options);
                try {
                    const { lines, eventCount, matchedCount } = yield this.fetchOddsForWeek(season, week, options);
                    allLines.push(...lines);
                    eventsProcessed += eventCount;
                    gamesMatched += matchedCount;
                    // Count spreads, totals, and moneylines
                    const spreads = lines.filter(l => l.lineType === 'spread').length;
                    const totals = lines.filter(l => l.lineType === 'total').length;
                    const moneylines = lines.filter(l => l.lineType === 'moneyline').length;
                    console.log(`   [ODDSAPI] Parsed counts — spread: ${spreads}, total: ${totals}, moneyline: ${moneylines}`);
                    console.log(`   ✅ Fetched ${spreads} spreads, ${totals} totals, ${moneylines} moneylines (oddsapi)`);
                    // Debug: Log sample rows for each market type
                    if (spreads > 0) {
                        const sampleSpread = lines.find(l => l.lineType === 'spread');
                        console.log(`   [DEBUG] Sample spread: gameId=${sampleSpread.gameId}, lineValue=${sampleSpread.lineValue}, bookName=${sampleSpread.bookName}, timestamp=${sampleSpread.timestamp}`);
                    }
                    if (totals > 0) {
                        const sampleTotal = lines.find(l => l.lineType === 'total');
                        console.log(`   [DEBUG] Sample total: gameId=${sampleTotal.gameId}, lineValue=${sampleTotal.lineValue}, bookName=${sampleTotal.bookName}, timestamp=${sampleTotal.timestamp}`);
                    }
                    if (moneylines > 0) {
                        const sampleML = lines.find(l => l.lineType === 'moneyline');
                        console.log(`   [DEBUG] Sample moneyline: gameId=${sampleML.gameId}, lineValue=${sampleML.lineValue}, bookName=${sampleML.bookName}, timestamp=${sampleML.timestamp}`);
                    }
                }
                catch (error) {
                    console.error(`   ❌ Error fetching Odds API odds for week ${week}:`, error.message);
                    // Continue with other weeks
                }
            }
            // Log matching statistics
            console.log(`   [ODDSAPI] Team matching stats:`);
            console.log(`     Events processed: ${eventsProcessed}`);
            console.log(`     Games matched: ${gamesMatched} (${Math.round(gamesMatched / eventsProcessed * 100) || 0}%)`);
            console.log(`     Match breakdown:`);
            console.log(`       P0 (Exact ID): ${this.matchStats.p0_exactId}`);
            console.log(`       P1 (Name slug): ${this.matchStats.p1_nameSlug}`);
            console.log(`       P2 (Alias): ${this.matchStats.p2_alias}`);
            console.log(`       P3 (Strip mascot): ${this.matchStats.p3_stripMascot}`);
            console.log(`       P4 (Name+Mascot): ${this.matchStats.p4_nameMascot}`);
            console.log(`       P5 (Fuzzy): ${this.matchStats.p5_fuzzy}`);
            console.log(`     Failed: ${this.matchStats.failed}`);
            // Write unmatched events report
            yield this.writeUnmatchedReport(season, weeks[0]);
            return allLines;
        });
    }
    /**
     * Write unmatched teams report
     */
    writeUnmatchedReport(season, week, unmatched) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const fs = yield import('fs/promises');
                const path = yield import('path');
                const reportsDir = path.join(process.cwd(), 'reports');
                yield fs.mkdir(reportsDir, { recursive: true });
                const report = {
                    season,
                    week,
                    timestamp: new Date().toISOString(),
                    unmatched: Array.from(unmatched).sort().slice(0, 20) // First 20 for debugging
                };
                const reportPath = path.join(reportsDir, `unmatched_oddsapi_${season}_w${week}.json`);
                yield fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
                console.log(`   [ODDSAPI] 📝 Wrote unmatched teams report: ${reportPath}`);
                console.log(`   [ODDSAPI] ${unmatched.size} unmatched teams - review and add to TEAM_ALIASES`);
            }
            catch (error) {
                console.warn(`   [ODDSAPI] Failed to write unmatched report: ${error.message}`);
            }
        });
    }
    /**
     * Return empty array for team branding
     */
    getTeamBranding() {
        return __awaiter(this, void 0, void 0, function* () {
            return [];
        });
    }
    /**
     * Fetch odds for a specific week
     */
    fetchOddsForWeek(season, week, options) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`   [ODDSAPI] Fetching odds for ${season} week ${week}`);
            
            // SCOPE GUARDS: Allow 2024 for testing, 2025 for production
            const allowedSeason = parseInt(process.env.HISTORICAL_ALLOWED_SEASON || '2025', 10);
            const allowedWeeksStr = process.env.HISTORICAL_ALLOWED_WEEKS || '2-7';
            const [minWeek, maxWeek] = allowedWeeksStr.split('-').map(n => parseInt(n, 10));
            
            // Allow 2024 for testing, 2025 for production
            if (season !== allowedSeason && season !== 2024) {
                throw new Error(`OUT_OF_SCOPE_SEASON: Only seasons ${allowedSeason} and 2024 (testing) are allowed. Requested: ${season}`);
            }
            
            if (week < minWeek || week > maxWeek) {
                throw new Error(`OUT_OF_SCOPE_WEEK: Only weeks ${minWeek}-${maxWeek} are allowed. Requested: week ${week}`);
            }
            
            console.log(`   [SCOPE] Validated: season ${season}, week ${week} (allowed: ${allowedSeason}, weeks ${minWeek}-${maxWeek})`);
            
            // Determine if this is historical data
            const currentYear = new Date().getFullYear();
            const currentWeek = this.getCurrentCFBWeek();
            const isHistorical = season < currentYear || (season === currentYear && week < currentWeek);
            
            // Check HISTORICAL_STRICT mode
            const historicalStrict = process.env.HISTORICAL_STRICT === 'true';
            
            console.log(`   [DEBUG] Historical check: season=${season}, currentYear=${currentYear}, week=${week}, currentWeek=${currentWeek}, isHistorical=${isHistorical}, HISTORICAL_STRICT=${historicalStrict}`);
            
            if (historicalStrict && isHistorical) {
                console.log(`   [HISTORICAL_STRICT] Historical mode enabled for ${season} week ${week} - MUST use historical endpoints`);
                // Use two-step historical process
                return yield this.fetchHistoricalOddsForWeek(season, week);
            } else if (isHistorical) {
                console.log(`   [WARNING] Historical data requested but HISTORICAL_STRICT=false, using historical endpoints anyway`);
                return yield this.fetchHistoricalOddsForWeek(season, week);
            } else {
                // Use live endpoint for current week
                console.log(`   [LIVE] Using live endpoint for current week ${season} week ${week}`);
                return yield this.fetchLiveOdds(season, week, options);
            }
        });
    }
    
    /**
     * Fetch historical odds using two-step process
     */
    fetchHistoricalOddsForWeek(season, week) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`   [HISTORICAL] Using two-step historical process for ${season} week ${week}`);
            
            // Step 1: Calculate date window from CFBD games (FBS only)
            const dateRange = yield this.calculateDateRangeFromGames(season, week);
            
            // Use a broader time window that includes the actual week
            const commenceTimeFrom = dateRange.startDate;
            // Extend the end date to include the following week (for Saturday games)
            const extendedEndDate = new Date(dateRange.endDate);
            extendedEndDate.setDate(extendedEndDate.getDate() + 7); // Add 7 days
            const commenceTimeTo = extendedEndDate.toISOString();
            
            // Calculate snapshot date: use Saturday of the week at 23:59:00Z for closing odds
            const games = yield prisma.game.findMany({
                where: { season: season, week: week },
                select: { date: true },
                orderBy: { date: 'desc' }
            });
            
            let snapshotDate;
            if (games.length > 0) {
                // Use Saturday of the week at 23:59:00Z for closing odds
                const maxKickoff = new Date(games[0].date);
                const saturday = new Date(maxKickoff);
                // Find the Saturday of that week
                const dayOfWeek = saturday.getDay();
                const daysToSaturday = (6 - dayOfWeek) % 7; // 6 = Saturday
                saturday.setDate(saturday.getDate() + daysToSaturday);
                saturday.setUTCHours(23, 59, 0, 0);
                snapshotDate = saturday.toISOString();
                console.log(`   [HISTORICAL] Calculated snapshot: Saturday ${saturday.toISOString().split('T')[0]} at 23:59:00Z = ${snapshotDate}`);
            } else {
                // Fallback: use the end of the date range
                console.warn(`   [HISTORICAL] No games found for ${season} week ${week}, using fallback snapshot`);
                const fallbackDate = new Date(dateRange.endDate);
                fallbackDate.setUTCHours(23, 59, 0, 0);
                snapshotDate = fallbackDate.toISOString();
            }
            
            console.log(`   [HISTORICAL] Date window: ${commenceTimeFrom} to ${commenceTimeTo}`);
            console.log(`   [HISTORICAL] Snapshot date: ${snapshotDate}`);
            
            // Step 2: Fetch historical events with retry logic for 422 errors
            let eventsResult = null;
            const snapshots = [
                snapshotDate,  // +30 minutes
                new Date(new Date(snapshotDate).getTime() + 5 * 60 * 1000).toISOString(),  // +35 minutes
                new Date(new Date(snapshotDate).getTime() + 10 * 60 * 1000).toISOString()  // +40 minutes
            ];
            
            for (let attempt = 0; attempt < snapshots.length; attempt++) {
                try {
                    const snapshot = snapshots[attempt];
                    console.log(`   [HISTORICAL] Attempt ${attempt + 1}/${snapshots.length}: Using snapshot ${snapshot}`);
                    
                    eventsResult = yield this.fetchHistoricalEvents('americanfootball_ncaaf', snapshot, {
                        commenceTimeFrom,
                        commenceTimeTo
                    });
                    
                    console.log(`   [HISTORICAL] Found ${eventsResult.events.length} events at snapshot ${eventsResult.timestamp}`);
                    break;  // Success!
                } catch (error) {
                    if (error.message.includes('422') || error.message.includes('INVALID_HISTORICAL_TIMESTAMP')) {
                        console.log(`   [HISTORICAL] 422 error on attempt ${attempt + 1}, will retry with next offset if available...`);
                        if (attempt === snapshots.length - 1) {
                            throw error;  // Last attempt failed, throw error
                        }
                    } else {
                        throw error;  // Non-422 error, throw immediately
                    }
                }
            }
            
            if (!eventsResult) {
                throw new Error('Failed to fetch historical events after all retry attempts');
            }
            
            // Step 3: Map events to database games
            const mappingResult = yield this.mapToDbGames(eventsResult.events, season);
            const { mappings, unmatchedEvents } = mappingResult;
            
            console.log(`   [HISTORICAL] Mapped ${mappings.length} events to DB games`);
            
            // Write audit log
            yield this.writeEventMappingAudit(season, week, mappings, unmatchedEvents);
            
            if (mappings.length === 0) {
                console.log(`   [HISTORICAL] No events mapped to DB games, skipping odds fetch`);
                return { lines: [], eventCount: 0, matchedCount: 0 };
            }
            
            // PRE-FLIGHT QUOTA CHECK
            const costPerEvent = 20; // spreads + totals only (2 markets × 1 region × 10)
            const estimatedCost = mappings.length * costPerEvent;
            const safetyBuffer = 3000;
            
            console.log(`   [QUOTA] Estimated cost: ${estimatedCost} credits for ${mappings.length} events`);
            console.log(`   [QUOTA] Safety buffer: ${safetyBuffer} credits`);
            
            // Step 4: Fetch odds for each mapped event
            const allLines = [];
            const errorLog = [];
            let totalCost = 0;
            
            console.log(`   [HISTORICAL] Fetching odds for ${mappings.length} mapped events`);
            
            for (let i = 0; i < mappings.length; i++) {
                const mapping = mappings[i];
                try {
                    console.log(`   [HISTORICAL] Processing event ${i+1}/${mappings.length}: ${mapping.eventId}`);
                    
                    // Use the event's commence_time as snapshot for closing odds
                    let eventSnapshotDate = mapping.commence_time;
                    let oddsResult = null;
                    let attempts = 0;
                    const maxAttempts = 3;
                    
                    // Retry logic for 422 errors
                    while (attempts < maxAttempts && !oddsResult) {
                        try {
                            const snapshotToUse = attempts === 0 ? eventSnapshotDate :
                                                 attempts === 1 ? new Date(new Date(eventSnapshotDate).getTime() + 5 * 60 * 1000).toISOString() :
                                                 new Date(new Date(eventSnapshotDate).getTime() + 10 * 60 * 1000).toISOString();
                            
                            console.log(`   [HISTORICAL] Attempt ${attempts + 1}/${maxAttempts}: snapshot ${snapshotToUse}`);
                            
                            oddsResult = yield this.fetchHistoricalEventOdds(
                                'americanfootball_ncaaf',
                                mapping.eventId,
                                snapshotToUse,
                                {
                                    markets: 'spreads,totals',  // NO MONEYLINE
                                    regions: 'us',
                                    oddsFormat: 'american',
                                    dateFormat: 'iso'
                                }
                            );
                            
                            break; // Success!
                        } catch (error) {
                            attempts++;
                            if (error.message.includes('422') || error.message.includes('INVALID_HISTORICAL_TIMESTAMP')) {
                                console.log(`   [HISTORICAL] 422 error, retrying with offset...`);
                                if (attempts >= maxAttempts) {
                                    throw error;
                                }
                            } else {
                                throw error;
                            }
                        }
                    }
                    
                    if (oddsResult && oddsResult.event) {
                        // Parse odds for this event
                        const eventLines = yield this.parseHistoricalEventOdds(oddsResult.event, mapping.gameId, season, week, oddsResult.timestamp);
                        allLines.push(...eventLines);
                        
                        // Track cost (20 credits per event for spreads+totals)
                        totalCost += 20;
                    }
                    
                    // Rate limiting - 250-400ms delay between requests
                    if (i < mappings.length - 1) {
                        yield new Promise(resolve => setTimeout(resolve, 300));
                    }
                    
                } catch (error) {
                    console.error(`   [HISTORICAL] Error fetching odds for event ${mapping.eventId}: ${error.message}`);
                    errorLog.push({
                        eventId: mapping.eventId,
                        gameId: mapping.gameId,
                        error: error.message,
                        timestamp: new Date().toISOString()
                    });
                }
            }
            
            // Write error log if any
            if (errorLog.length > 0) {
                yield this.writeErrorLog(season, week, errorLog);
            }
            
            console.log(`   [HISTORICAL] Total cost: ${totalCost} credits for ${mappings.length} events`);
            console.log(`   [HISTORICAL] Parsed ${allLines.length} total lines`);
            console.log(`   [HISTORICAL] Errors: ${errorLog.length} events failed`);
            
            return { lines: allLines, eventCount: mappings.length, matchedCount: mappings.length };
        });
    }
    /**
     * Parse historical event odds into market lines
     */
    parseHistoricalEventOdds(event, gameId, season, week, snapshotTimestamp) {
        return __awaiter(this, void 0, void 0, function* () {
            const lines = [];
            
            if (!event || !event.bookmakers) {
                return lines;
            }
            
            for (const bookmaker of event.bookmakers) {
                for (const market of bookmaker.markets) {
                    // SKIP MONEYLINE (h2h) - only process spreads and totals
                    if (market.key === 'spreads') {
                        // Spreads
                        for (const outcome of market.outcomes) {
                            lines.push({
                                gameId,
                                season,
                                week,
                                lineType: 'spread',
                                bookName: bookmaker.title,
                                source: 'oddsapi',
                                timestamp: snapshotTimestamp,
                                lineValue: outcome.point,
                                closingLine: true,
                                team: outcome.name === event.home_team ? 'home' : 'away'
                            });
                        }
                    } else if (market.key === 'totals') {
                        // Totals
                        for (const outcome of market.outcomes) {
                            lines.push({
                                gameId,
                                season,
                                week,
                                lineType: 'total',
                                bookName: bookmaker.title,
                                source: 'oddsapi',
                                timestamp: snapshotTimestamp,
                                lineValue: outcome.point,
                                closingLine: true,
                                team: outcome.name === 'Over' ? 'over' : 'under'
                            });
                        }
                    }
                }
            }
            
            return lines;
        });
    }
    /**
     * Calculate date range from CFBD games for a given season and week
     */
    calculateDateRangeFromGames(season, week) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Query games for the specific season and week
                const games = yield prisma.game.findMany({
                    where: {
                        season: season,
                        week: week
                    },
                    select: {
                        date: true
                    },
                    orderBy: {
                        date: 'asc'
                    }
                });
                
                if (games.length === 0) {
                    console.log(`   [WARNING] No games found for ${season} week ${week}, using fallback date range`);
                    // Fallback to a reasonable date range for the week
                    const weekStart = new Date(`${season}-08-01`); // Approximate start of CFB season
                    weekStart.setDate(weekStart.getDate() + (week - 1) * 7); // Add weeks
                    const weekEnd = new Date(weekStart);
                    weekEnd.setDate(weekEnd.getDate() + 6);
                    
                    return {
                        startDate: weekStart.toISOString(),
                        endDate: weekEnd.toISOString()
                    };
                }
                
                // Calculate date range with 2-day buffer
                const minDate = new Date(games[0].date);
                const maxDate = new Date(games[games.length - 1].date);
                
                // Add 2 days buffer before and after
                minDate.setDate(minDate.getDate() - 2); // 2 days before first game
                maxDate.setDate(maxDate.getDate() + 2); // 2 days after last game
                
                console.log(`   [DATE RANGE] Game dates: ${games[0].date} to ${games[games.length - 1].date}`);
                console.log(`   [DATE RANGE] Buffer dates: ${minDate.toISOString()} to ${maxDate.toISOString()}`);
                
                return {
                    startDate: minDate.toISOString(),
                    endDate: maxDate.toISOString()
                };
                
            } catch (error) {
                console.error(`   [ERROR] Failed to calculate date range: ${error.message}`);
                // Fallback to a reasonable date range
                const weekStart = new Date(`${season}-08-01`);
                weekStart.setDate(weekStart.getDate() + (week - 1) * 7);
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekEnd.getDate() + 6);
                
                return {
                    startDate: weekStart.toISOString(),
                    endDate: weekEnd.toISOString()
                };
            }
        });
    }
    /**
     * Get current CFB week (simplified - in production this would be more sophisticated)
     */
    getCurrentCFBWeek() {
        // For now, hardcode to week 8 (as per the workflow changes)
        // In production, this would calculate based on the actual CFB calendar
        return 8;
    }
    /**
     * Fetch live odds from The Odds API
     */
    fetchLiveOdds(season, week, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const lines = [];
            let eventCount = 0;
            let matchedCount = 0;
            // Build URL for NCAAF live odds
            const markets = this.config.markets.join(',');
            const url = `${this.baseUrl}/sports/americanfootball_ncaaf/odds?apiKey=${this.apiKey}&regions=us&markets=${markets}&oddsFormat=american`;
            console.log(`   [ODDSAPI] URL: ${url.replace(this.apiKey, 'HIDDEN')}`);
            try {
                const response = yield fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                    },
                    signal: AbortSignal.timeout(this.config.timeoutMs),
                });
                if (!response.ok) {
                    const errorBody = yield response.text();
                    console.error(`   [ODDSAPI] ERROR ${response.status} ${response.statusText} for ${url.replace(this.apiKey, 'HIDDEN')}`);
                    console.error(errorBody.slice(0, 800));
                    throw new Error(`Odds API error: ${response.status} ${response.statusText}`);
                }
                const events = yield response.json();
                eventCount = events.length;
                console.log(`   [ODDSAPI] Found ${events.length} events`);
                // Parse each event's odds with team matching
                for (const event of events) {
                    const eventLines = yield this.parseEventOdds(event, season, week);
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
        });
    }
    /**
     * Fetch historical odds from The Odds API
     */
    fetchHistoricalOdds(season, week, startDate, endDate) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`   [ODDSAPI] Using historical endpoint for ${season} week ${week}`);
            console.log(`   [ODDSAPI] Date window: ${startDate} to ${endDate || 'N/A'}`);
            const lines = [];
            let matchedCount = 0;
            let eventCount = 0;
            const markets = this.config.markets.join(',');
            // Use historical endpoint for past seasons
            // Try using a different approach - maybe the endpoint is different
            const testDate = '2024-12-01'; // Use a more recent date to test
            const url = `${this.baseUrl}/historical/sports/americanfootball_ncaaf/odds?apiKey=${this.apiKey}&regions=us&markets=${markets}&oddsFormat=american&date=${testDate}&sport=americanfootball_ncaaf`;
            console.log(`   [ODDSAPI] Historical URL: ${url.replace(this.apiKey, 'HIDDEN')}`);
            console.log(`   [ODDSAPI] Markets: ${markets}`);
            try {
                const response = yield fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                    },
                    signal: AbortSignal.timeout(this.config.timeoutMs),
                });
                if (!response.ok) {
                    const errorBody = yield response.text();
                    console.error(`   [ODDSAPI] ERROR ${response.status} ${response.statusText} for ${url.replace(this.apiKey, 'HIDDEN')}`);
                    console.error(errorBody.slice(0, 800));
                    throw new Error(`Odds API error: ${response.status} ${response.statusText}`);
                }
                const events = yield response.json();
                eventCount = events.length;
                console.log(`   [ODDSAPI] Found ${events.length} historical events`);
                // Parse each event's odds with team matching
                for (const event of events) {
                    const eventLines = yield this.parseEventOdds(event, season, week);
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
        });
    }
    /**
     * Parse event odds into MarketLine objects
     */
    parseEventOdds(event, season, week) {
        return __awaiter(this, void 0, void 0, function* () {
        const lines = [];
        // Resolve team names to CFBD team IDs
        const homeTeamId = this.resolveTeamId(event.home_team);
        const awayTeamId = this.resolveTeamId(event.away_team);
        // Skip if either team couldn't be matched
        if (!homeTeamId || !awayTeamId) {
            console.log(`   [DEBUG] Team matching failed: Away="${event.away_team}" (${awayTeamId}), Home="${event.home_team}" (${homeTeamId})`);
            // Track unmatched events for reporting
            this.trackUnmatchedEvent(season, event, homeTeamId, awayTeamId);
            return [];
        }
        
        // For historical data, use season + teams + date proximity resolver
        const currentYear = new Date().getFullYear();
        const currentWeek = this.getCurrentCFBWeek();
        const isHistorical = season < currentYear || (season === currentYear && week < currentWeek);
        
        // Check HISTORICAL_STRICT mode
        const historicalStrict = process.env.HISTORICAL_STRICT === 'true';
        if (historicalStrict && isHistorical) {
            console.log(`   [HISTORICAL_STRICT] Historical mode enabled for ${season} week ${week}`);
        }
        
        let gameId;
        if (isHistorical) {
            // Use season + teams + date proximity resolver for historical data
            const eventStart = event.commence_time || new Date().toISOString();
            gameId = yield this.resolveGameBySeasonAndTeams(season, homeTeamId, awayTeamId, eventStart);
            if (!gameId) {
                console.log(`   [DEBUG] No game match found for historical event: ${event.away_team} @ ${event.home_team}`);
                return [];
            }
        } else {
            // Use exact week match for current/live data
            gameId = `${season}-wk${week}-${awayTeamId}-${homeTeamId}`;
            if (!this.existingGameIds || !this.existingGameIds.has(gameId)) {
                console.log(`   [DEBUG] Game ${gameId} not found in database, skipping`);
                return [];
            }
        }
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
        });
    }
}
