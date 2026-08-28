/**
 * Phase 2C-2J-4 — Guarded 2026 Core V1 weekly-card planner (pure).
 *
 * Plans official_flat_100 bets only. Uses append-only display snapshots.
 * Side-specific closePrice / modelPrice — never store raw HMA in closePrice.
 * No provider calls. No Hybrid / V4 / Fade.
 */

import { getATSPick } from './core-v1-spread';
import { getOUPick } from './core-v1-total';
import { selectCoreV1MoneylinePick } from './core-v1-moneyline';
import type {
  BookMoneylineSnapshot,
  BookSpreadSnapshot,
  BookTotalSnapshot,
  GameMarketSelection,
} from './market-line-snapshot';

export const CORE_CARD_SEASON = 2026;
export const CORE_CARD_STRATEGY_TAG = 'official_flat_100';
export const CORE_CARD_SOURCE = 'strategy_run' as const;
export const CORE_CARD_STAKE = 100;
export const AUTHORITATIVE_FBS_COUNT = 138;
export const WEEK1_GAME_COUNT = 51;
export const LIVE_ODDS_SOURCE = 'oddsapi';
export const KICKOFF_LEAD_MS = 30 * 60 * 1000;
export const SPREAD_LINE_TOLERANCE = 1e-6;
export const SPREAD_EDGE_FLOOR = 0.1;

export type CoreCardMode = 'PREVIEW' | 'COMMIT';
export type CoreCardMarketType = 'spread' | 'total' | 'moneyline';
export type CoreCardSide = 'home' | 'away' | 'over' | 'under';

export function expectedWriteConfirmation(week: number): string {
  return `WRITE_2026_WEEK_${week}_CORE_CARD`;
}

export function naturalBetKey(parts: {
  season: number;
  week: number;
  gameId: string;
  marketType: CoreCardMarketType;
  strategyTag?: string;
}): string {
  const tag = parts.strategyTag ?? CORE_CARD_STRATEGY_TAG;
  return `${parts.season}|${parts.week}|${parts.gameId}|${parts.marketType}|${tag}`;
}

function approxEqual(a: number, b: number, eps = SPREAD_LINE_TOLERANCE): boolean {
  return Math.abs(a - b) <= eps;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function gradeSpreadEdgePts(edgePts: number): 'A' | 'B' | 'C' | null {
  if (!Number.isFinite(edgePts) || edgePts < 0.1) return null;
  if (edgePts >= 4.0) return 'A';
  if (edgePts >= 3.0) return 'B';
  if (edgePts >= 0.1) return 'C';
  return null;
}

/** Kickoff must be strictly after executionNow + 30 minutes. */
export function isKickoffEligible(options: {
  status: string;
  kickoff: Date | string;
  executionNow: Date | string;
}): { eligible: boolean; reason: string | null } {
  const status = String(options.status || '').toLowerCase();
  if (status !== 'scheduled') {
    return { eligible: false, reason: `status=${status}` };
  }
  const kick = toDate(options.kickoff);
  const now = toDate(options.executionNow);
  if (!kick || !now) {
    return { eligible: false, reason: 'invalid_kickoff_or_now' };
  }
  const cutoff = now.getTime() + KICKOFF_LEAD_MS;
  if (kick.getTime() <= cutoff) {
    return {
      eligible: false,
      reason:
        kick.getTime() <= now.getTime()
          ? 'kickoff_past_or_now'
          : 'kickoff_within_30m',
    };
  }
  return { eligible: true, reason: null };
}

export function assertDisplaySpreadInvariant(
  display: BookSpreadSnapshot
): boolean {
  const hma = display.marketSpreadHma;
  if (!isFiniteNumber(hma)) return false;
  if (!isFiniteNumber(display.homeLine) || !isFiniteNumber(display.awayLine)) {
    return false;
  }
  return (
    approxEqual(display.homeLine, -hma) && approxEqual(display.awayLine, hma)
  );
}

export interface PlannedBet {
  naturalKey: string;
  season: number;
  week: number;
  gameId: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoffIso: string;
  marketType: CoreCardMarketType;
  side: CoreCardSide;
  label: string;
  modelPrice: number;
  closePrice: number;
  stake: number;
  strategyTag: typeof CORE_CARD_STRATEGY_TAG;
  source: typeof CORE_CARD_SOURCE;
  result: null;
  pnl: null;
  clv: null;
  hybridConflictType: null;
  edgeOrValue: number;
  grade: 'A' | 'B' | 'C' | null;
  bookName: string;
  marketTimestamp: string;
  notes: string;
}

export interface ExistingOfficialBetRow {
  id?: string;
  season: number;
  week: number;
  gameId: string;
  marketType: string;
  side: string;
  modelPrice: number;
  closePrice: number | null;
  stake: number;
  source: string;
  strategyTag: string;
  result?: string | null;
  pnl?: number | null;
  clv?: number | null;
  hybridConflictType?: string | null;
}

export interface WeeklyCardGameInput {
  gameId: string;
  season: number;
  week: number;
  status: string;
  kickoff: Date | string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  /** Both teams FBS (membership). */
  bothFbs: boolean;
  coreSpreadHma: number;
  marketSelection: GameMarketSelection;
}

export interface KickoffExclusion {
  gameId: string;
  reason: string;
  kickoffIso: string | null;
  status: string;
}

export interface MarketGameIssue {
  gameId: string;
  missingSpread: boolean;
  missingTotal: boolean;
  missingMoneyline: boolean;
  incoherentSpread: boolean;
  incoherentMoneyline: boolean;
}

export interface TrancheSelection {
  kickoffBefore: string | null;
  selectedGameIds: string[];
  selectedGameCount: number;
  excludedAfterCutoffGameIds: string[];
}

/** Full ISO-8601 timestamp with explicit timezone (Z or ±HH:MM). Blank = no cutoff. */
const KICKOFF_BEFORE_ISO_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

function isValidGregorianDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  // UTC Date constructor uses 0-based month; reject JS normalization of invalid days.
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/** Parse optional exclusive kickoff_before (blank = no upper bound). */
export function parseKickoffBefore(
  raw: string | null | undefined
): { ok: boolean; value: Date | null; reason: string | null } {
  if (raw == null || String(raw).trim() === '') {
    return { ok: true, value: null, reason: null };
  }
  const trimmed = String(raw).trim();
  const m = KICKOFF_BEFORE_ISO_RE.exec(trimmed);
  if (!m) {
    return {
      ok: false,
      value: null,
      reason:
        'kickoff_before must be a full ISO-8601 timestamp with explicit timezone (Z or ±HH:MM)',
    };
  }

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6]);
  const tz = m[7];

  if (hour > 23 || minute > 59 || second > 59) {
    return {
      ok: false,
      value: null,
      reason: 'kickoff_before has an invalid hour/minute/second component',
    };
  }
  if (!isValidGregorianDate(year, month, day)) {
    return {
      ok: false,
      value: null,
      reason: 'kickoff_before is not a valid calendar date',
    };
  }
  if (tz !== 'Z') {
    const tzHour = Number(tz.slice(1, 3));
    const tzMinute = Number(tz.slice(4, 6));
    if (tzHour > 23 || tzMinute > 59) {
      return {
        ok: false,
        value: null,
        reason: 'kickoff_before has an invalid timezone offset',
      };
    }
  }

  const d = new Date(trimmed);
  if (!Number.isFinite(d.getTime())) {
    return { ok: false, value: null, reason: 'kickoff_before must be a valid ISO-8601 timestamp' };
  }
  return { ok: true, value: d, reason: null };
}

