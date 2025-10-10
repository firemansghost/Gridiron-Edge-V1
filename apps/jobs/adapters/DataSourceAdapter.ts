/**
 * M5 DataSourceAdapter Interface
 * 
 * Defines the contract for data source adapters to fetch team schedules,
 * team information, and market lines from various providers.
 */

export interface Team {
  id: string;
  name: string;
  conference: string;
  division?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

export interface Game {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  season: number;
  week: number;
  date: Date;
  status: 'scheduled' | 'in_progress' | 'final';
  venue: string;
  city: string;
  neutralSite: boolean;
  conferenceGame: boolean;
  homeScore?: number;
  awayScore?: number;
}

export interface MarketLine {
  gameId: string;
  lineType: 'spread' | 'total';
  openingLine: number;
  closingLine: number;
  timestamp: Date;
  bookName: string;
}

export interface DataSourceAdapter {
  /**
   * Fetch team information for a given season
   */
  getTeams(season: number): Promise<Team[]>;

  /**
   * Fetch game schedules for a given season and week range
   */
  getSchedules(season: number, weeks: number[]): Promise<Game[]>;

  /**
   * Fetch market lines (closing only) for a given season and week range
   */
  getMarketLines(season: number, weeks: number[]): Promise<MarketLine[]>;

  /**
   * Get the name of this adapter
   */
  getName(): string;

  /**
   * Check if this adapter is available/configured
   */
  isAvailable(): Promise<boolean>;
}

export interface AdapterConfig {
  provider: string;
  enabled: boolean;
  config: Record<string, any>;
}

export interface DataSourcesConfig {
  adapters: Record<string, AdapterConfig>;
  defaultAdapter: string;
}
