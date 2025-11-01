import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { validateAliasFile } from '../src/utils/validate-aliases';

interface TeamAlias {
  [key: string]: string;
}

interface UnmatchedTeam {
  providerName: string;
  providerSport: string;
  reason: 'not_fbs' | 'no_alias' | 'denylisted';
}

export class TeamResolver {
  private aliases: Map<string, string> = new Map();
  private cfbdAliases: Map<string, string> = new Map();
  private denylist: Set<string> = new Set();
  private fbsTeams: Set<string> = new Set(); // Current season's FBS teams
  private currentSeason?: number; // Track which season's teams are loaded
  private verboseLogging: boolean;
  private resolvedTeams: Set<string> = new Set(); // Track teams we've already logged

  constructor() {
    this.verboseLogging = process.env.LOG_RESOLVER_VERBOSE === 'true';
    this.loadAliases();
    this.loadCFBDAliases();
    this.loadDenylist();
    // Don't load FBS teams automatically - must call loadFBSTeamsForSeason(season)
  }

  private loadAliases(): void {
    let aliasContent: string;
    let source: string;

    try {
      // Priority 1: Inline env variable (useful for quick hotfixes)
      if (process.env.TEAM_ALIASES_YAML) {
        aliasContent = process.env.TEAM_ALIASES_YAML;
        source = 'environment variable TEAM_ALIASES_YAML';
      }
      // Priority 2: Path env variable
      else if (process.env.TEAM_ALIASES_PATH) {
        aliasContent = fs.readFileSync(process.env.TEAM_ALIASES_PATH, 'utf8');
        source = `environment variable TEAM_ALIASES_PATH (${process.env.TEAM_ALIASES_PATH})`;
      }
      // Priority 3: Well-known relative paths (first that exists)
      else {
        const possiblePaths = [
          path.join(__dirname, '../config/team_aliases.yml'), // dist runtime
          path.join(process.cwd(), 'apps/jobs/config/team_aliases.yml'), // monorepo root
          path.join(process.cwd(), 'config/team_aliases.yml'), // fallback
        ];

        let aliasPath: string | null = null;
        for (const testPath of possiblePaths) {
          if (fs.existsSync(testPath)) {
            aliasPath = testPath;
            break;
          }
        }

        if (!aliasPath) {
          const attemptedPaths = possiblePaths.join(', ');
          throw new Error(`team_aliases.yml not found in any of these locations: ${attemptedPaths}`);
        }

        aliasContent = fs.readFileSync(aliasPath, 'utf8');
        source = aliasPath;
      }

      // Parse and validate aliases (throws if duplicates found)
      const aliasData = yaml.load(aliasContent) as any;
      
      if (!aliasData || typeof aliasData !== 'object') {
        throw new Error('Invalid YAML structure: expected object with team aliases');
      }
      
      // Handle nested structure with 'aliases' key
      const aliases = aliasData.aliases || aliasData;
      
      if (!aliases || typeof aliases !== 'object') {
        throw new Error('Invalid YAML structure: missing or invalid aliases section');
      }
      
      // Validate for duplicate keys
      const seen = new Set<string>();
      const dups: string[] = [];
      for (const k of Object.keys(aliases)) {
        if (seen.has(k)) dups.push(k);
        seen.add(k);
      }
      if (dups.length) {
        throw new Error(`Duplicate keys in team_aliases.yml: ${dups.join(", ")}`);
      }
      
      for (const [alias, teamId] of Object.entries(aliases)) {
        if (typeof teamId === 'string' && teamId.trim()) {
          this.aliases.set(alias.toLowerCase(), teamId);
        }
      }
      
      console.log(`[TEAM_RESOLVER] Loaded ${this.aliases.size} team aliases from ${source}`);
    } catch (error) {
      console.error('[TEAM_RESOLVER] FATAL: Failed to load team aliases');
      console.error('[TEAM_RESOLVER] Error:', (error as Error).message);
      console.error('[TEAM_RESOLVER] Attempted locations:');
      console.error('  - Environment variable TEAM_ALIASES_YAML');
      console.error('  - Environment variable TEAM_ALIASES_PATH');
      console.error('  - ' + path.join(__dirname, '../config/team_aliases.yml'));
      console.error('  - ' + path.join(process.cwd(), 'apps/jobs/config/team_aliases.yml'));
      console.error('  - ' + path.join(process.cwd(), 'config/team_aliases.yml'));
      console.error('[TEAM_RESOLVER] Cannot proceed without team aliases - exiting');
      process.exit(1);
    }
  }

