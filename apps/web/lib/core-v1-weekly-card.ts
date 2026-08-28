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
  counts: {
    games: number;
    eligibleGames: number;
    spreadPicks: number;
    totalPicks: number;
    moneylinePicks: number;
    totalPlannedBets: number;
    existingOfficial: number;
    existingHybrid: number;
  };
  existingOfficialKeys: string[];
  existingHybridKeys: string[];
  existingSafety: ExistingCardSafety;
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
    | 'idempotent_exact'
    | 'blocked_hybrid'
    | 'blocked_partial'
    | 'blocked_conflict'
    | 'blocked_duplicate'
    | 'blocked_other';
  reasons: string[];
  duplicateNaturalKeys: string[];
  conflictingKeys: string[];
  missingPlannedKeys: string[];
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

function resultStateCompatible(row: ExistingOfficialBetRow): boolean {
  // Ungraded official card only.
  return (
    (row.result == null || row.result === undefined) &&
    (row.pnl == null || row.pnl === undefined) &&
    (row.clv == null || row.clv === undefined) &&
    (row.hybridConflictType == null || row.hybridConflictType === undefined)
  );
}

export function evaluateExistingCardSafety(options: {
  plannedBets: PlannedBet[];
  existingOfficial: ExistingOfficialBetRow[];
  existingHybrid: ExistingOfficialBetRow[];
}): ExistingCardSafety {
  const reasons: string[] = [];
  const duplicateNaturalKeys: string[] = [];
  const conflictingKeys: string[] = [];
  const missingPlannedKeys: string[] = [];
  const extraExistingKeys: string[] = [];

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
      duplicateNaturalKeys: [],
      conflictingKeys: [],
      missingPlannedKeys: [],
      extraExistingKeys: hybridKeys,
    };
  }

  const plannedByKey = new Map(options.plannedBets.map((b) => [b.naturalKey, b]));
  const existingByKey = new Map<string, ExistingOfficialBetRow[]>();
  for (const row of options.existingOfficial) {
    if (row.strategyTag !== CORE_CARD_STRATEGY_TAG) continue;
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
      duplicateNaturalKeys,
      conflictingKeys,
      missingPlannedKeys,
      extraExistingKeys,
    };
  }

  if (options.existingOfficial.length === 0) {
    return {
      ok: true,
      mode: 'empty',
      reasons: [],
      duplicateNaturalKeys: [],
      conflictingKeys: [],
      missingPlannedKeys: [],
      extraExistingKeys: [],
    };
  }

  // Exact complete card → idempotent NO-OP
  for (const [key, planned] of Array.from(plannedByKey.entries())) {
    const existing = existingByKey.get(key)?.[0];
    if (!existing) {
      missingPlannedKeys.push(key);
      continue;
    }
    const sideOk = existing.side === planned.side;
    const modelOk = pricesCompatible(Number(existing.modelPrice), planned.modelPrice);
    const closeOk = pricesCompatible(
      existing.closePrice === null ? null : Number(existing.closePrice),
      planned.closePrice
    );
    const stakeOk = pricesCompatible(Number(existing.stake), planned.stake);
    const sourceOk = existing.source === planned.source;
    const stateOk = resultStateCompatible(existing);
    if (!sideOk || !modelOk || !closeOk || !stakeOk || !sourceOk || !stateOk) {
      conflictingKeys.push(key);
      reasons.push(`conflict on ${key}`);
    }
  }

  for (const key of Array.from(existingByKey.keys())) {
    if (!plannedByKey.has(key)) {
      extraExistingKeys.push(key);
    }
  }

  if (
    missingPlannedKeys.length === 0 &&
    extraExistingKeys.length === 0 &&
    conflictingKeys.length === 0
  ) {
    return {
      ok: true,
      mode: 'idempotent_exact',
      reasons: [],
      duplicateNaturalKeys: [],
      conflictingKeys: [],
      missingPlannedKeys: [],
      extraExistingKeys: [],
    };
  }

  if (conflictingKeys.length > 0) {
    return {
      ok: false,
      mode: 'blocked_conflict',
      reasons,
      duplicateNaturalKeys,
      conflictingKeys,
      missingPlannedKeys,
      extraExistingKeys,
    };
  }

  return {
    ok: false,
    mode: 'blocked_partial',
    reasons: [
      ...reasons,
      missingPlannedKeys.length
        ? `missing planned keys: ${missingPlannedKeys.length}`
        : '',
      extraExistingKeys.length
        ? `extra existing keys: ${extraExistingKeys.length}`
        : '',
    ].filter(Boolean),
    duplicateNaturalKeys,
    conflictingKeys,
    missingPlannedKeys,
    extraExistingKeys,
  };
}

