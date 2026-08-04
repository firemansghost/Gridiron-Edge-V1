/**
 * Pure helpers for preseason provider validation (Odds API + CFBD).
 * No secrets logged. No DB writes. Safe for unit tests with mocked responses.
 */

export const ODDS_SPORT_KEY = 'americanfootball_ncaaf';
export const ODDS_DEFAULT_MARKETS = 'h2h,spreads,totals';
export const ODDS_DEFAULT_REGION = 'us';

/**
 * Expected maximum Odds API credits for one featured NCAAF probe:
 * 1 region (`us`) × 3 markets (`h2h,spreads,totals`) = up to 3 credits.
 * Actual charge is authoritative via `x-requests-last` response header.
 * Zero-event responses are typically 0 credits.
 */
export const ODDS_PROBE_MAX_EXPECTED_CREDITS = 3;
export const ODDS_SPORTS_LIST_EXPECTED_CREDITS = 0;

/** Document expected credit ceiling for the optional featured-odds probe (not a live charge). */
export function expectedMaxCreditsForOddsProbe(options?: {
  regions?: number;
  markets?: number;
}): number {
  const regions = options?.regions ?? 1;
  const markets = options?.markets ?? ODDS_DEFAULT_MARKETS.split(',').length;
  return regions * markets;
}

export interface QuotaHeaders {
  requestsLast: string | null;
  requestsUsed: string | null;
  requestsRemaining: string | null;
}

export interface OddsSportEntry {
  key: string;
  active?: boolean;
  title?: string;
  group?: string;
}

export interface OddsEventSummary {
  eventCount: number;
  earliestCommence: string | null;
  latestCommence: string | null;
}

export interface ProviderKeyPresence {
  cfbdPresent: boolean;
  oddsPresent: boolean;
}

/** Check env var presence without reading/printing values. */
export function checkProviderKeyPresence(env: NodeJS.ProcessEnv = process.env): ProviderKeyPresence {
  return {
    cfbdPresent: Boolean(env.CFBD_API_KEY && String(env.CFBD_API_KEY).trim()),
    oddsPresent: Boolean(env.ODDS_API_KEY && String(env.ODDS_API_KEY).trim()),
  };
}

/** Parse The Odds API quota headers (names only — never auth headers). */
export function parseOddsQuotaHeaders(headers: Headers | Record<string, string | null>): QuotaHeaders {
  const get = (name: string): string | null => {
    if (typeof (headers as Headers).get === 'function') {
      return (headers as Headers).get(name);
    }
    const map = headers as Record<string, string | null>;
    const lower = name.toLowerCase();
    for (const [k, v] of Object.entries(map)) {
      if (k.toLowerCase() === lower) {
        return v;
      }
    }
    return null;
  };

  return {
    requestsLast: get('x-requests-last'),
    requestsUsed: get('x-requests-used'),
    requestsRemaining: get('x-requests-remaining'),
  };
}

export function findNcaafSport(sports: OddsSportEntry[]): OddsSportEntry | undefined {
  return sports.find((s) => s.key === ODDS_SPORT_KEY);
}

export function isNcaafActive(sports: OddsSportEntry[]): boolean {
  const sport = findNcaafSport(sports);
  return Boolean(sport && sport.active !== false);
}

export function summarizeOddsEvents(
  events: Array<{ commence_time?: string; commenceTime?: string }>
): OddsEventSummary {
  if (!Array.isArray(events) || events.length === 0) {
    return { eventCount: 0, earliestCommence: null, latestCommence: null };
  }

  const times = events
    .map((e) => e.commence_time || e.commenceTime)
    .filter((t): t is string => Boolean(t))
    .sort();

  return {
    eventCount: events.length,
    earliestCommence: times[0] ?? null,
    latestCommence: times[times.length - 1] ?? null,
  };
}

export function classifyOddsHttpStatus(status: number): 'ok' | 'invalid_key' | 'error' {
  if (status === 200) return 'ok';
  if (status === 401 || status === 403) return 'invalid_key';
  return 'error';
}

export function summarizeCfbdGames(
  games: Array<{ startDate?: string; start_date?: string; season?: number }>
): {
  gameCount: number;
  season2026Count: number;
  earliestStart: string | null;
  latestStart: string | null;
} {
  if (!Array.isArray(games) || games.length === 0) {
    return { gameCount: 0, season2026Count: 0, earliestStart: null, latestStart: null };
  }

  const season2026Count = games.filter((g) => g.season === 2026).length;
  const starts = games
    .map((g) => g.startDate || g.start_date)
    .filter((t): t is string => Boolean(t))
    .sort();

  return {
    gameCount: games.length,
    season2026Count,
    earliestStart: starts[0] ?? null,
    latestStart: starts[starts.length - 1] ?? null,
  };
}

/** Redact any query string that might contain apiKey — for safe logging. */
export function redactUrlForLog(url: string): string {
  try {
    const u = new URL(url);
    if (u.searchParams.has('apiKey')) {
      u.searchParams.set('apiKey', 'REDACTED');
    }
    return u.toString();
  } catch {
    return url.replace(/apiKey=[^&]+/gi, 'apiKey=REDACTED');
  }
}

export function buildOddsSportsUrl(baseUrl: string, apiKey: string): string {
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/sports?apiKey=${encodeURIComponent(apiKey)}`;
}

export function buildOddsNcaafOddsUrl(baseUrl: string, apiKey: string): string {
  const base = baseUrl.replace(/\/$/, '');
  const markets = ODDS_DEFAULT_MARKETS;
  const region = ODDS_DEFAULT_REGION;
  return `${base}/sports/${ODDS_SPORT_KEY}/odds?apiKey=${encodeURIComponent(apiKey)}&regions=${region}&markets=${markets}&oddsFormat=american`;
}

export function buildCfbdGamesUrl(baseUrl: string, season: number): string {
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/games?year=${season}&seasonType=regular`;
}
