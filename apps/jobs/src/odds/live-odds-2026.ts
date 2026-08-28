/**
 * Phase 2C-2J-2 — Guarded 2026 Live Odds PREVIEW/COMMIT (pure helpers).
 *
 * Operational authorization only for persistence decisions.
 * Does not change Odds API adapter live/historical heuristics for legacy callers.
 * Append-only MarketLine observations — no delete/update of historical rows.
 */

import { normalizeBookmakerName } from '../../lib/bookmaker-normalizer';
import type { TeamResolveMethod } from '../../adapters/TeamResolver';

export const LIVE_ODDS_SEASON = 2026;
export const LIVE_ODDS_SOURCE = 'oddsapi';
export const LIVE_ODDS_MARKETS = 'h2h,spreads,totals';
export const LIVE_ODDS_REGION = 'us';
export const MAX_EXPECTED_REQUEST_CREDITS = 3;
export const AUTHORITATIVE_FBS_COUNT = 138;
export const WEEK1_GAME_COUNT = 51;

export type LiveOddsMode = 'PREVIEW' | 'COMMIT';

export function expectedWriteConfirmation(week: number): string {
  return `WRITE_2026_WEEK_${week}_ODDS`;
}

export interface ScheduledGameRow {
  gameId: string;
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
}

export interface ExistingMarketLineRow {
  gameId: string;
  lineType: string;
  bookName: string;
  timestamp: Date | string;
  teamId: string | null;
  lineValue: number;
  closingLine: number;
}

export interface ProviderOutcome {
  name: string;
  price?: number;
  point?: number;
}

export interface ProviderBookmaker {
  key?: string;
  title?: string;
  last_update?: string;
  markets?: Array<{
    key: string;
    last_update?: string;
    outcomes?: ProviderOutcome[];
  }>;
}

export interface ProviderEvent {
  id?: string;
  commence_time?: string;
  home_team: string;
  away_team: string;
  bookmakers?: ProviderBookmaker[];
}

export interface TeamResolveFn {
  (name: string): { teamId: string | null; method: TeamResolveMethod };
}

export type EventClassification =
  | 'matched_requested_week'
  | 'out_of_requested_week'
  | 'out_of_scope_fbs_fcs'
  | 'unresolved_team'
  | 'unmatched_both_fbs'
  | 'ambiguous'
  | 'week_mismatch'
  | 'fuzzy_required';

export interface CandidateMarketLine {
  gameId: string;
  season: number;
  week: number;
  lineType: 'spread' | 'total' | 'moneyline';
  lineValue: number;
  closingLine: number;
  bookName: string;
  timestamp: Date;
  source: typeof LIVE_ODDS_SOURCE;
  teamId: string | null;
}

export interface RejectedSnapshot {
  eventId?: string;
  bookName: string;
  market: string;
  reason: string;
}

