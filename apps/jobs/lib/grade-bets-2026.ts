/**
 * 2C-2J-6C-1 — Pure helpers for guarded 2026 official_flat_100 bet grading.
 * Updates only Bet.result / Bet.pnl / Bet.clv. Never mutates closePrice.
 */

import {
  gradeMoneyline,
  gradeSpreadTotal,
  isOfficial2026MissingClosePrice,
  type GradeMarketType,
  type GradeResult,
  type GradeSide,
} from './grading-settlement';

export const GRADING_SEASON = 2026;
export const OFFICIAL_STRATEGY_TAG = 'official_flat_100';
export const OFFICIAL_SOURCE = 'strategy_run';
export const PHASE = '2C-2J-6C-1';
export const MAX_WEEK = 20;

export type GradeMode = 'PREVIEW' | 'COMMIT';

export type GradeAction =
  | 'grade'
  | 'already_graded_same'
  | 'pending_game'
  | 'conflict'
  | 'invalid';

export interface GradeCliArgs {
  season: number;
  week: number;
  mode: GradeMode;
  confirmation: string;
  reportPath?: string;
}

export interface GradeGameSnapshot {
  id: string;
  season: number;
  week: number;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
}

export interface GradeBetRow {
  id: string;
  season: number;
  week: number;
  gameId: string;
  marketType: string;
  side: string;
  modelPrice: number | null;
  closePrice: number | null;
  stake: number;
  result: string | null;
  pnl: number | null;
  clv: number | null;
  strategyTag: string;
  source: string;
  game: GradeGameSnapshot;
}

/** Non-target bets in the same season/week — verified unchanged after COMMIT. */
export interface NonTargetBetSnapshot {
  id: string;
  strategyTag: string;
  source: string;
  result: string | null;
  pnl: number | null;
  clv: number | null;
  closePrice: number | null;
  modelPrice: number | null;
  stake: number;
}

export interface PlannedGradeRow {
  betId: string;
  gameId: string;
  marketType: string;
  side: string;
  stake: number;
  closePrice: number | null;
  modelPrice: number | null;
  gameSeason: number;
  gameWeek: number;
  gameStatus: string;
  homeScore: number | null;
  awayScore: number | null;
  result: GradeResult | null;
  pnl: number | null;
  clv: number | null;
  action: GradeAction;
  dbResult: string | null;
  dbPnl: number | null;
  dbClv: number | null;
}

export interface GradePlan {
  phase: typeof PHASE;
  season: number;
  week: number;
  mode: GradeMode;
  generatedAt: string;
  writeSafe: boolean;
  confirmationValid: boolean;
  expectedConfirmation: string;
  blockers: string[];
  counts: {
    officialBets: number;
    gradeable: number;
    plannedUpdates: number;
    alreadyGradedSame: number;
    pendingGame: number;
    conflicts: number;
    nonTargetBets: number;
  };
  rows: PlannedGradeRow[];
  plannedMutations: Array<{
    betId: string;
    result: GradeResult;
    pnl: number;
    clv: number;
  }>;
  nonTargetBefore: NonTargetBetSnapshot[];
}

export interface GradeExecutionState {
  mode: GradeMode;
  commitAttempted: boolean;
  transactionStarted: boolean;
  betMutationsInvoked: boolean;
  /** Persisted Bet updates after a successful transaction; null on rollback. */
  betUpdateCount: number | null;
  /** Attempted tx.bet.update() calls (including those rolled back). */
  betMutationAttempts: number | null;
  commitSucceeded: boolean;
  postWriteVerificationSucceeded: boolean | null;
  error: string | null;
  providerCalls: 0;
}

export interface GradePostWriteVerification {
  ok: boolean;
  reasons: string[];
  officialBetsAfter: number;
  gradedVerified: number;
}

export function expectedGradeConfirmation(week: number): string {
  return `GRADE_2026_WEEK_${week}_OFFICIAL`;
}

