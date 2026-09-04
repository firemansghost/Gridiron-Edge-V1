/**
 * Guarded 2026 CFBD unit-grade SOURCE ingest (pure planner + sequential fetch).
 *
 * Writes (COMMIT only): cfbd_games, cfbd_eff_team_game, cfbd_ppa_team_game,
 * cfbd_eff_team_season. Does not write TeamUnitGrades, priors, Shadow, Bet,
 * or MatchupOutput. Does not compute grades.
 *
 * CFBD account-wide heavy-endpoint risk (ops note): max 2 in-flight and a
 * reported 75-second lease. Exact 75s lease semantics are NOT implemented in
 * this repository and are not invented here. This writer substitutes a more
 * conservative model: one process, one in-flight request, sequential week
 * fetches, Retry-After on 429, fail closed after retry exhaustion.
 */

import {
  CFBD_BASE_URL_DEFAULT,
  MAX_REGULAR_SEASON_WEEK,
  parseKickoffExplicit,
  redactSecretLike,
  type TeamResolutionResult,
} from '../preseason/cfbd-schedule-ingest';
import { EXPECTED_2026_FBS_COUNT } from '../preseason/balanced-v1-preseason-bridge-eval';

export const TARGET_SEASON = 2026 as const;
export const UNIT_GRADE_SOURCE_CONFIRMATION =
  'INGEST_2026_CFBD_UNIT_GRADE_SOURCES' as const;
export const CFBD_UNIT_GRADE_SOURCE_PROCESS_MAX_CONCURRENCY = 1 as const;
export const CFBD_UNIT_GRADE_SOURCE_TIMEOUT_MS = 30_000;
export const CFBD_UNIT_GRADE_SOURCE_MAX_RETRIES = 5;
export const CFBD_LEASE_SEMANTICS =
  '75-second CFBD account lease semantics are uncertain in this repo; writer uses sequential single-in-flight requests plus Retry-After instead of inventing a lease';

export const PROVIDER_ENDPOINTS = [
  '/games',
  '/stats/season/advanced',
  '/stats/game/advanced',
  '/ppa/games',
] as const;

export type IngestMode = 'PREVIEW' | 'COMMIT';
export type MutationKind = 'CREATE' | 'UPDATE' | 'NO_CHANGE';

export interface MembershipRow {
  teamId: string;
  level: string;
}

export interface ExistingCfbdGameRow {
  gameIdCfbd: string;
  season: number;
  week: number;
  date: Date | string;
  homeTeamIdInternal: string;
  awayTeamIdInternal: string;
  neutralSite: boolean;
  venue: string | null;
  homeConference: string | null;
  awayConference: string | null;
}

export type EffMetricFields = {
  offEpa: number | null;
  offSr: number | null;
  isoPppOff: number | null;
  ppoOff: number | null;
  lineYardsOff: number | null;
  havocOff: number | null;
  havocFront7Off: number | null;
  havocDbOff: number | null;
  defEpa: number | null;
  defSr: number | null;
  isoPppDef: number | null;
  ppoDef: number | null;
  stuffRate: number | null;
  powerSuccess: number | null;
  havocDef: number | null;
  havocFront7Def: number | null;
  havocDbDef: number | null;
  runEpa: number | null;
  passEpa: number | null;
  runSr: number | null;
  passSr: number | null;
  earlyDownEpa: number | null;
  lateDownEpa: number | null;
  avgFieldPosition: number | null;
};

export interface ExistingEffTeamGameRow extends EffMetricFields {
  gameIdCfbd: string;
  teamIdInternal: string;
}

export interface ExistingPpaTeamGameRow {
  gameIdCfbd: string;
  teamIdInternal: string;
  ppaOffense: number | null;
  ppaDefense: number | null;
  ppaOverall: number | null;
}

export interface ExistingEffTeamSeasonRow extends EffMetricFields {
  season: number;
  teamIdInternal: string;
}

export interface PlannedGameRow {
  kind: MutationKind;
  gameIdCfbd: string;
  season: number;
  week: number;
  dateIso: string;
  homeTeamIdInternal: string;
  awayTeamIdInternal: string;
  neutralSite: boolean;
  venue: string | null;
  homeConference: string | null;
  awayConference: string | null;
  providerHomeName: string;
  providerAwayName: string;
  homeLevel: string | null;
  awayLevel: string | null;
}

export interface PlannedEffGameRow extends EffMetricFields {
  kind: MutationKind;
  gameIdCfbd: string;
  teamIdInternal: string;
}

export interface PlannedPpaGameRow {
  kind: MutationKind;
  gameIdCfbd: string;
  teamIdInternal: string;
  ppaOffense: number | null;
  ppaDefense: number | null;
  ppaOverall: number | null;
}

export interface PlannedEffSeasonRow extends EffMetricFields {
  kind: MutationKind;
  season: number;
  teamIdInternal: string;
}

export interface MutationCounts {
  create: number;
  update: number;
  noChange: number;
}

