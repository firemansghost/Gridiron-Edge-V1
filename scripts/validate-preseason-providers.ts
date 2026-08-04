#!/usr/bin/env npx tsx
/**
 * Read-only preseason provider validation (CFBD + The Odds API).
 *
 * Default (zero Odds credits):
 *   - CFBD GET /games?year=2026 (read-only)
 *   - Odds GET /v4/sports (0 credits) — confirms americanfootball_ncaaf active
 *
 * Optional --probe-odds (explicit only):
 *   - Odds GET /v4/sports/americanfootball_ncaaf/odds
 *   - regions=us, markets=h2h,spreads,totals, oddsFormat=american
 *   - Expected maximum: up to 3 credits (1 region × 3 markets)
 *   - Zero-event responses are typically 0 credits
 *   - Actual charge: trust x-requests-last / x-requests-used / x-requests-remaining
 *
 * Usage:
 *   npx tsx scripts/validate-preseason-providers.ts
 *   npx tsx scripts/validate-preseason-providers.ts --probe-odds
 *
 * Never prints secret values, Authorization headers, or URLs with apiKey.
 * Never writes to the database.
 * Never calls CFBD play-by-play.
 *
 * Exit codes:
 *   0 — all required checks passed
 *   1 — missing keys / invalid key / NCAAF inactive / CFBD failed
 */

import {
  buildCfbdGamesUrl,
  buildOddsNcaafOddsUrl,
  buildOddsSportsUrl,
  checkProviderKeyPresence,
  classifyOddsHttpStatus,
  expectedMaxCreditsForOddsProbe,
  isNcaafActive,
  ODDS_PROBE_MAX_EXPECTED_CREDITS,
  ODDS_SPORTS_LIST_EXPECTED_CREDITS,
  parseOddsQuotaHeaders,
  redactUrlForLog,
  summarizeCfbdGames,
  summarizeOddsEvents,
  type OddsSportEntry,
} from '../apps/jobs/src/preseason/provider-validation';

const ODDS_BASE = process.env.ODDS_API_BASE_URL || 'https://api.the-odds-api.com/v4';
const CFBD_BASE = process.env.CFBD_BASE_URL || 'https://api.collegefootballdata.com';
const TARGET_SEASON = 2026;

function parseArgs(argv: string[]): { probeOdds: boolean } {
  return { probeOdds: argv.includes('--probe-odds') };
}

async function validateCfbd(apiKey: string): Promise<boolean> {
  const url = buildCfbdGamesUrl(CFBD_BASE, TARGET_SEASON);
  console.log(`[CFBD] GET ${redactUrlForLog(url)} (Authorization: Bearer <redacted>)`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'User-Agent': 'gridiron-edge-preseason-validate/1.0',
    },
    signal: AbortSignal.timeout(30000),
  });

  console.log(`[CFBD] HTTP ${response.status}`);

  if (!response.ok) {
    console.error(`[CFBD] Failed: ${response.status} ${response.statusText}`);
    return false;
  }

  const games = (await response.json()) as Array<{
    startDate?: string;
    start_date?: string;
    season?: number;
  }>;
  const summary = summarizeCfbdGames(games);
  console.log(`[CFBD] gameCount=${summary.gameCount}`);
  console.log(`[CFBD] season2026Count=${summary.season2026Count}`);
  console.log(`[CFBD] earliestStart=${summary.earliestStart ?? 'n/a'}`);
  console.log(`[CFBD] latestStart=${summary.latestStart ?? 'n/a'}`);

  if (summary.gameCount === 0) {
    console.error('[CFBD] No games returned for 2026 — check season availability');
    return false;
  }

  return true;
}

