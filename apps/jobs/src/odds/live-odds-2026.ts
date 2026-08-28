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

/** Bounded kickoff/date drift for schedule↔provider temporal matching (36h). */
export const KICKOFF_MATCH_TOLERANCE_MS = 36 * 60 * 60 * 1000;

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
  /** Authoritative Game.date (kickoff). Required for temporal classification. */
  date: Date | string;
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
  | 'unresolved_expected_fbs'
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
  commence_time?: string | null;
  classification: EventClassification;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeMethod?: TeamResolveMethod;
  awayMethod?: TeamResolveMethod;
  gameId?: string | null;
  candidateGameIds?: string[];
  detail?: string;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function approxEqual(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}

export function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

export function withinKickoffTolerance(
  a: Date | string,
  b: Date | string,
  toleranceMs: number = KICKOFF_MATCH_TOLERANCE_MS
): boolean {
  const da = toDate(a);
  const db = toDate(b);
  if (!da || !db) return false;
  return Math.abs(da.getTime() - db.getTime()) <= toleranceMs;
}

export function gamesNearCommence(
  games: ScheduledGameRow[],
  commence: Date,
  toleranceMs: number = KICKOFF_MATCH_TOLERANCE_MS
): ScheduledGameRow[] {
  return games.filter((g) => withinKickoffTolerance(g.date, commence, toleranceMs));
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
    if (!toDate(g.date)) {
      reasons.push(`game ${g.gameId} has invalid date`);
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

function findExactPairGames(
  games: ScheduledGameRow[],
  homeTeamId: string,
  awayTeamId: string
): ScheduledGameRow[] {
  return games.filter(
    (g) =>
      (g.homeTeamId === homeTeamId && g.awayTeamId === awayTeamId) ||
      (g.homeTeamId === awayTeamId && g.awayTeamId === homeTeamId)
  );
}

function uniqueGames(games: ScheduledGameRow[]): ScheduledGameRow[] {
  return [...new Map(games.map((g) => [g.gameId, g])).values()];
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
  const commence = toDate(event.commence_time);

  const base: EventDiag = {
    eventId: event.id,
    home_team: event.home_team,
    away_team: event.away_team,
    commence_time: event.commence_time ?? null,
    homeTeamId: home.teamId,
    awayTeamId: away.teamId,
    homeMethod: home.method,
    awayMethod: away.method,
    classification: 'unresolved_team',
  };

  const requestedNear = commence
    ? gamesNearCommence(requestedWeekGames, commence)
    : [];
  const seasonNear = commence ? gamesNearCommence(seasonGames, commence) : [];

  // --- Partial / unresolved resolution ---
  if (!home.teamId || !away.teamId) {
    const homeIn = home.teamId ? fbsTeamIds.has(home.teamId) : false;
    const awayIn = away.teamId ? fbsTeamIds.has(away.teamId) : false;

    // B: resolved side is explicitly non-FBS
    if ((home.teamId && !homeIn) || (away.teamId && !awayIn)) {
      return {
        ...base,
        classification: 'out_of_scope_fbs_fcs',
        detail: 'non-FBS resolved side',
      };
    }

    const resolvedFbsId = homeIn
      ? home.teamId!
      : awayIn
        ? away.teamId!
        : null;

    // A: one authoritative FBS side resolved; opponent unresolved
    if (resolvedFbsId) {
      const teamWeekGames = requestedWeekGames.filter(
        (g) =>
          g.homeTeamId === resolvedFbsId || g.awayTeamId === resolvedFbsId
      );

      // A1: no requested-week FBS-vs-FBS Game for this team → FCS/out-of-scope
      if (teamWeekGames.length === 0) {
        return {
          ...base,
          classification: 'out_of_scope_fbs_fcs',
          detail:
            'resolved FBS team has no authoritative requested-week FBS opponent',
        };
      }

      const teamWeekNear = commence
        ? teamWeekGames.filter((g) => withinKickoffTolerance(g.date, commence))
        : [];

      // A3: multiple possible requested-week games
      if (teamWeekGames.length > 1) {
        if (teamWeekNear.length > 1) {
          return {
            ...base,
            classification: 'ambiguous',
            candidateGameIds: teamWeekNear.map((g) => g.gameId),
            detail: `resolved FBS ${resolvedFbsId} has ${teamWeekNear.length} requested-week games near commence_time`,
          };
        }
        if (teamWeekNear.length === 0 && commence) {
          return {
            ...base,
            classification: 'out_of_requested_week',
            detail:
              'resolved FBS has requested-week games, but commence_time is outside their kickoff tolerance',
            candidateGameIds: teamWeekGames.map((g) => g.gameId),
          };
        }
        if (teamWeekNear.length === 0 && !commence) {
          return {
            ...base,
            classification: 'ambiguous',
            candidateGameIds: teamWeekGames.map((g) => g.gameId),
            detail: `resolved FBS ${resolvedFbsId} has ${teamWeekGames.length} requested-week games; commence_time missing/malformed`,
          };
        }
        // exactly one temporally aligned among multiple → treat as A2 below
      }

      const focusGames =
        teamWeekGames.length === 1
          ? teamWeekGames
          : teamWeekNear.length === 1
            ? teamWeekNear
            : [];

      // A2: exactly one requested-week FBS-vs-FBS game (or one temporally selected)
      if (focusGames.length === 1) {
        const g = focusGames[0];
        const expectedOpp =
          g.homeTeamId === resolvedFbsId ? g.awayTeamId : g.homeTeamId;
        const otherId = homeIn ? away.teamId : home.teamId;

        if (!commence) {
          return {
            ...base,
            classification: 'unresolved_expected_fbs',
            gameId: g.gameId,
            candidateGameIds: [g.gameId],
            detail: `resolved FBS ${resolvedFbsId} has requested-week Game ${g.gameId}; commence_time missing/malformed; opponent unresolved (expected ${expectedOpp})`,
          };
        }

        if (withinKickoffTolerance(g.date, commence)) {
          if (otherId !== expectedOpp) {
            return {
              ...base,
              classification: 'unresolved_expected_fbs',
              gameId: g.gameId,
              candidateGameIds: [g.gameId],
              detail: `resolved FBS ${resolvedFbsId} maps to requested-week Game ${g.gameId}; other provider name did not resolve to expected opponent ${expectedOpp}`,
            };
          }
        }

        // commence present but not aligned with the team's requested-week game
        if (requestedNear.length === 0) {
          return {
            ...base,
            classification: 'out_of_requested_week',
            gameId: g.gameId,
            candidateGameIds: [g.gameId],
            detail:
              'resolved FBS has a requested-week Game, but provider commence_time is outside requested-week kickoff window',
          };
        }

        return {
          ...base,
          classification: 'unresolved_expected_fbs',
          gameId: g.gameId,
          candidateGameIds: [g.gameId],
          detail: `resolved FBS ${resolvedFbsId} has requested-week Game ${g.gameId}; commence_time not within kickoff tolerance of canonical Game.date`,
        };
      }
    }

    // C: both unresolved (or unresolved without usable FBS schedule context)
    if (commence && requestedNear.length === 0) {
      return {
        ...base,
        classification: 'out_of_requested_week',
        detail: 'commence_time outside requested-week kickoff window',
        candidateGameIds: seasonNear.map((g) => g.gameId),
      };
    }

    // Fail closed — cannot safely prove out-of-scope
    return {
      ...base,
      classification: 'unresolved_expected_fbs',
      candidateGameIds: requestedNear.map((g) => g.gameId),
      detail:
        commence == null
          ? 'unresolved team(s) without commence_time; cannot prove out-of-scope'
          : 'unresolved team(s) near requested-week window; missing alias / review required',
    };
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

  const exactUnique = uniqueGames(
    findExactPairGames(requestedWeekGames, home.teamId, away.teamId)
  );
  if (exactUnique.length === 1) {
    const g = exactUnique[0];
    const gameDate = toDate(g.date);
    const gameDateIso = gameDate ? gameDate.toISOString() : String(g.date);

    // Exact pair still requires valid commence_time + kickoff tolerance.
    if (!commence) {
      return {
        ...base,
        classification: 'week_mismatch',
        gameId: g.gameId,
        candidateGameIds: [g.gameId],
        detail:
          'exact requested-week pair found, but provider commence_time is missing/malformed; temporal validation required',
      };
    }

    const nearThis = withinKickoffTolerance(g.date, commence);
    if (!nearThis) {
      const otherWeekNear = seasonNear.filter(
        (x) =>
          x.week !== week &&
          ((x.homeTeamId === home.teamId && x.awayTeamId === away.teamId) ||
            (x.homeTeamId === away.teamId && x.awayTeamId === home.teamId))
      );
      const deltaMs = gameDate
        ? Math.abs(gameDate.getTime() - commence.getTime())
        : null;
      return {
        ...base,
        classification: 'week_mismatch',
        gameId: otherWeekNear[0]?.gameId ?? g.gameId,
        candidateGameIds: [g.gameId, ...otherWeekNear.map((x) => x.gameId)],
        detail:
          otherWeekNear.length > 0
            ? `exact requested-week pair found, but provider commence_time aligns with other-week Game; canonical=${gameDateIso}; commence=${commence.toISOString()}; toleranceMs=${KICKOFF_MATCH_TOLERANCE_MS}`
            : `exact requested-week pair found, but provider commence_time differs from canonical Game.date by more than kickoff tolerance; canonical=${gameDateIso}; commence=${commence.toISOString()}; deltaMs=${deltaMs}; toleranceMs=${KICKOFF_MATCH_TOLERANCE_MS}`,
      };
    }

    return {
      ...base,
      classification: 'matched_requested_week',
      gameId: g.gameId,
      candidateGameIds: [g.gameId],
    };
  }
  if (exactUnique.length > 1) {
    return {
      ...base,
      classification: 'ambiguous',
      candidateGameIds: exactUnique.map((g) => g.gameId),
      detail: `${exactUnique.length} requested-week games`,
    };
  }

  // Both FBS; pair not in requested week
  const anyUnique = uniqueGames(
    findExactPairGames(seasonGames, home.teamId, away.teamId)
  );
  if (anyUnique.length >= 1) {
    const otherWeek = anyUnique.filter((g) => g.week !== week);
    if (commence) {
      const nearOther = otherWeek.filter((g) =>
        withinKickoffTolerance(g.date, commence)
      );
      const inRequestedWindow = requestedNear.length > 0;

      // C: commence corresponds to other week's Game → out of requested week (coverage)
      if (nearOther.length >= 1 && !inRequestedWindow) {
        return {
          ...base,
          classification: 'out_of_requested_week',
          gameId: nearOther[0].gameId,
          candidateGameIds: nearOther.map((g) => g.gameId),
          detail: `DB week(s)=${[...new Set(nearOther.map((g) => g.week))].join(',')}; requested=${week}`,
        };
      }

      // C/D: commence in requested-week window but only other-week Game exists
      if (inRequestedWindow) {
        return {
          ...base,
          classification: 'week_mismatch',
          gameId: otherWeek[0]?.gameId ?? anyUnique[0].gameId,
          candidateGameIds: [
            ...requestedNear.map((g) => g.gameId),
            ...otherWeek.map((g) => g.gameId),
          ],
          detail:
            'commence_time in requested-week window but pair only stored under another DB week',
        };
      }

      // commence present but not near other-week game and not in requested window
      if (nearOther.length === 0 && !inRequestedWindow) {
        return {
          ...base,
          classification: 'out_of_requested_week',
          gameId: anyUnique[0].gameId,
          candidateGameIds: anyUnique.map((g) => g.gameId),
          detail: `pair exists under DB week(s)=${[...new Set(anyUnique.map((g) => g.week))].join(',')}; commence not near requested week`,
        };
      }

      return {
        ...base,
        classification: 'ambiguous',
        candidateGameIds: anyUnique.map((g) => g.gameId),
        detail: 'ambiguous temporal/game mapping for both-FBS pair',
      };
    }

    // No commence_time: pair only under another week — treat as later-week coverage
    return {
      ...base,
      classification: 'out_of_requested_week',
      gameId: anyUnique[0].gameId,
      candidateGameIds: anyUnique.map((g) => g.gameId),
      detail: `DB week(s)=${[...new Set(anyUnique.map((g) => g.week))].join(',')}; requested=${week}; no commence_time`,
    };
  }

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
  resolveTeam?: TeamResolveFn;
}): { candidates: CandidateMarketLine[]; rejected: RejectedSnapshot[] } {
  const { event, game, bookmaker, resolveTeam } = options;
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
      const result = normalizeSpreadPair(
        outcomes,
        game,
        bookName,
        timestamp,
        event.id,
        resolveTeam
      );
      candidates.push(...result.candidates);
      rejected.push(...result.rejected);
    } else if (market.key === 'totals') {
      const result = normalizeTotalPair(
        outcomes,
        game,
        bookName,
        timestamp,
        event.id
      );
      candidates.push(...result.candidates);
      rejected.push(...result.rejected);
    } else if (market.key === 'h2h') {
      const result = normalizeMoneylinePair(
        outcomes,
        game,
        bookName,
        timestamp,
        event.id,
        resolveTeam
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
  if (!resolveByName) return null;
  const r = resolveByName(outcomeName);
  if (!r.teamId) return null;
  if (r.teamId === game.homeTeamId || r.teamId === game.awayTeamId) {
    return r.teamId;
  }
  return null;
}

function resolveOutcomeTeamId(
  outcomeName: string,
  game: ScheduledGameRow,
  resolveTeam?: TeamResolveFn
): string | null {
  if (resolveTeam) {
    return mapOutcomeToGameTeam(outcomeName, game, resolveTeam);
  }
  const slug = outcomeName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (slug === game.homeTeamId) return game.homeTeamId;
  if (slug === game.awayTeamId) return game.awayTeamId;
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
  if (points.length !== 2) {
    rejected.push({
      eventId,
      bookName,
      market: 'spreads',
      reason: `spread requires exactly two team outcomes with points (got ${points.length})`,
    });
    return { candidates: [], rejected };
  }

  const sides: Array<{ teamId: string; point: number }> = [];
  for (const o of points) {
    const teamId = resolveOutcomeTeamId(o.name, game, resolveTeam);
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
      reason: 'spread pair must map to two distinct game participants (duplicate team outcome)',
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

  const candidates: CandidateMarketLine[] = sides.map((s) => ({
    gameId: game.gameId,
    season: game.season,
    week: game.week,
    lineType: 'spread',
    lineValue: s.point,
    closingLine: s.point,
    bookName,
    timestamp,
    source: LIVE_ODDS_SOURCE,
    teamId: s.teamId,
  }));
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
  const overs = outcomes.filter((o) => /over/i.test(o.name));
  const unders = outcomes.filter((o) => /under/i.test(o.name));
  if (overs.length !== 1 || unders.length !== 1) {
    rejected.push({
      eventId,
      bookName,
      market: 'totals',
      reason: `total requires exactly one Over and one Under (got Over=${overs.length} Under=${unders.length})`,
    });
    return { candidates: [], rejected };
  }
  const over = overs[0];
  const under = unders[0];
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
  if (priced.length !== 2) {
    rejected.push({
      eventId,
      bookName,
      market: 'h2h',
      reason: `moneyline requires exactly two finite nonzero American prices (got ${priced.length})`,
    });
    return { candidates: [], rejected };
  }

  const sides: Array<{ teamId: string; price: number }> = [];
  for (const o of priced) {
    const teamId = resolveOutcomeTeamId(o.name, game, resolveTeam);
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
  if (unique.size !== 2) {
    rejected.push({
      eventId,
      bookName,
      market: 'h2h',
      reason: 'moneyline pair must map to two distinct game participants (duplicate team outcome)',
    });
    return { candidates: [], rejected };
  }
  if (!unique.has(game.homeTeamId) || !unique.has(game.awayTeamId)) {
    rejected.push({
      eventId,
      bookName,
      market: 'h2h',
      reason: 'moneyline teams must be the two Game participants',
    });
    return { candidates: [], rejected };
  }

  const candidates: CandidateMarketLine[] = sides.map((s) => ({
    gameId: game.gameId,
    season: game.season,
    week: game.week,
    lineType: 'moneyline',
    lineValue: s.price,
    closingLine: s.price,
    bookName,
    timestamp,
    source: LIVE_ODDS_SOURCE,
    teamId: s.teamId,
  }));
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
  productionOddsWriteAuthorizedByThisPhase: false;
  betsWriteAuthorized: false;
  ratingsWriteAuthorized: false;
  schedulesWriteAuthorized: false;
  scoresWriteAuthorized: false;
  unitGradesWriteAuthorized: false;
  previewConsumesOddsApiCredits: true;
  previewDbReadOnly: boolean;
  appendOnly: true;
  kickoffMatchToleranceMs: number;
}

export interface LiveOddsExecutionState {
  commitAttempted: boolean;
  transactionStarted: boolean;
  /**
   * True only when MarketLine persistence has committed (transaction resolved
   * successfully). A rolled-back createMany attempt stays false.
   */
  mutationsInvoked: boolean;
  /**
   * Same meaning as mutationsInvoked for this writer: append-only rows were
   * committed. Not set for in-transaction attempts that rolled back.
   */
  marketLinePersistenceInvoked: boolean;
  proposedBeforeTransaction: number;
  stillNewAtTransaction: number | null;
  createManyCount: number | null;
  insertedThisRun: number | null;
  commitSucceeded: boolean;
  postWriteVerificationSucceeded: boolean | null;
  error: string | null;
}

export interface LiveOddsPostWriteVerification {
  expectedInsertCount: number;
  createManyCount: number;
  totalRowsAfter: number;
  distinctGamesAfter: number;
  spreadsAfter: number;
  totalsAfter: number;
  moneylinesAfter: number;
  distinctBooksAfter: number;
  insertedFingerprintsExpected: string[];
  insertedFingerprintsFound: string[];
  missingInsertedFingerprints: string[];
  conflictingInsertedFingerprints: Array<{
    fingerprint: string;
    expectedLineValue: number;
    expectedClosingLine: number;
    actualLineValue: number;
    actualClosingLine: number;
  }>;
  ok: boolean;
  reasons: string[];
}

function emptyEventCounts(): Record<EventClassification, number> {
  return {
    matched_requested_week: 0,
    out_of_requested_week: 0,
    out_of_scope_fbs_fcs: 0,
    unresolved_team: 0,
    unresolved_expected_fbs: 0,
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
  if (eventCounts.unresolved_expected_fbs > 0) {
    writeBlockers.push('unresolved expected-FBS mapping present');
  }
  if (eventCounts.unresolved_team > 0) {
    writeBlockers.push('unresolved team mapping present');
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
    productionOddsWriteAuthorizedByThisPhase: false,
    betsWriteAuthorized: false,
    ratingsWriteAuthorized: false,
    schedulesWriteAuthorized: false,
    scoresWriteAuthorized: false,
    unitGradesWriteAuthorized: false,
    previewConsumesOddsApiCredits: true,
    previewDbReadOnly: input.mode === 'PREVIEW',
    appendOnly: true,
    kickoffMatchToleranceMs: KICKOFF_MATCH_TOLERANCE_MS,
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

/**
 * Enforce createMany count equality inside the Prisma transaction.
 * Throws so the transaction rolls back on mismatch.
 */
export function assertCreateManyCountMatches(
  expectedCount: number,
  createManyCount: number
): void {
  if (createManyCount !== expectedCount) {
    throw new Error(
      `COMMIT abort: createMany count ${createManyCount} != expected ${expectedCount}`
    );
  }
}

/**
 * Build execution state when the transaction committed but the later
 * verification read/check throws or fails closed.
 */
export function buildCommittedVerificationFailureExecution(options: {
  proposedBeforeTransaction: number;
  stillNewAtTransaction: number;
  createManyCount: number;
  error: string;
}): LiveOddsExecutionState {
  return {
    commitAttempted: true,
    transactionStarted: true,
    mutationsInvoked: true,
    marketLinePersistenceInvoked: true,
    proposedBeforeTransaction: options.proposedBeforeTransaction,
    stillNewAtTransaction: options.stillNewAtTransaction,
    createManyCount: options.createManyCount,
    insertedThisRun: options.createManyCount,
    commitSucceeded: true,
    postWriteVerificationSucceeded: false,
    error: options.error,
  };
}

export function buildPreviewExecution(
  proposedInsertCount: number
): LiveOddsExecutionState {
  return {
    commitAttempted: false,
    transactionStarted: false,
    mutationsInvoked: false,
    marketLinePersistenceInvoked: false,
    proposedBeforeTransaction: proposedInsertCount,
    stillNewAtTransaction: null,
    createManyCount: null,
    insertedThisRun: null,
    commitSucceeded: false,
    postWriteVerificationSucceeded: null,
    error: null,
  };
}

export function buildFailedCommitExecution(options: {
  proposedBeforeTransaction: number;
  transactionStarted?: boolean;
  mutationsInvoked?: boolean;
  marketLinePersistenceInvoked?: boolean;
  stillNewAtTransaction?: number | null;
  createManyCount?: number | null;
  insertedThisRun?: number | null;
  commitSucceeded?: boolean;
  postWriteVerificationSucceeded?: boolean | null;
  error: string;
}): LiveOddsExecutionState {
  return {
    commitAttempted: true,
    transactionStarted: options.transactionStarted ?? false,
    mutationsInvoked: options.mutationsInvoked ?? false,
    marketLinePersistenceInvoked: options.marketLinePersistenceInvoked ?? false,
    proposedBeforeTransaction: options.proposedBeforeTransaction,
    stillNewAtTransaction: options.stillNewAtTransaction ?? null,
    createManyCount: options.createManyCount ?? null,
    insertedThisRun: options.insertedThisRun ?? null,
    commitSucceeded: options.commitSucceeded ?? false,
    postWriteVerificationSucceeded:
      options.postWriteVerificationSucceeded ?? null,
    error: options.error,
  };
}

export function buildSuccessfulCommitExecution(options: {
  proposedBeforeTransaction: number;
  stillNewAtTransaction: number;
  createManyCount: number;
  postWriteVerificationSucceeded: boolean;
  error?: string | null;
}): LiveOddsExecutionState {
  return {
    commitAttempted: true,
    transactionStarted: true,
    mutationsInvoked: true,
    marketLinePersistenceInvoked: true,
    proposedBeforeTransaction: options.proposedBeforeTransaction,
    stillNewAtTransaction: options.stillNewAtTransaction,
    createManyCount: options.createManyCount,
    insertedThisRun: options.createManyCount,
    commitSucceeded: true,
    postWriteVerificationSucceeded: options.postWriteVerificationSucceeded,
    error: options.error ?? null,
  };
}

export function verifyInsertedFingerprints(options: {
  expectedInserts: CandidateMarketLine[];
  createManyCount: number;
  afterRows: ExistingMarketLineRow[];
}): LiveOddsPostWriteVerification {
  const expectedInserts = options.expectedInserts;
  const expectedFps = expectedInserts.map((c) => fingerprintKey(c));
  const afterMap = new Map<string, ExistingMarketLineRow>();
  for (const row of options.afterRows) {
    afterMap.set(fingerprintKey(row), row);
  }

  const insertedFingerprintsFound: string[] = [];
  const missingInsertedFingerprints: string[] = [];
  const conflictingInsertedFingerprints: LiveOddsPostWriteVerification['conflictingInsertedFingerprints'] =
    [];

  for (const c of expectedInserts) {
    const fp = fingerprintKey(c);
    const found = afterMap.get(fp);
    if (!found) {
      missingInsertedFingerprints.push(fp);
      continue;
    }
    if (
      !approxEqual(Number(found.lineValue), c.lineValue) ||
      !approxEqual(Number(found.closingLine), c.closingLine)
    ) {
      conflictingInsertedFingerprints.push({
        fingerprint: fp,
        expectedLineValue: c.lineValue,
        expectedClosingLine: c.closingLine,
        actualLineValue: Number(found.lineValue),
        actualClosingLine: Number(found.closingLine),
      });
      continue;
    }
    insertedFingerprintsFound.push(fp);
  }

  const reasons: string[] = [];
  if (options.createManyCount !== expectedInserts.length) {
    reasons.push(
      `createManyCount ${options.createManyCount} != expectedInsertCount ${expectedInserts.length}`
    );
  }
  if (missingInsertedFingerprints.length > 0) {
    reasons.push(
      `missing ${missingInsertedFingerprints.length} expected inserted fingerprint(s)`
    );
  }
  if (conflictingInsertedFingerprints.length > 0) {
    reasons.push(
      `${conflictingInsertedFingerprints.length} conflicting inserted fingerprint(s)`
    );
  }

  return {
    expectedInsertCount: expectedInserts.length,
    createManyCount: options.createManyCount,
    totalRowsAfter: options.afterRows.length,
    distinctGamesAfter: new Set(options.afterRows.map((r) => r.gameId)).size,
    spreadsAfter: options.afterRows.filter((r) => r.lineType === 'spread').length,
    totalsAfter: options.afterRows.filter((r) => r.lineType === 'total').length,
    moneylinesAfter: options.afterRows.filter((r) => r.lineType === 'moneyline')
      .length,
    distinctBooksAfter: new Set(options.afterRows.map((r) => r.bookName)).size,
    insertedFingerprintsExpected: expectedFps,
    insertedFingerprintsFound,
    missingInsertedFingerprints,
    conflictingInsertedFingerprints,
    ok: reasons.length === 0,
    reasons,
  };
}

export function finalizeLiveOddsReport(options: {
  plan: LiveOddsPlan;
  execution: LiveOddsExecutionState;
  verification: LiveOddsPostWriteVerification | null;
  meta?: Record<string, unknown>;
}): {
  generatedAt: string;
  plan: LiveOddsPlan;
  execution: LiveOddsExecutionState;
  verification: LiveOddsPostWriteVerification | null;
  sampleCandidates: CandidateMarketLine[];
  sampleProposedInsert: CandidateMarketLine[];
  productionOddsWriteAuthorizedByThisPhase: false;
  [key: string]: unknown;
} {
  return {
    generatedAt: new Date().toISOString(),
    ...(options.meta || {}),
    plan: options.plan,
    execution: options.execution,
    verification: options.verification,
    sampleCandidates: options.plan.candidates.slice(0, 20),
    sampleProposedInsert: options.plan.proposedInsert.slice(0, 20),
    productionOddsWriteAuthorizedByThisPhase: false,
  };
}