/** Exclusive upper bound: kickoff < cutoff (or no cutoff). */
export function isBeforeKickoffCutoff(
  kickoff: Date | string,
  cutoff: Date | null
): boolean {
  if (!cutoff) return true;
  const k = toDate(kickoff);
  if (!k) return false;
  return k.getTime() < cutoff.getTime();
}

function buildNotes(parts: Record<string, string | number | null | undefined>): string {
  // Deterministic key order for idempotent comparison friendliness.
  const keys = Object.keys(parts).sort();
  return keys
    .map((k) => {
      const v = parts[k];
      return `${k}=${v === null || v === undefined ? '' : String(v)}`;
    })
    .join('; ');
}

export function planSpreadBet(options: {
  season: number;
  week: number;
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoffIso: string;
  coreSpreadHma: number;
  displaySpread: BookSpreadSnapshot;
}): PlannedBet | null {
  const { displaySpread, coreSpreadHma } = options;
  if (!assertDisplaySpreadInvariant(displaySpread)) return null;

  const marketSpreadHma = displaySpread.marketSpreadHma;
  const ats = getATSPick(
    coreSpreadHma,
    marketSpreadHma,
    options.homeTeamName,
    options.awayTeamName,
    options.homeTeamId,
    options.awayTeamId,
    SPREAD_EDGE_FLOOR
  );
  if (!ats.recommendedTeamId || !ats.recommendedTeamName) return null;

  const isHome = ats.recommendedTeamId === options.homeTeamId;
  const side: CoreCardSide = isHome ? 'home' : 'away';
  let closePrice = isHome ? displaySpread.homeLine : displaySpread.awayLine;
  if (Object.is(closePrice, -0) || Math.abs(closePrice) < 1e-9) closePrice = 0;
  const modelPrice = isHome ? -coreSpreadHma : coreSpreadHma;
  const isPickEm = Math.abs(marketSpreadHma) < 1e-9;
  const label = isPickEm
    ? `${ats.recommendedTeamName} PK`
    : closePrice > 0
      ? `${ats.recommendedTeamName} +${closePrice}`
      : `${ats.recommendedTeamName} ${closePrice}`;
  const grade = gradeSpreadEdgePts(ats.edgePts);

  return {
    naturalKey: naturalBetKey({
      season: options.season,
      week: options.week,
      gameId: options.gameId,
      marketType: 'spread',
    }),
    season: options.season,
    week: options.week,
    gameId: options.gameId,
    homeTeamName: options.homeTeamName,
    awayTeamName: options.awayTeamName,
    kickoffIso: options.kickoffIso,
    marketType: 'spread',
    side,
    label,
    modelPrice,
    closePrice,
    stake: CORE_CARD_STAKE,
    strategyTag: CORE_CARD_STRATEGY_TAG,
    source: CORE_CARD_SOURCE,
    result: null,
    pnl: null,
    clv: null,
    hybridConflictType: null,
    edgeOrValue: ats.edgePts,
    grade,
    bookName: displaySpread.bookName,
    marketTimestamp: displaySpread.timestamp,
    notes: buildNotes({
      model: 'Core V1',
      market: 'spread',
      side,
      edgePts: Number(ats.edgePts.toFixed(4)),
      grade: grade ?? '',
      book: displaySpread.bookName,
      marketTimestamp: displaySpread.timestamp,
      marketHma: marketSpreadHma,
      closePrice,
      modelPrice,
    }),
  };
}

export function planTotalBet(options: {
  season: number;
  week: number;
  gameId: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoffIso: string;
  coreSpreadHma: number;
  marketSpreadHma: number;
  displayTotal: BookTotalSnapshot;
}): PlannedBet | null {
  const marketTotal = options.displayTotal.total;
  const ou = getOUPick(
    marketTotal,
    options.marketSpreadHma,
    options.coreSpreadHma
  );
  if (!ou.pickLabel || ou.modelTotal === null || ou.ouEdgePts === null) {
    return null;
  }
  const side: CoreCardSide = ou.ouEdgePts > 0 ? 'over' : 'under';

  return {
    naturalKey: naturalBetKey({
      season: options.season,
      week: options.week,
      gameId: options.gameId,
      marketType: 'total',
    }),
    season: options.season,
    week: options.week,
    gameId: options.gameId,
    homeTeamName: options.homeTeamName,
    awayTeamName: options.awayTeamName,
    kickoffIso: options.kickoffIso,
    marketType: 'total',
    side,
    label: ou.pickLabel,
    modelPrice: ou.modelTotal,
    closePrice: marketTotal,
    stake: CORE_CARD_STAKE,
    strategyTag: CORE_CARD_STRATEGY_TAG,
    source: CORE_CARD_SOURCE,
    result: null,
    pnl: null,
    clv: null,
    hybridConflictType: null,
    edgeOrValue: Math.abs(ou.ouEdgePts),
    grade: ou.grade,
    bookName: options.displayTotal.bookName,
    marketTimestamp: options.displayTotal.timestamp,
    notes: buildNotes({
      model: 'Core V1',
      market: 'total',
      side,
      modelTotal: Number(ou.modelTotal.toFixed(4)),
      marketTotal,
      ouEdgePts: Number(ou.ouEdgePts.toFixed(4)),
      grade: ou.grade ?? '',
      book: options.displayTotal.bookName,
      marketTimestamp: options.displayTotal.timestamp,
    }),
  };
}