export function parseGradeCliArgs(argv: string[]): {
  ok: boolean;
  args: GradeCliArgs | null;
  errors: string[];
} {
  const errors: string[] = [];
  let season: number | null = null;
  let week: number | null = null;
  let mode: GradeMode = 'PREVIEW';
  let confirmation = '';
  let reportPath: string | undefined;
  const known = new Set([
    '--season',
    '--week',
    '--mode',
    '--confirm',
    '--confirmation',
    '--report',
  ]);

  const takeValue = (flag: string, idx: number): string | null => {
    const next = argv[idx + 1];
    if (next === undefined || next.startsWith('-')) {
      errors.push(`missing value for ${flag}`);
      return null;
    }
    return next;
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (known.has(a)) {
      const v = takeValue(a, i);
      if (v === null) continue;
      i += 1;
      if (a === '--season') season = Number(v);
      else if (a === '--week') {
        if (/current/i.test(v) || /[.,]/.test(v) || /-/.test(v)) {
          errors.push(
            'week must be a single positive integer (no current/ranges)'
          );
        } else {
          week = Number(v);
        }
      } else if (a === '--mode') {
        const m = String(v).toUpperCase();
        if (m !== 'PREVIEW' && m !== 'COMMIT') {
          errors.push('mode must be PREVIEW or COMMIT');
        } else mode = m as GradeMode;
      } else if (a === '--confirm' || a === '--confirmation') {
        confirmation = v;
      } else if (a === '--report') {
        reportPath = v;
      }
      continue;
    }
    if (a.startsWith('-')) {
      errors.push(`unknown argument: ${a}`);
      continue;
    }
    errors.push(`unexpected positional argument: ${a}`);
  }

  if (season !== GRADING_SEASON) {
    errors.push(`season must equal ${GRADING_SEASON}`);
  }
  if (
    week == null ||
    !Number.isInteger(week) ||
    week < 1 ||
    week > MAX_WEEK
  ) {
    errors.push(`week must be an integer 1..${MAX_WEEK} (week 0 rejected)`);
  }

  const expected = week != null ? expectedGradeConfirmation(week) : '';
  if (mode === 'COMMIT' && confirmation !== expected) {
    errors.push(`COMMIT requires confirmation=${expected}`);
  }

  if (errors.length || season == null || week == null) {
    return { ok: false, args: null, errors };
  }

  return {
    ok: true,
    args: { season, week, mode, confirmation, reportPath },
    errors: [],
  };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Null-safe numeric equality: null !== 0. */
export function sameNullableNumber(
  a: number | null | undefined,
  b: number | null | undefined
): boolean {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull || bNull) return aNull && bNull;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) < 1e-9;
}

/** Planned finite numeric value must match a present finite DB value. */
export function matchRequiredNumber(
  actual: number | null | undefined,
  expected: number,
  field: string,
  id: string
): string | null {
  if (actual === null || actual === undefined) {
    return `${field} null for ${id} (expected ${expected})`;
  }
  if (!Number.isFinite(actual)) {
    return `${field} non-finite for ${id}: ${String(actual)}`;
  }
  if (!Number.isFinite(expected) || Math.abs(actual - expected) >= 1e-9) {
    return `${field} mismatch ${id}: db=${actual} expected=${expected}`;
  }
  return null;
}

export function officialNaturalKey(bet: {
  season: number;
  week: number;
  gameId: string;
  marketType: string;
  strategyTag: string;
}): string {
  return `${bet.season}|${bet.week}|${bet.gameId}|${bet.marketType}|${bet.strategyTag}`;
}

const SPREAD_SIDES = new Set(['home', 'away']);
const TOTAL_SIDES = new Set(['over', 'under']);
const ML_SIDES = new Set(['home', 'away']);

