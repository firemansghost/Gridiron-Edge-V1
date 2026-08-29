/**
 * 2C-2J-6B — Pure helpers for guarded 2026 CFBD score PREVIEW/COMMIT.
 * Finals-only Game.homeScore / Game.awayScore / Game.status updates.
 */

import {
  MAX_REGULAR_SEASON_WEEK,
  assertProviderWeeksMatch,
  buildCfbdWeekGamesUrl,
  buildGameId,
  collectProviderTeamNames,
  isFbsMatchup,
  redactSecretLike,
  resolveAllTeams,
  type CfbdProviderGame,
  type TeamLookup,
  type TeamResolutionResult,
} from '../src/preseason/cfbd-schedule-ingest';

export const SCORES_SEASON = 2026;
export const WEEK1_GAME_COUNT = 51;
export const PHASE = '2C-2J-6B';

export type ScoreMode = 'PREVIEW' | 'COMMIT';

export type ScoreAction =
  | 'pending'
  | 'update_to_final'
  | 'finalize_existing_scores'
  | 'already_final_same'
  | 'conflict'
  | 'missing_db'
  | 'db_only'
  | 'invalid_provider_scores'
  | 'invalid_db_final';

export interface ScoreCliArgs {
  season: number;
  week: number;
  mode: ScoreMode;
  confirmation: string;
  reportPath?: string;
}

export interface DbScoreGameRow {
  id: string;
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
}

export interface NormalizedScoreGame {
  gameId: string;
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  completed: boolean;
  homePoints: number | null;
  awayPoints: number | null;
}

export interface PlannedScoreRow {
  gameId: string;
  awayTeam: string;
  homeTeam: string;
  providerCompleted: boolean;
  providerAwayScore: number | null;
  providerHomeScore: number | null;
  dbStatus: string | null;
  dbAwayScore: number | null;
  dbHomeScore: number | null;
  action: ScoreAction;
  plannedHomeScore?: number;
  plannedAwayScore?: number;
  plannedStatus?: 'final';
}

export interface ScorePlan {
  phase: typeof PHASE;
  season: number;
  week: number;
  mode: ScoreMode;
  generatedAt: string;
  providerCalls: number;
  providerHttpStatus: number | null;
  writeSafe: boolean;
  confirmationValid: boolean;
  expectedConfirmation: string;
  blockers: string[];
  counts: {
    providerRows: number;
    providerFbsGames: number;
    dbGames: number;
    completedProviderGames: number;
    incompleteProviderGames: number;
    plannedUpdates: number;
    alreadyFinalSame: number;
    scoreConflicts: number;
    missingDbGames: number;
    dbOnlyGames: number;
    unresolvedTeams: number;
    duplicateGames: number;
  };
  games: PlannedScoreRow[];
  plannedMutations: Array<{
    gameId: string;
    homeScore: number;
    awayScore: number;
    status: 'final';
  }>;
}

export interface ScoreExecutionState {
  mode: ScoreMode;
  commitAttempted: boolean;
  transactionStarted: boolean;
  gameMutationsInvoked: boolean;
  gameUpdateCount: number | null;
  commitSucceeded: boolean;
  postWriteVerificationSucceeded: boolean | null;
  error: string | null;
  providerCalls: number;
}

export interface ScorePostWriteVerification {
  ok: boolean;
  reasons: string[];
  dbGamesAfter: number;
  completedVerified: number;
}

export function expectedScoreConfirmation(week: number): string {
  return `WRITE_2026_WEEK_${week}_SCORES`;
}