export interface UnitGradeSourceIngestPlan {
  season: number;
  requestedWeeks: number[];
  mode: IngestMode;
  expectedConfirmation: typeof UNIT_GRADE_SOURCE_CONFIRMATION;
  confirmationValid: boolean;
  writeSafe: boolean;
  blockers: string[];
  warnings: string[];
  skipped: string[];
  providerTeamNames: string[];
  mappedInternalIds: string[];
  unmappedProviderTeams: string[];
  games: PlannedGameRow[];
  effGames: PlannedEffGameRow[];
  ppaGames: PlannedPpaGameRow[];
  effSeasons: PlannedEffSeasonRow[];
  gameCounts: MutationCounts;
  effGameCounts: MutationCounts;
  ppaGameCounts: MutationCounts;
  effSeasonCounts: MutationCounts;
  cfbdLeaseSemantics: typeof CFBD_LEASE_SEMANTICS;
  processMaxConcurrency: typeof CFBD_UNIT_GRADE_SOURCE_PROCESS_MAX_CONCURRENCY;
}

export interface UnitGradeSourceIngestCliArgs {
  season: number;
  weeks: number[];
  mode: IngestMode;
  confirmation: string;
  reportPath: string | null;
}

export function expectedUnitGradeSourceConfirmation(): string {
  return UNIT_GRADE_SOURCE_CONFIRMATION;
}

export function uniqueSorted(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = String(raw ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  out.sort();
  return out;
}

export function toFiniteOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseWeeks(raw: string): { ok: true; weeks: number[] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const parts = String(raw ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) {
    return { ok: false, errors: ['weeks must be a non-empty comma-separated integer list'] };
  }
  const weeks: number[] = [];
  const seen = new Set<number>();
  for (const p of parts) {
    if (!/^-?\d+$/.test(p)) {
      errors.push(`invalid week: ${p}`);
      continue;
    }
    const n = Number(p);
    if (!Number.isInteger(n)) errors.push(`invalid week: ${p}`);
    else if (n < 0) errors.push(`week must be >= 0 (got ${n})`);
    else if (n > MAX_REGULAR_SEASON_WEEK) {
      errors.push(`week must be <= ${MAX_REGULAR_SEASON_WEEK} (got ${n})`);
    } else if (seen.has(n)) errors.push(`duplicate week: ${n}`);
    else {
      seen.add(n);
      weeks.push(n);
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, weeks };
}

export function parseUnitGradeSourceIngestArgs(argv: string[]):
  | { ok: true; args: UnitGradeSourceIngestCliArgs }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  let season: number | null = null;
  let weeksRaw: string | null = null;
  let mode: IngestMode = 'PREVIEW';
  let confirmation = '';
  let reportPath: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--season') season = Number(argv[++i]);
    else if (a.startsWith('--season=')) season = Number(a.slice('--season='.length));
    else if (a === '--weeks') weeksRaw = String(argv[++i] ?? '');
    else if (a.startsWith('--weeks=')) weeksRaw = a.slice('--weeks='.length);
    else if (a === '--mode') mode = String(argv[++i] ?? '').toUpperCase() as IngestMode;
    else if (a.startsWith('--mode=')) mode = a.slice('--mode='.length).toUpperCase() as IngestMode;
    else if (a === '--confirm' || a === '--confirmation') confirmation = String(argv[++i] ?? '');
    else if (a.startsWith('--confirm=')) confirmation = a.slice('--confirm='.length);
    else if (a.startsWith('--confirmation=')) confirmation = a.slice('--confirmation='.length);
    else if (a === '--report') reportPath = String(argv[++i] ?? '').trim() || null;
    else if (a.startsWith('--report=')) reportPath = a.slice('--report='.length).trim() || null;
    else errors.push(`unknown arg: ${a}`);
  }

  if (season === null || !Number.isInteger(season)) errors.push('season is required');
  else if (season !== TARGET_SEASON) errors.push(`season must be ${TARGET_SEASON}`);
  if (mode !== 'PREVIEW' && mode !== 'COMMIT') errors.push('mode must be PREVIEW or COMMIT');
  if (weeksRaw === null) errors.push('weeks is required');
  const parsedWeeks = weeksRaw === null ? null : parseWeeks(weeksRaw);
  if (parsedWeeks && parsedWeeks.ok === false) errors.push(...parsedWeeks.errors);
  if (mode === 'COMMIT' && confirmation !== UNIT_GRADE_SOURCE_CONFIRMATION) {
    errors.push(`COMMIT requires confirmation=${UNIT_GRADE_SOURCE_CONFIRMATION}`);
  }
  if (errors.length > 0 || !parsedWeeks || parsedWeeks.ok === false || season === null) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    args: {
      season,
      weeks: parsedWeeks.weeks,
      mode,
      confirmation,
      reportPath,
    },
  };
}

export function parseRetryAfterMs(header: string | null, fallbackMs: number): number {
  if (!header) return fallbackMs;
  const sec = Number(String(header).trim());
  if (!Number.isFinite(sec) || sec < 0) return fallbackMs;
  return Math.min(Math.max(sec * 1000, 0), 120_000);
}

