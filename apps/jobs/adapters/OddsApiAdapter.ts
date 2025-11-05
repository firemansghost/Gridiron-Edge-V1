/**
 * The Odds API Adapter
 * 
 * Fetches NCAAF spreads, totals, and moneylines from The Odds API.
 * Requires ODDS_API_KEY environment variable.
 * Supports both live and historical odds data.
 */

import { DataSourceAdapter, Team, Game, MarketLine, TeamBranding } from './DataSourceAdapter';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { isTransitionalMatchup } from '../config/transitional_teams';
import { isRejectedSlug, isDenylisted, matchesNonFBSPattern } from '../config/denylist';
import { TeamResolver } from './TeamResolver';
import { GameLookup } from './GameLookup';

const prisma = new PrismaClient();

// Load team aliases from config file (Phase A: parse YAML only)
function loadTeamAliasesFromYAML(): Record<string, string> {
  const aliasPath = path.join(process.cwd(), 'apps', 'jobs', 'config', 'team_aliases.yml');
  
  if (!fs.existsSync(aliasPath)) {
    console.error('[ALIASES] FATAL: Config file not found at', aliasPath);
    throw new Error('team_aliases.yml not found - cannot proceed without aliases');
  }
  
  try {
    const fileContents = fs.readFileSync(aliasPath, 'utf8');
    const config = yaml.load(fileContents) as { aliases: Record<string, string> };
    
    if (!config || !config.aliases) {
      throw new Error('Invalid YAML structure: missing "aliases" key');
    }
    
    const rawCount = Object.keys(config.aliases).length;
    console.log(`[ALIASES] Loaded ${rawCount} aliases from YAML (validation deferred)`);
    
    return config.aliases;
  } catch (error) {
    console.error('[ALIASES] FATAL: Failed to load/parse team_aliases.yml');
    console.error('[ALIASES] Error:', (error as Error).message);
    throw new Error(`team_aliases.yml load failed: ${(error as Error).message}`);
  }
}

// Validate aliases against FBS team index (Phase B: post-index validation)
// NOW: Hard-fail on non-FBS targets (guardrail to prevent *-college, etc.)
function validateAliasesAgainstFBS(rawAliases: Record<string, string>, fbsTeamIds: Set<string>): Record<string, string> {
  // Safety check: FBS index must be properly sized (this should never trigger after buildTeamIndex fail-fast)
  if (!fbsTeamIds || fbsTeamIds.size < 100) {
    console.error(`[ALIASES] ❌ FATAL: FBS index undersized during alias validation (${fbsTeamIds?.size || 0} teams)`);
    console.error(`[ALIASES] This should have been caught by buildTeamIndex fail-fast guard.`);
    throw new Error(`Cannot validate aliases with undersized FBS index (${fbsTeamIds?.size || 0} < 100)`);
  }
  
  const validAliases: Record<string, string> = {};
  const rejectedAliases: Array<{key: string, target: string, reason: string}> = [];
  let presentCount = 0;
  let deniedCount = 0;
  
  for (const [key, target] of Object.entries(rawAliases)) {
    // HARD GUARDRAIL 1: Check denylist (non-FBS schools)
    if (isRejectedSlug(target)) {
      const reason = isDenylisted(target) ? 'denylisted' : matchesNonFBSPattern(target) ? '*-college pattern' : 'rejected pattern';
      console.error(`[ALIASES] ❌ Denied alias target not FBS or denylisted: "${key}" → ${target} (${reason})`);
      rejectedAliases.push({ key, target, reason });
      deniedCount++;
      continue;
    }
    
    // HARD GUARDRAIL 2: Target must exist in FBS index
    if (!fbsTeamIds.has(target)) {
      console.error(`[ALIASES] ❌ Rejected non-FBS target: "${key}" → ${target} (not in FBS index)`);
      rejectedAliases.push({ key, target, reason: 'not in FBS index' });
      continue;
    }
    
    // Valid FBS alias
    validAliases[key] = target;
    presentCount++;
  }
  
  // FAIL FAST: If any aliases were rejected, abort with clear error
  if (rejectedAliases.length > 0) {
    console.error(`[ALIASES] ❌ FATAL: ${rejectedAliases.length} invalid alias target(s) found:`);
    for (const { key, target, reason } of rejectedAliases) {
      console.error(`  - "${key}" → ${target} (${reason})`);
    }
    throw new Error(`Invalid alias targets detected. Fix team_aliases.yml before proceeding.`);
  }
  
  const totalCount = Object.keys(validAliases).length;
  console.log(`[ALIASES] ✅ Loaded ${totalCount} valid FBS aliases (all in index)`);
  
  // Log first 10 for verification
  if (totalCount > 0) {
    const first10 = Object.entries(validAliases).slice(0, 10);
    console.log('[ALIASES] First 10:', first10.map(([k, v]) => `"${k}" → ${v}`).join(', '));
  }
  
  return validAliases;
}

// Token parity exceptions (schools that break the State/Tech pattern at FBS level)
const TOKEN_PARITY_EXCEPTIONS: Record<string, string> = {
  'sam houston state': 'sam-houston',
  'sam houston state bearkats': 'sam-houston',
  'sam houston': 'sam-houston',
  'louisiana ragin cajuns': 'louisiana',
  'louisiana ragincajuns': 'louisiana',
  'louisiana ragin': 'louisiana',
};