export function parseScoreCliArgs(argv: string[]): {
  ok: boolean;
  args: ScoreCliArgs | null;
  errors: string[];
} {
  const errors: string[] = [];
  let season: number | null = null;
  let week: number | null = null;
  let mode: ScoreMode = 'PREVIEW';
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

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!known.has(a) && a.startsWith('-')) {
      errors.push(`unknown argument: ${a}`);
      continue;
    }
    if (a === '--season') season = Number(argv[++i]);
    else if (a === '--week') {
      const raw = String(argv[++i] ?? '');
      if (/current/i.test(raw) || /[.,]/.test(raw) || /-/.test(raw)) {
        errors.push('week must be a single positive integer (no current/ranges)');
      } else {
        week = Number(raw);
      }
    } else if (a === '--mode') {
      const m = String(argv[++i] ?? '').toUpperCase();
      if (m !== 'PREVIEW' && m !== 'COMMIT') {
        errors.push('mode must be PREVIEW or COMMIT');
      } else mode = m as ScoreMode;
    } else if (a === '--confirm' || a === '--confirmation') {
      confirmation = String(argv[++i] ?? '');
    } else if (a === '--report') reportPath = String(argv[++i] ?? '');
  }

  if (season !== SCORES_SEASON) {
    errors.push(`season must equal ${SCORES_SEASON}`);
  }
  if (
    week == null ||
    !Number.isInteger(week) ||
    week < 1 ||
    week > MAX_REGULAR_SEASON_WEEK
  ) {
    errors.push(
      `week must be an integer 1..${MAX_REGULAR_SEASON_WEEK} (week 0 rejected)`
    );
  }

  const expected = week != null ? expectedScoreConfirmation(week) : '';
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

export function isFiniteNonNegInt(v: unknown): v is number {
  return (
    typeof v === 'number' &&
    Number.isFinite(v) &&
    Number.isInteger(v) &&
    v >= 0
  );
}

export async function fetchCfbdScoresWeek(options: {
  season: number;
  week: number;
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ games: CfbdProviderGame[]; httpStatus: number; providerCalls: 1 }> {
  if (!options.apiKey || !String(options.apiKey).trim()) {
    throw new Error('CFBD_API_KEY is missing or empty');
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = buildCfbdWeekGamesUrl(
    options.season,
    options.week,
    options.baseUrl
  );
  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        Accept: 'application/json',
      },
    });
  } catch (err) {
    throw new Error(
      redactSecretLike(
        `CFBD games fetch failed: ${err instanceof Error ? err.message : String(err)}`
      )
    );
  }
  if (!res.ok) {
    throw new Error(`CFBD games HTTP ${res.status}`);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error('CFBD games response was not valid JSON');
  }
  if (!Array.isArray(body)) {
    throw new Error('CFBD games response was not an array');
  }
  return {
    games: body as CfbdProviderGame[],
    httpStatus: res.status,
    providerCalls: 1,
  };
}