async function validateOddsSports(apiKey: string): Promise<{ ok: boolean; quota: ReturnType<typeof parseOddsQuotaHeaders> }> {
  const url = buildOddsSportsUrl(ODDS_BASE, apiKey);
  console.log(`[Odds] GET ${redactUrlForLog(url)}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });

  const quota = parseOddsQuotaHeaders(response.headers);
  console.log(`[Odds] HTTP ${response.status}`);
  console.log(`[Odds] x-requests-last=${quota.requestsLast ?? 'n/a'}`);
  console.log(`[Odds] x-requests-used=${quota.requestsUsed ?? 'n/a'}`);
  console.log(`[Odds] x-requests-remaining=${quota.requestsRemaining ?? 'n/a'}`);

  const classif = classifyOddsHttpStatus(response.status);
  if (classif === 'invalid_key') {
    console.error('[Odds] Invalid or deactivated API key');
    return { ok: false, quota };
  }
  if (classif !== 'ok') {
    console.error(`[Odds] Unexpected status: ${response.status} ${response.statusText}`);
    return { ok: false, quota };
  }

  const sports = (await response.json()) as OddsSportEntry[];
  if (!Array.isArray(sports)) {
    console.error('[Odds] Sports response was not an array');
    return { ok: false, quota };
  }

  const active = isNcaafActive(sports);
  console.log(`[Odds] americanfootball_ncaaf active=${active}`);
  if (!active) {
    console.error('[Odds] NCAAF sport key missing or inactive');
    return { ok: false, quota };
  }

  return { ok: true, quota };
}

async function probeOddsFeatured(apiKey: string): Promise<boolean> {
  const url = buildOddsNcaafOddsUrl(ODDS_BASE, apiKey);
  const maxExpected = expectedMaxCreditsForOddsProbe();
  console.log(`[Odds probe] GET ${redactUrlForLog(url)}`);
  console.log(
    `[Odds probe] markets=h2h,spreads,totals region=us oddsFormat=american (expected max ${maxExpected} credits; actual = x-requests-last)`
  );

  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });

  const quota = parseOddsQuotaHeaders(response.headers);
  console.log(`[Odds probe] HTTP ${response.status}`);
  console.log(`[Odds probe] x-requests-last=${quota.requestsLast ?? 'n/a'}`);
  console.log(`[Odds probe] x-requests-used=${quota.requestsUsed ?? 'n/a'}`);
  console.log(`[Odds probe] x-requests-remaining=${quota.requestsRemaining ?? 'n/a'}`);

  const classif = classifyOddsHttpStatus(response.status);
  if (classif === 'invalid_key') {
    console.error('[Odds probe] Invalid or deactivated API key');
    return false;
  }
  if (classif !== 'ok') {
    console.error(`[Odds probe] Unexpected status: ${response.status}`);
    return false;
  }

  const events = (await response.json()) as Array<{ commence_time?: string }>;
  const summary = summarizeOddsEvents(events);
  console.log(`[Odds probe] eventCount=${summary.eventCount}`);
  console.log(`[Odds probe] earliestCommence=${summary.earliestCommence ?? 'n/a'}`);
  console.log(`[Odds probe] latestCommence=${summary.latestCommence ?? 'n/a'}`);

  if (summary.eventCount === 0) {
    console.warn('[Odds probe] Zero events — valid response; NCAAF slate may be empty right now');
  }

  return true;
}

async function main(): Promise<void> {
  const { probeOdds } = parseArgs(process.argv.slice(2));
  console.log('=== Preseason provider validation (read-only) ===');
  console.log(`probeOdds=${probeOdds}`);
  console.log('DB writes: none');

  const presence = checkProviderKeyPresence();
  console.log(`[env] CFBD_API_KEY present=${presence.cfbdPresent}`);
  console.log(`[env] ODDS_API_KEY present=${presence.oddsPresent}`);

  if (!presence.cfbdPresent || !presence.oddsPresent) {
    console.error('[env] Missing required provider key(s). Set secrets in env / GitHub Actions — do not paste into chat.');
    process.exit(1);
  }

  const cfbdKey = process.env.CFBD_API_KEY!;
  const oddsKey = process.env.ODDS_API_KEY!;

  let ok = true;

  try {
    const cfbdOk = await validateCfbd(cfbdKey);
    if (!cfbdOk) ok = false;
  } catch (err) {
    console.error('[CFBD] Request failed:', err instanceof Error ? err.message : 'unknown error');
    ok = false;
  }

  try {
    const sportsResult = await validateOddsSports(oddsKey);
    if (!sportsResult.ok) ok = false;
  } catch (err) {
    console.error('[Odds] Sports request failed:', err instanceof Error ? err.message : 'unknown error');
    ok = false;
  }

  if (probeOdds) {
    try {
      const probeOk = await probeOddsFeatured(oddsKey);
      if (!probeOk) ok = false;
    } catch (err) {
      console.error('[Odds probe] Request failed:', err instanceof Error ? err.message : 'unknown error');
      ok = false;
    }
  } else {
    console.log(
      `[Odds] Featured-market probe skipped (pass --probe-odds; expected max ${ODDS_PROBE_MAX_EXPECTED_CREDITS} credits). /v4/sports expected credits=${ODDS_SPORTS_LIST_EXPECTED_CREDITS}`
    );
  }

  if (!ok) {
    console.error('=== FAILED ===');
    process.exit(1);
  }

  console.log('=== PASSED ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