export function planMoneylineBet(options: {
  season: number;
  week: number;
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoffIso: string;
  coreSpreadHma: number;
  displayMoneyline: BookMoneylineSnapshot;
}): PlannedBet | null {
  const ml = options.displayMoneyline;
  if (!ml.coherent) return null;

  const pick = selectCoreV1MoneylinePick({
    coreSpreadHma: options.coreSpreadHma,
    homeTeamId: options.homeTeamId,
    awayTeamId: options.awayTeamId,
    homeTeamName: options.homeTeamName,
    awayTeamName: options.awayTeamName,
    homeAmericanPrice: ml.homePrice,
    awayAmericanPrice: ml.awayPrice,
  });
  if (!pick) return null;

  return {
    naturalKey: naturalBetKey({
      season: options.season,
      week: options.week,
      gameId: options.gameId,
      marketType: 'moneyline',
    }),
    season: options.season,
    week: options.week,
    gameId: options.gameId,
    homeTeamName: options.homeTeamName,
    awayTeamName: options.awayTeamName,
    kickoffIso: options.kickoffIso,
    marketType: 'moneyline',
    side: pick.side,
    label: pick.label,
    modelPrice: pick.modelPrice,
    closePrice: pick.closePrice,
    stake: CORE_CARD_STAKE,
    strategyTag: CORE_CARD_STRATEGY_TAG,
    source: CORE_CARD_SOURCE,
    result: null,
    pnl: null,
    clv: null,
    hybridConflictType: null,
    edgeOrValue: pick.valuePercent,
    grade: pick.grade,
    bookName: ml.bookName,
    marketTimestamp: ml.timestamp,
    notes: buildNotes({
      model: 'Core V1',
      market: 'moneyline',
      side: pick.side,
      modelWinProb: Number(pick.modelWinProb.toFixed(6)),
      modelFairAmerican: pick.modelPrice,
      marketAmerican: pick.closePrice,
      valuePercent: Number(pick.valuePercent.toFixed(4)),
      grade: pick.grade,
      book: ml.bookName,
      marketTimestamp: ml.timestamp,
    }),
  };
}

export interface CoreWeeklyCardPlan {
  season: number;
  week: number;
  generatedAt: string;
  mode: CoreCardMode;
  writeSafe: boolean;
  writeBlockers: string[];
  confirmationValid: boolean;
  expectedConfirmation: string;
  membership: {
    fbsCount: number;
    fbsOk: boolean;
  };
  games: {
    trackedCount: number;
    duplicateGameIds: string[];
    week1Exact51: boolean | null;
    nonFbsTracked: string[];
  };
  kickoffGate: {
    executionNowIso: string;
    eligibleGameIds: string[];
    exclusions: KickoffExclusion[];
  };
  modelReadiness: {
    ok: boolean;
    missingRatings: string[];
    duplicateRatings: string[];
  };
  marketReadiness: {
    gamesWithSpread: number;
    gamesWithTotal: number;
    gamesWithML: number;
    gamesMissingSpread: string[];
    gamesMissingTotal: string[];
    gamesMissingML: string[];
    incoherentSpreadPairs: string[];
    incoherentMlPairs: string[];
    sameTimestampTies: number;
    issues: MarketGameIssue[];
  };
  plannedBets: PlannedBet[];
  /** Planned bets whose natural keys are not already exactly present (append insert set). */
  newPlannedBets: PlannedBet[];
  counts: {
    games: number;
    eligibleGames: number;
    selectedGames: number;
    spreadPicks: number;
    totalPicks: number;
    moneylinePicks: number;
    totalPlannedBets: number;
    newPlannedBets: number;
    existingOfficial: number;
    existingHybrid: number;
  };
  existingOfficialKeys: string[];
  existingHybridKeys: string[];
  existingSafety: ExistingCardSafety;
  tranche: TrancheSelection;
  consensusComparisons?: Array<{
    gameId: string;
    displaySpreadHma: number | null;
    consensusSpreadHma: number | null;
  }>;
}

export interface ExistingCardSafety {
  ok: boolean;
  mode:
    | 'empty'
    | 'append_safe'
    | 'idempotent_exact'
    | 'idempotent_slice'
    | 'blocked_hybrid'
    | 'blocked_conflict'
    | 'blocked_duplicate'
    | 'blocked_untracked'
    | 'blocked_other';
  reasons: string[];
  duplicateNaturalKeys: string[];
  conflictingKeys: string[];
  /** Existing official keys not in the current planned tranche (prior tranche / off-slice). */
  priorExistingKeys: string[];
  /** Planned keys that already exist with exact wager-defining fields. */
  matchedExistingKeys: string[];
  /** Planned keys that do not yet exist and may be inserted. */
  newPlannedKeys: string[];
  /** @deprecated use priorExistingKeys; retained empty for older readers */
  missingPlannedKeys: string[];
  /** @deprecated use priorExistingKeys */
  extraExistingKeys: string[];
}

