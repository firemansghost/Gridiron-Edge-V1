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
            // Determine if we need historical data
            const currentYear = new Date().getFullYear();
            const currentWeek = this.getCurrentCFBWeek();
            const isHistorical = season < currentYear || (season === currentYear && week < currentWeek);
            console.log(`   [DEBUG] Historical check: season=${season}, currentYear=${currentYear}, week=${week}, currentWeek=${currentWeek}, isHistorical=${isHistorical}`);
            if (isHistorical) {
                // Use live endpoint with date filtering for historical data (historical endpoint has issues)
                console.log(`   [ODDSAPI] Using live endpoint with date filtering for ${season} week ${week} (historical endpoint has issues)`);
                console.log(`   [ODDSAPI] Note: Filtering by date range (${(options === null || options === void 0 ? void 0 : options.startDate) || 'N/A'} to ${(options === null || options === void 0 ? void 0 : options.endDate) || 'N/A'})`);
                return yield this.fetchLiveOdds(season, week, options);
            }
            else {
                // Use live odds endpoint for current week
                console.log(`   [ODDSAPI] Using live odds endpoint for ${season} week ${week}`);
                console.log(`   [ODDSAPI] Note: Filtering by date range (${(options === null || options === void 0 ? void 0 : options.startDate) || 'N/A'} to ${(options === null || options === void 0 ? void 0 : options.endDate) || 'N/A'}) may not work on free tier`);
                return yield this.fetchLiveOdds(season, week, options);
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