export class SequentialJsonFetcher {
  readonly maxConcurrency = CFBD_UNIT_GRADE_SOURCE_PROCESS_MAX_CONCURRENCY;
  private inFlight = 0;
  providerCalls = 0;
  endpointsInvoked: string[] = [];

  async getJson(options: {
    url: string;
    endpointLabel: string;
    apiKey: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    sleepImpl?: (ms: number) => Promise<void>;
  }): Promise<{ status: number; body: unknown; attempts: number }> {
    while (this.inFlight >= this.maxConcurrency) {
      await (options.sleepImpl ?? defaultSleep)(25);
    }
    this.inFlight += 1;
    try {
      return await this.requestWithRetry(options);
    } finally {
      this.inFlight -= 1;
    }
  }

  private async requestWithRetry(options: {
    url: string;
    endpointLabel: string;
    apiKey: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    sleepImpl?: (ms: number) => Promise<void>;
  }): Promise<{ status: number; body: unknown; attempts: number }> {
    if (!options.apiKey || !String(options.apiKey).trim()) {
      throw new Error('CFBD_API_KEY is missing or empty');
    }
    const fetchImpl = options.fetchImpl ?? fetch;
    const timeoutMs = options.timeoutMs ?? CFBD_UNIT_GRADE_SOURCE_TIMEOUT_MS;
    const sleep = options.sleepImpl ?? defaultSleep;
    let attempts = 0;
    let backoff = 1000;
    while (attempts < CFBD_UNIT_GRADE_SOURCE_MAX_RETRIES) {
      attempts += 1;
      this.providerCalls += 1;
      if (this.endpointsInvoked.indexOf(options.endpointLabel) < 0) {
        this.endpointsInvoked.push(options.endpointLabel);
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetchImpl(options.url, {
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
      } catch (err) {
        const name = err instanceof Error ? err.name : '';
        const msg = err instanceof Error ? err.message : String(err);
        if (name === 'AbortError' || /aborted/i.test(msg)) {
          throw new Error(
            redactSecretLike(
              `CFBD ${options.endpointLabel} timed out after ${timeoutMs}ms`
            )
          );
        }
        throw new Error(
          redactSecretLike(`CFBD ${options.endpointLabel} fetch failed: ${msg}`)
        );
      } finally {
        clearTimeout(timer);
      }
      if (res.status === 429) {
        if (attempts >= CFBD_UNIT_GRADE_SOURCE_MAX_RETRIES) {
          throw new Error(
            `CFBD ${options.endpointLabel} HTTP 429 after ${attempts} attempts`
          );
        }
        const waitMs = parseRetryAfterMs(res.headers.get('Retry-After'), backoff);
        await sleep(waitMs);
        backoff *= 2;
        continue;
      }
      if (!res.ok) {
        throw new Error(`CFBD ${options.endpointLabel} HTTP ${res.status}`);
      }
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        throw new Error(`CFBD ${options.endpointLabel} response was not valid JSON`);
      }
      if (!Array.isArray(body)) {
        throw new Error(`CFBD ${options.endpointLabel} response was not an array`);
      }
      return { status: res.status, body, attempts };
    }
    throw new Error(`CFBD ${options.endpointLabel} HTTP 429 after retry exhaustion`);
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildGamesUrl(season: number, week: number, baseUrl = CFBD_BASE_URL_DEFAULT): string {
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/games`);
  url.searchParams.set('year', String(season));
  url.searchParams.set('week', String(week));
  url.searchParams.set('seasonType', 'regular');
  url.searchParams.set('division', 'fbs');
  return url.toString();
}

export function buildAdvancedGameUrl(
  season: number,
  week: number,
  baseUrl = CFBD_BASE_URL_DEFAULT
): string {
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/stats/game/advanced`);
  url.searchParams.set('year', String(season));
  url.searchParams.set('week', String(week));
  url.searchParams.set('seasonType', 'regular');
  url.searchParams.set('classification', 'fbs');
  return url.toString();
}

export function buildPpaGameUrl(
  season: number,
  week: number,
  baseUrl = CFBD_BASE_URL_DEFAULT
): string {
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/ppa/games`);
  url.searchParams.set('year', String(season));
  url.searchParams.set('week', String(week));
  url.searchParams.set('seasonType', 'regular');
  return url.toString();
}

export function buildAdvancedSeasonUrl(
  season: number,
  baseUrl = CFBD_BASE_URL_DEFAULT
): string {
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/stats/season/advanced`);
  url.searchParams.set('year', String(season));
  url.searchParams.set('seasonType', 'regular');
  return url.toString();
}

export async function fetchUnitGradeSourcePayloads(options: {
  season: number;
  weeks: number[];
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  sleepImpl?: (ms: number) => Promise<void>;
  fetcher?: SequentialJsonFetcher;
}): Promise<{
  gamesByWeek: Record<number, unknown[]>;
  advancedGameByWeek: Record<number, unknown[]>;
  ppaGameByWeek: Record<number, unknown[]>;
  advancedSeason: unknown[];
  providerCalls: number;
  endpointsInvoked: string[];
  responseRowCounts: Record<string, number>;
}> {
  const fetcher = options.fetcher ?? new SequentialJsonFetcher();
  const baseUrl = options.baseUrl ?? CFBD_BASE_URL_DEFAULT;
  const gamesByWeek: Record<number, unknown[]> = {};
  const advancedGameByWeek: Record<number, unknown[]> = {};
  const ppaGameByWeek: Record<number, unknown[]> = {};

  for (let i = 0; i < options.weeks.length; i++) {
    const week = options.weeks[i];
    const games = await fetcher.getJson({
      url: buildGamesUrl(options.season, week, baseUrl),
      endpointLabel: '/games',
      apiKey: options.apiKey,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
      sleepImpl: options.sleepImpl,
    });
    gamesByWeek[week] = games.body as unknown[];
  }

  const seasonAdv = await fetcher.getJson({
    url: buildAdvancedSeasonUrl(options.season, baseUrl),
    endpointLabel: '/stats/season/advanced',
    apiKey: options.apiKey,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    sleepImpl: options.sleepImpl,
  });

  for (let i = 0; i < options.weeks.length; i++) {
    const week = options.weeks[i];
    const adv = await fetcher.getJson({
      url: buildAdvancedGameUrl(options.season, week, baseUrl),
      endpointLabel: '/stats/game/advanced',
      apiKey: options.apiKey,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
      sleepImpl: options.sleepImpl,
    });
    advancedGameByWeek[week] = adv.body as unknown[];
    const ppa = await fetcher.getJson({
      url: buildPpaGameUrl(options.season, week, baseUrl),
      endpointLabel: '/ppa/games',
      apiKey: options.apiKey,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
      sleepImpl: options.sleepImpl,
    });
    ppaGameByWeek[week] = ppa.body as unknown[];
  }

  return {
    gamesByWeek,
    advancedGameByWeek,
    ppaGameByWeek,
    advancedSeason: seasonAdv.body as unknown[],
    providerCalls: fetcher.providerCalls,
    endpointsInvoked: fetcher.endpointsInvoked.slice(),
    responseRowCounts: {
      games: options.weeks.reduce((n, w) => n + (gamesByWeek[w] || []).length, 0),
      advancedGame: options.weeks.reduce(
        (n, w) => n + (advancedGameByWeek[w] || []).length,
        0
      ),
      ppaGame: options.weeks.reduce((n, w) => n + (ppaGameByWeek[w] || []).length, 0),
      advancedSeason: (seasonAdv.body as unknown[]).length,
    },
  };
}

function str(v: unknown): string {
  return String(v ?? '').trim();
}

function providerId(row: Record<string, unknown>): string {
  const raw = row.id ?? row.gameId ?? row.game_id ?? row.gameIdCfbd;
  return str(raw);
}

function providerTeam(row: Record<string, unknown>): string {
  return str(row.team ?? row.teamName ?? row.name ?? row.school);
}

function sideName(row: Record<string, unknown>, side: 'home' | 'away'): string {
  if (side === 'home') {
    return str(row.homeTeam ?? row.home_team ?? row.homeTeamName);
  }
  return str(row.awayTeam ?? row.away_team ?? row.awayTeamName);
}

function nest(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (let i = 0; i < path.length; i++) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[path[i]];
  }
  return cur;
}