export function buildCoreWeeklyCardPlan(options: {
  season: number;
  week: number;
  mode: CoreCardMode;
  confirmation?: string | null;
  executionNow: Date | string;
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
  const eligible: WeeklyCardGameInput[] = [];
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
    eligible.push(g);
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

  for (const g of eligible) {
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

    if (missingSpread || missingTotal || missingMl || incoherentSpread || incoherentMl) {
      issues.push({
        gameId: g.gameId,
        missingSpread,
        missingTotal,
        missingMoneyline: missingMl,
        incoherentSpread,
        incoherentMoneyline: incoherentMl,
      });
      writeBlockers.push(
        `eligible game ${g.gameId} missing/incoherent required market data`
      );
    }

    consensusComparisons.push({
      gameId: g.gameId,
      displaySpreadHma: displaySpread?.marketSpreadHma ?? null,
      consensusSpreadHma: sel.spreadConsensus?.value ?? null,
    });

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

  const existingSafety = evaluateExistingCardSafety({
    plannedBets,
    existingOfficial: options.existingOfficial,
    existingHybrid: options.existingHybrid,
  });
  if (!existingSafety.ok) {
    writeBlockers.push(...existingSafety.reasons);
  }

  if (plannedBets.length === 0) {
    writeBlockers.push('no planned bets');
  }

  const writeSafe = writeBlockers.length === 0;

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
      eligibleGameIds: eligible.map((g) => g.gameId),
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
    counts: {
      games: options.games.length,
      eligibleGames: eligible.length,
      spreadPicks: plannedBets.filter((b) => b.marketType === 'spread').length,
      totalPicks: plannedBets.filter((b) => b.marketType === 'total').length,
      moneylinePicks: plannedBets.filter((b) => b.marketType === 'moneyline')
        .length,
      totalPlannedBets: plannedBets.length,
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
    consensusComparisons,
  };
}

export function commitEligible(plan: CoreWeeklyCardPlan): boolean {
  return (
    plan.mode === 'COMMIT' &&
    plan.writeSafe &&
    plan.confirmationValid &&
    plan.plannedBets.length > 0 &&
    plan.existingSafety.mode === 'empty'
  );
}

export function isIdempotentNoOp(plan: CoreWeeklyCardPlan): boolean {
  return (
    plan.writeSafe &&
    plan.existingSafety.mode === 'idempotent_exact' &&
    plan.plannedBets.length > 0
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
 * Atomic first COMMIT helper (injectable for tests).
 * Re-reads official+hybrid, requires both empty, createMany all, assert count.
 */
export async function executeAtomicFirstCommit(options: {
  plannedBets: PlannedBet[];
  reReadOfficial: () => Promise<ExistingOfficialBetRow[]>;
  reReadHybrid: () => Promise<ExistingOfficialBetRow[]>;
  createMany: (
    rows: ReturnType<typeof plannedBetToCreateData>[]
  ) => Promise<{ count: number }>;
}): Promise<{ count: number }> {
  const official = await options.reReadOfficial();
  const hybrid = await options.reReadHybrid();
  if (official.length !== 0) {
    throw new Error(
      `transaction aborted: official_flat_100 rows already exist (${official.length})`
    );
  }
  if (hybrid.length !== 0) {
    throw new Error(
      `transaction aborted: hybrid_v2 rows exist (${hybrid.length})`
    );
  }

  const keys = new Set<string>();
  for (const b of options.plannedBets) {
    if (keys.has(b.naturalKey)) {
      throw new Error(`transaction aborted: duplicate planned key ${b.naturalKey}`);
    }
    keys.add(b.naturalKey);
  }

  const data = options.plannedBets.map(plannedBetToCreateData);
  const result = await options.createMany(data);
  assertCreateManyCountMatches(data.length, result.count);
  return { count: result.count };
}

export interface CoreCardPostWriteVerification {
  plannedRows: number;
  insertedRows: number;
  rowsAfter: number;
  naturalKeysFound: string[];
  duplicateKeys: string[];
  missingKeys: string[];
  extraKeys: string[];
  conflictingRows: string[];
  hybridRowsAfter: number;
  exactMatches: number;
  ok: boolean;
  reasons: string[];
}

export function verifyCoreCardPostWrite(options: {
  plannedBets: PlannedBet[];
  createManyCount: number;
  afterOfficial: ExistingOfficialBetRow[];
  afterHybrid: ExistingOfficialBetRow[];
}): CoreCardPostWriteVerification {
  const reasons: string[] = [];
  const plannedByKey = new Map(options.plannedBets.map((b) => [b.naturalKey, b]));
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
  let exactMatches = 0;

  for (const [key, planned] of Array.from(plannedByKey.entries())) {
    const rows = afterByKey.get(key) ?? [];
    if (rows.length === 0) {
      missingKeys.push(key);
      continue;
    }
    if (rows.length > 1) continue;
    const row = rows[0];
    const ok =
      row.side === planned.side &&
      pricesCompatible(Number(row.modelPrice), planned.modelPrice) &&
      pricesCompatible(
        row.closePrice === null ? null : Number(row.closePrice),
        planned.closePrice
      ) &&
      pricesCompatible(Number(row.stake), CORE_CARD_STAKE) &&
      row.source === CORE_CARD_SOURCE &&
      row.strategyTag === CORE_CARD_STRATEGY_TAG &&
      resultStateCompatible(row);
    if (!ok) {
      conflictingRows.push(key);
    } else {
      exactMatches += 1;
      naturalKeysFound.push(key);
    }
  }

  const extraKeys: string[] = [];
  for (const key of Array.from(afterByKey.keys())) {
    if (!plannedByKey.has(key)) extraKeys.push(key);
  }

  if (options.createManyCount !== options.plannedBets.length) {
    reasons.push(
      `createManyCount ${options.createManyCount} != planned ${options.plannedBets.length}`
    );
  }
  if (options.afterOfficial.length !== options.plannedBets.length) {
    reasons.push(
      `rowsAfter ${options.afterOfficial.length} != planned ${options.plannedBets.length}`
    );
  }
  if (duplicateKeys.length) reasons.push(`duplicateKeys=${duplicateKeys.length}`);
  if (missingKeys.length) reasons.push(`missingKeys=${missingKeys.length}`);
  if (extraKeys.length) reasons.push(`extraKeys=${extraKeys.length}`);
  if (conflictingRows.length)
    reasons.push(`conflictingRows=${conflictingRows.length}`);
  if (options.afterHybrid.length > 0) {
    reasons.push(`hybridRowsAfter=${options.afterHybrid.length}`);
  }

  return {
    plannedRows: options.plannedBets.length,
    insertedRows: options.createManyCount,
    rowsAfter: options.afterOfficial.length,
    naturalKeysFound,
    duplicateKeys,
    missingKeys,
    extraKeys,
    conflictingRows,
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
    phase: '2C-2J-4',
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