export async function normalizeProviderScoreGames(options: {
  season: number;
  week: number;
  providerGames: CfbdProviderGame[];
  teamLookup: TeamLookup;
  aliases: Map<string, string>;
}): Promise<{
  normalized: NormalizedScoreGame[];
  blockers: string[];
  unresolvedTeams: number;
  duplicateGames: number;
  resolutions: Map<string, TeamResolutionResult>;
}> {
  const blockers: string[] = [];
  const weekIssues = assertProviderWeeksMatch(
    options.providerGames,
    options.week
  );
  for (const issue of weekIssues) blockers.push(issue.message);

  const fbs = options.providerGames.filter(isFbsMatchup);
  if (options.providerGames.length === 0) {
    blockers.push('provider returned zero games');
  }

  const names = collectProviderTeamNames(fbs);
  const resolutions = await resolveAllTeams(
    names,
    options.teamLookup,
    options.aliases
  );

  let unresolvedTeams = 0;
  for (const r of Array.from(resolutions.values())) {
    if (
      !r.resolvedId ||
      (r.kind !== 'exact_canonical' && r.kind !== 'alias')
    ) {
      unresolvedTeams += 1;
      blockers.push(
        `unresolved team "${r.providerName}" (${r.kind}${r.detail ? `: ${r.detail}` : ''})`
      );
    }
  }

  const normalized: NormalizedScoreGame[] = [];
  const seenIds = new Set<string>();
  let duplicateGames = 0;

  for (const g of fbs) {
    const homeRes = resolutions.get(g.homeTeam);
    const awayRes = resolutions.get(g.awayTeam);
    if (!homeRes?.resolvedId || !awayRes?.resolvedId) continue;

    const gameId = buildGameId(
      options.season,
      options.week,
      awayRes.resolvedId,
      homeRes.resolvedId
    );
    if (seenIds.has(gameId)) {
      duplicateGames += 1;
      blockers.push(`duplicate canonical gameId ${gameId}`);
      continue;
    }
    seenIds.add(gameId);

    const completed = Boolean(g.completed);
    let homePoints: number | null =
      g.homePoints === null || g.homePoints === undefined
        ? null
        : Number(g.homePoints);
    let awayPoints: number | null =
      g.awayPoints === null || g.awayPoints === undefined
        ? null
        : Number(g.awayPoints);

    if (completed) {
      if (!isFiniteNonNegInt(homePoints) || !isFiniteNonNegInt(awayPoints)) {
        blockers.push(
          `completed provider game ${gameId} has invalid scores home=${String(g.homePoints)} away=${String(g.awayPoints)}`
        );
        homePoints = null;
        awayPoints = null;
      }
    }

    normalized.push({
      gameId,
      season: options.season,
      week: options.week,
      homeTeamId: homeRes.resolvedId,
      awayTeamId: awayRes.resolvedId,
      homeTeamName: g.homeTeam,
      awayTeamName: g.awayTeam,
      completed,
      homePoints: completed && isFiniteNonNegInt(homePoints) ? homePoints : null,
      awayPoints: completed && isFiniteNonNegInt(awayPoints) ? awayPoints : null,
    });
  }

  return {
    normalized,
    blockers,
    unresolvedTeams,
    duplicateGames,
    resolutions,
  };
}