export function extractHavoc(raw: unknown): {
  total: number | null;
  front7: number | null;
  db: number | null;
} {
  if (raw === null || raw === undefined) {
    return { total: null, front7: null, db: null };
  }
  if (typeof raw !== 'object') {
    return { total: toFiniteOrNull(raw), front7: null, db: null };
  }
  const o = raw as Record<string, unknown>;
  return {
    total: toFiniteOrNull(o.total ?? o.havoc),
    front7: toFiniteOrNull(o.frontSeven ?? o.front7),
    db: toFiniteOrNull(o.db),
  };
}

export function mapAdvancedMetrics(row: Record<string, unknown>): EffMetricFields {
  const offense = (row.offense ?? {}) as Record<string, unknown>;
  const defense = (row.defense ?? {}) as Record<string, unknown>;
  const rushing = (offense.rushingPlays ?? {}) as Record<string, unknown>;
  const passing = (offense.passingPlays ?? {}) as Record<string, unknown>;
  const havocOff = extractHavoc(offense.havoc);
  const havocDef = extractHavoc(defense.havoc);
  const fieldPos = (row.fieldPosition ?? {}) as Record<string, unknown>;
  return {
    offEpa: toFiniteOrNull(offense.epa),
    offSr: toFiniteOrNull(offense.successRate),
    isoPppOff: toFiniteOrNull(offense.explosiveness),
    ppoOff: toFiniteOrNull(
      offense.pointsPerOpportunity ?? offense.ppo ?? offense.pointsPerOpp
    ),
    lineYardsOff: toFiniteOrNull(offense.lineYards),
    havocOff: havocOff.total,
    havocFront7Off: havocOff.front7,
    havocDbOff: havocOff.db,
    defEpa: toFiniteOrNull(defense.epa),
    defSr: toFiniteOrNull(defense.successRate),
    isoPppDef: toFiniteOrNull(defense.explosiveness),
    ppoDef: toFiniteOrNull(
      defense.pointsPerOpportunity ?? defense.ppo ?? defense.pointsPerOpp
    ),
    stuffRate: toFiniteOrNull(defense.stuffRate),
    powerSuccess: toFiniteOrNull(offense.powerSuccess),
    havocDef: havocDef.total,
    havocFront7Def: havocDef.front7,
    havocDbDef: havocDef.db,
    runEpa: toFiniteOrNull(rushing.epa),
    passEpa: toFiniteOrNull(passing.epa),
    runSr: toFiniteOrNull(rushing.successRate),
    passSr: toFiniteOrNull(passing.successRate),
    earlyDownEpa: toFiniteOrNull(nest(offense, ['firstDown', 'epa'])),
    lateDownEpa: toFiniteOrNull(nest(offense, ['secondDown', 'epa'])),
    avgFieldPosition: toFiniteOrNull(fieldPos.averageStartingFieldPosition),
  };
}