export interface EventDiag {
  eventId?: string;
  home_team: string;
  away_team: string;
  classification: EventClassification;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeMethod?: TeamResolveMethod;
  awayMethod?: TeamResolveMethod;
  gameId?: string | null;
  detail?: string;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function approxEqual(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}

export function fingerprintKey(row: {
  gameId: string;
  lineType: string;
  bookName: string;
  timestamp: Date | string;
  teamId: string | null;
}): string {
  const ts =
    row.timestamp instanceof Date
      ? row.timestamp.toISOString()
      : new Date(row.timestamp).toISOString();
  const team = row.teamId == null ? 'NULL' : row.teamId;
  return `${row.gameId}|${row.lineType}|${row.bookName}|${ts}|${team}`;
}

export function validateLiveOddsInputs(options: {
  season: number;
  week: number;
  mode: string;
  confirmation?: string | null;
}): {
  ok: boolean;
  mode: LiveOddsMode | null;
  confirmationValid: boolean;
  expectedConfirmation: string;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (options.season !== LIVE_ODDS_SEASON) {
    reasons.push(`season must be ${LIVE_ODDS_SEASON}`);
  }
  if (!Number.isInteger(options.week) || options.week < 1) {
    reasons.push('week must be a positive integer');
  }
  const mode =
    options.mode === 'PREVIEW' || options.mode === 'COMMIT'
      ? options.mode
      : null;
  if (!mode) reasons.push('mode must be PREVIEW or COMMIT');

  const expectedConfirmation = expectedWriteConfirmation(options.week);
  const confirmationValid = options.confirmation === expectedConfirmation;
  if (mode === 'COMMIT' && !confirmationValid) {
    reasons.push(`COMMIT requires confirmation=${expectedConfirmation}`);
  }

  return {
    ok: reasons.length === 0,
    mode,
    confirmationValid,
    expectedConfirmation,
    reasons,
  };
}

export function validateAuthoritativeSchedule(options: {
  week: number;
  fbsTeamIds: Set<string> | string[];
  games: ScheduledGameRow[];
}): { ok: boolean; reasons: string[]; bothFbsCount: number; duplicateGameIds: number } {
  const fbs = options.fbsTeamIds instanceof Set
    ? options.fbsTeamIds
    : new Set(options.fbsTeamIds);
  const reasons: string[] = [];
  if (fbs.size !== AUTHORITATIVE_FBS_COUNT) {
    reasons.push(
      `authoritative FBS membership must be ${AUTHORITATIVE_FBS_COUNT} (got ${fbs.size})`
    );
  }
  if (options.games.length === 0) {
    reasons.push('authoritative schedule is empty for requested week');
  }
  const ids = options.games.map((g) => g.gameId);
  const duplicateGameIds = ids.length - new Set(ids).size;
  if (duplicateGameIds > 0) {
    reasons.push(`duplicate game IDs: ${duplicateGameIds}`);
  }

  let bothFbsCount = 0;
  for (const g of options.games) {
    if (g.season !== LIVE_ODDS_SEASON) {
      reasons.push(`game ${g.gameId} has season ${g.season}`);
    }
    if (g.week !== options.week) {
      reasons.push(`game ${g.gameId} has week ${g.week}, expected ${options.week}`);
    }
    const both =
      fbs.has(g.homeTeamId) && fbs.has(g.awayTeamId);
    if (both) bothFbsCount++;
    if (options.week === 1 && !both) {
      reasons.push(`Week1 game ${g.gameId} is not FBS-vs-FBS`);
    }
  }

  if (options.week === 1) {
    if (options.games.length !== WEEK1_GAME_COUNT) {
      reasons.push(
        `Week1 gameCount must be ${WEEK1_GAME_COUNT} (got ${options.games.length})`
      );
    }
    if (bothFbsCount !== WEEK1_GAME_COUNT) {
      reasons.push(
        `Week1 FBS-vs-FBS must be ${WEEK1_GAME_COUNT} (got ${bothFbsCount})`
      );
    }
  }

  return { ok: reasons.length === 0, reasons, bothFbsCount, duplicateGameIds };
}

export function evaluateProviderCredits(options: {
  providerCalls: number;
  requestsLast: string | null | undefined;
  maxExpectedCredits?: number;
}): { ok: boolean; requestCreditsLast: number | null; reasons: string[] } {
  const max = options.maxExpectedCredits ?? MAX_EXPECTED_REQUEST_CREDITS;
  const reasons: string[] = [];
  if (options.providerCalls !== 1) {
    reasons.push(`providerCalls must be 1 (got ${options.providerCalls})`);
  }
  let requestCreditsLast: number | null = null;
  if (
    options.requestsLast != null &&
    String(options.requestsLast).trim() !== ''
  ) {
    const n = Number(options.requestsLast);
    if (!Number.isFinite(n)) {
      reasons.push(`x-requests-last is nonfinite: ${options.requestsLast}`);
    } else {
      requestCreditsLast = n;
      if (n > max) {
        reasons.push(
          `x-requests-last ${n} exceeds MAX_EXPECTED_REQUEST_CREDITS=${max}`
        );
      }
    }
  }
  return { ok: reasons.length === 0, requestCreditsLast, reasons };
}

function findExactRequestedWeekGames(
  games: ScheduledGameRow[],
  homeTeamId: string,
  awayTeamId: string
): ScheduledGameRow[] {
  return games.filter(
    (g) => g.homeTeamId === homeTeamId && g.awayTeamId === awayTeamId
  );
}

function findAnyWeekGames(
  allSeasonGames: ScheduledGameRow[],
  homeTeamId: string,
  awayTeamId: string
): ScheduledGameRow[] {
  return allSeasonGames.filter(
    (g) => g.homeTeamId === homeTeamId && g.awayTeamId === awayTeamId
  );
}

export function classifyProviderEvent(options: {
  event: ProviderEvent;
  week: number;
  fbsTeamIds: Set<string>;
  requestedWeekGames: ScheduledGameRow[];
  seasonGames: ScheduledGameRow[];
  resolveTeam: TeamResolveFn;
}): EventDiag {
  const { event, week, fbsTeamIds, requestedWeekGames, seasonGames, resolveTeam } =
    options;
  const home = resolveTeam(event.home_team);
  const away = resolveTeam(event.away_team);

  const base: EventDiag = {
    eventId: event.id,
    home_team: event.home_team,
    away_team: event.away_team,
    homeTeamId: home.teamId,
    awayTeamId: away.teamId,
    homeMethod: home.method,
    awayMethod: away.method,
    classification: 'unresolved_team',
  };

  if (!home.teamId || !away.teamId) {
    // One side unresolved: if the other is FBS, still unresolved; if neither in FBS aliases, may be FCS
    const homeIn = home.teamId ? fbsTeamIds.has(home.teamId) : false;
    const awayIn = away.teamId ? fbsTeamIds.has(away.teamId) : false;
    if ((home.teamId && !homeIn) || (away.teamId && !awayIn)) {
      return { ...base, classification: 'out_of_scope_fbs_fcs', detail: 'non-FBS side' };
    }
    return { ...base, classification: 'unresolved_team' };
  }

  const homeFbs = fbsTeamIds.has(home.teamId);
  const awayFbs = fbsTeamIds.has(away.teamId);
  if (!homeFbs || !awayFbs) {
    return { ...base, classification: 'out_of_scope_fbs_fcs' };
  }

  if (home.method === 'fuzzy' || away.method === 'fuzzy') {
    return {
      ...base,
      classification: 'fuzzy_required',
      detail: 'fuzzy-only team resolution is not COMMIT-safe',
    };
  }

  const exact = findExactRequestedWeekGames(
    requestedWeekGames,
    home.teamId,
    away.teamId
  );
  const exactSwapped = findExactRequestedWeekGames(
    requestedWeekGames,
    away.teamId,
    home.teamId
  );
  const exactAll = [...exact, ...exactSwapped];
  const exactUnique = [
    ...new Map(exactAll.map((g) => [g.gameId, g])).values(),
  ];
  if (exactUnique.length === 1) {
    return {
      ...base,
      classification: 'matched_requested_week',
      gameId: exactUnique[0].gameId,
    };
  }
  if (exactUnique.length > 1) {
    return {
      ...base,
      classification: 'ambiguous',
      detail: `${exactUnique.length} requested-week games`,
    };
  }

  const anyWeek = [
    ...findAnyWeekGames(seasonGames, home.teamId, away.teamId),
    ...findAnyWeekGames(seasonGames, away.teamId, home.teamId),
  ];
  const anyUnique = [...new Map(anyWeek.map((g) => [g.gameId, g])).values()];
  if (anyUnique.length >= 1) {
    // Present in DB under a different week — out of requested-week scope (coverage, not fail).
    // Guarded writer never week-flexible COMMITs these.
    return {
      ...base,
      classification: 'out_of_requested_week',
      gameId: anyUnique[0].gameId,
      detail: `DB week(s)=${[...new Set(anyUnique.map((g) => g.week))].join(',')}; requested=${week}`,
    };
  }

  // Both FBS, no Game row anywhere this season for this pairing
  return {
    ...base,
    classification: 'unmatched_both_fbs',
    detail: 'both authoritative FBS; no unique requested-week Game',
  };
}

function parseBookTimestamp(raw: string | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

export function normalizeBookmakerMarkets(options: {
  event: ProviderEvent;
  game: ScheduledGameRow;
  bookmaker: ProviderBookmaker;
}): { candidates: CandidateMarketLine[]; rejected: RejectedSnapshot[] } {
  const { event, game, bookmaker } = options;
  const candidates: CandidateMarketLine[] = [];
  const rejected: RejectedSnapshot[] = [];
  const bookName = normalizeBookmakerName(bookmaker.title || bookmaker.key);
  const timestamp = parseBookTimestamp(bookmaker.last_update);
  if (!timestamp) {
    rejected.push({
      eventId: event.id,
      bookName,
      market: '*',
      reason: 'invalid or missing bookmaker.last_update',
    });
    return { candidates, rejected };
  }

  for (const market of bookmaker.markets || []) {
    const outcomes = market.outcomes || [];
    if (market.key === 'spreads') {
      const result = normalizeSpreadPair(outcomes, game, bookName, timestamp, event.id);
      candidates.push(...result.candidates);
      rejected.push(...result.rejected);
    } else if (market.key === 'totals') {
      const result = normalizeTotalPair(outcomes, game, bookName, timestamp, event.id);
      candidates.push(...result.candidates);
      rejected.push(...result.rejected);
    } else if (market.key === 'h2h') {
      const result = normalizeMoneylinePair(
        outcomes,
        game,
        bookName,
        timestamp,
        event.id
      );
      candidates.push(...result.candidates);
      rejected.push(...result.rejected);
    }
  }

  return { candidates, rejected };
}

function mapOutcomeToGameTeam(
  outcomeName: string,
  game: ScheduledGameRow,
  resolveByName?: TeamResolveFn
): string | null {
  // Prefer matching provider outcome name via optional resolver; else exact home/away string compare is insufficient.
  // Callers pass resolved map via team ids when known — here we resolve by comparing resolved ids.
  if (!resolveByName) return null;
  const r = resolveByName(outcomeName);
  if (!r.teamId) return null;
  if (r.teamId === game.homeTeamId || r.teamId === game.awayTeamId) return r.teamId;
  return null;
}

export function normalizeSpreadPair(
  outcomes: ProviderOutcome[],
  game: ScheduledGameRow,
  bookName: string,
  timestamp: Date,
  eventId: string | undefined,
  resolveTeam?: TeamResolveFn
): { candidates: CandidateMarketLine[]; rejected: RejectedSnapshot[] } {
  const rejected: RejectedSnapshot[] = [];
  const points = outcomes.filter((o) => isFiniteNumber(o.point));
  if (points.length < 2) {
    rejected.push({
      eventId,
      bookName,
      market: 'spreads',
      reason: 'spread requires two team outcomes with points',
    });
    return { candidates: [], rejected };
  }

  // Resolve each outcome to a game participant
  const sides: Array<{ teamId: string; point: number }> = [];
  for (const o of points) {
    let teamId: string | null = null;
    if (resolveTeam) {
      teamId = mapOutcomeToGameTeam(o.name, game, resolveTeam);
    } else {
      // Fallback: match by exact casing-insensitive name against known home/away labels is unavailable;
      // tests pass resolveTeam. Without it, try slug-ish equality to home/away ids.
      const slug = o.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (slug === game.homeTeamId) teamId = game.homeTeamId;
      if (slug === game.awayTeamId) teamId = game.awayTeamId;
    }
    if (!teamId || !isFiniteNumber(o.point)) {
      rejected.push({
        eventId,
        bookName,
        market: 'spreads',
        reason: `unresolved spread team for outcome ${o.name}`,
      });
      return { candidates: [], rejected };
    }
    if (Math.abs(o.point) > 50) {
      rejected.push({
        eventId,
        bookName,
        market: 'spreads',
        reason: `abs(spread) > 50 (${o.point})`,
      });
      return { candidates: [], rejected };
    }
    sides.push({ teamId, point: o.point });
  }

  const uniqueTeams = new Set(sides.map((s) => s.teamId));
  if (uniqueTeams.size !== 2) {
    rejected.push({
      eventId,
      bookName,
      market: 'spreads',
      reason: 'spread pair must map to two distinct game participants',
    });
    return { candidates: [], rejected };
  }
  if (
    !uniqueTeams.has(game.homeTeamId) ||
    !uniqueTeams.has(game.awayTeamId)
  ) {
    rejected.push({
      eventId,
      bookName,
      market: 'spreads',
      reason: 'spread teamIds must belong to matched Game',
    });
    return { candidates: [], rejected };
  }

  const [a, b] = sides;
  if (!approxEqual(a.point, -b.point)) {
    rejected.push({
      eventId,
      bookName,
      market: 'spreads',
      reason: `spread sides not opposite (${a.point} vs ${b.point})`,
    });
    return { candidates: [], rejected };
  }

  // Dedup to one row per team (first wins)
  const byTeam = new Map<string, number>();
  for (const s of sides) {
    if (!byTeam.has(s.teamId)) byTeam.set(s.teamId, s.point);
  }

  const candidates: CandidateMarketLine[] = [];
  for (const [teamId, point] of byTeam) {
    candidates.push({
      gameId: game.gameId,
      season: game.season,
      week: game.week,
      lineType: 'spread',
      lineValue: point,
      closingLine: point,
      bookName,
      timestamp,
      source: LIVE_ODDS_SOURCE,
      teamId,
    });
  }
  return { candidates, rejected };
}

export function normalizeTotalPair(
  outcomes: ProviderOutcome[],
  game: ScheduledGameRow,
  bookName: string,
  timestamp: Date,
  eventId?: string
): { candidates: CandidateMarketLine[]; rejected: RejectedSnapshot[] } {
  const rejected: RejectedSnapshot[] = [];
  const over = outcomes.find((o) => /over/i.test(o.name));
  const under = outcomes.find((o) => /under/i.test(o.name));
  if (!over || !under) {
    rejected.push({
      eventId,
      bookName,
      market: 'totals',
      reason: 'total requires Over and Under outcomes',
    });
    return { candidates: [], rejected };
  }
  if (!isFiniteNumber(over.point) || !isFiniteNumber(under.point)) {
    rejected.push({
      eventId,
      bookName,
      market: 'totals',
      reason: 'total points must be finite',
    });
    return { candidates: [], rejected };
  }
  if (!approxEqual(over.point, under.point)) {
    rejected.push({
      eventId,
      bookName,
      market: 'totals',
      reason: `Over/Under disagreement (${over.point} vs ${under.point})`,
    });
    return { candidates: [], rejected };
  }
  const total = over.point;
  if (total < 20 || total > 120) {
    rejected.push({
      eventId,
      bookName,
      market: 'totals',
      reason: `total outside 20–120 (${total})`,
    });
    return { candidates: [], rejected };
  }

  return {
    candidates: [
      {
        gameId: game.gameId,
        season: game.season,
        week: game.week,
        lineType: 'total',
        lineValue: total,
        closingLine: total,
        bookName,
        timestamp,
        source: LIVE_ODDS_SOURCE,
        teamId: null,
      },
    ],
    rejected,
  };
}

export function normalizeMoneylinePair(
  outcomes: ProviderOutcome[],
  game: ScheduledGameRow,
  bookName: string,
  timestamp: Date,
  eventId?: string,
  resolveTeam?: TeamResolveFn
): { candidates: CandidateMarketLine[]; rejected: RejectedSnapshot[] } {
  const rejected: RejectedSnapshot[] = [];
  const priced = outcomes.filter((o) => isFiniteNumber(o.price) && o.price !== 0);
  if (priced.length < 2) {
    rejected.push({
      eventId,
      bookName,
      market: 'h2h',
      reason: 'moneyline requires two finite nonzero American prices',
    });
    return { candidates: [], rejected };
  }

  const sides: Array<{ teamId: string; price: number }> = [];
  for (const o of priced) {
    let teamId: string | null = null;
    if (resolveTeam) {
      teamId = mapOutcomeToGameTeam(o.name, game, resolveTeam);
    } else {
      const slug = o.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (slug === game.homeTeamId) teamId = game.homeTeamId;
      if (slug === game.awayTeamId) teamId = game.awayTeamId;
    }
    if (!teamId) {
      rejected.push({
        eventId,
        bookName,
        market: 'h2h',
        reason: `unresolved moneyline team for outcome ${o.name}`,
      });
      return { candidates: [], rejected };
    }
    sides.push({ teamId, price: o.price as number });
  }

  const unique = new Set(sides.map((s) => s.teamId));
  if (
    unique.size !== 2 ||
    !unique.has(game.homeTeamId) ||
    !unique.has(game.awayTeamId)
  ) {
    rejected.push({
      eventId,
      bookName,
      market: 'h2h',
      reason: 'moneyline teams must be the two Game participants',
    });
    return { candidates: [], rejected };
  }

  const byTeam = new Map<string, number>();
  for (const s of sides) {
    if (!byTeam.has(s.teamId)) byTeam.set(s.teamId, s.price);
  }

  const candidates: CandidateMarketLine[] = [];
  for (const [teamId, price] of byTeam) {
    candidates.push({
      gameId: game.gameId,
      season: game.season,
      week: game.week,
      lineType: 'moneyline',
      lineValue: price,
      closingLine: price,
      bookName,
      timestamp,
      source: LIVE_ODDS_SOURCE,
      teamId,
    });
  }
  return { candidates, rejected };
}

export function dedupeCandidates(candidates: CandidateMarketLine[]): {
  unique: CandidateMarketLine[];
  duplicateCandidateCount: number;
  fingerprintCollisions: Array<{ fingerprint: string; a: CandidateMarketLine; b: CandidateMarketLine }>;
} {
  const map = new Map<string, CandidateMarketLine>();
  let duplicateCandidateCount = 0;
  const fingerprintCollisions: Array<{
    fingerprint: string;
    a: CandidateMarketLine;
    b: CandidateMarketLine;
  }> = [];

  for (const c of candidates) {
    const fp = fingerprintKey(c);
    const existing = map.get(fp);
    if (!existing) {
      map.set(fp, c);
      continue;
    }
    if (
      approxEqual(existing.lineValue, c.lineValue) &&
      approxEqual(existing.closingLine, c.closingLine)
    ) {
      duplicateCandidateCount++;
    } else {
      fingerprintCollisions.push({ fingerprint: fp, a: existing, b: c });
    }
  }

  return {
    unique: [...map.values()],
    duplicateCandidateCount,
    fingerprintCollisions,
  };
}

export function reconcileWithExisting(
  candidates: CandidateMarketLine[],
  existing: ExistingMarketLineRow[]
): {
  proposedInsert: CandidateMarketLine[];
  existingIdentical: number;
  existingCollisions: Array<{
    fingerprint: string;
    candidate: CandidateMarketLine;
    existing: ExistingMarketLineRow;
  }>;
  existingRows: number;
} {
  const existingMap = new Map<string, ExistingMarketLineRow>();
  for (const row of existing) {
    existingMap.set(fingerprintKey(row), row);
  }

  const proposedInsert: CandidateMarketLine[] = [];
  let existingIdentical = 0;
  const existingCollisions: Array<{
    fingerprint: string;
    candidate: CandidateMarketLine;
    existing: ExistingMarketLineRow;
  }> = [];

  for (const c of candidates) {
    const fp = fingerprintKey(c);
    const ex = existingMap.get(fp);
    if (!ex) {
      proposedInsert.push(c);
      continue;
    }
    if (
      approxEqual(Number(ex.lineValue), c.lineValue) &&
      approxEqual(Number(ex.closingLine), c.closingLine)
    ) {
      existingIdentical++;
    } else {
      existingCollisions.push({ fingerprint: fp, candidate: c, existing: ex });
    }
  }

  return {
    proposedInsert,
    existingIdentical,
    existingCollisions,
    existingRows: existing.length,
  };
}

export function buildCoverage(options: {
  requestedWeekGames: ScheduledGameRow[];
  candidates: CandidateMarketLine[];
}): {
  gamesWithAnyOdds: string[];
  gamesWithSpread: string[];
  gamesWithTotal: string[];
  gamesWithMoneyline: string[];
  gamesWithoutAnyOdds: string[];
  gamesWithoutSpread: string[];
  gamesWithoutTotal: string[];
  gamesWithoutMoneyline: string[];
  uniqueBookmakers: string[];
} {
  const byGame = new Map<string, Set<string>>();
  const books = new Set<string>();
  for (const c of options.candidates) {
    books.add(c.bookName);
    if (!byGame.has(c.gameId)) byGame.set(c.gameId, new Set());
    byGame.get(c.gameId)!.add(c.lineType);
  }

  const gamesWithAnyOdds: string[] = [];
  const gamesWithSpread: string[] = [];
  const gamesWithTotal: string[] = [];
  const gamesWithMoneyline: string[] = [];
  const gamesWithoutAnyOdds: string[] = [];
  const gamesWithoutSpread: string[] = [];
  const gamesWithoutTotal: string[] = [];
  const gamesWithoutMoneyline: string[] = [];

  for (const g of [...options.requestedWeekGames].sort((a, b) =>
    a.gameId.localeCompare(b.gameId)
  )) {
    const types = byGame.get(g.gameId) || new Set();
    if (types.size > 0) gamesWithAnyOdds.push(g.gameId);
    else gamesWithoutAnyOdds.push(g.gameId);
    if (types.has('spread')) gamesWithSpread.push(g.gameId);
    else gamesWithoutSpread.push(g.gameId);
    if (types.has('total')) gamesWithTotal.push(g.gameId);
    else gamesWithoutTotal.push(g.gameId);
    if (types.has('moneyline')) gamesWithMoneyline.push(g.gameId);
    else gamesWithoutMoneyline.push(g.gameId);
  }

  return {
    gamesWithAnyOdds,
    gamesWithSpread,
    gamesWithTotal,
    gamesWithMoneyline,
    gamesWithoutAnyOdds,
    gamesWithoutSpread,
    gamesWithoutTotal,
    gamesWithoutMoneyline,
    uniqueBookmakers: [...books].sort(),
  };
}

export interface LiveOddsPlanInput {
  season: number;
  week: number;
  mode: LiveOddsMode;
  confirmation?: string | null;
  fbsTeamIds: string[];
  requestedWeekGames: ScheduledGameRow[];
  seasonGames: ScheduledGameRow[];
  providerEvents: ProviderEvent[];
  providerCalls: number;
  providerUsage: {
    requestsLast: string | null;
    requestsUsed: string | null;
    requestsRemaining: string | null;
  };
  existingRows: ExistingMarketLineRow[];
  resolveTeam: TeamResolveFn;
  maxExpectedCredits?: number;
}

export interface LiveOddsPlan {
  season: number;
  week: number;
  mode: LiveOddsMode;
  expectedConfirmation: string;
  confirmationValid: boolean;
  providerCalls: number;
  providerUsage: LiveOddsPlanInput['providerUsage'];
  requestCreditsLast: number | null;
  authoritativeFbsCount: number;
  scheduledGameCount: number;
  eventDiagnostics: EventDiag[];
  eventCounts: Record<EventClassification, number>;
  rejectedSnapshots: RejectedSnapshot[];
  candidates: CandidateMarketLine[];
  candidateDuplicatesCollapsed: number;
  fingerprintCollisions: number;
  existingRows: number;
  proposedInsert: CandidateMarketLine[];
  existingIdentical: number;
  existingCollisions: number;
  coverage: ReturnType<typeof buildCoverage>;
  writeSafe: boolean;
  writeBlockers: string[];
  mutationsInvoked: false;
  marketLinePersistenceInvoked: false;
  productionOddsWriteAuthorizedByThisPhase: false;
  betsWriteAuthorized: false;
  ratingsWriteAuthorized: false;
  schedulesWriteAuthorized: false;
  scoresWriteAuthorized: false;
  unitGradesWriteAuthorized: false;
  previewConsumesOddsApiCredits: true;
  previewDbReadOnly: boolean;
  appendOnly: true;
}

function emptyEventCounts(): Record<EventClassification, number> {
  return {
    matched_requested_week: 0,
    out_of_requested_week: 0,
    out_of_scope_fbs_fcs: 0,
    unresolved_team: 0,
    unmatched_both_fbs: 0,
    ambiguous: 0,
    week_mismatch: 0,
    fuzzy_required: 0,
  };
}

export function buildLiveOddsPlan(input: LiveOddsPlanInput): LiveOddsPlan {
  const writeBlockers: string[] = [];
  const inputCheck = validateLiveOddsInputs({
    season: input.season,
    week: input.week,
    mode: input.mode,
    confirmation: input.confirmation,
  });
  writeBlockers.push(...inputCheck.reasons);

  const scheduleCheck = validateAuthoritativeSchedule({
    week: input.week,
    fbsTeamIds: input.fbsTeamIds,
    games: input.requestedWeekGames,
  });
  writeBlockers.push(...scheduleCheck.reasons);

  const creditCheck = evaluateProviderCredits({
    providerCalls: input.providerCalls,
    requestsLast: input.providerUsage.requestsLast,
    maxExpectedCredits: input.maxExpectedCredits,
  });
  writeBlockers.push(...creditCheck.reasons);

  const fbsSet = new Set(input.fbsTeamIds);
  const eventDiagnostics: EventDiag[] = [];
  const eventCounts = emptyEventCounts();
  const rejectedSnapshots: RejectedSnapshot[] = [];
  const rawCandidates: CandidateMarketLine[] = [];

  const gamesById = new Map(
    input.requestedWeekGames.map((g) => [g.gameId, g] as const)
  );

  for (const event of input.providerEvents) {
    const diag = classifyProviderEvent({
      event,
      week: input.week,
      fbsTeamIds: fbsSet,
      requestedWeekGames: input.requestedWeekGames,
      seasonGames: input.seasonGames,
      resolveTeam: input.resolveTeam,
    });
    eventDiagnostics.push(diag);
    eventCounts[diag.classification]++;

    if (diag.classification !== 'matched_requested_week' || !diag.gameId) {
      continue;
    }
    const game = gamesById.get(diag.gameId);
    if (!game) continue;

    for (const book of event.bookmakers || []) {
      // Use normalize helpers with resolveTeam for outcome→team mapping
      const bookName = normalizeBookmakerName(book.title || book.key);
      const timestamp = parseBookTimestamp(book.last_update);
      if (!timestamp) {
        rejectedSnapshots.push({
          eventId: event.id,
          bookName,
          market: '*',
          reason: 'invalid or missing bookmaker.last_update',
        });
        continue;
      }
      for (const market of book.markets || []) {
        const outcomes = market.outcomes || [];
        if (market.key === 'spreads') {
          const r = normalizeSpreadPair(
            outcomes,
            game,
            bookName,
            timestamp,
            event.id,
            input.resolveTeam
          );
          rawCandidates.push(...r.candidates);
          rejectedSnapshots.push(...r.rejected);
        } else if (market.key === 'totals') {
          const r = normalizeTotalPair(
            outcomes,
            game,
            bookName,
            timestamp,
            event.id
          );
          rawCandidates.push(...r.candidates);
          rejectedSnapshots.push(...r.rejected);
        } else if (market.key === 'h2h') {
          const r = normalizeMoneylinePair(
            outcomes,
            game,
            bookName,
            timestamp,
            event.id,
            input.resolveTeam
          );
          rawCandidates.push(...r.candidates);
          rejectedSnapshots.push(...r.rejected);
        }
      }
    }
  }

  if (eventCounts.ambiguous > 0) {
    writeBlockers.push('ambiguous both-FBS mapping present');
  }
  if (eventCounts.unmatched_both_fbs > 0) {
    writeBlockers.push('unmatched both-FBS provider event for requested week');
  }
  if (eventCounts.week_mismatch > 0) {
    writeBlockers.push('week-flexible / week-mismatch mapping present');
  }
  if (eventCounts.fuzzy_required > 0) {
    writeBlockers.push('fuzzy-only team resolution present');
  }

  const deduped = dedupeCandidates(rawCandidates);
  if (deduped.fingerprintCollisions.length > 0) {
    writeBlockers.push('within-snapshot fingerprint collisions');
  }

  const reconciled = reconcileWithExisting(deduped.unique, input.existingRows);
  if (reconciled.existingCollisions.length > 0) {
    writeBlockers.push('existing DB fingerprint collisions');
  }

  for (const c of deduped.unique) {
    if (c.season !== LIVE_ODDS_SEASON || c.week !== input.week) {
      writeBlockers.push('candidate references wrong season/week');
      break;
    }
    if (
      (c.lineType === 'spread' || c.lineType === 'moneyline') &&
      (c.teamId == null || c.teamId === '')
    ) {
      writeBlockers.push('spread/ML candidate missing teamId');
      break;
    }
    if (!Number.isFinite(c.lineValue) || !Number.isFinite(c.closingLine)) {
      writeBlockers.push('nonfinite accepted MarketLine values');
      break;
    }
  }

  const coverage = buildCoverage({
    requestedWeekGames: input.requestedWeekGames,
    candidates: deduped.unique,
  });

  // Coverage gaps alone do not block writeSafe.
  // PREVIEW: writeSafe reflects structural/provider safety (may have 0 inserts).
  // COMMIT: also requires proposedInsert > 0 (enforced below).
  if (input.mode === 'COMMIT' && reconciled.proposedInsert.length === 0) {
    writeBlockers.push('proposedInsert must be > 0 for COMMIT');
  }

  const finalWriteSafe = writeBlockers.length === 0;

  return {
    season: input.season,
    week: input.week,
    mode: input.mode,
    expectedConfirmation: inputCheck.expectedConfirmation,
    confirmationValid: inputCheck.confirmationValid,
    providerCalls: input.providerCalls,
    providerUsage: input.providerUsage,
    requestCreditsLast: creditCheck.requestCreditsLast,
    authoritativeFbsCount: input.fbsTeamIds.length,
    scheduledGameCount: input.requestedWeekGames.length,
    eventDiagnostics,
    eventCounts,
    rejectedSnapshots,
    candidates: deduped.unique,
    candidateDuplicatesCollapsed: deduped.duplicateCandidateCount,
    fingerprintCollisions: deduped.fingerprintCollisions.length,
    existingRows: reconciled.existingRows,
    proposedInsert: reconciled.proposedInsert,
    existingIdentical: reconciled.existingIdentical,
    existingCollisions: reconciled.existingCollisions.length,
    coverage,
    writeSafe: finalWriteSafe,
    writeBlockers: [...new Set(writeBlockers)],
    mutationsInvoked: false,
    marketLinePersistenceInvoked: false,
    productionOddsWriteAuthorizedByThisPhase: false,
    betsWriteAuthorized: false,
    ratingsWriteAuthorized: false,
    schedulesWriteAuthorized: false,
    scoresWriteAuthorized: false,
    unitGradesWriteAuthorized: false,
    previewConsumesOddsApiCredits: true,
    previewDbReadOnly: input.mode === 'PREVIEW',
    appendOnly: true,
  };
}

export function commitEligible(plan: LiveOddsPlan): boolean {
  return (
    plan.mode === 'COMMIT' &&
    plan.writeSafe &&
    plan.confirmationValid &&
    plan.proposedInsert.length > 0 &&
    plan.providerCalls === 1
  );
}