export function validateCoreCardInputs(options: {
  season: number;
  week: number;
  mode: string;
  confirmation?: string | null;
}): {
  ok: boolean;
  mode: CoreCardMode | null;
  confirmationValid: boolean;
  expectedConfirmation: string;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (options.season !== CORE_CARD_SEASON) {
    reasons.push(`season must be ${CORE_CARD_SEASON}`);
  }
  if (!Number.isInteger(options.week) || options.week < 1) {
    reasons.push('week must be a positive integer');
  }
  const mode =
    options.mode === 'PREVIEW' || options.mode === 'COMMIT'
      ? options.mode
      : null;
  if (!mode) reasons.push('mode must be PREVIEW or COMMIT');
  const expectedConfirmation = expectedWriteConfirmation(options.week || 1);
  const confirmationValid =
    mode === 'PREVIEW'
      ? true
      : (options.confirmation ?? '') === expectedConfirmation;
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

function pricesCompatible(
  a: number | null | undefined,
  b: number | null | undefined
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return approxEqual(Number(a), Number(b), 1e-6);
}

/** Wager-defining fields only — ignores grading result/pnl/clv (immutable prior rows). */
export function wagerFieldsMatch(
  existing: ExistingOfficialBetRow,
  planned: Pick<
    PlannedBet,
    'side' | 'modelPrice' | 'closePrice' | 'stake' | 'source' | 'strategyTag'
  >
): boolean {
  return (
    existing.side === planned.side &&
    pricesCompatible(Number(existing.modelPrice), planned.modelPrice) &&
    pricesCompatible(
      existing.closePrice === null ? null : Number(existing.closePrice),
      planned.closePrice
    ) &&
    pricesCompatible(Number(existing.stake), planned.stake) &&
    existing.source === planned.source &&
    existing.strategyTag === planned.strategyTag
  );
}

export function evaluateExistingCardSafety(options: {
  plannedBets: PlannedBet[];
  existingOfficial: ExistingOfficialBetRow[];
  existingHybrid: ExistingOfficialBetRow[];
  /** Full provider-week tracked Game IDs. */
  trackedGameIds: string[];
}): ExistingCardSafety {
  const emptyLists = {
    duplicateNaturalKeys: [] as string[],
    conflictingKeys: [] as string[],
    priorExistingKeys: [] as string[],
    matchedExistingKeys: [] as string[],
    newPlannedKeys: [] as string[],
    missingPlannedKeys: [] as string[],
    extraExistingKeys: [] as string[],
  };

  if (options.existingHybrid.length > 0) {
    const hybridKeys = options.existingHybrid.map((r) =>
      naturalBetKey({
        season: r.season,
        week: r.week,
        gameId: r.gameId,
        marketType: r.marketType as CoreCardMarketType,
        strategyTag: 'hybrid_v2',
      })
    );
    return {
      ok: false,
      mode: 'blocked_hybrid',
      reasons: [
        `hybrid_v2 bets exist for target week (${options.existingHybrid.length}); Hybrid held — COMMIT blocked`,
      ],
      ...emptyLists,
      extraExistingKeys: hybridKeys,
      priorExistingKeys: hybridKeys,
    };
  }

  const tracked = new Set(options.trackedGameIds);
  const plannedByKey = new Map(options.plannedBets.map((b) => [b.naturalKey, b]));
  const existingByKey = new Map<string, ExistingOfficialBetRow[]>();
  const reasons: string[] = [];
  const duplicateNaturalKeys: string[] = [];
  const conflictingKeys: string[] = [];
  const untrackedKeys: string[] = [];

  for (const row of options.existingOfficial) {
    if (row.strategyTag !== CORE_CARD_STRATEGY_TAG) {
      reasons.push(`unsupported strategyTag on existing row: ${row.strategyTag}`);
      return {
        ok: false,
        mode: 'blocked_other',
        reasons,
        ...emptyLists,
      };
    }
    if (!tracked.has(row.gameId)) {
      const key = naturalBetKey({
        season: row.season,
        week: row.week,
        gameId: row.gameId,
        marketType: row.marketType as CoreCardMarketType,
      });
      untrackedKeys.push(key);
      reasons.push(
        `existing official row gameId=${row.gameId} not in tracked provider-week universe`
      );
    }
    const key = naturalBetKey({
      season: row.season,
      week: row.week,
      gameId: row.gameId,
      marketType: row.marketType as CoreCardMarketType,
    });
    const list = existingByKey.get(key) ?? [];
    list.push(row);
    existingByKey.set(key, list);
  }

  if (untrackedKeys.length > 0) {
    return {
      ok: false,
      mode: 'blocked_untracked',
      reasons,
      ...emptyLists,
      priorExistingKeys: untrackedKeys,
      extraExistingKeys: untrackedKeys,
    };
  }

  for (const [key, rows] of Array.from(existingByKey.entries())) {
    if (rows.length > 1) {
      duplicateNaturalKeys.push(key);
      reasons.push(`duplicate natural key ${key} (count=${rows.length})`);
    }
  }
  if (duplicateNaturalKeys.length > 0) {
    return {
      ok: false,
      mode: 'blocked_duplicate',
      reasons,
      ...emptyLists,
      duplicateNaturalKeys,
    };
  }

  if (options.existingOfficial.length === 0) {
    return {
      ok: true,
      mode: 'empty',
      reasons: [],
      ...emptyLists,
      newPlannedKeys: options.plannedBets.map((b) => b.naturalKey),
    };
  }

  const priorExistingKeys: string[] = [];
  const matchedExistingKeys: string[] = [];
  const newPlannedKeys: string[] = [];

  for (const [key, planned] of Array.from(plannedByKey.entries())) {
    const existing = existingByKey.get(key)?.[0];
    if (!existing) {
      newPlannedKeys.push(key);
      continue;
    }
    if (!wagerFieldsMatch(existing, planned)) {
      conflictingKeys.push(key);
      reasons.push(`conflict on ${key}`);
      continue;
    }
    matchedExistingKeys.push(key);
  }

  for (const key of Array.from(existingByKey.keys())) {
    if (!plannedByKey.has(key)) {
      priorExistingKeys.push(key);
    }
  }

  if (conflictingKeys.length > 0) {
    return {
      ok: false,
      mode: 'blocked_conflict',
      reasons,
      duplicateNaturalKeys: [],
      conflictingKeys,
      priorExistingKeys,
      matchedExistingKeys,
      newPlannedKeys,
      missingPlannedKeys: newPlannedKeys,
      extraExistingKeys: priorExistingKeys,
    };
  }

  if (newPlannedKeys.length === 0) {
    return {
      ok: true,
      mode: priorExistingKeys.length === 0 ? 'idempotent_exact' : 'idempotent_slice',
      reasons: [],
      duplicateNaturalKeys: [],
      conflictingKeys: [],
      priorExistingKeys,
      matchedExistingKeys,
      newPlannedKeys: [],
      missingPlannedKeys: [],
      extraExistingKeys: priorExistingKeys,
    };
  }

  // Prior off-tranche rows OK; insert only missing planned keys.
  return {
    ok: true,
    mode: 'append_safe',
    reasons: [],
    duplicateNaturalKeys: [],
    conflictingKeys: [],
    priorExistingKeys,
    matchedExistingKeys,
    newPlannedKeys,
    missingPlannedKeys: newPlannedKeys,
    extraExistingKeys: priorExistingKeys,
  };
}

export function buildCoreWeeklyCardPlan(options: {
  season: number;
  week: number;
  mode: CoreCardMode;
  confirmation?: string | null;
  executionNow: Date | string;
  /** Optional exclusive kickoff_before upper bound (ISO / Date). Blank/null = none. */
  kickoffBefore?: Date | string | null;
  fbsMembershipCount: number;
  games: WeeklyCardGameInput[];
  existingOfficial: ExistingOfficialBetRow[];
  existingHybrid: ExistingOfficialBetRow[];
  /** Team IDs missing finite Core V1 TeamSeasonRating. */
  missingRatingTeamIds?: string[];
  duplicateRatingTeamIds?: string[];
  generatedAt?: string;
}): CoreWeeklyCardPlan {
  const inputCheck = validateCoreCardInputs({
    season: options.season,
    week: options.week,
    mode: options.mode,
    confirmation: options.confirmation,
  });
  const writeBlockers: string[] = [...inputCheck.reasons];
  const executionNow = toDate(options.executionNow) ?? new Date();
  const generatedAt = options.generatedAt ?? executionNow.toISOString();

  let kickoffBefore: Date | null = null;
  if (options.kickoffBefore != null && String(options.kickoffBefore).trim() !== '') {
    const parsed = parseKickoffBefore(
      options.kickoffBefore instanceof Date
        ? options.kickoffBefore.toISOString()
        : String(options.kickoffBefore)
    );
    if (!parsed.ok) {
      writeBlockers.push(parsed.reason ?? 'invalid kickoff_before');
    } else {
      kickoffBefore = parsed.value;
    }
  }

  const gameIds = options.games.map((g) => g.gameId);
  const seen = new Set<string>();
  const duplicateGameIds: string[] = [];
  for (const id of gameIds) {
    if (seen.has(id)) duplicateGameIds.push(id);
    seen.add(id);
  }
  if (duplicateGameIds.length > 0) {
    writeBlockers.push(`duplicate game IDs: ${duplicateGameIds.join(',')}`);
  }
  if (options.games.length === 0) {
    writeBlockers.push('no tracked games for season/week');
  }

  const fbsOk = options.fbsMembershipCount === AUTHORITATIVE_FBS_COUNT;
  if (!fbsOk) {
    writeBlockers.push(
      `FBS membership ${options.fbsMembershipCount} != ${AUTHORITATIVE_FBS_COUNT}`
    );
  }

  const nonFbsTracked = options.games
    .filter((g) => !g.bothFbs)
    .map((g) => g.gameId);
  if (nonFbsTracked.length > 0) {
    writeBlockers.push(`non-FBS tracked games: ${nonFbsTracked.length}`);
  }

  const week1Exact51 =
    options.week === 1 ? options.games.length === WEEK1_GAME_COUNT : null;
  if (options.week === 1 && week1Exact51 === false) {
    writeBlockers.push(
      `Week1 requires exactly ${WEEK1_GAME_COUNT} games (got ${options.games.length})`
    );
  }

  const missingRatings = options.missingRatingTeamIds ?? [];
  const duplicateRatings = options.duplicateRatingTeamIds ?? [];
  const modelOk = missingRatings.length === 0 && duplicateRatings.length === 0;
  if (!modelOk) {
    writeBlockers.push('Core V1 TeamSeasonRating readiness failed');
  }

  const exclusions: KickoffExclusion[] = [];
  const kickoffEligible: WeeklyCardGameInput[] = [];
  for (const g of options.games) {
    const gate = isKickoffEligible({
      status: g.status,
      kickoff: g.kickoff,
      executionNow,
    });
    const kick = toDate(g.kickoff);
    if (!gate.eligible) {
      exclusions.push({
        gameId: g.gameId,
        reason: gate.reason ?? 'excluded',
        kickoffIso: kick ? kick.toISOString() : null,
        status: g.status,
      });
      continue;
    }
    kickoffEligible.push(g);
  }

  // Tranche selection: planning/write slice within kickoff-eligible games.
  const selected: WeeklyCardGameInput[] = [];
  const excludedAfterCutoffGameIds: string[] = [];
  for (const g of kickoffEligible) {
    if (isBeforeKickoffCutoff(g.kickoff, kickoffBefore)) {
      selected.push(g);
    } else {
      excludedAfterCutoffGameIds.push(g.gameId);
    }
  }

  const gamesMissingSpread: string[] = [];
  const gamesMissingTotal: string[] = [];
  const gamesMissingML: string[] = [];
  const incoherentSpreadPairs: string[] = [];
  const incoherentMlPairs: string[] = [];
  const issues: MarketGameIssue[] = [];
  let gamesWithSpread = 0;
  let gamesWithTotal = 0;
  let gamesWithML = 0;
  let sameTimestampTies = 0;

  const plannedBets: PlannedBet[] = [];
  const consensusComparisons: CoreWeeklyCardPlan['consensusComparisons'] = [];
  const selectedIds = new Set(selected.map((g) => g.gameId));

  // Market inventory across kickoff-eligible games for reporting; BLOCK only selected tranche.
  for (const g of kickoffEligible) {
    const sel = g.marketSelection;
    sameTimestampTies += sel.sameTimestampTies ?? 0;

    const displaySpread = sel.displaySpread;
    const displayTotal = sel.displayTotal;
    const displayMl = sel.displayMoneyline;

    const missingSpread = !displaySpread;
    const missingTotal = !displayTotal;
    const missingMl = !displayMl;
    const incoherentSpread = !!(
      displaySpread &&
      (!displaySpread.coherent || !assertDisplaySpreadInvariant(displaySpread))
    );
    const incoherentMl = !!(displayMl && !displayMl.coherent);

    if (!missingSpread && !incoherentSpread) gamesWithSpread += 1;
    else {
      if (missingSpread) gamesMissingSpread.push(g.gameId);
      if (incoherentSpread) incoherentSpreadPairs.push(g.gameId);
    }
    if (!missingTotal) gamesWithTotal += 1;
    else gamesMissingTotal.push(g.gameId);
    if (!missingMl && !incoherentMl) gamesWithML += 1;
    else {
      if (missingMl) gamesMissingML.push(g.gameId);
      if (incoherentMl) incoherentMlPairs.push(g.gameId);
    }

    const inTranche = selectedIds.has(g.gameId);
    if (
      inTranche &&
      (missingSpread || missingTotal || missingMl || incoherentSpread || incoherentMl)
    ) {
      issues.push({
        gameId: g.gameId,
        missingSpread,
        missingTotal,
        missingMoneyline: missingMl,
        incoherentSpread,
        incoherentMoneyline: incoherentMl,
      });
      writeBlockers.push(
        `selected tranche game ${g.gameId} missing/incoherent required market data`
      );
    }

    if (inTranche) {
      consensusComparisons.push({
        gameId: g.gameId,
        displaySpreadHma: displaySpread?.marketSpreadHma ?? null,
        consensusSpreadHma: sel.spreadConsensus?.value ?? null,
      });
    }

    if (!inTranche) continue;

    if (!isFiniteNumber(g.coreSpreadHma)) {
      writeBlockers.push(`game ${g.gameId} missing finite coreSpreadHma`);
      continue;
    }

    const kickIso = toDate(g.kickoff)!.toISOString();

    if (displaySpread && !incoherentSpread) {
      const spreadBet = planSpreadBet({
        season: options.season,
        week: options.week,
        gameId: g.gameId,
        homeTeamId: g.homeTeamId,
        awayTeamId: g.awayTeamId,
        homeTeamName: g.homeTeamName,
        awayTeamName: g.awayTeamName,
        kickoffIso: kickIso,
        coreSpreadHma: g.coreSpreadHma,
        displaySpread,
      });
      if (spreadBet) plannedBets.push(spreadBet);
    }

    if (displayTotal && displaySpread && !incoherentSpread) {
      const totalBet = planTotalBet({
        season: options.season,
        week: options.week,
        gameId: g.gameId,
        homeTeamName: g.homeTeamName,
        awayTeamName: g.awayTeamName,
        kickoffIso: kickIso,
        coreSpreadHma: g.coreSpreadHma,
        marketSpreadHma: displaySpread.marketSpreadHma,
        displayTotal,
      });
      if (totalBet) plannedBets.push(totalBet);
    }

    if (displayMl && !incoherentMl) {
      const mlBet = planMoneylineBet({
        season: options.season,
        week: options.week,
        gameId: g.gameId,
        homeTeamId: g.homeTeamId,
        awayTeamId: g.awayTeamId,
        homeTeamName: g.homeTeamName,
        awayTeamName: g.awayTeamName,
        kickoffIso: kickIso,
        coreSpreadHma: g.coreSpreadHma,
        displayMoneyline: displayMl,
      });
      if (mlBet) plannedBets.push(mlBet);
    }
  }

  // Natural-key uniqueness in plan
  const planKeyCounts = new Map<string, number>();
  for (const b of plannedBets) {
    planKeyCounts.set(b.naturalKey, (planKeyCounts.get(b.naturalKey) ?? 0) + 1);
  }
  for (const [key, count] of Array.from(planKeyCounts.entries())) {
    if (count > 1) {
      writeBlockers.push(`planned duplicate natural key ${key}`);
    }
  }

  // Only official_flat_100
  for (const b of plannedBets) {
    if (b.strategyTag !== CORE_CARD_STRATEGY_TAG) {
      writeBlockers.push(`non-official strategyTag in plan: ${b.strategyTag}`);
    }
  }

  const trackedGameIds = options.games.map((g) => g.gameId);
  const existingSafety = evaluateExistingCardSafety({
    plannedBets,
    existingOfficial: options.existingOfficial,
    existingHybrid: options.existingHybrid,
    trackedGameIds,
  });
  if (!existingSafety.ok) {
    writeBlockers.push(...existingSafety.reasons);
  }

  const newPlannedBets = plannedBets.filter((b) =>
    existingSafety.newPlannedKeys.includes(b.naturalKey)
  );

  if (plannedBets.length === 0) {
    writeBlockers.push('no planned bets');
  }

  const writeSafe = writeBlockers.length === 0;
  const tranche: TrancheSelection = {
    kickoffBefore: kickoffBefore ? kickoffBefore.toISOString() : null,
    selectedGameIds: selected.map((g) => g.gameId),
    selectedGameCount: selected.length,
    excludedAfterCutoffGameIds,
  };

  return {
    season: options.season,
    week: options.week,
    generatedAt,
    mode: options.mode,
    writeSafe,
    writeBlockers,
    confirmationValid: inputCheck.confirmationValid,
    expectedConfirmation: inputCheck.expectedConfirmation,
    membership: {
      fbsCount: options.fbsMembershipCount,
      fbsOk,
    },
    games: {
      trackedCount: options.games.length,
      duplicateGameIds,
      week1Exact51,
      nonFbsTracked,
    },
    kickoffGate: {
      executionNowIso: executionNow.toISOString(),
      eligibleGameIds: kickoffEligible.map((g) => g.gameId),
      exclusions,
    },
    modelReadiness: {
      ok: modelOk,
      missingRatings,
      duplicateRatings,
    },
    marketReadiness: {
      gamesWithSpread,
      gamesWithTotal,
      gamesWithML,
      gamesMissingSpread,
      gamesMissingTotal,
      gamesMissingML,
      incoherentSpreadPairs,
      incoherentMlPairs,
      sameTimestampTies,
      issues,
    },
    plannedBets,
    newPlannedBets,
    counts: {
      games: options.games.length,
      eligibleGames: kickoffEligible.length,
      selectedGames: selected.length,
      spreadPicks: plannedBets.filter((b) => b.marketType === 'spread').length,
      totalPicks: plannedBets.filter((b) => b.marketType === 'total').length,
      moneylinePicks: plannedBets.filter((b) => b.marketType === 'moneyline')
        .length,
      totalPlannedBets: plannedBets.length,
      newPlannedBets: newPlannedBets.length,
      existingOfficial: options.existingOfficial.length,
      existingHybrid: options.existingHybrid.length,
    },
    existingOfficialKeys: options.existingOfficial.map((r) =>
      naturalBetKey({
        season: r.season,
        week: r.week,
        gameId: r.gameId,
        marketType: r.marketType as CoreCardMarketType,
      })
    ),
    existingHybridKeys: options.existingHybrid.map((r) =>
      naturalBetKey({
        season: r.season,
        week: r.week,
        gameId: r.gameId,
        marketType: r.marketType as CoreCardMarketType,
        strategyTag: 'hybrid_v2',
      })
    ),
    existingSafety,
    tranche,
    consensusComparisons,
  };
}

export function commitEligible(plan: CoreWeeklyCardPlan): boolean {
  return (
    plan.mode === 'COMMIT' &&
    plan.writeSafe &&
    plan.confirmationValid &&
    plan.newPlannedBets.length > 0 &&
    (plan.existingSafety.mode === 'empty' ||
      plan.existingSafety.mode === 'append_safe')
  );
}

/**
 * Initial-plan gate for entering the authoritative COMMIT transaction.
 * Includes apparently-idempotent plans — the transaction re-read is authoritative.
 */
export function commitMayEnterTransaction(plan: CoreWeeklyCardPlan): boolean {
  return (
    plan.mode === 'COMMIT' &&
    plan.writeSafe &&
    plan.confirmationValid &&
    plan.plannedBets.length > 0 &&
    plan.existingSafety.ok &&
    (plan.existingSafety.mode === 'empty' ||
      plan.existingSafety.mode === 'append_safe' ||
      plan.existingSafety.mode === 'idempotent_exact' ||
      plan.existingSafety.mode === 'idempotent_slice')
  );
}

export function isIdempotentNoOp(plan: CoreWeeklyCardPlan): boolean {
  return (
    plan.writeSafe &&
    plan.plannedBets.length > 0 &&
    plan.newPlannedBets.length === 0 &&
    (plan.existingSafety.mode === 'idempotent_exact' ||
      plan.existingSafety.mode === 'idempotent_slice')
  );
}

export function assertCreateManyCountMatches(
  expected: number,
  actual: number
): void {
  if (expected !== actual) {
    throw new Error(
      `createMany.count mismatch: expected=${expected} actual=${actual}`
    );
  }
}

export function plannedBetToCreateData(bet: PlannedBet): {
  season: number;
  week: number;
  gameId: string;
  marketType: CoreCardMarketType;
  side: CoreCardSide;
  modelPrice: number;
  closePrice: number;
  stake: number;
  strategyTag: string;
  source: string;
  notes: string;
  result: null;
  pnl: null;
  clv: null;
  hybridConflictType: null;
} {
  return {
    season: bet.season,
    week: bet.week,
    gameId: bet.gameId,
    marketType: bet.marketType,
    side: bet.side,
    modelPrice: bet.modelPrice,
    closePrice: bet.closePrice,
    stake: bet.stake,
    strategyTag: bet.strategyTag,
    source: bet.source,
    notes: bet.notes,
    result: null,
    pnl: null,
    clv: null,
    hybridConflictType: null,
  };
}

/**
 * Atomic append-safe COMMIT helper (injectable for tests).
 * Re-reads official+hybrid, re-evaluates append safety, createMany only missing keys.
 * No upsert / update / delete / skipDuplicates.
 */
export async function executeAtomicAppendCommit(options: {
  plannedBets: PlannedBet[];
  trackedGameIds: string[];
  reReadOfficial: () => Promise<ExistingOfficialBetRow[]>;
  reReadHybrid: () => Promise<ExistingOfficialBetRow[]>;
  createMany: (
    rows: ReturnType<typeof plannedBetToCreateData>[]
  ) => Promise<{ count: number }>;
}): Promise<{ count: number; newPlannedBets: PlannedBet[]; beforeOfficial: ExistingOfficialBetRow[] }> {
  const official = await options.reReadOfficial();
  const hybrid = await options.reReadHybrid();

  const safety = evaluateExistingCardSafety({
    plannedBets: options.plannedBets,
    existingOfficial: official,
    existingHybrid: hybrid,
    trackedGameIds: options.trackedGameIds,
  });
  if (!safety.ok) {
    throw new Error(
      `transaction aborted: append safety failed (${safety.mode}): ${safety.reasons.join('; ')}`
    );
  }

  const keys = new Set<string>();
  for (const b of options.plannedBets) {
    if (keys.has(b.naturalKey)) {
      throw new Error(`transaction aborted: duplicate planned key ${b.naturalKey}`);
    }
    keys.add(b.naturalKey);
  }

  const newPlannedBets = options.plannedBets.filter((b) =>
    safety.newPlannedKeys.includes(b.naturalKey)
  );

  if (newPlannedBets.length === 0) {
    // Exact safe no-op — do not invoke createMany.
    return { count: 0, newPlannedBets: [], beforeOfficial: official };
  }

  const data = newPlannedBets.map(plannedBetToCreateData);
  const result = await options.createMany(data);
  assertCreateManyCountMatches(data.length, result.count);
  return { count: result.count, newPlannedBets, beforeOfficial: official };
}

/** Prefer executeAtomicAppendCommit — first-write-only semantics removed. */
export async function executeAtomicFirstCommit(options: {
  plannedBets: PlannedBet[];
  trackedGameIds: string[];
  reReadOfficial: () => Promise<ExistingOfficialBetRow[]>;
  reReadHybrid: () => Promise<ExistingOfficialBetRow[]>;
  createMany: (
    rows: ReturnType<typeof plannedBetToCreateData>[]
  ) => Promise<{ count: number }>;
}): Promise<{ count: number; newPlannedBets: PlannedBet[]; beforeOfficial: ExistingOfficialBetRow[] }> {
  return executeAtomicAppendCommit(options);
}

function officialRowFingerprint(row: ExistingOfficialBetRow): string {
  return [
    row.season,
    row.week,
    row.gameId,
    row.marketType,
    row.side,
    String(row.modelPrice),
    row.closePrice === null || row.closePrice === undefined
      ? 'null'
      : String(row.closePrice),
    String(row.stake),
    row.source,
    row.strategyTag,
    row.result ?? 'null',
    row.pnl === null || row.pnl === undefined ? 'null' : String(row.pnl),
    row.clv === null || row.clv === undefined ? 'null' : String(row.clv),
    row.hybridConflictType ?? 'null',
  ].join('|');
}

export interface CoreCardPostWriteVerification {
  existingRowsBefore: number;
  newRowsPlanned: number;
  plannedRows: number;
  insertedRows: number;
  rowsAfter: number;
  naturalKeysFound: string[];
  duplicateKeys: string[];
  missingKeys: string[];
  extraKeys: string[];
  conflictingRows: string[];
  changedPriorKeys: string[];
  hybridRowsAfter: number;
  exactMatches: number;
  ok: boolean;
  reasons: string[];
}

export function verifyCoreCardPostWrite(options: {
  plannedBets: PlannedBet[];
  newPlannedBets: PlannedBet[];
  createManyCount: number;
  beforeOfficial: ExistingOfficialBetRow[];
  afterOfficial: ExistingOfficialBetRow[];
  afterHybrid: ExistingOfficialBetRow[];
}): CoreCardPostWriteVerification {
  const reasons: string[] = [];
  const plannedByKey = new Map(options.plannedBets.map((b) => [b.naturalKey, b]));
  const newByKey = new Map(options.newPlannedBets.map((b) => [b.naturalKey, b]));
  const beforeByKey = new Map<string, ExistingOfficialBetRow>();
  for (const row of options.beforeOfficial) {
    const key = naturalBetKey({
      season: row.season,
      week: row.week,
      gameId: row.gameId,
      marketType: row.marketType as CoreCardMarketType,
    });
    beforeByKey.set(key, row);
  }

  const afterByKey = new Map<string, ExistingOfficialBetRow[]>();
  for (const row of options.afterOfficial) {
    const key = naturalBetKey({
      season: row.season,
      week: row.week,
      gameId: row.gameId,
      marketType: row.marketType as CoreCardMarketType,
    });
    const list = afterByKey.get(key) ?? [];
    list.push(row);
    afterByKey.set(key, list);
  }

  const duplicateKeys: string[] = [];
  for (const [key, rows] of Array.from(afterByKey.entries())) {
    if (rows.length > 1) duplicateKeys.push(key);
  }

  const missingKeys: string[] = [];
  const conflictingRows: string[] = [];
  const naturalKeysFound: string[] = [];
  const changedPriorKeys: string[] = [];
  let exactMatches = 0;

  // Preexisting rows must still exist unchanged (immutable).
  for (const [key, before] of Array.from(beforeByKey.entries())) {
    const rows = afterByKey.get(key) ?? [];
    if (rows.length === 0) {
      missingKeys.push(key);
      reasons.push(`prior row missing after write: ${key}`);
      continue;
    }
    if (rows.length > 1) continue;
    if (officialRowFingerprint(rows[0]) !== officialRowFingerprint(before)) {
      changedPriorKeys.push(key);
      reasons.push(`prior row changed after write: ${key}`);
    }
  }

  // All currently planned keys must exist with exact wager-defining fields.
  for (const [key, planned] of Array.from(plannedByKey.entries())) {
    const rows = afterByKey.get(key) ?? [];
    if (rows.length === 0) {
      if (!missingKeys.includes(key)) missingKeys.push(key);
      continue;
    }
    if (rows.length > 1) continue;
    const row = rows[0];
    if (!wagerFieldsMatch(row, planned)) {
      conflictingRows.push(key);
    } else {
      exactMatches += 1;
      naturalKeysFound.push(key);
    }
  }

  // Newly inserted keys must be present (covered above) and were expected inserts.
  for (const key of Array.from(newByKey.keys())) {
    if (!afterByKey.has(key)) {
      if (!missingKeys.includes(key)) missingKeys.push(key);
    }
  }

  // Expected after = preexisting ∪ newly planned (matched already in before).
  const expectedKeys = new Set<string>([
    ...Array.from(beforeByKey.keys()),
    ...Array.from(newByKey.keys()),
  ]);
  // Matched planned keys already in before; ensure no unexpected extras.
  const extraKeys: string[] = [];
  for (const key of Array.from(afterByKey.keys())) {
    if (!expectedKeys.has(key)) extraKeys.push(key);
  }

  if (options.createManyCount !== options.newPlannedBets.length) {
    reasons.push(
      `createManyCount ${options.createManyCount} != newPlanned ${options.newPlannedBets.length}`
    );
  }
  const expectedRowsAfter =
    options.beforeOfficial.length + options.newPlannedBets.length;
  if (options.afterOfficial.length !== expectedRowsAfter) {
    reasons.push(
      `rowsAfter ${options.afterOfficial.length} != preexisting+new ${expectedRowsAfter}`
    );
  }
  if (duplicateKeys.length) reasons.push(`duplicateKeys=${duplicateKeys.length}`);
  if (missingKeys.length) reasons.push(`missingKeys=${missingKeys.length}`);
  if (extraKeys.length) reasons.push(`extraKeys=${extraKeys.length}`);
  if (conflictingRows.length)
    reasons.push(`conflictingRows=${conflictingRows.length}`);
  if (changedPriorKeys.length)
    reasons.push(`changedPriorKeys=${changedPriorKeys.length}`);
  if (options.afterHybrid.length > 0) {
    reasons.push(`hybridRowsAfter=${options.afterHybrid.length}`);
  }

  return {
    existingRowsBefore: options.beforeOfficial.length,
    newRowsPlanned: options.newPlannedBets.length,
    plannedRows: options.plannedBets.length,
    insertedRows: options.createManyCount,
    rowsAfter: options.afterOfficial.length,
    naturalKeysFound,
    duplicateKeys,
    missingKeys,
    extraKeys,
    conflictingRows,
    changedPriorKeys,
    hybridRowsAfter: options.afterHybrid.length,
    exactMatches,
    ok: reasons.length === 0,
    reasons,
  };
}

export interface CoreCardExecutionState {
  mode: CoreCardMode;
  commitAttempted: boolean;
  transactionStarted: boolean;
  mutationsInvoked: boolean;
  betPersistenceInvoked: boolean;
  createManyCount: number | null;
  commitSucceeded: boolean;
  postWriteVerificationSucceeded: boolean | null;
  error: string | null;
  providerCalls: 0;
}

export function buildPreviewExecution(mode: CoreCardMode = 'PREVIEW'): CoreCardExecutionState {
  return {
    mode,
    commitAttempted: false,
    transactionStarted: false,
    mutationsInvoked: false,
    betPersistenceInvoked: false,
    createManyCount: null,
    commitSucceeded: false,
    postWriteVerificationSucceeded: null,
    error: null,
    providerCalls: 0,
  };
}

export function buildIdempotentNoOpExecution(): CoreCardExecutionState {
  // Legacy non-transactional builder — prefer buildTransactionalIdempotentNoOpExecution.
  return {
    mode: 'COMMIT',
    commitAttempted: true,
    transactionStarted: false,
    mutationsInvoked: false,
    betPersistenceInvoked: false,
    createManyCount: 0,
    commitSucceeded: true,
    postWriteVerificationSucceeded: true,
    error: null,
    providerCalls: 0,
  };
}

/** Authoritative tx found zero missing keys; createMany never invoked. */
export function buildTransactionalIdempotentNoOpExecution(): CoreCardExecutionState {
  return {
    mode: 'COMMIT',
    commitAttempted: true,
    transactionStarted: true,
    mutationsInvoked: false,
    betPersistenceInvoked: false,
    createManyCount: 0,
    commitSucceeded: true,
    postWriteVerificationSucceeded: true,
    error: null,
    providerCalls: 0,
  };
}

/**
 * Transactional idempotent no-op committed (zero mutations), but fresh
 * post-operation verification failed. Distinct from committed-mutation failure.
 */
export function buildTransactionalIdempotentVerificationFailureExecution(options: {
  error: string;
}): CoreCardExecutionState {
  return {
    mode: 'COMMIT',
    commitAttempted: true,
    transactionStarted: true,
    mutationsInvoked: false,
    betPersistenceInvoked: false,
    createManyCount: 0,
    commitSucceeded: true,
    postWriteVerificationSucceeded: false,
    error: options.error,
    providerCalls: 0,
  };
}

export function buildFailedCommitExecution(options: {
  transactionStarted?: boolean;
  mutationsInvoked?: boolean;
  betPersistenceInvoked?: boolean;
  createManyCount?: number | null;
  commitSucceeded?: boolean;
  postWriteVerificationSucceeded?: boolean | null;
  error: string;
}): CoreCardExecutionState {
  return {
    mode: 'COMMIT',
    commitAttempted: true,
    transactionStarted: options.transactionStarted ?? false,
    mutationsInvoked: options.mutationsInvoked ?? false,
    betPersistenceInvoked: options.betPersistenceInvoked ?? false,
    createManyCount: options.createManyCount ?? null,
    commitSucceeded: options.commitSucceeded ?? false,
    postWriteVerificationSucceeded:
      options.postWriteVerificationSucceeded ?? null,
    error: options.error,
    providerCalls: 0,
  };
}

/**
 * Transaction aborted/rolled back — ZERO Bet rows committed.
 * Truthfully report whether createMany was reached before rollback.
 * mutation attempted != persistence committed.
 */
export function buildRolledBackTransactionExecution(options: {
  /** True iff tx.bet.createMany(...) was entered/invoked before abort. */
  createManyInvoked: boolean;
  /** createMany result.count if available after invocation; else null. */
  createManyCount?: number | null;
  error: string;
}): CoreCardExecutionState {
  const invoked = options.createManyInvoked;
  return buildFailedCommitExecution({
    transactionStarted: true,
    mutationsInvoked: invoked,
    betPersistenceInvoked: invoked,
    createManyCount: invoked ? (options.createManyCount ?? null) : null,
    commitSucceeded: false,
    error: options.error,
  });
}

export function buildSuccessfulCommitExecution(options: {
  createManyCount: number;
  postWriteVerificationSucceeded: boolean;
  error?: string | null;
}): CoreCardExecutionState {
  return {
    mode: 'COMMIT',
    commitAttempted: true,
    transactionStarted: true,
    mutationsInvoked: true,
    betPersistenceInvoked: true,
    createManyCount: options.createManyCount,
    commitSucceeded: true,
    postWriteVerificationSucceeded: options.postWriteVerificationSucceeded,
    error: options.error ?? null,
    providerCalls: 0,
  };
}

/**
 * Transaction committed; post-write verification mismatch or read/code failure.
 * Never implies rollback — Bet rows may/do exist.
 */
export function buildCommittedVerificationFailureExecution(options: {
  createManyCount: number;
  error: string;
}): CoreCardExecutionState {
  return {
    mode: 'COMMIT',
    commitAttempted: true,
    transactionStarted: true,
    mutationsInvoked: true,
    betPersistenceInvoked: true,
    createManyCount: options.createManyCount,
    commitSucceeded: true,
    postWriteVerificationSucceeded: false,
    error: options.error,
    providerCalls: 0,
  };
}

/** PREVIEW always writes artifact first; unsafe plans fail the workflow after. */
export function resolvePreviewExitCode(writeSafe: boolean): 0 | 1 {
  return writeSafe ? 0 : 1;
}

export function finalizeCoreCardReport(options: {
  plan: CoreWeeklyCardPlan;
  execution: CoreCardExecutionState;
  verification: CoreCardPostWriteVerification | null;
  meta?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    phase: '2C-2J-5',
    artifact: `core-v1-weekly-card-2026-${options.plan.season}-week-${options.plan.week}-${options.plan.mode.toLowerCase()}`,
    plan: options.plan,
    execution: options.execution,
    verification: options.verification,
    meta: {
      providerCalls: 0,
      ratingsWrites: false,
      gameWrites: false,
      grading: false,
      scoreWrites: false,
      marketLineWrites: false,
      hybridWrites: false,
      ...(options.meta ?? {}),
    },
  };
}
