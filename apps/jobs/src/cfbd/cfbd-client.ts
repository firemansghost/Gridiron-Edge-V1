/**
 * CFBD API Client with Rate Limiting
 * 
 * Handles:
 * - Rate limit management (burst + sustained)
 * - Retry with jittered backoff
 * - Per-endpoint concurrency caps
 * - Error handling
 */

interface RateLimitConfig {
  burst: number; // Requests per burst window
  sustained: number; // Requests per sustained window
  burstWindowMs: number;
  sustainedWindowMs: number;
  maxConcurrency: number; // Per endpoint
}

class RateLimiter {
  private burstQueue: number[] = [];
  private sustainedQueue: number[] = [];
  private config: RateLimitConfig;
  private activeRequests = 0;
  
  constructor(config: RateLimitConfig) {
    this.config = config;
  }
  
  async acquire(): Promise<void> {
    while (this.activeRequests >= this.config.maxConcurrency) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const now = Date.now();
    
    // Clean old entries
    this.burstQueue = this.burstQueue.filter(t => now - t < this.config.burstWindowMs);
    this.sustainedQueue = this.sustainedQueue.filter(t => now - t < this.config.sustainedWindowMs);
    
    // Check burst limit
    if (this.burstQueue.length >= this.config.burst) {
      const oldest = Math.min(...this.burstQueue);
      const waitTime = this.config.burstWindowMs - (now - oldest) + 100; // Add 100ms buffer
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.acquire(); // Retry
    }
    
    // Check sustained limit
    if (this.sustainedQueue.length >= this.config.sustained) {
      const oldest = Math.min(...this.sustainedQueue);
      const waitTime = this.config.sustainedWindowMs - (now - oldest) + 100;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.acquire(); // Retry
    }
    
    // Acquire
    this.burstQueue.push(now);
    this.sustainedQueue.push(now);
    this.activeRequests++;
  }
  
  release() {
    this.activeRequests--;
  }
}

export class CFBDClient {
  private apiKey: string;
  private baseUrl: string;
  private rateLimiter: RateLimiter;
  
  constructor() {
    this.apiKey = process.env.CFBD_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('CFBD_API_KEY environment variable is required');
    }
    
    this.baseUrl = process.env.CFBD_BASE_URL || 'https://api.collegefootballdata.com';
    
    // Rate limits: Free tier ~1000/day, Paid ~10k/day
    // Conservative defaults: 50 burst, 500 sustained per hour
    this.rateLimiter = new RateLimiter({
      burst: 50,
      sustained: 500,
      burstWindowMs: 60 * 1000, // 1 minute
      sustainedWindowMs: 60 * 60 * 1000, // 1 hour
      maxConcurrency: 5, // 5 concurrent requests per endpoint
    });
  }
  
  private async request<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T> {
    await this.rateLimiter.acquire();
    
    try {
      const url = new URL(`${this.baseUrl}${endpoint}`);
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value.toString());
      }
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      
      let response: Response;
      let retries = 3;
      let backoff = 1000; // Start with 1 second
      
      while (retries > 0) {
        try {
          response = await fetch(url.toString(), {
            signal: controller.signal,
            redirect: 'manual',
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Accept': 'application/json',
              'User-Agent': 'gridiron-edge-jobs/1.0',
            },
          });
          
          clearTimeout(timeout);
          
          // Handle rate limiting (429)
          if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After');
            const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : backoff;
            console.warn(`[CFBD] Rate limited, waiting ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            backoff *= 2; // Exponential backoff
            retries--;
            continue;
          }
          
          // Handle redirects
          if (response.status === 301 || response.status === 302) {
            const location = response.headers.get('location');
            throw new Error(`CFBD API redirected: ${response.status} to ${location}`);
          }
          
          // Handle errors
          if (!response.ok) {
            const body = await response.text();
            throw new Error(`CFBD API error: ${response.status} ${response.statusText} - ${body.substring(0, 200)}`);
          }
          
          // Parse JSON
          const contentType = response.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            const body = await response.text();
            throw new Error(`CFBD non-JSON response (type=${contentType}): ${body.substring(0, 200)}`);
          }
          
          const data = await response.json();
          return data as T;
          
        } catch (error: any) {
          if (error.name === 'AbortError') {
            throw new Error('CFBD API request timeout');
          }
          
          if (retries > 0 && (response!.status >= 500 || response!.status === 429)) {
            retries--;
            const jitter = Math.random() * 500; // Add jitter
            await new Promise(resolve => setTimeout(resolve, backoff + jitter));
            backoff *= 2;
            continue;
          }
          
          throw error;
        }
      }
      
      throw new Error('CFBD API request failed after retries');
      
    } finally {
      this.rateLimiter.release();
    }
  }
  
  // Advanced Stats
  async getAdvancedStatsSeason(year: number, team?: string): Promise<any[]> {
    const params: Record<string, string | number> = { year };
    if (team) params.team = team;
    return this.request<any[]>(`/stats/season/advanced`, params);
  }
  
  async getAdvancedStatsGame(year: number, week?: number, team?: string): Promise<any[]> {
    const params: Record<string, string | number> = { year };
    if (week) params.week = week;
    if (team) params.team = team;
    return this.request<any[]>(`/stats/game/advanced`, params);
  }
  
  // PPA
  async getPPASeason(year: number, team?: string): Promise<any[]> {
    const params: Record<string, string | number> = { year };
    if (team) params.team = team;
    return this.request<any[]>(`/ppa/players/season`, params);
  }
  
  async getPPAGames(year: number, week?: number, team?: string): Promise<any[]> {
    const params: Record<string, string | number> = { year };
    if (week) params.week = week;
    if (team) params.team = team;
    return this.request<any[]>(`/ppa/games`, params);
  }
  
  // Drives
  async getDrives(year: number, week?: number, team?: string): Promise<any[]> {
    const params: Record<string, string | number> = { year };
    if (week) params.week = week;
    if (team) params.team = team;
    return this.request<any[]>(`/drives`, params);
  }
  
  // Talent
  async getTalent(year: number): Promise<any[]> {
    return this.request<any[]>(`/talent`, { year });
  }
  
  // Returning Production
  async getReturningProduction(year: number, team?: string): Promise<any[]> {
    const params: Record<string, string | number> = { year };
    if (team) params.team = team;
    return this.request<any[]>(`/player/returning`, params);
  }
  
  // Games (schedule)
  async getGames(year: number, week?: number, team?: string, seasonType?: string): Promise<any[]> {
    const params: Record<string, string | number> = { year };
    if (week) params.week = week;
    if (team) params.team = team;
    if (seasonType) params.seasonType = seasonType;
    return this.request<any[]>(`/games`, params);
  }
  
  // Standard Game Stats (yards, plays, turnovers - not advanced)
  // Uses /games/teams endpoint which returns game stats with teams array
  async getTeamGameStats(year: number, week?: number, team?: string, seasonType?: string): Promise<any[]> {
    const params: Record<string, string | number> = { year };
    if (week) params.week = week;
    if (team) params.team = team;
    if (seasonType) params.seasonType = seasonType;
    return this.request<any[]>(`/games/teams`, params);
  }
  
  // Weather (if available)
  async getWeather(year: number, week?: number): Promise<any[]> {
    const params: Record<string, string | number> = { year };
    if (week) params.week = week;
    return this.request<any[]>(`/games/weather`, params);
  }
}