export function planScoreUpdates(options: {
  season: number;
  week: number;
  mode: ScoreMode;
  confirmation: string;
  normalized: NormalizedScoreGame[];
  dbGames: DbScoreGameRow[];
  providerRows: number;
  providerHttpStatus: number | null;
  providerCalls: number;
  unresolvedTeams: number;
  duplicateGames: number;
  extraBlockers?: string[];
  generatedAt?: string;
}): ScorePlan {
  const blockers = [...(options.extraBlockers ?? [])];
  const expectedConfirmation = expectedScoreConfirmation(options.week);
  const confirmationValid =
    options.mode === 'PREVIEW' ||
    options.confirmation === expectedConfirmation;

  if (options.mode === 'COMMIT' && !confirmationValid) {
    blockers.push(`COMMIT requires confirmation=${expectedConfirmation}`);
  }

  const dbById = new Map(options.dbGames.map((g) => [g.id, g]));
  const providerIds = new Set(options.normalized.map((g) => g.gameId));
  const dbIds = new Set(options.dbGames.map((g) => g.id));

  if (options.week === 1) {
    if (options.normalized.length !== WEEK1_GAME_COUNT) {
      blockers.push(
        `Week1 requires exactly ${WEEK1_GAME_COUNT} provider FBS games (got ${options.normalized.length})`
      );
    }
    if (options.dbGames.length !== WEEK1_GAME_COUNT) {
      blockers.push(
        `Week1 requires exactly ${WEEK1_GAME_COUNT} DB games (got ${options.dbGames.length})`
      );
    }
  }

  let missingDbGames = 0;
  let dbOnlyGames = 0;
  for (const id of Array.from(providerIds)) {
    if (!dbIds.has(id)) {
      missingDbGames += 1;
      blockers.push(`provider game missing from DB: ${id}`);
    }
  }
  for (const id of Array.from(dbIds)) {
    if (!providerIds.has(id)) {
      dbOnlyGames += 1;
      blockers.push(`DB game missing from provider FBS set: ${id}`);
    }
  }

  const games: PlannedScoreRow[] = [];
  const plannedMutations: ScorePlan['plannedMutations'] = [];
  let completedProviderGames = 0;
  let incompleteProviderGames = 0;
  let alreadyFinalSame = 0;
  let scoreConflicts = 0;

  for (const n of options.normalized) {
    const db = dbById.get(n.gameId) ?? null;
    const row: PlannedScoreRow = {
      gameId: n.gameId,
      awayTeam: n.awayTeamName,
      homeTeam: n.homeTeamName,
      providerCompleted: n.completed,
      providerAwayScore: n.awayPoints,
      providerHomeScore: n.homePoints,
      dbStatus: db?.status ?? null,
      dbAwayScore: db?.awayScore ?? null,
      dbHomeScore: db?.homeScore ?? null,
      action: 'pending',
    };

    if (!db) {
      row.action = 'missing_db';
      games.push(row);
      continue;
    }

    if (!n.completed) {
      incompleteProviderGames += 1;
      row.action = 'pending';
      games.push(row);
      continue;
    }

    completedProviderGames += 1;
    if (!isFiniteNonNegInt(n.homePoints) || !isFiniteNonNegInt(n.awayPoints)) {
      row.action = 'invalid_provider_scores';
      blockers.push(
        `completed provider game ${n.gameId} has invalid scores`
      );
      scoreConflicts += 1;
      games.push(row);
      continue;
    }

    const status = String(db.status || '').toLowerCase();
    const dbHome = db.homeScore;
    const dbAway = db.awayScore;

    if (status === 'final') {
      if (dbHome === null || dbHome === undefined || dbAway === null || dbAway === undefined) {
        row.action = 'invalid_db_final';
        blockers.push(
          `DB final game ${n.gameId} has null score(s) home=${String(dbHome)} away=${String(dbAway)}`
        );
        scoreConflicts += 1;
        games.push(row);
        continue;
      }
      if (Number(dbHome) === n.homePoints && Number(dbAway) === n.awayPoints) {
        row.action = 'already_final_same';
        alreadyFinalSame += 1;
        games.push(row);
        continue;
      }
      row.action = 'conflict';
      blockers.push(
        `final score conflict ${n.gameId}: db=${dbHome}-${dbAway} provider=${n.homePoints}-${n.awayPoints}`
      );
      scoreConflicts += 1;
      games.push(row);
      continue;
    }

    // scheduled / in_progress / other non-final
    if (dbHome !== null && dbHome !== undefined && dbAway !== null && dbAway !== undefined) {
      if (Number(dbHome) === n.homePoints && Number(dbAway) === n.awayPoints) {
        row.action = 'finalize_existing_scores';
        row.plannedHomeScore = n.homePoints;
        row.plannedAwayScore = n.awayPoints;
        row.plannedStatus = 'final';
        plannedMutations.push({
          gameId: n.gameId,
          homeScore: n.homePoints,
          awayScore: n.awayPoints,
          status: 'final',
        });
        games.push(row);
        continue;
      }
      row.action = 'conflict';
      blockers.push(
        `non-final score conflict ${n.gameId}: db=${dbHome}-${dbAway} provider=${n.homePoints}-${n.awayPoints}`
      );
      scoreConflicts += 1;
      games.push(row);
      continue;
    }

    // null scores → write finals
    if (
      (dbHome !== null && dbHome !== undefined) ||
      (dbAway !== null && dbAway !== undefined)
    ) {
      // partial score present
      row.action = 'conflict';
      blockers.push(
        `partial existing scores conflict ${n.gameId}: db=${String(dbHome)}-${String(dbAway)}`
      );
      scoreConflicts += 1;
      games.push(row);
      continue;
    }

    row.action = 'update_to_final';
    row.plannedHomeScore = n.homePoints;
    row.plannedAwayScore = n.awayPoints;
    row.plannedStatus = 'final';
    plannedMutations.push({
      gameId: n.gameId,
      homeScore: n.homePoints,
      awayScore: n.awayPoints,
      status: 'final',
    });
    games.push(row);
  }

  // db-only already counted as blockers; still list them for report
  for (const db of options.dbGames) {
    if (!providerIds.has(db.id)) {
      games.push({
        gameId: db.id,
        awayTeam: db.awayTeamId,
        homeTeam: db.homeTeamId,
        providerCompleted: false,
        providerAwayScore: null,
        providerHomeScore: null,
        dbStatus: db.status,
        dbAwayScore: db.awayScore,
        dbHomeScore: db.homeScore,
        action: 'db_only',
      });
    }
  }

  const writeSafe = blockers.length === 0;

  return {
    phase: PHASE,
    season: options.season,
    week: options.week,
    mode: options.mode,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    providerCalls: options.providerCalls,
    providerHttpStatus: options.providerHttpStatus,
    writeSafe,
    confirmationValid,
    expectedConfirmation,
    blockers,
    counts: {
      providerRows: options.providerRows,
      providerFbsGames: options.normalized.length,
      dbGames: options.dbGames.length,
      completedProviderGames,
      incompleteProviderGames,
      plannedUpdates: plannedMutations.length,
      alreadyFinalSame,
      scoreConflicts,
      missingDbGames,
      dbOnlyGames,
      unresolvedTeams: options.unresolvedTeams,
      duplicateGames: options.duplicateGames,
    },
    games,
    plannedMutations,
  };
}