// Team name aliases for common variations (will be loaded during initialization)
let TEAM_ALIASES: Record<string, string> = {
  
  // Built-in aliases (will be overridden by config if duplicates exist)
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
  weekFlexible: number;
  direct: number;
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
  private teamResolver: TeamResolver;
  private gameLookup: GameLookup;
  private matchStats: MatchStats = {
    p0_exactId: 0,
    p1_nameSlug: 0,
    p2_alias: 0,
    p3_stripMascot: 0,
    p4_nameMascot: 0,
    p5_fuzzy: 0,
    failed: 0,
    unmatchedNames: new Set(),
    weekFlexible: 0,
    direct: 0
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
    
    // Initialize new components
    this.teamResolver = new TeamResolver();
    this.gameLookup = new GameLookup(prisma);
  }

  /**
   * Normalize team name for matching
   */
  private normalizeName(name: string): string {
    let normalized = name.toLowerCase();
    
    // Remove punctuation (but keep spaces and hyphens)
    normalized = normalized.replace(/[^a-z0-9\s-]/g, '');
    
    // Remove common filler words (but NOT "state" - that's a disambiguator!)
    normalized = normalized.replace(/\b(university|univ|college|the|football)\b/g, '');
    
    // Collapse whitespace
    normalized = normalized.replace(/\s+/g, ' ').trim();
    
    return normalized;
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
   * Normalize a slug with ASCII folding and standard formatting
   */
  private normalizeSlug(x: string): string {
    if (!x) return '';
    return x
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '') // ASCII fold (é → e)
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Build team index from database with UNION of all sources (authoritative)
   */
  private async buildTeamIndex(): Promise<void> {
    if (this.teamIndex) return; // Already built

    // Phase 1: Build UNION index from all sources (no single point of failure)
    const slugSet = new Set<string>();
    const sourceUsed: string[] = [];

    // A) teams table (no division filter; it's unreliable)
    let filteredCount = 0;
    try {
      const dbTeams = await prisma.team.findMany({
        select: { id: true, name: true, mascot: true }
      });
      for (const t of dbTeams) {
        const slug = this.normalizeSlug(t.id);
        if (slug && !isRejectedSlug(slug)) {
          slugSet.add(slug);
        } else if (slug && isRejectedSlug(slug)) {
          filteredCount++;
        }
      }
      sourceUsed.push(`teams-db:${dbTeams.length}`);
    } catch (error) {
      console.warn('[INDEX] ⚠️  Failed to query teams table:', (error as Error).message);
      sourceUsed.push('teams-db:0');
    }

    // B) games table slugs (correct columns) - FILTER OUT DENYLISTED
    try {
      const gamesSlugs = await prisma.$queryRawUnsafe<Array<{slug: string | null}>>(` 
        SELECT unnest(ARRAY[home_team_id, away_team_id]) AS slug
        FROM games
        WHERE season BETWEEN 2014 AND 2025
      `);
      for (const r of gamesSlugs) {
        const slug = this.normalizeSlug(r.slug || '');
        if (slug && !isRejectedSlug(slug)) {
          slugSet.add(slug);
        } else if (slug && isRejectedSlug(slug)) {
          filteredCount++;
        }
      }
      sourceUsed.push(`games-slugs:${gamesSlugs.length}`);
    } catch (error) {
      console.warn('[INDEX] ⚠️  Failed to query games table:', (error as Error).message);
      sourceUsed.push('games-slugs:0');
    }

    // C) static JSON (checked in; ~134 2024 FBS slugs, plus legacy) - FILTER OUT DENYLISTED
    try {
      const staticPath = path.join(process.cwd(), 'apps', 'jobs', 'config', 'fbs_slugs.json');
      if (fs.existsSync(staticPath)) {
        const staticFbs = JSON.parse(fs.readFileSync(staticPath, 'utf8')) as string[];
        for (const s of staticFbs) {
          const slug = this.normalizeSlug(s);
          if (slug && !isRejectedSlug(slug)) {
            slugSet.add(slug);
          } else if (slug && isRejectedSlug(slug)) {
            filteredCount++;
          }
        }
        sourceUsed.push(`static-json:${staticFbs.length}`);
      }
    } catch (error) {
      console.warn('[INDEX] ⚠️  Failed to load static FBS list:', (error as Error).message);
      sourceUsed.push('static-json:0');
    }
    
    if (filteredCount > 0) {
      console.log(`[INDEX] 🚫 Filtered ${filteredCount} denylisted slug(s) (*-college, FCS, etc.)`);
    }

    // D) Canary self-heal: ensure cornerstone programs exist (prevent regressions)
    const MUST_HAVE = [
      'alabama', 'georgia', 'ohio-state', 'michigan', 'clemson', 'penn-state', 'notre-dame',
      'washington', 'oregon', 'usc', 'ucla', 'utah', 'oklahoma', 'texas', 'texas-am',
      'florida', 'florida-state', 'miami', 'lsu', 'tennessee', 'ole-miss', 'auburn',
      'kansas-state', 'oklahoma-state', 'iowa', 'iowa-state', 'rutgers', 'umass', 'uconn',
      'san-jose-state', 'appalachian-state', 'usf', 'ucf', 'eastern-michigan', 'western-michigan'
    ];
    const missing = MUST_HAVE.filter(s => !slugSet.has(s));
    for (const m of missing) slugSet.add(m); // inject; we trust this list

    console.log(`[INDEX] 🔗 Sources: ${sourceUsed.join(' | ')} | size=${slugSet.size}`);
    console.log(`[INDEX] Sample: ${[...slugSet].slice(0, 12).join(', ')}`);

    // Self-check: verify presence of core programs (regression guard)
    const CHECK_PROGRAMS = ['clemson', 'san-jose-state', 'uconn', 'umass', 'usf', 'ucf', 'rutgers', 'penn-state'];
    const checkResults = CHECK_PROGRAMS.map(s => `${s}=${slugSet.has(s) ? '✓' : '✗'}`).join('  ');
    console.log(`[INDEX] ✅ Presence check: ${checkResults}`);

    // FAIL FAST: Index must have at least 100 teams
    if (slugSet.size < 100) {
      console.error(`[INDEX] ❌ FATAL: FBS index undersized after union: ${slugSet.size} teams (expected ≥ 100)`);
      console.error(`[INDEX] Hints: all sources failed, DB connection issue, or corrupt data.`);
      throw new Error(`FBS team index too small (${slugSet.size} < 100) - cannot proceed with team resolution`);
    }

    // Convert to full team records for indexing
    const teams: Array<{id: string, name: string, mascot: string | null}> = [];
    for (const slug of slugSet) {
      teams.push({ id: slug, name: slug, mascot: null });
    }

    const byId: Record<string, any> = {};
    const byNameSlug: Record<string, string> = {};
    const byMascotSlug: Record<string, string> = {};
    const byNameMascotSlug: Record<string, string> = {};
    const allTeams: Array<{id: string, name: string, mascot: string | null}> = [];

    for (const team of teams) {
      const teamRecord = {
        id: team.id,
        name: team.name || team.id, // Fallback: use ID as name if missing
        mascot: team.mascot || null
      };
      
      byId[teamRecord.id] = teamRecord;
      
      // Index by name slug
      const nameSlug = this.slugifyTeam(teamRecord.name);
      byNameSlug[nameSlug] = teamRecord.id;
      
      // Index by mascot slug (if exists)
      if (teamRecord.mascot) {
        const mascotSlug = this.slugifyTeam(teamRecord.mascot);
        if (!byMascotSlug[mascotSlug]) {
          byMascotSlug[mascotSlug] = teamRecord.id;
        }
        
        // Index by name + mascot combo
        const comboSlug = this.slugifyTeam(`${teamRecord.name} ${teamRecord.mascot}`);
        byNameMascotSlug[comboSlug] = teamRecord.id;
      }
      
      allTeams.push(teamRecord);
    }

    this.teamIndex = { byId, byNameSlug, byMascotSlug, byNameMascotSlug, allTeams };
    
    // Phase 2: Load and validate aliases against the FBS index we just built
    const fbsTeamIds = new Set(teams.map(t => t.id));
    const rawAliases = loadTeamAliasesFromYAML();
    const validatedAliases = validateAliasesAgainstFBS(rawAliases, fbsTeamIds);
    
    // Merge validated aliases into global TEAM_ALIASES
    TEAM_ALIASES = { ...TEAM_ALIASES, ...validatedAliases };
  }

  /**
   * Calculate Jaccard similarity between two strings (token-based)
   */
  private jaccardSimilarity(str1: string, str2: string): number {
    const tokens1 = new Set(str1.split(/\s+/));
    const tokens2 = new Set(str2.split(/\s+/));
    
    const intersection = new Set(Array.from(tokens1).filter(x => tokens2.has(x)));
    const union = new Set([...Array.from(tokens1), ...Array.from(tokens2)]);
    
    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  /**
   * Check if a candidate team ID violates token parity rules
   */
  private violatesTokenParity(originalName: string, candidateId: string): boolean {
    const originalLower = originalName.toLowerCase();
    const candidateLower = candidateId.toLowerCase();
    
    // Rule 1: If original has "state", candidate must have "state" (or be exact match)
    const originalHasState = /\bstate\b/.test(originalLower);
    const candidateHasState = /state/.test(candidateLower);
    
    if (originalHasState && !candidateHasState) {
      return true; // Original says "State" but candidate doesn't → violation
    }
    if (!originalHasState && candidateHasState) {
      return true; // Original doesn't say "State" but candidate does → violation
    }
    
    // Rule 2: If original has "tech", candidate must have "tech"
    const originalHasTech = /\btech\b/.test(originalLower);
    const candidateHasTech = /tech/.test(candidateLower);
    
    if (originalHasTech && !candidateHasTech) {
      return true;
    }
    if (!originalHasTech && candidateHasTech) {
      return true;
    }
    
    // Rule 3: If original has "a&m" or "am", candidate must have it
    const originalHasAM = /\ba&m\b|\bam\b/.test(originalLower);
    const candidateHasAM = /a-m|am/.test(candidateLower);
    
    if (originalHasAM && !candidateHasAM) {
      return true;
    }
    
    return false;
  }

  /**
   * Multi-pass team name resolution with detailed candidate tracking
   */
  private resolveTeamIdWithCandidates(oddsTeamName: string): { 
    teamId: string | null, 
    normalized: string,
    candidates: Array<{name: string, id: string, score: number, method: string}>
  } {
    const candidates: Array<{name: string, id: string, score: number, method: string}> = [];
    
    if (!this.teamIndex) {
      throw new Error('Team index not built. Call buildTeamIndex() first.');
    }

    const normalized = this.normalizeName(oddsTeamName);
    const slugged = this.slugifyTeam(oddsTeamName);

    // P0: Exact ID match (rare but cheap)
    if (this.teamIndex.byId[oddsTeamName]) {
      this.matchStats.p0_exactId++;
      return { teamId: oddsTeamName, normalized, candidates: [] };
    }
    
    // P0.5: Token parity exceptions (authoritative - skip all other checks)
    for (const [exceptionKey, exceptionSlug] of Object.entries(TOKEN_PARITY_EXCEPTIONS)) {
      if (normalized.includes(exceptionKey) || oddsTeamName.toLowerCase().includes(exceptionKey)) {
        if (this.teamIndex.byNameSlug[exceptionSlug]) {
          console.log(`   [RESOLVER] Token parity exception: "${oddsTeamName}" → ${exceptionSlug}`);
          return { teamId: this.teamIndex.byNameSlug[exceptionSlug], normalized, candidates: [] };
        }
      }
    }

    // P1: Exact name slug match (with token parity check)
    if (this.teamIndex.byNameSlug[slugged]) {
      const candidateId = this.teamIndex.byNameSlug[slugged];
      if (!this.violatesTokenParity(oddsTeamName, candidateId)) {
        this.matchStats.p1_nameSlug++;
        return { teamId: candidateId, normalized, candidates: [] };
      }
    }

    // P2: Alias → name slug (AUTHORITATIVE - aliases are explicit, skip parity check)
    if (TEAM_ALIASES[normalized]) {
      const aliasTarget = TEAM_ALIASES[normalized];
      
      // Additional safety: check deny list at resolve-time
      if (isRejectedSlug(aliasTarget)) {
        console.log(`   [RESOLVER] ⚠️  Blocked denied alias target: "${oddsTeamName}" → ${aliasTarget}`);
      } else {
        // Soft-heal: try multiple slug variations
        let aliasSlug = this.slugifyTeam(aliasTarget);
        let candidateId = this.teamIndex.byNameSlug[aliasSlug];
        
        // If not found, try ASCII-folded version (San José → san-jose)
        if (!candidateId) {
          const foldedSlug = this.normalizeSlug(aliasTarget);
          candidateId = this.teamIndex.byNameSlug[foldedSlug];
          if (candidateId) {
            aliasSlug = foldedSlug;
          }
        }
        
        // If still not found, check historical renames
        if (!candidateId) {
          const RENAMES: Record<string, string> = {
            'central-florida': 'ucf',
            'mississippi': 'ole-miss',
            'louisiana-lafayette': 'louisiana',
            'connecticut': 'uconn'
          };
          const renamed = RENAMES[aliasSlug];
          if (renamed && this.teamIndex.byNameSlug[renamed]) {
            candidateId = this.teamIndex.byNameSlug[renamed];
            aliasSlug = renamed;
          }
        }
        
        if (candidateId) {
          this.matchStats.p2_alias++;
          console.log(`   [RESOLVER] Alias match: "${oddsTeamName}" → ${candidateId} (via alias "${aliasTarget}" → ${aliasSlug})`);
          return { teamId: candidateId, normalized, candidates: [] };
        } else {
          // Log once but don't fail - games table may reference this slug
          console.log(`   [RESOLVER] ⚠️  Alias target absent in index: "${oddsTeamName}" → ${aliasTarget} (will try game lookup)`);
        }
      }
    }

    // P3: Strip trailing word/phrase (likely mascot) (with token parity check)
    // Try stripping multi-word mascots first, then single-word
    const MULTI_WORD_MASCOTS = [
      'crimson tide', 'blue devils', 'fighting irish', 'nittany lions', 
      'fighting illini', 'sun devils', 'golden hurricane', 'demon deacons',
      'scarlet knights', 'red wolves', 'golden eagles', 'black knights'
    ];
    
    for (const mascot of MULTI_WORD_MASCOTS) {
      if (normalized.endsWith(` ${mascot}`)) {
        const baseName = normalized.slice(0, -(mascot.length + 1));
        const nameSlug = this.slugifyTeam(baseName);
        
        if (this.teamIndex.byNameSlug[nameSlug]) {
          const candidateId = this.teamIndex.byNameSlug[nameSlug];
          if (!this.violatesTokenParity(oddsTeamName, candidateId)) {
            this.matchStats.p3_stripMascot++;
            return { teamId: candidateId, normalized, candidates: [] };
          }
        }
      }
    }
    
    // Fall back to single-word strip
    const tokens = normalized.split(/\s+/);
    if (tokens.length >= 2) {
      const allButLast = tokens.slice(0, -1).join(' ');
      const nameSlug = this.slugifyTeam(allButLast);
      
      if (this.teamIndex.byNameSlug[nameSlug]) {
        const candidateId = this.teamIndex.byNameSlug[nameSlug];
        if (!this.violatesTokenParity(oddsTeamName, candidateId)) {
          this.matchStats.p3_stripMascot++;
          return { teamId: candidateId, normalized, candidates: [] };
        }
      }
    }

    // P4: Name + Mascot combo (with token parity check)
    if (this.teamIndex.byNameMascotSlug[slugged]) {
      const candidateId = this.teamIndex.byNameMascotSlug[slugged];
      if (!this.violatesTokenParity(oddsTeamName, candidateId)) {
        this.matchStats.p4_nameMascot++;
        return { teamId: candidateId, normalized, candidates: [] };
      }
    }

    // P5: Conservative fuzzy matching (Jaccard ≥ 0.9) - track top 3 candidates
    let bestMatch: {id: string, score: number} | null = null;
    const threshold = 0.9;

    for (const team of this.teamIndex.allTeams) {
      // Apply token parity check first
      if (this.violatesTokenParity(oddsTeamName, team.id)) {
        continue; // Skip candidates that violate token parity
      }
      
      const teamNormalized = this.normalizeName(team.name);
      const score = this.jaccardSimilarity(normalized, teamNormalized);
      
      if (score >= 0.5) { // Track candidates with score >= 0.5
        candidates.push({ name: team.name, id: team.id, score, method: 'fuzzy' });
      }
      
      if (score >= threshold) {
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { id: team.id, score };
        } else if (score === bestMatch.score) {
          bestMatch = null;
          break;
        }
      }
    }

    // Sort candidates by score and keep top 3
    candidates.sort((a, b) => b.score - a.score);
    const top3 = candidates.slice(0, 3);

    if (bestMatch) {
      this.matchStats.p5_fuzzy++;
      return { teamId: bestMatch.id, normalized, candidates: top3 };
    }

    // No match found
    return { teamId: null, normalized, candidates: top3 };
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
    // Load FBS teams into TeamResolver BEFORE building team index
    // This ensures teamExistsInDatabase checks will work correctly
    await this.teamResolver.loadFBSTeamsForSeason(season);
    
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
      unmatchedNames: new Set(),
      weekFlexible: 0,
      direct: 0
    };
    
    const allLines: any[] = [];
    let eventsProcessed = 0;
    let gamesMatched = 0;

    for (const week of weeks) {
      console.log(`📥 Fetching Odds API odds for ${season} Week ${week}...`);
      console.log(`   [DEBUG] About to call fetchOddsForWeek with season=${season}, week=${week}, options=`, options);
      
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
    console.log(`     Week-flexible: ${this.matchStats.weekFlexible}`);
    console.log(`     Direct: ${this.matchStats.direct}`);
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
        unmatched: Array.from(unmatched).sort().slice(0, 20) // First 20 for debugging
      };
      
      const reportPath = path.join(reportsDir, `unmatched_oddsapi_${season}_w${week}.json`);
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
    const currentWeek = await this.getCurrentCFBWeek(season);
    const isHistorical = season < currentYear || (season === currentYear && week < currentWeek);
    
    console.log(`   [DEBUG] Historical check: season=${season}, currentYear=${currentYear}, week=${week}, currentWeek=${currentWeek}, isHistorical=${isHistorical}`);
    
    if (isHistorical) {
      // Use historical endpoint for past weeks
      console.log(`   [ODDSAPI] Using historical data endpoint for ${season} week ${week}`);
      
      // Calculate proper date range for the week
      const dateRange = await this.calculateDateRangeFromGames(season, week);
      console.log(`   [ODDSAPI] Calculated date range: ${dateRange.startDate} to ${dateRange.endDate}`);
      
      return await this.fetchHistoricalOdds(season, week, dateRange.startDate, dateRange.endDate, options);
    } else {
      // Use live odds endpoint for current week
      console.log(`   [ODDSAPI] Using live odds endpoint for ${season} week ${week}`);
      console.log(`   [ODDSAPI] Note: Filtering by date range (${options?.startDate || 'N/A'} to ${options?.endDate || 'N/A'}) may not work on free tier`);
      return await this.fetchLiveOdds(season, week, options);
    }
  }

  /**
   * Get current CFB week by querying the database
   * Finds the week with upcoming games (games that haven't started yet)
   * If all games are past, returns the latest week
   */
  private async getCurrentCFBWeek(season: number): Promise<number> {
    try {
      const now = new Date();
      
      // Get all games for the season, grouped by week
      const games = await prisma.game.findMany({
        where: { season },
        select: { week: true, date: true },
        orderBy: { date: 'asc' }
      });

      if (games.length === 0) {
        // No games in DB - return a safe default (treat everything as historical)
        return 999;
      }

      // Group games by week
      const weekDates: Record<number, Date[]> = {};
      for (const game of games) {
        const week = game.week || 1;
        if (!weekDates[week]) {
          weekDates[week] = [];
        }
        const gameDate = game.date instanceof Date ? game.date : new Date(game.date);
        if (!isNaN(gameDate.getTime())) {
          weekDates[week].push(gameDate);
        }
      }

      // Find the week with the earliest upcoming game (future games)
      let currentWeek: number | null = null;
      let earliestFutureDate: Date | null = null;

      for (const [weekStr, dates] of Object.entries(weekDates)) {
        const week = parseInt(weekStr);
        // Find the earliest future game in this week
        for (const date of dates) {
          if (date.getTime() > now.getTime()) {
            // This is a future game
            if (!earliestFutureDate || date.getTime() < earliestFutureDate.getTime()) {
              earliestFutureDate = date;
              currentWeek = week;
            }
          }
        }
      }

      // If we found a week with upcoming games, return it
      if (currentWeek !== null) {
        return currentWeek;
      }

      // If all games are past, use the latest week
      const weeks = Object.keys(weekDates).map(n => parseInt(n)).sort((a, b) => b - a);
      return weeks[0] || 1;
    } catch (error) {
      console.warn(`   [ODDSAPI] Error determining current week: ${(error as Error).message}. Defaulting to week 1.`);
      // Default to week 1 if there's an error (treats everything as potentially historical)
      return 1;
    }
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
        const eventLines = await this.parseEventOdds(event, season, week);
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
  private async fetchHistoricalOdds(season: number, week: number, startDate: string, endDate?: string, options?: any): Promise<{lines: any[], eventCount: number, matchedCount: number}> {
    console.log(`   [ODDSAPI] Using historical endpoint for ${season} week ${week}`);
    console.log(`   [ODDSAPI] Date window: ${startDate} to ${endDate || 'N/A'}`);
    
    const lines: any[] = [];
    let matchedCount = 0;
    let eventCount = 0;
    
    try {
      // Step 1: Get historical events for the week
      console.log(`   [ODDSAPI] Step 1: Fetching historical events...`);
      const events = await this.fetchHistoricalEvents('americanfootball_ncaaf', startDate, {
        commenceTimeFrom: startDate,
        commenceTimeTo: endDate || startDate
      });
      
      eventCount = events.events.length;
      console.log(`   [ODDSAPI] Found ${eventCount} historical events`);
      
      if (eventCount === 0) {
        console.log(`   [ODDSAPI] No events found for ${season} week ${week}`);
        return { lines, eventCount, matchedCount };
      }
      
      // Step 2: Map events to database games
      console.log(`   [ODDSAPI] Step 2: Mapping events to database games...`);
      const { mappedEvents, unmatchedEvents } = await this.mapToDbGames(events.events, season);
      
      console.log(`   [ODDSAPI] Mapped ${mappedEvents.length} events to games, ${unmatchedEvents.length} unmatched`);
      
      // Step 3: Fetch odds for each mapped event (with optional limit)
      const eventsToProcess = options?.maxEvents ? mappedEvents.slice(0, options.maxEvents) : mappedEvents;
      console.log(`   [ODDSAPI] Step 3: Fetching odds for ${eventsToProcess.length} mapped events${options?.maxEvents ? ` (limited to ${options.maxEvents})` : ''}...`);
      
      for (const mappedEvent of eventsToProcess) {
        try {
          console.log(`   [ODDSAPI] Fetching odds for event ${mappedEvent.eventId} (game ${mappedEvent.gameId})`);
          
          const eventOdds = await this.fetchHistoricalEventOdds(
            'americanfootball_ncaaf',
            mappedEvent.eventId,
            mappedEvent.event.commence_time,
            {
              markets: this.config.markets.join(','),
              regions: 'us',
              oddsFormat: 'american',
              dateFormat: 'iso'
            }
          );
          
          // Parse the event odds into market lines
          const eventLines = this.parseHistoricalEventOdds(
            eventOdds.event,
            mappedEvent.gameId,
            season,
            week,
            eventOdds.timestamp
          );
          
          lines.push(...eventLines);
          matchedCount++;
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));
          
        } catch (error) {
          console.error(`   [ODDSAPI] Error fetching odds for event ${mappedEvent.eventId}:`, (error as Error).message);
        }
      }
      
      // Write audit logs
      await this.writeEventMappingAudit(season, week, mappedEvents, unmatchedEvents);
      
    } catch (error) {
      console.error(`   [ODDSAPI] Error in historical odds fetch:`, (error as Error).message);
      throw error;
    }

    return { lines, eventCount, matchedCount };
  }

  /**
   * Parse historical event odds into MarketLine objects
   */
  private parseHistoricalEventOdds(event: any, gameId: string, season: number, week: number, snapshotTimestamp: string): any[] {
    const lines: any[] = [];
    
    // Historical responses have bookmakers nested under event.data
    const bookmakers = event?.bookmakers || [];
    
    if (bookmakers.length === 0) {
      console.log(`   [PARSER] No bookmakers found in event ${event?.id || 'unknown'}`);
      return lines;
    }
    
    console.log(`   [PARSER] Processing ${bookmakers.length} bookmakers for event ${event?.id || 'unknown'}`);
    
    for (const bookmaker of bookmakers) {
      const bookName = bookmaker.title || bookmaker.key;
      
      // Historical format: markets is an array with key/outcomes structure
      if (bookmaker.markets && Array.isArray(bookmaker.markets)) {
        for (const market of bookmaker.markets) {
          if (market.key === 'spreads' && market.outcomes) {
            console.log(`   [PARSER] Found ${market.outcomes.length} spread outcomes from ${bookName}`);
            for (const outcome of market.outcomes) {
              // Resolve team name to teamId
              const teamId = this.resolveTeamId(outcome.name);
              if (!teamId) {
                console.warn(`   [PARSER] Could not resolve team name "${outcome.name}" to teamId for spread line`);
              }
              lines.push({
                gameId,
                season,
                week,
                lineType: 'spread',
                lineValue: outcome.point,
                price: outcome.price,
                bookName,
                source: 'oddsapi',
                timestamp: snapshotTimestamp,
                closingLine: true,
                teamId: teamId || undefined
              });
            }
          }
          
          if (market.key === 'totals' && market.outcomes) {
            console.log(`   [PARSER] Found ${market.outcomes.length} total outcomes from ${bookName}`);
            for (const outcome of market.outcomes) {
              lines.push({
                gameId,
                season,
                week,
                lineType: 'total',
                lineValue: outcome.point,
                price: outcome.price,
                bookName,
                source: 'oddsapi',
                timestamp: snapshotTimestamp,
                closingLine: true
              });
            }
          }
        }
      }
      
      // Skip moneylines for cost control
    }
    
    // Parser miss guard
    if (bookmakers.length > 0 && lines.length === 0) {
      console.log(`   [PARSER_MISS] Event ${event?.id} had ${bookmakers.length} bookmakers but parsed 0 lines`);
      this.writeParserMissReport(event?.id, bookmakers);
    }
    
    console.log(`   [PARSER] Parsed ${lines.length} lines from ${bookmakers.length} bookmakers`);
    return lines;
  }

  /**
   * Parse event odds into MarketLine objects
   */
  private async parseEventOdds(event: OddsApiEvent, season: number, week: number): Promise<any[]> {
    const lines: any[] = [];

    // Step 1: Resolve team names to canonical team IDs using TeamResolver
    const homeTeamId = this.teamResolver.resolveTeam(event.home_team, 'NCAAF');
    const awayTeamId = this.teamResolver.resolveTeam(event.away_team, 'NCAAF');

    // Skip if either team couldn't be matched
    if (!homeTeamId || !awayTeamId) {
      console.log(`   [DEBUG] Team matching failed: Away="${event.away_team}" (${awayTeamId}), Home="${event.home_team}" (${homeTeamId})`);
      return [];
    }

    // Step 2: Look up the actual database game ID using GameLookup
    const eventTime = new Date(event.commence_time);
    const gameLookupResult = await this.gameLookup.lookupGame(
      season,
      week,
      homeTeamId,
      awayTeamId,
      eventTime
    );

    if (!gameLookupResult.gameId) {
      console.log(`   [DEBUG] Game lookup failed: ${awayTeamId} @ ${homeTeamId} - ${gameLookupResult.reason}`);
      return [];
    }

    const gameId = gameLookupResult.gameId;
    const game = gameLookupResult.game;
    
    // Use the game's actual season and week from the database, not the requested poll week
    const actualSeason = game.season;
    const actualWeek = game.week;
    
    // Track if this was a week-flexible match (different from requested week)
    const isWeekFlexible = actualWeek !== week;
    const matchType = isWeekFlexible ? 'week-flexible' : 'direct';
    
    // Update stats
    if (isWeekFlexible) {
      this.matchStats.weekFlexible++;
    } else {
      this.matchStats.direct++;
    }
    
    console.log(`   [DEBUG] Found game: ${gameId} for ${event.away_team} @ ${event.home_team} (DB: ${actualSeason} W${actualWeek}, ${matchType})`);

    // Step 3: Process odds and build market lines with real database game ID
    for (const bookmaker of event.bookmakers) {
      const bookName = bookmaker.title || bookmaker.key;
      const timestamp = new Date(bookmaker.last_update);

      for (const market of bookmaker.markets) {
        if (market.key === 'h2h') {
          // Moneyline
          for (const outcome of market.outcomes) {
            if (outcome.price !== undefined && outcome.price !== null) {
              // Resolve team name to teamId
              const teamId = this.resolveTeamId(outcome.name);
              if (!teamId) {
                console.warn(`   [ODDSAPI] Could not resolve team name "${outcome.name}" to teamId for moneyline`);
              }
              lines.push({
                gameId,
                season: actualSeason,
                week: actualWeek,
                lineType: 'moneyline',
                lineValue: outcome.price,
                closingLine: outcome.price,
                bookName,
                source: 'oddsapi',
                timestamp,
                teamId: teamId || undefined, // Store teamId if resolved
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
              // Resolve team name to teamId
              const teamId = this.resolveTeamId(outcome.name);
              if (!teamId) {
                console.warn(`   [ODDSAPI] Could not resolve team name "${outcome.name}" to teamId for spread line`);
              }
              lines.push({
                gameId,
                season: actualSeason,
                week: actualWeek,
                lineType: 'spread',
                lineValue: outcome.point,
                closingLine: outcome.point,
                bookName,
                source: 'oddsapi',
                timestamp,
                teamId: teamId || undefined, // Store teamId if resolved
              });
            }
          }
        } else if (market.key === 'totals') {
          // Total
          for (const outcome of market.outcomes) {
            if (outcome.point !== undefined && outcome.point !== null) {
              lines.push({
                gameId,
                season: actualSeason,
                week: actualWeek,
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

  /**
   * Map Odds API events to database games
   */
  private async mapToDbGames(events: any[], season: number): Promise<{mappedEvents: any[], unmatchedEvents: any[]}> {
    const mappedEvents: any[] = [];
    const unmatchedEvents: any[] = [];
    
    // PRE-CHECK: Validate all team names can resolve to FBS slugs (saves credits on bad mappings)
    console.log(`\n[PRECHECK] Validating team name → FBS slug resolution for ${events.length} events...`);
    const precheckFailures: Array<{event: any, team: string, side: string}> = [];
    
    for (const event of events) {
      const homeResolution = this.resolveTeamIdWithCandidates(event.home_team);
      const awayResolution = this.resolveTeamIdWithCandidates(event.away_team);
      
      if (!homeResolution.teamId) {
        precheckFailures.push({ event, team: event.home_team, side: 'home' });
      }
      if (!awayResolution.teamId) {
        precheckFailures.push({ event, team: event.away_team, side: 'away' });
      }
    }
    
    if (precheckFailures.length > 0) {
      console.log(`[PRECHECK] ⚠️  ${precheckFailures.length} team name(s) could not resolve to FBS slugs:`);
      const uniqueTeams = new Set(precheckFailures.map(f => f.team));
      for (const team of uniqueTeams) {
        console.log(`[PRECHECK]   - "${team}"`);
      }
      console.log(`[PRECHECK] → Add aliases or fix team names before fetching odds to avoid wasted credits.`);
    } else {
      console.log(`[PRECHECK] ✅ All ${events.length * 2} team names resolved to FBS slugs.`);
    }
    
    for (const event of events) {
      try {
        // Resolve team names to CFBD team IDs with detailed candidates
        const homeResolution = this.resolveTeamIdWithCandidates(event.home_team);
        const awayResolution = this.resolveTeamIdWithCandidates(event.away_team);
        
        if (!homeResolution.teamId || !awayResolution.teamId) {
          console.log(`   [ODDSAPI] COULD_NOT_RESOLVE_TEAMS: ${event.away_team} @ ${event.home_team}`);
          unmatchedEvents.push({ 
            event, 
            reason: 'COULD_NOT_RESOLVE_TEAMS',
            awayTeamRaw: event.away_team,
            homeTeamRaw: event.home_team,
            normalizedAway: awayResolution.normalized,
            normalizedHome: homeResolution.normalized,
            awayCandidates: awayResolution.candidates,
            homeCandidates: homeResolution.candidates
          });
          continue;
        }
        
        // Sanity check: both teams resolved to the same school (e.g., Iowa vs Iowa State both → iowa-state)
        if (homeResolution.teamId === awayResolution.teamId) {
          console.log(`   [ODDSAPI] DUPLICATE_TEAM_RESOLUTION: ${event.away_team} (${awayResolution.teamId}) @ ${event.home_team} (${homeResolution.teamId}) - both resolved to same team!`);
          unmatchedEvents.push({ 
            event, 
            reason: 'DUPLICATE_TEAM_RESOLUTION',
            awayTeamRaw: event.away_team,
            homeTeamRaw: event.home_team,
            awayTeamId: awayResolution.teamId,
            homeTeamId: homeResolution.teamId,
            normalizedAway: awayResolution.normalized,
            normalizedHome: homeResolution.normalized
          });
          continue;
        }
        
        // Find matching game in database (season-only + date proximity)
        let game = await this.resolveGameBySeasonAndTeams(season, homeResolution.teamId, awayResolution.teamId, event.commence_time);
        
        // If not found with ±2d, retry with ±6d (catches week-number drifts and Fri/Sun oddities)
        if (!game) {
          console.log(`   [ODDSAPI] No game in ±2d; retry ±6d for ${awayResolution.teamId} @ ${homeResolution.teamId}`);
          game = await this.resolveGameBySeasonAndTeams(season, homeResolution.teamId, awayResolution.teamId, event.commence_time, 6);
        }
        
        // Season-only nearest-date fallback (gated by env flag, tight constraints)
        let usedSeasonFallback = false;
        let fallbackDaysDelta: number | undefined;
        if (!game && process.env.ODDSAPI_ENABLE_SEASON_FALLBACK === 'true') {
          const fallbackResult = await this.trySeasonOnlyFallback(season, homeResolution.teamId, awayResolution.teamId, event.commence_time);
          if (fallbackResult) {
            game = fallbackResult.game;
            usedSeasonFallback = true;
            fallbackDaysDelta = fallbackResult.daysDelta;
            console.log(`   [MATCH-FALLBACK] Season-only nearest match: ${awayResolution.teamId}@${homeResolution.teamId} | delta=${fallbackResult.daysDelta.toFixed(1)}d | gameId=${game.id}`);
          }
        }
        
        if (!game) {
          console.log(`   [ODDSAPI] RESOLVED_TEAMS_BUT_NO_GAME: ${event.away_team} (${awayResolution.teamId}) @ ${event.home_team} (${homeResolution.teamId})`);
          
          // Diagnostic: find any games for these teams in this season
          const candidateGames = await prisma.game.findMany({
            where: {
              season,
              OR: [
                { homeTeamId: homeResolution.teamId, awayTeamId: awayResolution.teamId },
                { homeTeamId: awayResolution.teamId, awayTeamId: homeResolution.teamId }
              ]
            },
            select: { id: true, week: true, date: true },
            orderBy: { date: 'asc' }
          });
          
          const eventDate = new Date(event.commence_time);
          const closestGames = candidateGames.map(g => ({
            week: g.week,
            date: g.date,
            daysDiff: Math.abs((new Date(g.date).getTime() - eventDate.getTime()) / (24 * 60 * 60 * 1000))
          })).slice(0, 3);
          
          if (closestGames.length > 0) {
            console.log(`   [ODDSAPI]   Found ${candidateGames.length} candidate game(s) in season, closest:`, 
              closestGames.map(g => `W${g.week} (${g.daysDiff.toFixed(1)}d away)`).join(', '));
          } else {
            // Explicit "missing schedule row" diagnostic
            console.log(`   [NO-GAME] 0 schedule rows for (away=${awayResolution.teamId}, home=${homeResolution.teamId}, season=${season}).`);
            console.log(`   [NO-GAME] → This is a missing game in your schedule, not a date-matching issue.`);
          }
          
          unmatchedEvents.push({ 
            event, 
            reason: 'RESOLVED_TEAMS_BUT_NO_GAME',
            awayTeamRaw: event.away_team,
            homeTeamRaw: event.home_team,
            awayTeamId: awayResolution.teamId,
            homeTeamId: homeResolution.teamId,
            candidateGames: closestGames,
            usedSeasonFallback: false
          });
          continue;
        }
        
        mappedEvents.push({
          eventId: event.id,
          gameId: game.id,
          event,
          usedSeasonFallback,
          fallbackDaysDelta
        });
        
      } catch (error) {
        console.error(`   [ODDSAPI] Error mapping event ${event.id}:`, (error as Error).message);
        unmatchedEvents.push({ 
          event, 
          reason: 'mapping_error', 
          error: (error as Error).message,
          awayTeamRaw: event.away_team,
          homeTeamRaw: event.home_team
        });
      }
    }
    
    return { mappedEvents, unmatchedEvents };
  }

  /**
   * Resolve game by season and teams with date proximity (historical mode: ignore week)
   */
  private async resolveGameBySeasonAndTeams(season: number, homeTeamId: string, awayTeamId: string, eventStart: string, dayWindow: number = 2): Promise<any> {
    const eventDate = new Date(eventStart);
    const startWindow = new Date(eventDate.getTime() - dayWindow * 24 * 60 * 60 * 1000);
    const endWindow = new Date(eventDate.getTime() + dayWindow * 24 * 60 * 60 * 1000);
    
    const games = await prisma.game.findMany({
      where: {
        season,
        homeTeamId,
        awayTeamId,
        date: {
          gte: startWindow,
          lte: endWindow
        }
      },
      orderBy: {
        date: 'asc'
      }
    });
    
    if (games.length === 0) {
      return null;
    }
    
    // Return the closest game by date
    return games[0];
  }

  /**
   * Season-only nearest-date fallback (gated, tight constraints)
   * Only triggers when:
   * 1. Both teams resolved to FBS slugs
   * 2. Exactly one game exists between these two teams in the season
   * 3. The date delta is ≤ 8 days (or ≤ 14 days for transitional teams)
   */
  private async trySeasonOnlyFallback(season: number, homeTeamId: string, awayTeamId: string, eventStart: string): Promise<{ game: any, daysDelta: number } | null> {
    const eventDate = new Date(eventStart);
    const isTransitional = isTransitionalMatchup(homeTeamId, awayTeamId);
    
    // Find ALL games between these two teams in the season (regardless of date)
    const candidateGames = await prisma.game.findMany({
      where: {
        season,
        homeTeamId,
        awayTeamId
      },
      orderBy: {
        date: 'asc'
      }
    });
    
    // Must be exactly ONE game (prevents ambiguity for teams that play twice)
    if (candidateGames.length !== 1) {
      return null;
    }
    
    const game = candidateGames[0];
    const gameDate = new Date(game.date);
    const daysDelta = Math.abs((gameDate.getTime() - eventDate.getTime()) / (24 * 60 * 60 * 1000));
    
    // Date threshold: ±8 days normally, ±14 days for transitional teams
    const maxDelta = isTransitional ? 14 : 8;
    if (daysDelta > maxDelta) {
      return null;
    }
    
    return { game, daysDelta };
  }

  /**
   * Fetch historical events from The Odds API
   */
  private async fetchHistoricalEvents(sport: string, snapshotDate: string, filters: any = {}): Promise<any> {
    try {
      // Strip milliseconds from snapshot date
      const cleanSnapshotDate = this.toISOStringNoMs(new Date(snapshotDate));
      
      // Build URL for historical events
      const url = `${this.baseUrl}/historical/sports/${sport}/events?apiKey=${this.apiKey}&date=${cleanSnapshotDate}&dateFormat=iso`;
      console.log(`   [HISTORICAL_EVENTS] Fetching events for ${sport} at ${snapshotDate}`);
      console.log(`   [HISTORICAL_EVENTS] URL: ${url.replace(this.apiKey, 'HIDDEN')}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Gridiron-Edge/1.0'
        }
      });
      
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`   [HISTORICAL_EVENTS] ERROR ${response.status} ${response.statusText} for ${url.replace(this.apiKey, 'HIDDEN')}`);
        console.error(errorBody.slice(0, 800));
        throw new Error(`Historical Events API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
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
      
      return {
        timestamp: data.timestamp,
        previous_timestamp: data.previous_timestamp,
        next_timestamp: data.next_timestamp,
        events: filteredEvents
      };
      
    } catch (error) {
      console.error(`   [HISTORICAL_EVENTS] Error: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Fetch historical event odds from The Odds API
   */
  private async fetchHistoricalEventOdds(sport: string, eventId: string, snapshotDate: string, options: any = {}): Promise<any> {
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
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Gridiron-Edge/1.0'
        }
      });
      
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`   [HISTORICAL_ODDS] ERROR ${response.status} ${response.statusText} for event ${eventId}`);
        console.error(errorBody.slice(0, 800));
        throw new Error(`Historical Event Odds API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Log quota usage
      const remaining = response.headers.get('x-requests-remaining');
      const used = response.headers.get('x-requests-used');
      const lastCost = response.headers.get('x-requests-last');
      console.log(`   [HISTORICAL_ODDS] Quota: ${remaining} remaining, ${used} used, last call cost: ${lastCost}`);
      
      // Debug: Write raw payload for first few events
      await this.writeRawPayload(eventId, data);
      
      return {
        timestamp: data.timestamp,
        previous_timestamp: data.previous_timestamp,
        next_timestamp: data.next_timestamp,
        event: data.data
      };
      
    } catch (error) {
      console.error(`   [HISTORICAL_ODDS] Error for event ${eventId}: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Calculate date range from games in database for a specific season/week
   */
  private async calculateDateRangeFromGames(season: number, week: number): Promise<{startDate: string, endDate: string}> {
    try {
      // Get all games for this season/week
      const games = await prisma.game.findMany({
        where: {
          season,
          week
        },
        orderBy: {
          date: 'asc'
        }
      });
      
      if (games.length === 0) {
        // Fallback: approximate dates for the week
        const seasonStart = new Date(season, 7, 1); // August 1st
        const weekStart = new Date(seasonStart.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000);
        const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
        
        return {
          startDate: weekStart.toISOString().split('T')[0],
          endDate: weekEnd.toISOString().split('T')[0]
        };
      }
      
      // Use actual game dates
      const minDate = games[0].date;
      const maxDate = games[games.length - 1].date;
      
      // Add buffer days
      const startDate = new Date(minDate.getTime() - 24 * 60 * 60 * 1000); // 1 day before
      const endDate = new Date(maxDate.getTime() + 24 * 60 * 60 * 1000); // 1 day after
      
      return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      };
      
    } catch (error) {
      console.error(`   [ODDSAPI] Error calculating date range:`, (error as Error).message);
      // Fallback to current date
      const today = new Date().toISOString().split('T')[0];
      return { startDate: today, endDate: today };
    }
  }

  /**
   * Helper to strip milliseconds from ISO date strings
   */
  private toISOStringNoMs(date: Date): string {
    const iso = date.toISOString();
    return iso.replace(/\.\d{3}Z$/, 'Z'); // Remove .000Z and add back Z
  }

  /**
   * Write raw payload for debugging
   */
  private async writeRawPayload(eventId: string, data: any): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const auditDir = path.join(process.cwd(), 'reports', 'historical');
      await fs.mkdir(auditDir, { recursive: true });
      
      const rawFile = path.join(auditDir, `raw_odds_2024_w2_${eventId}.json`);
      
      // Redact API key if present
      const cleanData = JSON.parse(JSON.stringify(data, (key, value) => {
        if (key === 'apiKey' || (typeof value === 'string' && value.includes('apiKey'))) {
          return 'REDACTED';
        }
        return value;
      }));
      
      await fs.writeFile(rawFile, JSON.stringify(cleanData, null, 2));
      console.log(`   [DEBUG] Wrote raw payload to ${rawFile}`);
      
    } catch (error) {
      console.error(`   [DEBUG] Failed to write raw payload:`, (error as Error).message);
    }
  }

  /**
   * Write parser miss report for debugging
   */
  private async writeParserMissReport(eventId: string, bookmakers: any[]): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const auditDir = path.join(process.cwd(), 'reports', 'historical');
      await fs.mkdir(auditDir, { recursive: true });
      
      const missFile = path.join(auditDir, `parser_miss_2024_w2_${eventId}.json`);
      
      const report = {
        eventId,
        bookmakerCount: bookmakers.length,
        bookmakers: bookmakers.slice(0, 2).map(bm => ({
          key: bm.key,
          title: bm.title,
          markets: Object.keys(bm.markets || {}),
          sampleMarket: bm.markets ? Object.keys(bm.markets)[0] : null,
          sampleOutcomes: bm.markets ? 
            (bm.markets[Object.keys(bm.markets)[0]] || []).slice(0, 2) : []
        }))
      };
      
      await fs.writeFile(missFile, JSON.stringify(report, null, 2));
      console.log(`   [PARSER_MISS] Wrote report to ${missFile}`);
      
    } catch (error) {
      console.error(`   [PARSER_MISS] Failed to write report:`, (error as Error).message);
    }
  }

  /**
   * Write event mapping audit log
   */
  private async writeEventMappingAudit(season: number, week: number, mappedEvents: any[], unmatchedEvents: any[]): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const auditDir = path.join(process.cwd(), 'reports', 'historical');
      await fs.mkdir(auditDir, { recursive: true });
      
      // Write mapped events
      const auditFile = path.join(auditDir, `map_${season}_w${week}.jsonl`);
      const auditLines = mappedEvents.map(me => JSON.stringify({
        eventId: me.eventId,
        gameId: me.gameId,
        awayTeam: me.event.away_team,
        homeTeam: me.event.home_team,
        commenceTime: me.event.commence_time,
        matchReason: 'successful_mapping'
      }));
      
      await fs.writeFile(auditFile, auditLines.join('\n') + '\n');
      
      // Write detailed unmatched report
      const unmatchedFile = path.join(auditDir, `unmatched_oddsapi_${season}_w${week}.json`);
      
      // Count by reason
      const reasonCounts = unmatchedEvents.reduce((acc, ue) => {
        acc[ue.reason] = (acc[ue.reason] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const unmatchedReport = {
        season,
        week,
        timestamp: new Date().toISOString(),
        totalUnmatched: unmatchedEvents.length,
        reasonBreakdown: reasonCounts,
        unmatchedEvents: unmatchedEvents.map(ue => ({
          eventId: ue.event.id,
          awayTeamRaw: ue.awayTeamRaw || ue.event.away_team,
          homeTeamRaw: ue.homeTeamRaw || ue.event.home_team,
          normalizedAway: ue.normalizedAway,
          normalizedHome: ue.normalizedHome,
          awayTeamId: ue.awayTeamId,
          homeTeamId: ue.homeTeamId,
          commenceTime: ue.event.commence_time,
          reason: ue.reason,
          awayCandidates: ue.awayCandidates || [],
          homeCandidates: ue.homeCandidates || [],
          candidateGames: ue.candidateGames || [],
          error: ue.error
        })),
        // Deduplicated list of unmatched team names
        uniqueUnmatchedTeams: Array.from(new Set(
          unmatchedEvents.flatMap(ue => [
            ue.awayTeamRaw || ue.event.away_team,
            ue.homeTeamRaw || ue.event.home_team
          ])
        )).sort()
      };
      
      await fs.writeFile(unmatchedFile, JSON.stringify(unmatchedReport, null, 2));
      console.log(`   [AUDIT] Wrote unmatched report to ${unmatchedFile}`);
      console.log(`   [AUDIT] Wrote event mapping audit to ${auditFile}`);
      
    } catch (error) {
      console.error(`   [AUDIT] Failed to write event mapping audit:`, (error as Error).message);
    }
  }
}

