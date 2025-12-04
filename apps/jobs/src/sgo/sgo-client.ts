/**
 * SportsGameOdds (SGO) Client
 * 
 * Client for fetching team season stats from SportsGameOdds API.
 * Reuses the same API key and base URL configuration as the odds adapter.
 */

interface SGOConfig {
  baseUrl?: string;
  timeoutMs?: number;
}

interface SGOStatValue {
  statId: string;
  value: number;
}

interface SGOTeamStatRow {
  teamId?: string;
  team_id?: string;
  teamName?: string;
  team_name?: string;
  season?: number;
  stats?: SGOStatValue[];
  [key: string]: any; // SGO may have additional fields
}

export class SGOClient {
  private apiKey: string;
  private baseUrl: string;
  private timeoutMs: number;

  constructor(config?: SGOConfig) {
    // Check for API key
    this.apiKey = process.env.SGO_API_KEY || '';
    if (!this.apiKey) {
      throw new Error(
        'SGO_API_KEY environment variable is required for SGO client.\n' +
        'Get your API key from https://sportsgameodds.com and add it to your .env file.'
      );
    }

    // Use env override or config, defaulting to the same base URL pattern as the odds adapter
    // Note: Team stats endpoint may be at /v2/stats or /v2/teams/stats, we'll try both
    const defaultBaseUrl = process.env.SGO_BASE_URL || 'https://api.sportsgameodds.com/v2';
    this.baseUrl = config?.baseUrl || defaultBaseUrl;
    this.timeoutMs = config?.timeoutMs || 20000;

    console.log(`[SGO Client] Base URL: ${this.baseUrl}`);
  }

  /**
   * Fetch season-level team stats from SGO API
   * 
   * @param season - Season year (e.g., 2024)
   * @returns Array of team stat rows
   */
  async getSeasonTeamStats(season: number): Promise<SGOTeamStatRow[]> {
    // Try multiple possible endpoints for team stats
    const possibleEndpoints = [
      `${this.baseUrl}/stats/teams?season=${season}&league=NCAAF`,
      `${this.baseUrl}/teams/stats?season=${season}&league=NCAAF`,
      `${this.baseUrl}/stats/season?season=${season}&league=NCAAF`,
      `${this.baseUrl}/stats?season=${season}&league=NCAAF&type=team`,
    ];

    let lastError: Error | null = null;

    for (const url of possibleEndpoints) {
      try {
        console.log(`[SGO Client] Trying endpoint: ${url}`);
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'X-Api-Key': this.apiKey,
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!response.ok) {
          if (response.status === 404) {
            // Try next endpoint
            continue;
          }
          const errorBody = await response.text();
          console.error(`[SGO Client] ERROR ${response.status} ${response.statusText} for ${url}`);
          console.error(errorBody.slice(0, 800));
          throw new Error(`SGO API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        // Handle different response structures
        let teams: SGOTeamStatRow[] = [];
        if (Array.isArray(data)) {
          teams = data;
        } else if (data.data && Array.isArray(data.data)) {
          teams = data.data;
        } else if (data.teams && Array.isArray(data.teams)) {
          teams = data.teams;
        } else if (data.stats && Array.isArray(data.stats)) {
          teams = data.stats;
        } else {
          console.warn(`[SGO Client] Unexpected response structure:`, JSON.stringify(data).substring(0, 500));
          return [];
        }

        console.log(`[SGO Client] Successfully fetched ${teams.length} team stat rows from ${url}`);
        return teams;
      } catch (error: any) {
        if (error.name === 'AbortError') {
          lastError = new Error('Request timeout');
          continue;
        }
        if (error.message?.includes('404')) {
          // Try next endpoint
          continue;
        }
        lastError = error;
      }
    }

    // If all endpoints failed, throw the last error
    if (lastError) {
      throw new Error(`Failed to fetch SGO team stats from any endpoint. Last error: ${lastError.message}`);
    }

    throw new Error('No valid SGO team stats endpoint found. Please check API documentation.');
  }
}



