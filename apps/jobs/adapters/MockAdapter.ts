/**
 * M5 Mock Data Source Adapter
 * 
 * Reads data from local CSV/JSON files in /data/ directory.
 * Used for development and testing without external API dependencies.
 */

import fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { DataSourceAdapter, Team, Game, MarketLine, TeamBranding } from './DataSourceAdapter';

export class MockAdapter implements DataSourceAdapter {
  private dataPath: string;
  private fileFormats: Record<string, string>;
  private defaultBook: string;

  constructor(config: {
    dataPath: string;
    fileFormats: Record<string, string>;
    defaultBook: string;
  }) {
    this.dataPath = config.dataPath;
    this.fileFormats = config.fileFormats;
    this.defaultBook = config.defaultBook;
  }

  getName(): string {
    return 'Mock Data Source';
  }

  async isAvailable(): Promise<boolean> {
    try {
      return existsSync(this.dataPath);
    } catch {
      return false;
    }
  }

  async getTeams(season: number): Promise<Team[]> {
    const filePath = path.join(this.dataPath, this.fileFormats.teams);
    
    if (!existsSync(filePath)) {
      throw new Error(`Teams file not found: ${filePath}`);
    }

    const data = JSON.parse(readFileSync(filePath, 'utf8'));
    return data.teams || data;
  }

  async getSchedules(season: number, weeks: number[]): Promise<Game[]> {
    const games: Game[] = [];

    for (const week of weeks) {
      const filePath = path.join(
        this.dataPath, 
        this.fileFormats.schedules
          .replace('{season}', season.toString())
          .replace('{week}', week.toString())
      );

      if (!existsSync(filePath)) {
        console.warn(`Schedule file not found for season ${season}, week ${week}: ${filePath}`);
        continue;
      }

      const data = JSON.parse(readFileSync(filePath, 'utf8'));
      const weekGames = data.games || data;
      
      // Convert date strings to Date objects
      const processedGames = weekGames.map((game: any) => ({
        ...game,
        date: new Date(game.date)
      }));

      games.push(...processedGames);
    }

    return games;
  }

  async getMarketLines(season: number, weeks: number[]): Promise<MarketLine[]> {
    const marketLines: MarketLine[] = [];

    for (const week of weeks) {
      const filePath = path.join(
        this.dataPath,
        this.fileFormats.marketLines
          .replace('{season}', season.toString())
          .replace('{week}', week.toString())
      );

      if (!existsSync(filePath)) {
        console.warn(`Market lines file not found for season ${season}, week ${week}: ${filePath}`);
        continue;
      }

      const data = JSON.parse(readFileSync(filePath, 'utf8'));
      const weekLines = data.marketLines || data;
      
      // Convert timestamp strings to Date objects
      const processedLines = weekLines.map((line: any) => ({
        ...line,
        timestamp: new Date(line.timestamp)
      }));

      marketLines.push(...processedLines);
    }

    return marketLines;
  }

  async getTeamBranding(): Promise<TeamBranding[]> {
    try {
      const filePath = path.join(process.cwd(), 'data', 'teams-branding.json');
      const data = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(data);
      return parsed.teams || parsed || [];
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.warn('[MockAdapter] team branding file not found, skipping.');
        return [];
      }
      console.warn('[MockAdapter] Error reading team branding:', error.message);
      return [];
    }
  }
}