  private loadCFBDAliases(): void {
    try {
      const cfbdAliasPath = path.join(__dirname, '../config/team_aliases_cfbd.yml');
      if (fs.existsSync(cfbdAliasPath)) {
        // Validate CFBD aliases file (throws if duplicates found)
        const cfbdAliases = validateAliasFile(cfbdAliasPath);
        
        for (const [cfbdName, teamId] of Object.entries(cfbdAliases)) {
          if (typeof teamId === 'string' && teamId.trim()) {
            this.cfbdAliases.set(cfbdName.toLowerCase(), teamId);
          }
        }
        
        console.log(`[TEAM_RESOLVER] Loaded ${this.cfbdAliases.size} CFBD-specific aliases from ${cfbdAliasPath}`);
      } else {
        console.warn(`[TEAM_RESOLVER] CFBD aliases file not found: ${cfbdAliasPath}`);
      }
    } catch (error) {
      console.error(`[TEAM_RESOLVER] FATAL: Failed to load CFBD aliases from ${path.join(__dirname, '../config/team_aliases_cfbd.yml')}`);
      console.error(`[TEAM_RESOLVER] Error:`, (error as Error).message);
      console.error(`[TEAM_RESOLVER] Cannot proceed without CFBD aliases - exiting`);
      process.exit(1);
    }
  }

  private loadDenylist(): void {
    try {
      // Load denylist from the same YAML file as aliases
      let aliasContent: string;
      
      // Use the same path resolution logic as loadAliases
      if (process.env.TEAM_ALIASES_YAML) {
        aliasContent = process.env.TEAM_ALIASES_YAML;
      } else if (process.env.TEAM_ALIASES_PATH) {
        aliasContent = fs.readFileSync(process.env.TEAM_ALIASES_PATH, 'utf8');
      } else {
        const possiblePaths = [
          path.join(__dirname, '../config/team_aliases.yml'), // dist runtime
          path.join(process.cwd(), 'apps/jobs/config/team_aliases.yml'), // monorepo root
          path.join(process.cwd(), 'config/team_aliases.yml'), // fallback
        ];

        let aliasPath: string | null = null;
        for (const testPath of possiblePaths) {
          if (fs.existsSync(testPath)) {
            aliasPath = testPath;
            break;
          }
        }

        if (!aliasPath) {
          console.warn('[TEAM_RESOLVER] No team_aliases.yml found, continuing without denylist');
          return;
        }

        aliasContent = fs.readFileSync(aliasPath, 'utf8');
      }

      const aliasData = yaml.load(aliasContent) as any;
      
      if (aliasData && aliasData.denylist && Array.isArray(aliasData.denylist)) {
        aliasData.denylist.forEach((teamName: string) => {
          this.denylist.add(teamName.toLowerCase());
        });
      }
      
      console.log(`[TEAM_RESOLVER] Loaded ${this.denylist.size} denylisted teams from YAML`);
    } catch (error) {
      console.warn('[TEAM_RESOLVER] Failed to load denylist, continuing without it:', error);
    }
  }

