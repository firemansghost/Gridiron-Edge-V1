/**
 * Unit tests for preseason provider validation helpers (mocked responses only).
 * No network calls. No secrets.
 */

import {
  buildCfbdGamesUrl,
  buildOddsNcaafOddsUrl,
  buildOddsSportsUrl,
  checkProviderKeyPresence,
  classifyOddsHttpStatus,
  expectedMaxCreditsForOddsProbe,
  findNcaafSport,
  isNcaafActive,
  ODDS_DEFAULT_MARKETS,
  ODDS_PROBE_MAX_EXPECTED_CREDITS,
  ODDS_SPORT_KEY,
  ODDS_SPORTS_LIST_EXPECTED_CREDITS,
  parseOddsQuotaHeaders,
  redactUrlForLog,
  summarizeCfbdGames,
  summarizeOddsEvents,
} from '../src/preseason/provider-validation';

describe('preseason provider validation', () => {
  describe('checkProviderKeyPresence', () => {
    it('detects missing keys without printing values', () => {
      const result = checkProviderKeyPresence({} as NodeJS.ProcessEnv);
      expect(result.cfbdPresent).toBe(false);
      expect(result.oddsPresent).toBe(false);
    });

    it('detects present keys without exposing values', () => {
      const result = checkProviderKeyPresence({
        CFBD_API_KEY: 'secret-cfbd',
        ODDS_API_KEY: 'secret-odds',
      } as NodeJS.ProcessEnv);
      expect(result.cfbdPresent).toBe(true);
      expect(result.oddsPresent).toBe(true);
      expect(JSON.stringify(result)).not.toMatch(/secret-/);
    });
    it('detects missing CFBD key alone', () => {
      const result = checkProviderKeyPresence({
        ODDS_API_KEY: 'present',
      } as NodeJS.ProcessEnv);
      expect(result.cfbdPresent).toBe(false);
      expect(result.oddsPresent).toBe(true);
    });

    it('detects missing Odds key alone', () => {
      const result = checkProviderKeyPresence({
        CFBD_API_KEY: 'present',
      } as NodeJS.ProcessEnv);
      expect(result.cfbdPresent).toBe(true);
      expect(result.oddsPresent).toBe(false);
    });
  });

  describe('odds probe credit ceiling', () => {
    it('expects /v4/sports list at 0 credits and featured probe up to 3', () => {
      expect(ODDS_SPORTS_LIST_EXPECTED_CREDITS).toBe(0);
      expect(ODDS_PROBE_MAX_EXPECTED_CREDITS).toBe(3);
      expect(expectedMaxCreditsForOddsProbe()).toBe(3);
      expect(ODDS_DEFAULT_MARKETS.split(',').length).toBe(3);
      expect(expectedMaxCreditsForOddsProbe({ regions: 1, markets: 3 })).toBe(3);
    });
  });

  describe('odds sports response', () => {
    it('detects active NCAAF sport', () => {
      const sports = [
        { key: 'basketball_nba', active: true },
        { key: ODDS_SPORT_KEY, active: true, title: 'NCAAF' },
      ];
      expect(isNcaafActive(sports)).toBe(true);
      expect(findNcaafSport(sports)?.title).toBe('NCAAF');
    });

    it('fails when NCAAF missing or inactive', () => {
      expect(isNcaafActive([{ key: 'basketball_nba', active: true }])).toBe(false);
      expect(isNcaafActive([{ key: ODDS_SPORT_KEY, active: false }])).toBe(false);
    });
  });

  describe('classifyOddsHttpStatus', () => {
    it('classifies invalid/deactivated key responses', () => {
      expect(classifyOddsHttpStatus(401)).toBe('invalid_key');
      expect(classifyOddsHttpStatus(403)).toBe('invalid_key');
      expect(classifyOddsHttpStatus(200)).toBe('ok');
      expect(classifyOddsHttpStatus(500)).toBe('error');
    });
  });

  describe('summarizeOddsEvents', () => {
    it('handles zero-event odds response', () => {
      expect(summarizeOddsEvents([])).toEqual({
        eventCount: 0,
        earliestCommence: null,
        latestCommence: null,
      });
    });

    it('summarizes commence times', () => {
      const summary = summarizeOddsEvents([
        { commence_time: '2026-08-30T19:00:00Z' },
        { commence_time: '2026-08-28T16:00:00Z' },
        { commence_time: '2026-09-01T00:00:00Z' },
      ]);
      expect(summary.eventCount).toBe(3);
      expect(summary.earliestCommence).toBe('2026-08-28T16:00:00Z');
      expect(summary.latestCommence).toBe('2026-09-01T00:00:00Z');
    });
  });

  describe('parseOddsQuotaHeaders', () => {
    it('parses quota headers from a Headers-like map', () => {
      const quota = parseOddsQuotaHeaders({
        'x-requests-last': '1',
        'x-requests-used': '12',
        'x-requests-remaining': '19888',
      });
      expect(quota).toEqual({
        requestsLast: '1',
        requestsUsed: '12',
        requestsRemaining: '19888',
      });
    });

    it('parses from Fetch Headers', () => {
      const headers = new Headers({
        'x-requests-last': '2',
        'x-requests-used': '5',
        'x-requests-remaining': '19995',
      });
      expect(parseOddsQuotaHeaders(headers).requestsRemaining).toBe('19995');
    });
  });

  describe('summarizeCfbdGames', () => {
    it('summarizes 2026 CFBD games', () => {
      const summary = summarizeCfbdGames([
        { season: 2026, startDate: '2026-08-28T19:00:00.000Z' },
        { season: 2026, startDate: '2026-08-30T16:00:00.000Z' },
        { season: 2025, startDate: '2025-08-30T16:00:00.000Z' },
      ]);
      expect(summary.gameCount).toBe(3);
      expect(summary.season2026Count).toBe(2);
      expect(summary.earliestStart).toBe('2025-08-30T16:00:00.000Z');
      expect(summary.latestStart).toBe('2026-08-30T16:00:00.000Z');
    });
  });

  describe('URL builders / redaction', () => {
    it('redacts apiKey from logged URLs', () => {
      const url = buildOddsSportsUrl('https://api.the-odds-api.com/v4', 'super-secret-key');
      const redacted = redactUrlForLog(url);
      expect(redacted).toContain('apiKey=REDACTED');
      expect(redacted).not.toContain('super-secret-key');
    });

    it('builds NCAAF odds URL with expected markets/region', () => {
      const url = buildOddsNcaafOddsUrl('https://api.the-odds-api.com/v4', 'k');
      expect(url).toContain('/sports/americanfootball_ncaaf/odds');
      expect(url).toContain('regions=us');
      expect(url).toContain('markets=h2h,spreads,totals');
      expect(url).toContain('oddsFormat=american');
    });

    it('builds CFBD 2026 games URL', () => {
      const url = buildCfbdGamesUrl('https://api.collegefootballdata.com', 2026);
      expect(url).toBe('https://api.collegefootballdata.com/games?year=2026&seasonType=regular');
    });
  });
});
