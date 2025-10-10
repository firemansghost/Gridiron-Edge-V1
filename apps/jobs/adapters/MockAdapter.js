/**
 * M5 Mock Data Source Adapter
 * 
 * Reads data from local CSV/JSON files in /data/ directory.
 * Used for development and testing without external API dependencies.
 */

const fs = require('fs');
const path = require('path');

class MockAdapter {
  constructor(config) {
    this.dataPath = config.dataPath;
    this.fileFormats = config.fileFormats;
    this.defaultBook = config.defaultBook;
  }

  getName() {
    return 'Mock Data Source';
  }

  async isAvailable() {
    try {
      return fs.existsSync(this.dataPath);
    } catch {
      return false;
    }
  }

  async getTeams(season) {
    const filePath = path.join(this.dataPath, this.fileFormats.teams);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`Teams file not found: ${filePath}`);
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return data.teams || data;
  }

  async getTeamBranding() {
    const filePath = path.join(this.dataPath, 'teams-branding.json');
    
    if (!fs.existsSync(filePath)) {
      console.log('No team branding file found, skipping branding updates');
      return [];
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return data;
  }

  async getSchedules(season, weeks) {
    const games = [];

    for (const week of weeks) {
      const filePath = path.join(
        this.dataPath, 
        this.fileFormats.schedules
          .replace('{season}', season.toString())
          .replace('{week}', week.toString())
      );

      if (!fs.existsSync(filePath)) {
        console.warn(`Schedule file not found for season ${season}, week ${week}: ${filePath}`);
        continue;
      }

      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const weekGames = data.games || data;
      
      // Convert date strings to Date objects
      const processedGames = weekGames.map((game) => ({
        ...game,
        date: new Date(game.date)
      }));

      games.push(...processedGames);
    }

    return games;
  }

  async getMarketLines(season, weeks) {
    const marketLines = [];

    for (const week of weeks) {
      const filePath = path.join(
        this.dataPath,
        this.fileFormats.marketLines
          .replace('{season}', season.toString())
          .replace('{week}', week.toString())
      );

      if (!fs.existsSync(filePath)) {
        console.warn(`Market lines file not found for season ${season}, week ${week}: ${filePath}`);
        continue;
      }

      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const weekLines = data.marketLines || data;
      
      // Convert timestamp strings to Date objects
      const processedLines = weekLines.map((line) => ({
        ...line,
        timestamp: new Date(line.timestamp)
      }));

      marketLines.push(...processedLines);
    }

    return marketLines;
  }
}

module.exports = { MockAdapter };