function ppaFromSide(side: unknown): number | null {
  if (side === null || side === undefined) return null;
  if (typeof side !== 'object') return toFiniteOrNull(side);
  const o = side as Record<string, unknown>;
  return toFiniteOrNull(o.ppa ?? o.overall ?? o.average);
}

export function flattenPpaRows(rows: unknown[]): Array<{
  gameIdCfbd: string;
  teamName: string;
  ppaOffense: number | null;
  ppaDefense: number | null;
  ppaOverall: number | null;
  unknownShape: boolean;
}> {
  const out: Array<{
    gameIdCfbd: string;
    teamName: string;
    ppaOffense: number | null;
    ppaDefense: number | null;
    ppaOverall: number | null;
    unknownShape: boolean;
  }> = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') {
      out.push({
        gameIdCfbd: '',
        teamName: '',
        ppaOffense: null,
        ppaDefense: null,
        ppaOverall: null,
        unknownShape: true,
      });
      continue;
    }
    const row = raw as Record<string, unknown>;
    const gid = providerId(row);
    const nested = Array.isArray(row.teams) ? (row.teams as unknown[]) : null;
    if (nested) {
      for (const t of nested) {
        if (!t || typeof t !== 'object') {
          out.push({
            gameIdCfbd: gid,
            teamName: '',
            ppaOffense: null,
            ppaDefense: null,
            ppaOverall: null,
            unknownShape: true,
          });
          continue;
        }
        const tr = t as Record<string, unknown>;
        out.push({
          gameIdCfbd: gid,
          teamName: providerTeam(tr),
          ppaOffense: ppaFromSide(tr.offense),
          ppaDefense: ppaFromSide(tr.defense),
          ppaOverall: ppaFromSide(tr.overall ?? tr.ppa),
          unknownShape: false,
        });
      }
      continue;
    }
    out.push({
      gameIdCfbd: gid,
      teamName: providerTeam(row),
      ppaOffense: ppaFromSide(row.offense),
      ppaDefense: ppaFromSide(row.defense),
      ppaOverall: ppaFromSide(row.overall ?? row.ppa),
      unknownShape: false,
    });
  }
  return out;
}

function resolvedId(r: TeamResolutionResult | undefined): string | null {
  if (!r || !r.resolvedId) return null;
  if (r.kind !== 'exact_canonical' && r.kind !== 'alias') return null;
  return r.resolvedId;
}

function mutationKind(exists: boolean, same: boolean): MutationKind {
  if (!exists) return 'CREATE';
  return same ? 'NO_CHANGE' : 'UPDATE';
}

function countsOf(kinds: MutationKind[]): MutationCounts {
  return {
    create: kinds.filter((k) => k === 'CREATE').length,
    update: kinds.filter((k) => k === 'UPDATE').length,
    noChange: kinds.filter((k) => k === 'NO_CHANGE').length,
  };
}

function sameNum(a: number | null, b: number | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a === b;
}

function sameStr(a: string | null, b: string | null): boolean {
  return String(a ?? '') === String(b ?? '');
}

function sameEff(a: EffMetricFields, b: EffMetricFields): boolean {
  const keys = Object.keys(a) as Array<keyof EffMetricFields>;
  for (let i = 0; i < keys.length; i++) {
    if (!sameNum(a[keys[i]], b[keys[i]])) return false;
  }
  return true;
}

