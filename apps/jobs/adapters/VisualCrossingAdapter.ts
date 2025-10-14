/**
 * Visual Crossing Weather Adapter
 * 
 * Fetches game-time weather data from Visual Crossing Timeline API.
 * Requires VISUALCROSSING_API_KEY environment variable.
 * 
 * NOTE: This adapter only fetches and logs weather data.
 * It does NOT write to the database (no weather table exists yet).
 */

import { DataSourceAdapter, Team, Game, MarketLine } from './DataSourceAdapter';

interface VisualCrossingConfig {
  baseUrl: string;
  units: string;      // 'us' = F, mph
  include: string;    // 'hours' for hourly data
  timeoutMs: number;
}

interface VCHourlyData {
  datetime: string;      // "HH:MM:SS"
  temp: number;          // Temperature
  windspeed: number;     // Wind speed
  precipprob: number;    // Precipitation probability (0-100)
  humidity: number;      // Humidity percentage
  conditions: string;    // Weather conditions description
}

interface VCTimelineResponse {
  days: Array<{
    datetime: string;    // "YYYY-MM-DD"
    hours?: VCHourlyData[];
  }>;
}

export class VisualCrossingAdapter implements DataSourceAdapter {
  private config: VisualCrossingConfig;
  private apiKey: string;
  private baseUrl: string;

  constructor(config: VisualCrossingConfig) {
    this.config = config;
    
    // Check for API key
    this.apiKey = process.env.VISUALCROSSING_API_KEY || '';
    if (!this.apiKey) {
      throw new Error(
        'VISUALCROSSING_API_KEY environment variable is required for Visual Crossing adapter.\n' +
        'Get your API key from https://www.visualcrossing.com and add it to your .env file.'
      );
    }

    this.baseUrl = config.baseUrl;
  }

  getName(): string {
    return 'VisualCrossing';
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  /**
   * Visual Crossing doesn't provide team data
   */
  async getTeams(season: number): Promise<Team[]> {
    return [];
  }

  /**
   * Visual Crossing doesn't provide schedules
   */
  async getSchedules(season: number, weeks: number[]): Promise<Game[]> {
    return [];
  }

  /**
   * Visual Crossing doesn't provide market lines
   */
  async getMarketLines(season: number, weeks: number[]): Promise<MarketLine[]> {
    return [];
  }

  /**
   * Visual Crossing doesn't provide team branding
   */
  async getTeamBranding(): Promise<any[]> {
    return [];
  }

  /**
   * Fetch and log weather data for games
   * This is called manually, not by the standard ingest flow
   */
  async fetchWeatherForGames(season: number, weeks: number[]): Promise<void> {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    try {
      // Fetch games for the specified season and weeks
      const games = await prisma.game.findMany({
        where: {
          season,
          week: { in: weeks }
        },
        include: {
          homeTeam: true,
          awayTeam: true
        },
        orderBy: [
          { week: 'asc' },
          { date: 'asc' }
        ]
      });

      console.log(`\n⛅ Fetching weather for ${games.length} games...\n`);

      let fetched = 0;
      let skipped = 0;
      let errors = 0;

      for (const game of games) {
        try {
          // Check if we have city info
          if (!game.city) {
            console.log(`⚠️  ${season} wk${game.week} ${game.awayTeamId}-${game.homeTeamId} → No city/state, skipped`);
            skipped++;
            continue;
          }

          // Build location string (city only or city, state)
          // For simplicity, we'll just use the city from the game
          // In production, you might want to fetch the home team's state
          const location = game.city;
          
          // Get game date in YYYY-MM-DD format
          const gameDate = new Date(game.date);
          const dateStr = gameDate.toISOString().split('T')[0];

          // Get game time (hour)
          const gameHour = gameDate.getUTCHours(); // Using UTC for simplicity

          // Fetch weather data
          const weather = await this.fetchWeatherForLocation(location, dateStr, gameHour);

          if (weather) {
            // Format the log line as specified
            const formattedDate = gameDate.toISOString().slice(11, 16); // HH:MM
            console.log(
              `weather-vc: ${season} wk${game.week} ${game.awayTeamId}-${game.homeTeamId} @ ${formattedDate} → ` +
              `temp ${weather.temp}°F, wind ${weather.windspeed} mph, precipProb ${weather.precipprob}%`
            );
            fetched++;
          } else {
            console.log(`⚠️  ${season} wk${game.week} ${game.awayTeamId}-${game.homeTeamId} → Weather data unavailable`);
            skipped++;
          }

          // Rate limiting - small delay between requests
          await this.delay(100);

        } catch (error) {
          console.log(`❌ ${season} wk${game.week} ${game.awayTeamId}-${game.homeTeamId} → ${(error as Error).message}`);
          errors++;
        }
      }

      console.log(`\n✅ Weather fetch complete: ${fetched} fetched, ${skipped} skipped, ${errors} errors\n`);

    } finally {
      await prisma.$disconnect();
    }
  }

  /**
   * Fetch weather for a specific location and date
   */
  private async fetchWeatherForLocation(
    location: string,
    date: string,
    targetHour: number
  ): Promise<VCHourlyData | null> {
    try {
      // Build URL
      const url = new URL(`${this.baseUrl}/${encodeURIComponent(location)}/${date}`);
      url.searchParams.set('key', this.apiKey);
      url.searchParams.set('include', this.config.include);
      url.searchParams.set('unitGroup', this.config.units);

      // Make request
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        }
      });

      clearTimeout(timeout);

      if (!response.ok) {
        // Don't throw for 4xx/5xx, just return null
        return null;
      }

      const data: VCTimelineResponse = await response.json();

      // Find the day
      if (!data.days || data.days.length === 0) {
        return null;
      }

      const day = data.days[0];
      if (!day.hours || day.hours.length === 0) {
        return null;
      }

      // Find the hour closest to game time
      const closestHour = this.findClosestHour(day.hours, targetHour);
      return closestHour;

    } catch (error) {
      if ((error as any).name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  /**
   * Find the hour closest to the target hour
   */
  private findClosestHour(hours: VCHourlyData[], targetHour: number): VCHourlyData | null {
    if (hours.length === 0) return null;

    let closest = hours[0];
    let minDiff = Math.abs(this.parseHour(hours[0].datetime) - targetHour);

    for (const hour of hours) {
      const hourNum = this.parseHour(hour.datetime);
      const diff = Math.abs(hourNum - targetHour);
      if (diff < minDiff) {
        minDiff = diff;
        closest = hour;
      }
    }

    return closest;
  }

  /**
   * Parse hour from "HH:MM:SS" format
   */
  private parseHour(timeStr: string): number {
    const parts = timeStr.split(':');
    return parseInt(parts[0], 10);
  }

  /**
   * Delay helper for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