export function commitEligible(plan: ScorePlan): boolean {
  return (
    plan.mode === 'COMMIT' &&
    plan.writeSafe &&
    plan.confirmationValid
  );
}

export function buildPreviewExecution(providerCalls: number): ScoreExecutionState {
  return {
    mode: 'PREVIEW',
    commitAttempted: false,
    transactionStarted: false,
    gameMutationsInvoked: false,
    gameUpdateCount: null,
    commitSucceeded: false,
    postWriteVerificationSucceeded: null,
    error: null,
    providerCalls,
  };
}

export function buildTransactionalIdempotentScoreExecution(
  providerCalls: number
): ScoreExecutionState {
  return {
    mode: 'COMMIT',
    commitAttempted: true,
    transactionStarted: true,
    gameMutationsInvoked: false,
    gameUpdateCount: 0,
    commitSucceeded: true,
    postWriteVerificationSucceeded: true,
    error: null,
    providerCalls,
  };
}

export function buildSuccessfulScoreCommitExecution(options: {
  providerCalls: number;
  gameUpdateCount: number;
  postWriteVerificationSucceeded: boolean;
  error?: string | null;
}): ScoreExecutionState {
  return {
    mode: 'COMMIT',
    commitAttempted: true,
    transactionStarted: true,
    gameMutationsInvoked: options.gameUpdateCount > 0,
    gameUpdateCount: options.gameUpdateCount,
    commitSucceeded: true,
    postWriteVerificationSucceeded: options.postWriteVerificationSucceeded,
    error: options.error ?? null,
    providerCalls: options.providerCalls,
  };
}

export function buildRolledBackScoreExecution(options: {
  providerCalls: number;
  gameMutationsInvoked: boolean;
  gameUpdateCount: number | null;
  error: string;
}): ScoreExecutionState {
  return {
    mode: 'COMMIT',
    commitAttempted: true,
    transactionStarted: true,
    gameMutationsInvoked: options.gameMutationsInvoked,
    gameUpdateCount: options.gameMutationsInvoked
      ? options.gameUpdateCount
      : null,
    commitSucceeded: false,
    postWriteVerificationSucceeded: null,
    error: options.error,
    providerCalls: options.providerCalls,
  };
}

export function buildFailedScoreCommitExecution(options: {
  providerCalls: number;
  error: string;
}): ScoreExecutionState {
  return {
    mode: 'COMMIT',
    commitAttempted: true,
    transactionStarted: false,
    gameMutationsInvoked: false,
    gameUpdateCount: null,
    commitSucceeded: false,
    postWriteVerificationSucceeded: null,
    error: options.error,
    providerCalls: options.providerCalls,
  };
}

/**
 * Authoritative score COMMIT inside a transaction callback.
 * Re-reads DB, re-plans against the normalized provider snapshot, updates only planned rows.
 */
