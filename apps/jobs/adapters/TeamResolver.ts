import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

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
  private denylist: Set<string> = new Set();
  private fbsTeams: Set<string> = new Set();

  constructor() {
    this.loadAliases();
    this.loadDenylist();
    this.loadFBSTeams();
  }

  private loadAliases(): void {
    try {
      const aliasPath = path.join(__dirname, '../config/team_aliases.yml');
      const aliasContent = fs.readFileSync(aliasPath, 'utf8');
      const aliasData = yaml.load(aliasContent) as TeamAlias;
      
      for (const [alias, teamId] of Object.entries(aliasData)) {
        this.aliases.set(alias.toLowerCase(), teamId);
      }
      
      console.log(`[TEAM_RESOLVER] Loaded ${this.aliases.size} team aliases`);
    } catch (error) {
      console.error('[TEAM_RESOLVER] Failed to load team aliases:', error);
      throw error;
    }
  }

  private loadDenylist(): void {
    try {
      const denylistPath = path.join(__dirname, '../config/denylist.ts');
      const denylistContent = fs.readFileSync(denylistPath, 'utf8');
      
      // Extract DENYLIST_SLUGS from the TypeScript file
      const denylistMatch = denylistContent.match(/DENYLIST_SLUGS = new Set\(\[([\s\S]*?)\]\)/);
      if (denylistMatch) {
        const slugs = denylistMatch[1]
          .split(',')
          .map(s => s.trim().replace(/['"]/g, ''))
          .filter(s => s.length > 0);
        
        slugs.forEach(slug => this.denylist.add(slug));
      }
      
      console.log(`[TEAM_RESOLVER] Loaded ${this.denylist.size} denylisted teams`);
    } catch (error) {
      console.warn('[TEAM_RESOLVER] Failed to load denylist, continuing without it:', error);
    }
  }

  private loadFBSTeams(): void {
    // This would typically load from a database or static file
    // For now, we'll populate from the aliases we loaded
    for (const teamId of this.aliases.values()) {
      this.fbsTeams.add(teamId);
    }
    
    console.log(`[TEAM_RESOLVER] Loaded ${this.fbsTeams.size} FBS teams`);
  }

  /**
   * Resolve a provider team name to a canonical team ID
   * @param providerName - Team name from the provider (e.g., "Alabama Crimson Tide")
   * @param providerSport - Sport from the provider (e.g., "NCAAF")
   * @returns Canonical team ID or null if not found/denylisted
   */
  resolveTeam(providerName: string, providerSport: string): string | null {
    if (!providerName || !providerSport) {
      return null;
    }

    // Step 1: Exact alias match (required)
    const exactMatch = this.aliases.get(providerName.toLowerCase());
    if (exactMatch) {
      // Check if it's denylisted
      if (this.denylist.has(exactMatch)) {
        console.log(`[TEAM_RESOLVER] Denylisted team: ${providerName} -> ${exactMatch}`);
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
}