  /**
   * Load FBS teams for a specific season from team_membership table
   * @param season - The season year (e.g., 2024, 2025)
   * @returns Promise<Set<string>> Set of canonical team IDs
   */
  async loadFBSTeamsForSeason(season: number): Promise<Set<string>> {
    const forceDbTeams = process.env.FORCE_DB_TEAMS === 'true';
    
    // If we already have this season loaded, return cached
    if (this.currentSeason === season && this.fbsTeams.size > 0) {
      return this.fbsTeams;
    }

    // Clear previous season's teams
    this.fbsTeams.clear();
    this.currentSeason = season;

    if (forceDbTeams) {
      console.log(`[TEAM_RESOLVER] FORCE_DB_TEAMS=true, loading FBS teams for season=${season} from team_membership...`);
    }

    // Try to load from team_membership table
    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      
      const memberships = await prisma.teamMembership.findMany({
        where: {
          season,
          level: 'fbs'
        },
        select: { teamId: true }
      });
      
      if (memberships.length > 0) {
        // Database has season-aware FBS teams
        for (const membership of memberships) {
          this.fbsTeams.add(membership.teamId.toLowerCase());
        }
        await prisma.$disconnect();
        console.log(`[TEAM_RESOLVER] source=db (season=${season}, fbs_count=${this.fbsTeams.size})`);
        
        if (forceDbTeams && this.fbsTeams.size === 0) {
          throw new Error(`FORCE_DB_TEAMS=true but no FBS teams found for season ${season} in team_membership`);
        }
        
        return this.fbsTeams;
      } else {
        console.warn(`[TEAM_RESOLVER] No FBS teams found in team_membership for season ${season}`);
        await prisma.$disconnect();
      }
    } catch (error) {
      console.warn(`[TEAM_RESOLVER] Could not load teams from team_membership: ${error}`);
    }

    // Fallback to aliases if not forcing DB
    if (forceDbTeams) {
      throw new Error(`FORCE_DB_TEAMS=true but database load failed or no teams for season ${season}`);
    }

    // Legacy fallback: use all aliases (not season-aware)
    for (const teamId of this.aliases.values()) {
      this.fbsTeams.add(teamId);
    }
    console.log(`[TEAM_RESOLVER] source=aliases (season=${season}, fallback_count=${this.fbsTeams.size})`);
    