function isoDate(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

export function planUnitGradeSourceIngest(options: {
  season: number;
  weeks: number[];
  mode: IngestMode;
  confirmation: string;
  memberships: MembershipRow[];
  teamResolutions: Map<string, TeamResolutionResult>;
  existingGames: ExistingCfbdGameRow[];
  existingEffGames: ExistingEffTeamGameRow[];
  existingPpaGames: ExistingPpaTeamGameRow[];
  existingEffSeasons: ExistingEffTeamSeasonRow[];
  gamesByWeek: Record<number, unknown[]>;
  advancedGameByWeek: Record<number, unknown[]>;
  ppaGameByWeek: Record<number, unknown[]>;
  advancedSeason: unknown[];
}): UnitGradeSourceIngestPlan {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const skipped: string[] = [];
  const confirmationValid =
    options.mode === 'PREVIEW' ||
    options.confirmation === UNIT_GRADE_SOURCE_CONFIRMATION;
  if (options.mode === 'COMMIT' && !confirmationValid) {
    blockers.push(`COMMIT requires confirmation=${UNIT_GRADE_SOURCE_CONFIRMATION}`);
  }
  if (options.season !== TARGET_SEASON) {
    blockers.push(`season must be ${TARGET_SEASON}`);
  }

  const fbsIds = options.memberships
    .filter((m) => String(m.level).toLowerCase() === 'fbs')
    .map((m) => m.teamId.trim().toLowerCase())
    .filter(Boolean);
  const uniqueFbs = uniqueSorted(fbsIds);
  if (fbsIds.length !== EXPECTED_2026_FBS_COUNT) {
    blockers.push(`fbs_membership_row_count_not_138:${fbsIds.length}`);
  }
  if (uniqueFbs.length !== EXPECTED_2026_FBS_COUNT) {
    blockers.push(`fbs_population_not_138:${uniqueFbs.length}`);
  }
  const levelByTeam = new Map<string, string>();
  for (const m of options.memberships) {
    const id = m.teamId.trim().toLowerCase();
    if (id) levelByTeam.set(id, String(m.level).toLowerCase());
  }

  const existingGameById = new Map<string, ExistingCfbdGameRow>();
  for (const g of options.existingGames) {
    existingGameById.set(String(g.gameIdCfbd), g);
  }
  const existingEffByKey = new Map<string, ExistingEffTeamGameRow>();
  for (const r of options.existingEffGames) {
    existingEffByKey.set(`${r.gameIdCfbd}\0${r.teamIdInternal.toLowerCase()}`, r);
  }
  const existingPpaByKey = new Map<string, ExistingPpaTeamGameRow>();
  for (const r of options.existingPpaGames) {
    existingPpaByKey.set(`${r.gameIdCfbd}\0${r.teamIdInternal.toLowerCase()}`, r);
  }
  const existingSeasonByTeam = new Map<string, ExistingEffTeamSeasonRow>();
  for (const r of options.existingEffSeasons) {
    existingSeasonByTeam.set(r.teamIdInternal.toLowerCase(), r);
  }

  const providerTeamNames: string[] = [];
  const unmapped: string[] = [];
  const mappedIds: string[] = [];
  const plannedGames: PlannedGameRow[] = [];
  const plannedById = new Map<string, PlannedGameRow>();

  for (let wi = 0; wi < options.weeks.length; wi++) {
    const week = options.weeks[wi];
    const rows = options.gamesByWeek[week] || [];
    for (const raw of rows) {
      if (!raw || typeof raw !== 'object') {
        skipped.push(`week_${week}:skipped_unknown_game_shape`);
        continue;
      }
      const g = raw as Record<string, unknown>;
      const gid = providerId(g);
      const homeName = sideName(g, 'home');
      const awayName = sideName(g, 'away');
      if (!gid) {
        blockers.push('malformed_provider_game_id');
        continue;
      }
      if (!homeName || !awayName) {
        blockers.push(`missing_mapped_home_away:${gid}`);
        continue;
      }
      providerTeamNames.push(homeName, awayName);
      const homeRes = resolvedId(options.teamResolutions.get(homeName));
      const awayRes = resolvedId(options.teamResolutions.get(awayName));
      if (!homeRes || !awayRes) {
        if (!homeRes && unmapped.indexOf(homeName) < 0) unmapped.push(homeName);
        if (!awayRes && unmapped.indexOf(awayName) < 0) unmapped.push(awayName);
        skipped.push(`game_${gid}:unmapped_provider_team`);
        continue;
      }
      if (homeRes.toLowerCase() === awayRes.toLowerCase()) {
        blockers.push(`same_mapped_home_away:${gid}`);
        continue;
      }
      const kick = parseKickoffExplicit(
        str(g.startDate ?? g.start_date) || null
      );
      if (!kick.ok) {
        skipped.push(`game_${gid}:invalid_kickoff`);
        continue;
      }
      const homeId = homeRes.toLowerCase();
      const awayId = awayRes.toLowerCase();
      mappedIds.push(homeId, awayId);
      const existing = existingGameById.get(gid);
      const planned: Omit<PlannedGameRow, 'kind'> = {
        gameIdCfbd: gid,
        season: TARGET_SEASON,
        week,
        dateIso: kick.utcIso,
        homeTeamIdInternal: homeId,
        awayTeamIdInternal: awayId,
        neutralSite: Boolean(g.neutralSite ?? g.neutral_site),
        venue: str(g.venue) || null,
        homeConference: str(g.homeConference ?? g.home_conference) || null,
        awayConference: str(g.awayConference ?? g.away_conference) || null,
        providerHomeName: homeName,
        providerAwayName: awayName,
        homeLevel: levelByTeam.get(homeId) ?? null,
        awayLevel: levelByTeam.get(awayId) ?? null,
      };
      const prev = plannedById.get(gid);
      if (prev) {
        const conflict =
          prev.homeTeamIdInternal !== planned.homeTeamIdInternal ||
          prev.awayTeamIdInternal !== planned.awayTeamIdInternal ||
          prev.week !== planned.week;
        if (conflict) blockers.push(`duplicate_game_id_conflicting_identity:${gid}`);
        else blockers.push(`duplicate_game_id:${gid}`);
        continue;
      }
      let same = false;
      if (existing) {
        same =
          existing.season === planned.season &&
          existing.week === planned.week &&
          isoDate(existing.date) === planned.dateIso &&
          existing.homeTeamIdInternal.toLowerCase() === planned.homeTeamIdInternal &&
          existing.awayTeamIdInternal.toLowerCase() === planned.awayTeamIdInternal &&
          Boolean(existing.neutralSite) === planned.neutralSite &&
          sameStr(existing.venue, planned.venue) &&
          sameStr(existing.homeConference, planned.homeConference) &&
          sameStr(existing.awayConference, planned.awayConference);
      }
      const row: PlannedGameRow = { ...planned, kind: mutationKind(!!existing, same) };
      plannedById.set(gid, row);
      plannedGames.push(row);
    }
  }

  const plannedEff: PlannedEffGameRow[] = [];
  const effKeys = new Set<string>();
  for (let wi = 0; wi < options.weeks.length; wi++) {
    const week = options.weeks[wi];
    const rows = options.advancedGameByWeek[week] || [];
    for (const raw of rows) {
      if (!raw || typeof raw !== 'object') {
        skipped.push(`week_${week}:skipped_unknown_eff_shape`);
        continue;
      }
      const g = raw as Record<string, unknown>;
      const gid = providerId(g);
      const teamName = providerTeam(g);
      if (!gid || !teamName) {
        skipped.push(`week_${week}:skipped_unknown_eff_shape`);
        continue;
      }
      const teamId = resolvedId(options.teamResolutions.get(teamName));
      if (!teamId) {
        if (unmapped.indexOf(teamName) < 0) unmapped.push(teamName);
        skipped.push(`eff_${gid}:unmapped_provider_team`);
        continue;
      }
      const game = plannedById.get(gid);
      if (!game) {
        skipped.push(`eff_${gid}:game_not_in_frame`);
        continue;
      }
      const tid = teamId.toLowerCase();
      if (tid !== game.homeTeamIdInternal && tid !== game.awayTeamIdInternal) {
        blockers.push(`eff_team_game_team_not_in_game:${gid}:${tid}`);
        continue;
      }
      const key = `${gid}\0${tid}`;
      if (effKeys.has(key)) {
        blockers.push(`duplicate_eff_team_game_identity:${gid}:${tid}`);
        continue;
      }
      effKeys.add(key);
      const metrics = mapAdvancedMetrics(g);
      const existing = existingEffByKey.get(key);
      const same = existing ? sameEff(existing, metrics) : false;
      plannedEff.push({
        kind: mutationKind(!!existing, same),
        gameIdCfbd: gid,
        teamIdInternal: tid,
        ...metrics,
      });
    }
  }

  const plannedPpa: PlannedPpaGameRow[] = [];
  const ppaKeys = new Set<string>();
  for (let wi = 0; wi < options.weeks.length; wi++) {
    const week = options.weeks[wi];
    const flat = flattenPpaRows(options.ppaGameByWeek[week] || []);
    for (const row of flat) {
      if (row.unknownShape) {
        skipped.push(`week_${week}:skipped_unknown_ppa_shape`);
        continue;
      }
      if (!row.gameIdCfbd || !row.teamName) {
        skipped.push(`week_${week}:skipped_unknown_ppa_shape`);
        continue;
      }
      const teamId = resolvedId(options.teamResolutions.get(row.teamName));
      if (!teamId) {
        if (unmapped.indexOf(row.teamName) < 0) unmapped.push(row.teamName);
        skipped.push(`ppa_${row.gameIdCfbd}:unmapped_provider_team`);
        continue;
      }
      const game = plannedById.get(row.gameIdCfbd);
      if (!game) {
        skipped.push(`ppa_${row.gameIdCfbd}:game_not_in_frame`);
        continue;
      }
      const tid = teamId.toLowerCase();
      if (tid !== game.homeTeamIdInternal && tid !== game.awayTeamIdInternal) {
        blockers.push(`ppa_team_game_team_not_in_game:${row.gameIdCfbd}:${tid}`);
        continue;
      }
      const key = `${row.gameIdCfbd}\0${tid}`;
      if (ppaKeys.has(key)) {
        blockers.push(`duplicate_ppa_team_game_identity:${row.gameIdCfbd}:${tid}`);
        continue;
      }
      ppaKeys.add(key);
      const existing = existingPpaByKey.get(key);
      const same = existing
        ? sameNum(existing.ppaOffense, row.ppaOffense) &&
          sameNum(existing.ppaDefense, row.ppaDefense) &&
          sameNum(existing.ppaOverall, row.ppaOverall)
        : false;
      plannedPpa.push({
        kind: mutationKind(!!existing, same),
        gameIdCfbd: row.gameIdCfbd,
        teamIdInternal: tid,
        ppaOffense: row.ppaOffense,
        ppaDefense: row.ppaDefense,
        ppaOverall: row.ppaOverall,
      });
    }
  }

  const plannedSeason: PlannedEffSeasonRow[] = [];
  const seasonTeams = new Set<string>();
  for (const raw of options.advancedSeason) {
    if (!raw || typeof raw !== 'object') {
      skipped.push('season:skipped_unknown_shape');
      continue;
    }
    const g = raw as Record<string, unknown>;
    const teamName = providerTeam(g);
    if (!teamName) {
      skipped.push('season:skipped_unknown_shape');
      continue;
    }
    const teamId = resolvedId(options.teamResolutions.get(teamName));
    if (!teamId) {
      if (unmapped.indexOf(teamName) < 0) unmapped.push(teamName);
      skipped.push(`season:unmapped_provider_team:${teamName}`);
      continue;
    }
    const tid = teamId.toLowerCase();
    if (seasonTeams.has(tid)) {
      blockers.push(`duplicate_eff_team_season_team:${tid}`);
      continue;
    }
    seasonTeams.add(tid);
    const metrics = mapAdvancedMetrics(g);
    const existing = existingSeasonByTeam.get(tid);
    const same = existing ? sameEff(existing, metrics) : false;
    plannedSeason.push({
      kind: mutationKind(!!existing, same),
      season: TARGET_SEASON,
      teamIdInternal: tid,
      ...metrics,
    });
  }

  const uniqueNames = uniqueSorted(providerTeamNames);
  unmapped.sort();
  const writeSafe = blockers.length === 0 && confirmationValid;
  if (plannedGames.length === 0) {
    warnings.push('empty_provider_schedule');
  }

  return {
    season: options.season,
    requestedWeeks: options.weeks.slice(),
    mode: options.mode,
    expectedConfirmation: UNIT_GRADE_SOURCE_CONFIRMATION,
    confirmationValid,
    writeSafe,
    blockers: uniqueSorted(blockers),
    warnings: uniqueSorted(warnings),
    skipped: skipped.slice().sort(),
    providerTeamNames: uniqueNames,
    mappedInternalIds: uniqueSorted(mappedIds),
    unmappedProviderTeams: unmapped,
    games: plannedGames,
    effGames: plannedEff,
    ppaGames: plannedPpa,
    effSeasons: plannedSeason,
    gameCounts: countsOf(plannedGames.map((r) => r.kind)),
    effGameCounts: countsOf(plannedEff.map((r) => r.kind)),
    ppaGameCounts: countsOf(plannedPpa.map((r) => r.kind)),
    effSeasonCounts: countsOf(plannedSeason.map((r) => r.kind)),
    cfbdLeaseSemantics: CFBD_LEASE_SEMANTICS,
    processMaxConcurrency: CFBD_UNIT_GRADE_SOURCE_PROCESS_MAX_CONCURRENCY,
  };
}

export function collectProviderNamesFromPayloads(payloads: {
  gamesByWeek: Record<number, unknown[]>;
  advancedGameByWeek: Record<number, unknown[]>;
  ppaGameByWeek: Record<number, unknown[]>;
  advancedSeason: unknown[];
}): string[] {
  const names: string[] = [];
  const weekMaps = [
    payloads.gamesByWeek,
    payloads.advancedGameByWeek,
    payloads.ppaGameByWeek,
  ];
  for (let m = 0; m < weekMaps.length; m++) {
    const map = weekMaps[m];
    const weeks = Object.keys(map);
    for (let i = 0; i < weeks.length; i++) {
      const rows = map[Number(weeks[i])] || [];
      for (const raw of rows) {
        if (!raw || typeof raw !== 'object') continue;
        const row = raw as Record<string, unknown>;
        const home = sideName(row, 'home');
        const away = sideName(row, 'away');
        const team = providerTeam(row);
        if (home) names.push(home);
        if (away) names.push(away);
        if (team) names.push(team);
        if (Array.isArray(row.teams)) {
          for (const t of row.teams as unknown[]) {
            if (t && typeof t === 'object') {
              const n = providerTeam(t as Record<string, unknown>);
              if (n) names.push(n);
            }
          }
        }
      }
    }
  }
  for (const raw of payloads.advancedSeason) {
    if (!raw || typeof raw !== 'object') continue;
    const n = providerTeam(raw as Record<string, unknown>);
    if (n) names.push(n);
  }
  return uniqueSorted(names);
}
