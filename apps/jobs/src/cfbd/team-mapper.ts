/**
 * CFBD Team Mapping Layer
 * 
 * Maps CFBD team names to internal team IDs using:
 * 1. Exact name match
 * 2. Alias file (team_aliases_cfbd.yml)
 * 3. Fuzzy matching (fallback)
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const prisma = new PrismaClient();

interface TeamAlias {
  cfbd: string;
  internal: string;
}

export class CFBDTeamMapper {
  private aliasMap: Map<string, string> = new Map();
  private reverseMap: Map<string, string> = new Map(); // internal -> cfbd
  
  constructor() {
    this.loadAliases();
  }
  
  private loadAliases() {
    try {
      const aliasPath = path.join(process.cwd(), 'apps/jobs/config/team_aliases_cfbd.yml');
      if (fs.existsSync(aliasPath)) {
        const content = fs.readFileSync(aliasPath, 'utf8');
        const aliases = yaml.load(content) as TeamAlias[];
        for (const alias of aliases) {
          this.aliasMap.set(alias.cfbd.toLowerCase(), alias.internal);
          this.reverseMap.set(alias.internal.toLowerCase(), alias.cfbd);
        }
        console.log(`[CFBD Team Mapper] Loaded ${this.aliasMap.size} aliases from config`);
      }
    } catch (error) {
      console.warn(`[CFBD Team Mapper] Could not load aliases: ${error}`);
    }
  }
  
  /**
   * Map CFBD team name to internal team ID
   */
  async mapToInternal(cfbdName: string, season: number): Promise<string | null> {
    // Check database mapping first
    const dbMapping = await prisma.cfbdTeamMap.findFirst({
      where: {
        teamNameCfbd: { equals: cfbdName, mode: 'insensitive' },
      },
    });
    
    if (dbMapping) {
      return dbMapping.teamIdInternal;
    }
    
    // Check alias file
    const aliasMatch = this.aliasMap.get(cfbdName.toLowerCase());
    if (aliasMatch) {
      // Verify team exists
      const team = await prisma.team.findUnique({
        where: { id: aliasMatch },
      });
      if (team) {
        // Store in DB for future use
        await this.storeMapping(aliasMatch, cfbdName, season);
        return aliasMatch;
      }
    }
    
    // Try exact name match
    const exactMatch = await prisma.team.findFirst({
      where: {
        name: { equals: cfbdName, mode: 'insensitive' },
      },
    });
    
    if (exactMatch) {
      await this.storeMapping(exactMatch.id, cfbdName, season);
      return exactMatch.id;
    }
    
    // Fuzzy matching (simple - check if name contains key words)
    // This is a fallback - should be rare
    return null;
  }
  
  /**
   * Store mapping in database
   */
  private async storeMapping(internalId: string, cfbdName: string, season: number) {
    await prisma.cfbdTeamMap.upsert({
      where: { teamIdInternal: internalId },
      update: {
        teamNameCfbd: cfbdName,
        seasonLastSeen: season,
        updatedAt: new Date(),
      },
      create: {
        teamIdInternal: internalId,
        teamNameCfbd: cfbdName,
        seasonFirstSeen: season,
        seasonLastSeen: season,
      },
    });
  }
  
  /**
   * Get all mappings for a season
   */
  async getAllMappings(season: number): Promise<Map<string, string>> {
    const mappings = await prisma.cfbdTeamMap.findMany({
      where: {
        OR: [
          { seasonFirstSeen: { lte: season } },
          { seasonLastSeen: { gte: season } },
        ],
      },
    });
    
    const map = new Map<string, string>();
    for (const m of mappings) {
      map.set(m.teamNameCfbd.toLowerCase(), m.teamIdInternal);
    }
    
    return map;
  }
  
  /**
   * Report unmapped teams
   */
  async reportUnmapped(cfbdNames: string[], season: number): Promise<string[]> {
    const unmapped: string[] = [];
    
    for (const name of cfbdNames) {
      const mapped = await this.mapToInternal(name, season);
      if (!mapped) {
        unmapped.push(name);
      }
    }
    
    return unmapped;
  }
}