    return this.fbsTeams;
  }

  private preNormalizeName(s: string): string {
    const noDiacritics = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // unify A & M forms to A&M token
    const fixAM = noDiacritics
      .replace(/\bA\s*&\s*M\b/gi, 'A&M')
      .replace(/\bA\s+and\s+M\b/gi, 'A&M');
    return fixAM.trim();
  }

  private postFallbackNormalize(s: string): string {
    // only after alias miss: drop things like "(OH)"
    return s.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private teamExistsInDatabase(teamId: string): boolean {
    // Check if the team ID exists in our FBS teams set
    // If FBS teams haven't been loaded yet, we can't validate
    // In that case, allow the match to proceed (the database will catch invalid FKs)
    if (this.fbsTeams.size === 0) {
      // FBS teams not loaded - skip validation to allow matches
      // The database FK constraint will catch truly invalid team IDs
      return true;
    }
    return this.fbsTeams.has(teamId.toLowerCase());
  }

  /**
   * Apply mis-map guards to prevent common fuzzy matching errors
   */
  private applyMisMapGuards(providerName: string): string | null {
    const name = providerName.toLowerCase();
    
    // Texas A&M -> texas-a-m (prevent fuzzy match to north-texas)
    if (name.includes('texas a&m') || name === 'texas a&m') {
      return 'texas-a-m';
    }
    
    // Miami -> miami (FL), not miami-oh unless explicitly Ohio
    if (name === 'miami' && !name.includes('oh') && !name.includes('ohio')) {
      return 'miami';
    }
    if (name.includes('miami') && (name.includes('oh') || name.includes('ohio'))) {
      return 'miami-oh';
    }
    
    // Georgia schools - exact matches
    if (name === 'georgia state') {
      return 'georgia-state';
    }
    if (name === 'georgia southern') {
      return 'georgia-southern';
    }
    
    // San José State vs San Diego State - normalize diacritics
    if (name.includes('san josé') || name.includes('san jose')) {
      return 'san-jose-state';
    }
    if (name.includes('san diego')) {
      return 'san-diego-state';
    }
    
    return null; // No guard applied
  }

  /**
   * Resolve a provider team name to a canonical team ID
   * @param providerName - Team name from the provider (e.g., "Alabama Crimson Tide")
   * @param providerSport - Sport from the provider (e.g., "NCAAF")
   * @param options - Optional provider-specific options
   * @returns Canonical team ID or null if not found/denylisted
   */
  resolveTeam(providerName: string, providerSport: string, options?: { provider?: string }): string | null {
    if (!providerName || !providerSport) {
      return null;
    }

    // Pre-normalize: strip diacritics and unify A&M forms
    const preNormalized = this.preNormalizeName(providerName);
    const normalizedName = preNormalized.toLowerCase().trim();
    
    // Debug logging for Miami and Texas A&M
    const needsDebug = providerName.toLowerCase().includes('miami') || 
                       providerName.toLowerCase().includes('a&m') || 
                       providerName.toLowerCase().includes('a and m');

    // Check if the provider name itself is denylisted
    if (this.denylist.has(normalizedName)) {
      console.log(`[TEAM_RESOLVER] Denylisted team name: ${providerName}`);
      return null;
    }

    // Apply mis-map guards for common pitfalls
    const guardedResult = this.applyMisMapGuards(providerName);
    if (guardedResult) {
      return guardedResult;
    }

    // Step 1: Provider-specific alias match (CFBD first if provider is cfbd)
    if (options?.provider === 'cfbd') {
      let cfbdMatch = this.cfbdAliases.get(normalizedName);
      
      // If no match, try with fallback normalization
      if (!cfbdMatch) {
        const fallbackName = this.postFallbackNormalize(normalizedName);
        cfbdMatch = this.cfbdAliases.get(fallbackName);
      }
      
      if (cfbdMatch) {
        // Check if it's denylisted
        if (this.denylist.has(cfbdMatch)) {
          console.log(`[TEAM_RESOLVER] Denylisted CFBD team: ${providerName} -> ${cfbdMatch}`);
          return null;
        }
        
        // Check if the resolved team ID exists in our database
        if (!this.teamExistsInDatabase(cfbdMatch)) {
          console.error(`[TEAM_RESOLVER] FK ERROR: Alias "${providerName}" -> "${cfbdMatch}" but team ID doesn't exist in database`);
          return null;
        }
        
        if (this.verboseLogging || !this.resolvedTeams.has(providerName) || needsDebug) {
          console.log(`[TEAM_RESOLVER] CFBD alias match: ${providerName} -> ${cfbdMatch}`);
          if (needsDebug) {
            console.log(`[RESOLVER-DEBUG] input="${providerName}" -> normalized="${normalizedName}" -> mapped="${cfbdMatch}"`);
          }
          this.resolvedTeams.add(providerName);
        }
        return cfbdMatch;
      }
    }

    // Step 2: Exact alias match (general aliases)
    let exactMatch = this.aliases.get(normalizedName);
    
    // If no match, try with fallback normalization
    if (!exactMatch) {
      const fallbackName = this.postFallbackNormalize(normalizedName);
      exactMatch = this.aliases.get(fallbackName);
    }
    
    if (exactMatch) {
      // Check if it's denylisted
      if (this.denylist.has(exactMatch)) {
        console.log(`[TEAM_RESOLVER] Denylisted team: ${providerName} -> ${exactMatch}`);
        return null;
      }
      
      // Check if the resolved team ID exists in our database
      if (!this.teamExistsInDatabase(exactMatch)) {
        console.error(`[TEAM_RESOLVER] FK ERROR: Alias "${providerName}" -> "${exactMatch}" but team ID doesn't exist in database`);
        return null;
      }
      
      return exactMatch;
    }

    // Step 2: Name normalization (strip mascots, punctuation, etc.)
    const normalized = this.normalizeTeamName(providerName);
    const normalizedMatch = this.aliases.get(normalized.toLowerCase());
    if (normalizedMatch) {
      if (this.denylist.has(normalizedMatch)) {
        console.log(`[TEAM_RESOLVER] Denylisted normalized team: ${providerName} -> ${normalizedMatch}`);
        return null;
      }
      return normalizedMatch;
    }

    // Step 3: Fallback fuzzy match (very conservative)
    const fuzzyMatch = this.fuzzyMatch(providerName);
    if (fuzzyMatch) {
      if (this.denylist.has(fuzzyMatch)) {
        console.log(`[TEAM_RESOLVER] Denylisted fuzzy team: ${providerName} -> ${fuzzyMatch}`);
        return null;
      }
      return fuzzyMatch;
    }

    return null;
  }

  private normalizeTeamName(name: string): string {
    // Remove common mascots and epithets
    const mascots = [
      'crimson tide', 'blue devils', 'wildcats', 'huskies', 'fighting irish',
      'nittany lions', 'fighting illini', 'jayhawks', 'sun devils', 'golden hurricane',
      'cavaliers', 'demon deacons', 'scarlet knights', 'bearkats', 'broncos', 'zips',
      'bulldogs', 'tigers', 'eagles', 'hawks', 'lions', 'bears', 'wolves',
      'raiders', 'pirates', 'knights', 'crusaders', 'saints', 'angels'
    ];

    let normalized = name.toLowerCase();
    
    // Remove mascots
    for (const mascot of mascots) {
      normalized = normalized.replace(new RegExp(`\\s+${mascot}\\s*$`, 'gi'), '');
    }

    // Remove punctuation and extra spaces
    normalized = normalized.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    
    return normalized;
  }

  private fuzzyMatch(name: string): string | null {
    const normalized = this.normalizeTeamName(name);
    const words = normalized.split(' ');
    
    // Very conservative fuzzy matching - only if we have a strong partial match
    for (const [alias, teamId] of this.aliases.entries()) {
      const aliasWords = alias.split(' ');
      
      // Check if all words in the normalized name appear in the alias
      const allWordsMatch = words.every(word => 
        aliasWords.some(aliasWord => aliasWord.includes(word) || word.includes(aliasWord))
      );
      
      if (allWordsMatch && words.length >= 2) {
        console.log(`[TEAM_RESOLVER] Fuzzy match: ${name} -> ${teamId} (via ${alias})`);
        return teamId;
      }
    }
    
    return null;
  }

  /**
   * Check if a team ID is FBS
   */
  isFBSTeam(teamId: string): boolean {
    return this.fbsTeams.has(teamId);
  }

  /**
   * Get all unmatched teams for reporting
   */
  getUnmatchedTeams(events: any[]): UnmatchedTeam[] {
    const unmatched: UnmatchedTeam[] = [];
    
    for (const event of events) {
      const awayTeam = this.resolveTeam(event.away_team, event.sport);
      const homeTeam = this.resolveTeam(event.home_team, event.sport);
      
      if (!awayTeam) {
        unmatched.push({
          providerName: event.away_team,
          providerSport: event.sport,
          reason: this.denylist.has(event.away_team.toLowerCase()) ? 'denylisted' : 'no_alias'
        });
      }
      
      if (!homeTeam) {
        unmatched.push({
          providerName: event.home_team,
          providerSport: event.sport,
          reason: this.denylist.has(event.home_team.toLowerCase()) ? 'denylisted' : 'no_alias'
        });
      }
    }
    
    return unmatched;
  }

  /**
   * Get a summary of team resolution statistics
   */
  getResolutionSummary(): { resolved: number; total: number; unique: number } {
    return {
      resolved: this.resolvedTeams.size,
      total: this.resolvedTeams.size, // This will be updated by the calling code
      unique: this.resolvedTeams.size
    };
  }

  /**
   * Reset the resolved teams tracking (useful for new batches)
   */
  resetResolutionTracking(): void {
    this.resolvedTeams.clear();
  }
}