export async function executeAtomicScoreCommitWithNormalized(options: {
  plan: ScorePlan;
  normalized: NormalizedScoreGame[];
  reReadDbGames: () => Promise<DbScoreGameRow[]>;
  updateGameScores: (row: {
    gameId: string;
    homeScore: number;
    awayScore: number;
    status: 'final';
  }) => Promise<void>;
}): Promise<{
  updateCount: number;
  beforeDb: DbScoreGameRow[];
  rePlan: ScorePlan;
}> {
  const beforeDb = await options.reReadDbGames();
  const rePlan = planScoreUpdates({
    season: options.plan.season,
    week: options.plan.week,
    mode: 'COMMIT',
    confirmation: options.plan.expectedConfirmation,
    normalized: options.normalized,
    dbGames: beforeDb,
    providerRows: options.plan.counts.providerRows,
    providerHttpStatus: options.plan.providerHttpStatus,
    providerCalls: options.plan.providerCalls,
    unresolvedTeams: options.plan.counts.unresolvedTeams,
    duplicateGames: options.plan.counts.duplicateGames,
  });

  if (!rePlan.writeSafe) {
    throw new Error(
      `transaction aborted: score safety failed: ${rePlan.blockers.join('; ')}`
    );
  }

  for (const m of rePlan.plannedMutations) {
    await options.updateGameScores(m);
  }
  return {
    updateCount: rePlan.plannedMutations.length,
    beforeDb,
    rePlan,
  };
}

export function verifyScorePostWrite(options: {
  normalized: NormalizedScoreGame[];
  dbGamesAfter: DbScoreGameRow[];
  dbGamesBeforeCount: number;
  plannedUpdateIds: string[];
}): ScorePostWriteVerification {
  const reasons: string[] = [];
  const afterById = new Map(options.dbGamesAfter.map((g) => [g.id, g]));

  if (options.dbGamesAfter.length !== options.dbGamesBeforeCount) {
    reasons.push(
      `db game count changed: before=${options.dbGamesBeforeCount} after=${options.dbGamesAfter.length}`
    );
  }

  let completedVerified = 0;
  for (const n of options.normalized) {
    const db = afterById.get(n.gameId);
    if (!db) {
      reasons.push(`missing DB game after write: ${n.gameId}`);
      continue;
    }
    if (!n.completed) {
      if (String(db.status).toLowerCase() === 'final' && options.plannedUpdateIds.includes(n.gameId)) {
        reasons.push(`incomplete provider game was finalized: ${n.gameId}`);
      }
      // Incomplete must not have been mutated by this writer to final unless it was already final.
      continue;
    }
    completedVerified += 1;
    if (String(db.status).toLowerCase() !== 'final') {
      reasons.push(`completed game not final: ${n.gameId}`);
    }
    if (Number(db.homeScore) !== n.homePoints || Number(db.awayScore) !== n.awayPoints) {
      reasons.push(
        `score mismatch ${n.gameId}: db=${db.homeScore}-${db.awayScore} provider=${n.homePoints}-${n.awayPoints}`
      );
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    dbGamesAfter: options.dbGamesAfter.length,
    completedVerified,
  };
}

export function finalizeScoreReport(options: {
  plan: ScorePlan;
  execution: ScoreExecutionState;
  verification: ScorePostWriteVerification | null;
  meta?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    phase: PHASE,
    season: options.plan.season,
    week: options.plan.week,
    mode: options.plan.mode,
    generatedAt: options.plan.generatedAt,
    providerCalls: options.execution.providerCalls,
    providerHttpStatus: options.plan.providerHttpStatus,
    writeSafe: options.plan.writeSafe,
    blockers: options.plan.blockers,
    counts: options.plan.counts,
    games: options.plan.games,
    plannedMutations: options.plan.plannedMutations,
    execution: options.execution,
    verification: options.verification,
    meta: {
      venuesCalled: false,
      grading: false,
      odds: false,
      ratings: false,
      betWrites: false,
      marketLineWrites: false,
      ...(options.meta ?? {}),
    },
  };
}

export function resolvePreviewExitCode(writeSafe: boolean): 0 | 1 {
  return writeSafe ? 0 : 1;
}