export function settleOfficialBet(bet: GradeBetRow):
  | {
      ok: true;
      result: GradeResult;
      pnl: number;
      clv: number;
    }
  | {
      ok: false;
      reason: string;
    } {
  const marketType = String(bet.marketType || '').toLowerCase();
  const side = String(bet.side || '').toLowerCase();

  if (
    marketType !== 'spread' &&
    marketType !== 'total' &&
    marketType !== 'moneyline'
  ) {
    return { ok: false, reason: `unsupported marketType=${bet.marketType}` };
  }
  if (marketType === 'spread' && !SPREAD_SIDES.has(side)) {
    return { ok: false, reason: `unsupported spread side=${bet.side}` };
  }
  if (marketType === 'total' && !TOTAL_SIDES.has(side)) {
    return { ok: false, reason: `unsupported total side=${bet.side}` };
  }
  if (marketType === 'moneyline' && !ML_SIDES.has(side)) {
    return { ok: false, reason: `unsupported moneyline side=${bet.side}` };
  }

  if (!isFiniteNumber(bet.stake)) {
    return { ok: false, reason: `malformed stake for bet ${bet.id}` };
  }
  if (!isFiniteNumber(bet.modelPrice)) {
    return { ok: false, reason: `malformed modelPrice for bet ${bet.id}` };
  }

  if (
    isOfficial2026MissingClosePrice({
      season: bet.season,
      strategyTag: bet.strategyTag,
      closePrice: bet.closePrice,
    })
  ) {
    return {
      ok: false,
      reason: `official_flat_100 missing closePrice for bet ${bet.id}`,
    };
  }

  if (!isFiniteNumber(bet.closePrice)) {
    return { ok: false, reason: `malformed closePrice for bet ${bet.id}` };
  }

  const homeScore = bet.game.homeScore;
  const awayScore = bet.game.awayScore;
  if (
    String(bet.game.status).toLowerCase() !== 'final' ||
    homeScore === null ||
    homeScore === undefined ||
    awayScore === null ||
    awayScore === undefined ||
    !isFiniteNumber(Number(homeScore)) ||
    !isFiniteNumber(Number(awayScore))
  ) {
    return {
      ok: false,
      reason: `game not final or scores incomplete for bet ${bet.id}`,
    };
  }

  const margin = Number(homeScore) - Number(awayScore);
  const totalPts = Number(homeScore) + Number(awayScore);
  const stake = Number(bet.stake);
  const modelPrice = Number(bet.modelPrice);
  const closePrice = Number(bet.closePrice);

  try {
    if (marketType === 'moneyline') {
      const graded = gradeMoneyline(
        side as GradeSide,
        modelPrice,
        closePrice,
        margin,
        stake
      );
      return { ok: true, ...graded };
    }
    const graded = gradeSpreadTotal(
      marketType as Exclude<GradeMarketType, 'moneyline'>,
      side as GradeSide,
      modelPrice,
      closePrice,
      margin,
      totalPts,
      stake
    );
    return { ok: true, ...graded };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

function gameReady(game: GradeGameSnapshot): boolean {
  return (
    String(game.status).toLowerCase() === 'final' &&
    game.homeScore !== null &&
    game.homeScore !== undefined &&
    game.awayScore !== null &&
    game.awayScore !== undefined &&
    Number.isFinite(Number(game.homeScore)) &&
    Number.isFinite(Number(game.awayScore))
  );
}

export function planOfficialGrades(options: {
  season: number;
  week: number;
  mode: GradeMode;
  confirmation: string;
  officialBets: GradeBetRow[];
  nonTargetBets?: NonTargetBetSnapshot[];
  generatedAt?: string;
}): GradePlan {
  const blockers: string[] = [];
  const expectedConfirmation = expectedGradeConfirmation(options.week);
  const confirmationValid =
    options.mode === 'PREVIEW' ||
    options.confirmation === expectedConfirmation;

  if (options.mode === 'COMMIT' && !confirmationValid) {
    blockers.push(`COMMIT requires confirmation=${expectedConfirmation}`);
  }

  if (options.season !== GRADING_SEASON) {
    blockers.push(`season must equal ${GRADING_SEASON}`);
  }

  const seenIds = new Set<string>();
  const seenNaturalKeys = new Map<string, string>();
  for (const bet of options.officialBets) {
    if (seenIds.has(bet.id)) {
      blockers.push(`duplicate bet id ${bet.id}`);
    }
    seenIds.add(bet.id);

    const nat = officialNaturalKey(bet);
    const prior = seenNaturalKeys.get(nat);
    if (prior) {
      blockers.push(
        `duplicate official natural identity ${nat} (bets ${prior} and ${bet.id})`
      );
    } else {
      seenNaturalKeys.set(nat, bet.id);
    }

    if (bet.strategyTag !== OFFICIAL_STRATEGY_TAG) {
      blockers.push(
        `unexpected strategyTag ${bet.strategyTag} on bet ${bet.id}`
      );
    }
    if (bet.source !== OFFICIAL_SOURCE) {
      blockers.push(`unexpected source ${bet.source} on bet ${bet.id}`);
    }
    if (bet.season !== options.season || bet.week !== options.week) {
      blockers.push(
        `bet ${bet.id} season/week mismatch: ${bet.season}/${bet.week} (requested ${options.season}/${options.week})`
      );
    }
    if (bet.game.id !== bet.gameId) {
      blockers.push(
        `bet ${bet.id} game.id mismatch: game.id=${bet.game.id} bet.gameId=${bet.gameId}`
      );
    }
    if (bet.game.season !== bet.season) {
      blockers.push(
        `bet ${bet.id} game.season mismatch: game.season=${bet.game.season} bet.season=${bet.season}`
      );
    }
    if (bet.game.week !== bet.week) {
      blockers.push(
        `bet ${bet.id} game.week mismatch: game.week=${bet.game.week} bet.week=${bet.week}`
      );
    }
  }

  const rows: PlannedGradeRow[] = [];
  const plannedMutations: GradePlan['plannedMutations'] = [];
  let alreadyGradedSame = 0;
  let pendingGame = 0;
  let conflicts = 0;
  let gradeable = 0;

  for (const bet of options.officialBets) {
    const base: PlannedGradeRow = {
      betId: bet.id,
      gameId: bet.gameId,
      marketType: bet.marketType,
      side: bet.side,
      stake: bet.stake,
      closePrice: bet.closePrice,
      modelPrice: bet.modelPrice,
      gameSeason: bet.game.season,
      gameWeek: bet.game.week,
      gameStatus: bet.game.status,
      homeScore: bet.game.homeScore,
      awayScore: bet.game.awayScore,
      result: null,
      pnl: null,
      clv: null,
      action: 'pending_game',
      dbResult: bet.result,
      dbPnl: bet.pnl,
      dbClv: bet.clv,
    };

    if (!gameReady(bet.game)) {
      if (
        isOfficial2026MissingClosePrice({
          season: bet.season,
          strategyTag: bet.strategyTag,
          closePrice: bet.closePrice,
        })
      ) {
        blockers.push(
          `official_flat_100 missing closePrice for bet ${bet.id}`
        );
        base.action = 'invalid';
      } else {
        pendingGame += 1;
        base.action = 'pending_game';
      }
      rows.push(base);
      continue;
    }

    const settled = settleOfficialBet(bet);
    if (settled.ok === false) {
      blockers.push(settled.reason);
      base.action = 'invalid';
      rows.push(base);
      continue;
    }

    gradeable += 1;
    base.result = settled.result;
    base.pnl = settled.pnl;
    base.clv = settled.clv;

    if (bet.result === null || bet.result === undefined) {
      base.action = 'grade';
      plannedMutations.push({
        betId: bet.id,
        result: settled.result,
        pnl: settled.pnl,
        clv: settled.clv,
      });
      rows.push(base);
      continue;
    }

    if (
      String(bet.result) === settled.result &&
      sameNullableNumber(bet.pnl, settled.pnl) &&
      sameNullableNumber(bet.clv, settled.clv)
    ) {
      base.action = 'already_graded_same';
      alreadyGradedSame += 1;
      rows.push(base);
      continue;
    }

    base.action = 'conflict';
    conflicts += 1;
    blockers.push(
      `already-graded conflict bet ${bet.id}: db=${bet.result}/${bet.pnl}/${bet.clv} computed=${settled.result}/${settled.pnl}/${settled.clv}`
    );
    rows.push(base);
  }

  const nonTargetBefore = options.nonTargetBets ?? [];
  const writeSafe = blockers.length === 0;
  const finalMutations = writeSafe ? plannedMutations : [];

  return {
    phase: PHASE,
    season: options.season,
    week: options.week,
    mode: options.mode,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    writeSafe,
    confirmationValid,
    expectedConfirmation,
    blockers,
    counts: {
      officialBets: options.officialBets.length,
      gradeable,
      plannedUpdates: finalMutations.length,
      alreadyGradedSame,
      pendingGame,
      conflicts,
      nonTargetBets: nonTargetBefore.length,
    },
    rows,
    plannedMutations: finalMutations,
    nonTargetBefore,
  };
}

export function commitEligible(plan: GradePlan): boolean {
  return plan.mode === 'COMMIT' && plan.writeSafe && plan.confirmationValid;
}

export function buildPreviewExecution(): GradeExecutionState {
  return {
    mode: 'PREVIEW',
    commitAttempted: false,
    transactionStarted: false,
    betMutationsInvoked: false,
    betUpdateCount: null,
    betMutationAttempts: null,
    commitSucceeded: false,
    postWriteVerificationSucceeded: null,
    error: null,
    providerCalls: 0,
  };
}

export function buildTransactionalIdempotentGradeExecution(): GradeExecutionState {
  return {
    mode: 'COMMIT',
    commitAttempted: true,
    transactionStarted: true,
    betMutationsInvoked: false,
    betUpdateCount: 0,
    betMutationAttempts: 0,
    commitSucceeded: true,
    postWriteVerificationSucceeded: true,
    error: null,
    providerCalls: 0,
  };
}

export function buildSuccessfulGradeCommitExecution(options: {
  betUpdateCount: number;
  postWriteVerificationSucceeded: boolean;
  error?: string | null;
}): GradeExecutionState {
  return {
    mode: 'COMMIT',
    commitAttempted: true,
    transactionStarted: true,
    betMutationsInvoked: options.betUpdateCount > 0,
    betUpdateCount: options.betUpdateCount,
    betMutationAttempts: options.betUpdateCount,
    commitSucceeded: true,
    postWriteVerificationSucceeded: options.postWriteVerificationSucceeded,
    error: options.error ?? null,
    providerCalls: 0,
  };
}

/**
 * Rollback audit:
 * - betUpdateCount = null (persisted unknown; never report a false 0)
 * - betMutationAttempts = attempted updates before rollback
 */
export function buildRolledBackGradeExecution(options: {
  betMutationAttempts: number;
  error: string;
}): GradeExecutionState {
  const attempts = options.betMutationAttempts;
  return {
    mode: 'COMMIT',
    commitAttempted: true,
    transactionStarted: true,
    betMutationsInvoked: attempts > 0,
    betUpdateCount: null,
    betMutationAttempts: attempts,
    commitSucceeded: false,
    postWriteVerificationSucceeded: null,
    error: options.error,
    providerCalls: 0,
  };
}

export function buildFailedGradeCommitExecution(options: {
  error: string;
}): GradeExecutionState {
  return {
    mode: 'COMMIT',
    commitAttempted: true,
    transactionStarted: false,
    betMutationsInvoked: false,
    betUpdateCount: null,
    betMutationAttempts: null,
    commitSucceeded: false,
    postWriteVerificationSucceeded: null,
    error: options.error,
    providerCalls: 0,
  };
}

/**
 * Authoritative grade COMMIT inside a transaction callback.
 * Re-reads bets, re-plans, updates only planned rows with result=null guard.
 */
export async function executeAtomicOfficialGradeCommit(options: {
  plan: GradePlan;
  reReadOfficialBets: () => Promise<GradeBetRow[]>;
  reReadNonTargetBets?: () => Promise<NonTargetBetSnapshot[]>;
  updateBetGrade: (row: {
    betId: string;
    result: GradeResult;
    pnl: number;
    clv: number;
  }) => Promise<{ count: number }>;
}): Promise<{
  updateCount: number;
  rePlan: GradePlan;
  beforeOfficial: GradeBetRow[];
  beforeNonTarget: NonTargetBetSnapshot[];
}> {
  const beforeOfficial = await options.reReadOfficialBets();
  const beforeNonTarget = options.reReadNonTargetBets
    ? await options.reReadNonTargetBets()
    : options.plan.nonTargetBefore;

  const rePlan = planOfficialGrades({
    season: options.plan.season,
    week: options.plan.week,
    mode: 'COMMIT',
    confirmation: options.plan.expectedConfirmation,
    officialBets: beforeOfficial,
    nonTargetBets: beforeNonTarget,
  });

  if (!rePlan.writeSafe) {
    throw new Error(
      `transaction aborted: grade safety failed: ${rePlan.blockers.join('; ')}`
    );
  }

  for (const m of rePlan.plannedMutations) {
    const res = await options.updateBetGrade(m);
    if (res.count !== 1) {
      throw new Error(
        `transaction aborted: unexpected update count ${res.count} for bet ${m.betId} (expected result=null)`
      );
    }
  }

  return {
    updateCount: rePlan.plannedMutations.length,
    rePlan,
    beforeOfficial,
    beforeNonTarget,
  };
}

export function verifyGradePostWrite(options: {
  plan: GradePlan;
  officialBetsAfter: GradeBetRow[];
  nonTargetBetsAfter: NonTargetBetSnapshot[];
}): GradePostWriteVerification {
  const reasons: string[] = [];
  const afterById = new Map(options.officialBetsAfter.map((b) => [b.id, b]));
  const plannedIds = new Set(options.plan.plannedMutations.map((m) => m.betId));

  function assertGradingInputsUnchanged(
    row: PlannedGradeRow,
    after: GradeBetRow
  ): void {
    if (after.gameId !== row.gameId || after.game.id !== row.gameId) {
      reasons.push(
        `game id changed for ${row.betId}: planned=${row.gameId} after=${after.gameId}/${after.game.id}`
      );
    }
    if (after.game.season !== row.gameSeason) {
      reasons.push(
        `game.season changed for ${row.betId}: planned=${row.gameSeason} after=${after.game.season}`
      );
    }
    if (after.game.week !== row.gameWeek) {
      reasons.push(
        `game.week changed for ${row.betId}: planned=${row.gameWeek} after=${after.game.week}`
      );
    }
    if (String(after.game.status) !== String(row.gameStatus)) {
      reasons.push(
        `game.status changed for ${row.betId}: planned=${row.gameStatus} after=${after.game.status}`
      );
    }
    if (!sameNullableNumber(after.game.homeScore, row.homeScore)) {
      reasons.push(
        `homeScore changed for ${row.betId}: planned=${row.homeScore} after=${after.game.homeScore}`
      );
    }
    if (!sameNullableNumber(after.game.awayScore, row.awayScore)) {
      reasons.push(
        `awayScore changed for ${row.betId}: planned=${row.awayScore} after=${after.game.awayScore}`
      );
    }
  }

  for (const m of options.plan.plannedMutations) {
    const after = afterById.get(m.betId);
    if (!after) {
      reasons.push(`missing bet after write: ${m.betId}`);
      continue;
    }
    if (String(after.result) !== m.result) {
      reasons.push(
        `result mismatch ${m.betId}: db=${after.result} expected=${m.result}`
      );
    }
    const pnlErr = matchRequiredNumber(after.pnl, m.pnl, 'pnl', m.betId);
    if (pnlErr) reasons.push(pnlErr);
    const clvErr = matchRequiredNumber(after.clv, m.clv, 'clv', m.betId);
    if (clvErr) reasons.push(clvErr);

    const before = options.plan.rows.find((r) => r.betId === m.betId);
    if (before) {
      assertGradingInputsUnchanged(before, after);
      if (!sameNullableNumber(after.closePrice, before.closePrice)) {
        reasons.push(`closePrice mutated for ${m.betId}`);
      }
      if (!sameNullableNumber(after.modelPrice, before.modelPrice)) {
        reasons.push(`modelPrice mutated for ${m.betId}`);
      }
      if (!sameNullableNumber(after.stake, before.stake)) {
        reasons.push(`stake mutated for ${m.betId}`);
      }
    }
  }

  for (const row of options.plan.rows) {
    const after = afterById.get(row.betId);
    if (!after) {
      reasons.push(`official bet missing after write: ${row.betId}`);
      continue;
    }
    if (plannedIds.has(row.betId)) continue;

    if (row.action === 'already_graded_same') {
      assertGradingInputsUnchanged(row, after);
      if (String(after.result) !== row.result) {
        reasons.push(`already-graded result drifted: ${row.betId}`);
      }
      if (row.pnl !== null && row.pnl !== undefined) {
        const err = matchRequiredNumber(after.pnl, row.pnl, 'pnl', row.betId);
        if (err) reasons.push(`already-graded ${err}`);
      } else if (!sameNullableNumber(after.pnl, row.pnl)) {
        reasons.push(`already-graded pnl drifted: ${row.betId}`);
      }
      if (row.clv !== null && row.clv !== undefined) {
        const err = matchRequiredNumber(after.clv, row.clv, 'clv', row.betId);
        if (err) reasons.push(`already-graded ${err}`);
      } else if (!sameNullableNumber(after.clv, row.clv)) {
        reasons.push(`already-graded clv drifted: ${row.betId}`);
      }
    } else if (row.action === 'pending_game') {
      if (after.result !== null && after.result !== undefined) {
        reasons.push(`pending_game bet unexpectedly graded: ${row.betId}`);
      }
    }
  }

  for (const after of options.officialBetsAfter) {
    if (!options.plan.rows.some((r) => r.betId === after.id)) {
      reasons.push(`unexpected official bet after write: ${after.id}`);
    }
  }

  const beforeNon = new Map(
    options.plan.nonTargetBefore.map((b) => [b.id, b])
  );
  for (const after of options.nonTargetBetsAfter) {
    const before = beforeNon.get(after.id);
    if (!before) {
      reasons.push(`unexpected non-target bet appeared: ${after.id}`);
      continue;
    }
    if (
      after.result !== before.result ||
      !sameNullableNumber(after.pnl, before.pnl) ||
      !sameNullableNumber(after.clv, before.clv) ||
      !sameNullableNumber(after.closePrice, before.closePrice) ||
      !sameNullableNumber(after.modelPrice, before.modelPrice) ||
      !sameNullableNumber(after.stake, before.stake)
    ) {
      reasons.push(`non-target bet mutated: ${after.id}`);
    }
  }
  for (const id of Array.from(beforeNon.keys())) {
    if (!options.nonTargetBetsAfter.some((b) => b.id === id)) {
      reasons.push(`non-target bet missing after write: ${id}`);
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    officialBetsAfter: options.officialBetsAfter.length,
    gradedVerified: options.plan.plannedMutations.length,
  };
}

export function finalizeGradeReport(options: {
  plan: GradePlan;
  execution: GradeExecutionState;
  verification: GradePostWriteVerification | null;
  meta?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    phase: PHASE,
    season: options.plan.season,
    week: options.plan.week,
    mode: options.plan.mode,
    generatedAt: options.plan.generatedAt,
    writeSafe: options.plan.writeSafe,
    blockers: options.plan.blockers,
    counts: options.plan.counts,
    rows: options.plan.rows,
    plannedMutations: options.plan.plannedMutations,
    execution: options.execution,
    verification: options.verification,
    meta: {
      strategyTag: OFFICIAL_STRATEGY_TAG,
      source: OFFICIAL_SOURCE,
      providerCalls: 0,
      closePriceBackfill: false,
      marketLineWrites: false,
      scoreWrites: false,
      ratings: false,
      ...(options.meta ?? {}),
    },
  };
}

export function resolvePreviewExitCode(writeSafe: boolean): 0 | 1 {
  return writeSafe ? 0 : 1;
}

export function redactSecretLike(message: string): string {
  return message
    .replace(/postgresql:\/\/[^\s]+/gi, 'postgresql://***')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer ***');
}
