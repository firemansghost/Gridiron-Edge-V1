/**
 * 2C-2J-6D-1 — Pure helpers for guarded 2026 CFBD TeamGameStat PREVIEW/COMMIT.
 * Creates/updates TeamGameStat only; preserves legacy advanced-stats mapping semantics.
 */

import {
  CFBD_BASE_URL_DEFAULT,
  MAX_REGULAR_SEASON_WEEK,
  redactSecretLike,
  type TeamResolutionResult,
} from '../preseason/cfbd-schedule-ingest';

export const TEAM_GAME_STATS_SEASON = 2026;
export const PHASE = '2C-2J-6D-1';
export const CFBD_TEAM_GAME_STATS_TIMEOUT_MS = 20_000;

export type TeamGameStatMode = 'PREVIEW' | 'COMMIT';

export interface TeamGameStatCliArgs {
  season: number;
  week: number;
  mode: TeamGameStatMode;
  confirmation: string;
  reportPath?: string;
}

export interface CfbdAdvancedGameStatRow {
  season?: number;
  week?: number;
  team: string;
  opponent: string;
  homeAway: 'home' | 'away' | string;
  offense?: {
    yardsPerPlay?: number | null;
    successRate?: number | null;
    ppa?: number | null;
    secondsPerPlay?: number | null;
    yardsPerPass?: number | null;
    yardsPerRush?: number | null;
    plays?: number | null;
    yards?: number | null;
    passing?: { yards?: number | null; attempts?: number | null };
    rushing?: { yards?: number | null; attempts?: number | null };
  };
  defense?: {
    yardsPerPlay?: number | null;
    successRate?: number | null;
    ppa?: number | null;
    secondsPerPlay?: number | null;
    yardsPerPass?: number | null;
    yardsPerRush?: number | null;
    plays?: number | null;
    yards?: number | null;
    passing?: { yards?: number | null; attempts?: number | null };
    rushing?: { yards?: number | null; attempts?: number | null };
  };
  plays?: number | null;
  yards?: number | null;
  passing?: { yards?: number | null; attempts?: number | null };
  rushing?: { yards?: number | null; attempts?: number | null };
  [key: string]: unknown;
}

export interface ManagedTeamGameStatFields {
  yppOff: number | null;
  successOff: number | null;
  epaOff: number | null;
  pace: number | null;
  passYpaOff: number | null;
  rushYpcOff: number | null;
  yppDef: number | null;
  successDef: number | null;
  epaDef: number | null;
  passYpaDef: number | null;
  rushYpcDef: number | null;
  offensive_stats: Record<string, unknown>;
  defensive_stats: Record<string, unknown>;
  special_teams: Record<string, unknown>;
  rawJson: Record<string, unknown>;
}

export interface DbTeamGameStatRow extends ManagedTeamGameStatFields {
  id?: string;
  gameId: string;
  teamId: string;
  season: number;
  week: number;
}

export interface DbGameRowForStats {
  id: string;
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  status: string;
}

export interface PlannedTeamGameStatMutation {
  gameId: string;
  teamId: string;
  id?: string;
  fields: ManagedTeamGameStatFields;
}

export interface TeamGameStatPlan {
  phase: typeof PHASE;
  season: number;
  week: number;
  mode: TeamGameStatMode;
  generatedAt: string;
  providerCalls: number;
  providerHttpStatus: number | null;
  writeSafe: boolean;
  confirmationValid: boolean;
  expectedConfirmation: string;
  blockers: string[];
  /** Always false on the plan object itself (PREVIEW contract). */
  mutationsInvoked: false;
  counts: {
    providerRows: number;
    canonicalGames: number;
    finalTargetGames: number;
    incompleteTargetGames: number;
    expectedFbsParticipantRows: number;
    resolvedProviderRows: number;
    ignoredProviderRows: number;
    unresolvedRows: number;
    duplicateKeys: number;
    missingExpectedKeys: number;
    existingRows: number;
    proposedCreates: number;
    proposedUpdates: number;
    unchangedRows: number;
  };
  plannedCreates: PlannedTeamGameStatMutation[];
  plannedUpdates: PlannedTeamGameStatMutation[];
  /** All matched expected keys → planned managed fields (creates, updates, unchanged). */
  plannedByKey: Record<string, ManagedTeamGameStatFields>;
  expectedKeys: string[];
  matchedKeys: string[];
}

export interface TeamGameStatExecutionState {
  mode: TeamGameStatMode;
  commitAttempted: boolean;
  transactionStarted: boolean;
  mutationsInvoked: boolean;
  mutationAttempts: number | null;
  createCount: number | null;
  updateCount: number | null;
  unchangedCount: number | null;
  commitSucceeded: boolean;
  postWriteVerificationSucceeded: boolean | null;
  error: string | null;
  providerCalls: number;
}

export interface TeamGameStatPostWriteVerification {
  ok: boolean;
  reasons: string[];
  afterRows: number;
  verifiedKeys: number;
}

export function expectedTeamGameStatConfirmation(week: number): string {
  return `WRITE_2026_WEEK_${week}_TEAM_GAME_STATS`;
}

export function naturalKey(gameId: string, teamId: string): string {
  return `${gameId}|${teamId}`;
}

export function safeNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (Number.isNaN(n) || !Number.isFinite(n)) return null;
  return n;
}

export function derivePaceFromSecondsPerPlay(
  secondsPerPlay: unknown
): number | null {
  const spp = safeNumber(secondsPerPlay);
  if (spp === null || !(spp > 0)) return null;
  return 60 / spp;
}

export function mapAdvancedStatsToManagedFields(
  row: CfbdAdvancedGameStatRow
): ManagedTeamGameStatFields {
  const yppOff = safeNumber(row.offense?.yardsPerPlay);
  const successOff = safeNumber(row.offense?.successRate);
  const epaOff = safeNumber(row.offense?.ppa);
  const pace = derivePaceFromSecondsPerPlay(row.offense?.secondsPerPlay);
  const passYpaOff = safeNumber(row.offense?.yardsPerPass);
  const rushYpcOff = safeNumber(row.offense?.yardsPerRush);

  const yppDef = safeNumber(row.defense?.yardsPerPlay);
  const successDef = safeNumber(row.defense?.successRate);
  const epaDef = safeNumber(row.defense?.ppa);
  const passYpaDef = safeNumber(row.defense?.yardsPerPass);
  const rushYpcDef = safeNumber(row.defense?.yardsPerRush);

  const playsOff = safeNumber(row.plays);
  const yardsOff = safeNumber(row.yards);
  const passYardsOff = safeNumber(row.passing?.yards);
  const rushYardsOff = safeNumber(row.rushing?.yards);
  const passAttOff = safeNumber(row.passing?.attempts);
  const rushAttOff = safeNumber(row.rushing?.attempts);

  const playsDef = safeNumber(row.defense?.plays);
  const yardsDef = safeNumber(row.defense?.yards);
  const passYardsDef = safeNumber(row.defense?.passing?.yards);
  const rushYardsDef = safeNumber(row.defense?.rushing?.yards);
  const passAttDef = safeNumber(row.defense?.passing?.attempts);
  const rushAttDef = safeNumber(row.defense?.rushing?.attempts);

  return {
    yppOff,
    successOff,
    epaOff,
    pace,
    passYpaOff,
    rushYpcOff,
    yppDef,
    successDef,
    epaDef,
    passYpaDef,
    rushYpcDef,
    offensive_stats: {
      plays: playsOff,
      yards: yardsOff,
      ypp: yppOff,
      success: successOff,
      epa: epaOff,
      pace,
      passYards: passYardsOff,
      rushYards: rushYardsOff,
      passAtt: passAttOff,
      rushAtt: rushAttOff,
      passYpa: passYpaOff,
      rushYpc: rushYpcOff,
    },
    defensive_stats: {
      plays: playsDef,
      yards: yardsDef,
      ypp: yppDef,
      success: successDef,
      epa: epaDef,
      passYards: passYardsDef,
      rushYards: rushYardsDef,
      passAtt: passAttDef,
      rushAtt: rushAttDef,
      passYpa: passYpaDef,
      rushYpc: rushYpcDef,
    },
    special_teams: {},
    rawJson: { ...row } as Record<string, unknown>,
  };
}

export function managedFieldsEqual(
  a: ManagedTeamGameStatFields,
  b: ManagedTeamGameStatFields
): boolean {
  const scalarsEqual =
    a.yppOff === b.yppOff &&
    a.successOff === b.successOff &&
    a.epaOff === b.epaOff &&
    a.pace === b.pace &&
    a.passYpaOff === b.passYpaOff &&
    a.rushYpcOff === b.rushYpcOff &&
    a.yppDef === b.yppDef &&
    a.successDef === b.successDef &&
    a.epaDef === b.epaDef &&
    a.passYpaDef === b.passYpaDef &&
    a.rushYpcDef === b.rushYpcDef;
  if (!scalarsEqual) return false;
  return (
    JSON.stringify(a.offensive_stats) === JSON.stringify(b.offensive_stats) &&
    JSON.stringify(a.defensive_stats) === JSON.stringify(b.defensive_stats) &&
    JSON.stringify(a.special_teams) === JSON.stringify(b.special_teams) &&
    JSON.stringify(a.rawJson) === JSON.stringify(b.rawJson)
  );
}

export function parseTeamGameStatCliArgs(argv: string[]): {
  ok: boolean;
  args: TeamGameStatCliArgs | null;
  errors: string[];
} {
  const errors: string[] = [];
  let season: number | null = null;
  let week: number | null = null;
  let mode: TeamGameStatMode = 'PREVIEW';
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
        } else mode = m as TeamGameStatMode;
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

  if (season !== TEAM_GAME_STATS_SEASON) {
    errors.push(`season must equal ${TEAM_GAME_STATS_SEASON}`);
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

  const expected =
    week != null ? expectedTeamGameStatConfirmation(week) : '';
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

export function buildCfbdAdvancedGameStatsUrl(
  season: number,
  week: number,
  baseUrl = CFBD_BASE_URL_DEFAULT
): string {
  const base = baseUrl.replace(/\/$/, '');
  const url = new URL(`${base}/stats/game/advanced`);
  url.searchParams.set('year', String(season));
  url.searchParams.set('week', String(week));
  url.searchParams.set('seasonType', 'regular');
  url.searchParams.set('classification', 'fbs');
  return url.toString();
}

export async function fetchCfbdAdvancedGameStatsWeek(options: {
  season: number;
  week: number;
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<{
  rows: CfbdAdvancedGameStatRow[];
  httpStatus: number;
  providerCalls: 1;
}> {
  if (!options.apiKey || !String(options.apiKey).trim()) {
    throw new Error('CFBD_API_KEY is missing or empty');
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? CFBD_TEAM_GAME_STATS_TIMEOUT_MS;
  const url = buildCfbdAdvancedGameStatsUrl(
    options.season,
    options.week,
    options.baseUrl
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(url, {
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
          `CFBD advanced game stats request timed out after ${timeoutMs}ms`
        )
      );
    }
    throw new Error(
      redactSecretLike(`CFBD advanced game stats fetch failed: ${msg}`)
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`CFBD advanced game stats HTTP ${res.status}`);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error('CFBD advanced game stats response was not valid JSON');
  }
  if (!Array.isArray(body)) {
    throw new Error('CFBD advanced game stats response was not an array');
  }
  return {
    rows: body as CfbdAdvancedGameStatRow[],
    httpStatus: res.status,
    providerCalls: 1,
  };
}

function isTeamResolved(
  r: TeamResolutionResult | undefined
): r is TeamResolutionResult & { resolvedId: string } {
  return (
    !!r &&
    !!r.resolvedId &&
    (r.kind === 'exact_canonical' || r.kind === 'alias')
  );
}

export function buildExpectedFbsParticipantKeys(
  games: DbGameRowForStats[],
  fbsTeamIds: Set<string>
): {
  expectedKeys: Map<string, { gameId: string; teamId: string; isHome: boolean }>;
  relevantGames: DbGameRowForStats[];
  finalRelevantGames: DbGameRowForStats[];
  incompleteRelevantGames: DbGameRowForStats[];
} {
  const expectedKeys = new Map<
    string,
    { gameId: string; teamId: string; isHome: boolean }
  >();
  const relevantGames: DbGameRowForStats[] = [];

  for (const g of games) {
    const homeFbs = fbsTeamIds.has(g.homeTeamId);
    const awayFbs = fbsTeamIds.has(g.awayTeamId);
    if (!homeFbs && !awayFbs) continue;
    relevantGames.push(g);
    if (homeFbs) {
      expectedKeys.set(naturalKey(g.id, g.homeTeamId), {
        gameId: g.id,
        teamId: g.homeTeamId,
        isHome: true,
      });
    }
    if (awayFbs) {
      expectedKeys.set(naturalKey(g.id, g.awayTeamId), {
        gameId: g.id,
        teamId: g.awayTeamId,
        isHome: false,
      });
    }
  }

  const finalRelevantGames = relevantGames.filter((g) => g.status === 'final');
  const incompleteRelevantGames = relevantGames.filter(
    (g) => g.status !== 'final'
  );

  return {
    expectedKeys,
    relevantGames,
    finalRelevantGames,
    incompleteRelevantGames,
  };
}

type MatchedProviderRow = {
  key: string;
  gameId: string;
  teamId: string;
  fields: ManagedTeamGameStatFields;
};

export function planTeamGameStats(options: {
  season: number;
  week: number;
  mode: TeamGameStatMode;
  confirmation: string;
  providerRows: CfbdAdvancedGameStatRow[];
  providerHttpStatus: number | null;
  providerCalls: number;
  dbGames: DbGameRowForStats[];
  existingStats: DbTeamGameStatRow[];
  fbsTeamIds: string[];
  teamResolutions: Map<string, TeamResolutionResult>;
  generatedAt?: string;
}): TeamGameStatPlan {
  const blockers: string[] = [];
  const expectedConfirmation = expectedTeamGameStatConfirmation(options.week);
  const confirmationValid =
    options.mode === 'PREVIEW' ||
    options.confirmation === expectedConfirmation;

  if (options.mode === 'COMMIT' && !confirmationValid) {
    blockers.push(`COMMIT requires confirmation=${expectedConfirmation}`);
  }

  const fbsSet = new Set(options.fbsTeamIds);
  const {
    expectedKeys,
    finalRelevantGames,
    incompleteRelevantGames,
  } = buildExpectedFbsParticipantKeys(options.dbGames, fbsSet);

  // Index games by home|away pair — duplicate pairs are blockers.
  const gamesByPair = new Map<string, DbGameRowForStats[]>();
  for (const g of options.dbGames) {
    const pair = `${g.homeTeamId}|${g.awayTeamId}`;
    const list = gamesByPair.get(pair) ?? [];
    list.push(g);
    gamesByPair.set(pair, list);
  }
  for (const [pair, list] of Array.from(gamesByPair.entries())) {
    if (list.length > 1) {
      blockers.push(
        `duplicate_canonical_home_away_pair:${pair} count=${list.length}`
      );
    }
  }

  let ignoredProviderRows = 0;
  let unresolvedRows = 0;
  const matchedByKey = new Map<string, MatchedProviderRow>();
  const duplicateKeySet = new Set<string>();

  const findGamesWhere = (
    predicate: (g: DbGameRowForStats) => boolean
  ): DbGameRowForStats[] => options.dbGames.filter(predicate);

  for (const row of options.providerRows) {
    const homeAway = String(row.homeAway ?? '').toLowerCase();
    if (homeAway !== 'home' && homeAway !== 'away') {
      unresolvedRows += 1;
      blockers.push(
        `invalid_homeAway:${row.team}|${row.opponent}|${String(row.homeAway)}`
      );
      continue;
    }

    const teamRes = options.teamResolutions.get(row.team);
    const oppRes = options.teamResolutions.get(row.opponent);
    const teamOk = isTeamResolved(teamRes);
    const oppOk = isTeamResolved(oppRes);
    const fields = mapAdvancedStatsToManagedFields(row);

    if (!teamOk && !oppOk) {
      unresolvedRows += 1;
      blockers.push(`unresolved_provider_team:${row.team}`);
      blockers.push(`unresolved_provider_team:${row.opponent}`);
      continue;
    }

    if (!teamOk && oppOk) {
      // Opponent resolved; team unresolved — ignore only if unique FCS non-expected side.
      const oppId = oppRes.resolvedId;
      const candidates =
        homeAway === 'home'
          ? findGamesWhere((g) => g.awayTeamId === oppId)
          : findGamesWhere((g) => g.homeTeamId === oppId);
      if (candidates.length === 1) {
        const g = candidates[0];
        const teamSideId = homeAway === 'home' ? g.homeTeamId : g.awayTeamId;
        const key = naturalKey(g.id, teamSideId);
        if (!expectedKeys.has(key)) {
          ignoredProviderRows += 1;
          continue;
        }
      }
      unresolvedRows += 1;
      blockers.push(`unresolved_provider_team:${row.team}`);
      continue;
    }

    if (teamOk && !oppOk) {
      // Team resolved; opponent unresolved — match unique expected key without opponent id.
      const teamId = teamRes.resolvedId;
      const candidates =
        homeAway === 'home'
          ? findGamesWhere((g) => g.homeTeamId === teamId)
          : findGamesWhere((g) => g.awayTeamId === teamId);
      if (candidates.length > 1) {
        unresolvedRows += 1;
        blockers.push(
          `ambiguous_provider_row:${row.team}|${row.opponent} matches=${candidates.length}`
        );
        continue;
      }
      if (candidates.length === 0) {
        ignoredProviderRows += 1;
        continue;
      }
      const g = candidates[0];
      const key = naturalKey(g.id, teamId);
      if (!expectedKeys.has(key)) {
        ignoredProviderRows += 1;
        continue;
      }
      if (matchedByKey.has(key)) {
        duplicateKeySet.add(key);
        blockers.push(`duplicate_natural_key:${key}`);
        continue;
      }
      matchedByKey.set(key, {
        key,
        gameId: g.id,
        teamId,
        fields,
      });
      continue;
    }

    // Both resolved
    const teamId = teamRes!.resolvedId!;
    const oppId = oppRes!.resolvedId!;
    const homeId = homeAway === 'home' ? teamId : oppId;
    const awayId = homeAway === 'home' ? oppId : teamId;
    const pair = `${homeId}|${awayId}`;
    const pairGames = gamesByPair.get(pair) ?? [];
    if (pairGames.length === 0) {
      ignoredProviderRows += 1;
      continue;
    }
    if (pairGames.length > 1) {
      unresolvedRows += 1;
      blockers.push(
        `ambiguous_provider_row:${row.team}|${row.opponent} pair=${pair}`
      );
      continue;
    }
    const g = pairGames[0];
    const key = naturalKey(g.id, teamId);
    if (!expectedKeys.has(key)) {
      ignoredProviderRows += 1;
      continue;
    }
    if (matchedByKey.has(key)) {
      duplicateKeySet.add(key);
      blockers.push(`duplicate_natural_key:${key}`);
      continue;
    }
    matchedByKey.set(key, {
      key,
      gameId: g.id,
      teamId,
      fields,
    });
  }

  const duplicateKeys = duplicateKeySet.size;

  // Missing expected keys
  const missingExpected: string[] = [];
  for (const key of Array.from(expectedKeys.keys())) {
    if (!matchedByKey.has(key)) {
      missingExpected.push(key);
      blockers.push(`missing_expected_key:${key}`);
    }
  }

  if (options.mode === 'COMMIT' && incompleteRelevantGames.length > 0) {
    for (const g of incompleteRelevantGames) {
      blockers.push(`non_final_canonical_game:${g.id}:status=${g.status}`);
    }
  }

  const existingByKey = new Map<string, DbTeamGameStatRow>();
  for (const row of options.existingStats) {
    existingByKey.set(naturalKey(row.gameId, row.teamId), row);
  }

  const plannedCreates: PlannedTeamGameStatMutation[] = [];
  const plannedUpdates: PlannedTeamGameStatMutation[] = [];
  const plannedByKey: Record<string, ManagedTeamGameStatFields> = {};
  let unchangedRows = 0;

  for (const matched of Array.from(matchedByKey.values())) {
    // Skip keys that are duplicated (unsafe)
    if (duplicateKeySet.has(matched.key)) continue;
    plannedByKey[matched.key] = matched.fields;
    const existing = existingByKey.get(matched.key);
    if (!existing) {
      plannedCreates.push({
        gameId: matched.gameId,
        teamId: matched.teamId,
        fields: matched.fields,
      });
      continue;
    }
    if (managedFieldsEqual(existing, matched.fields)) {
      unchangedRows += 1;
      continue;
    }
    plannedUpdates.push({
      gameId: matched.gameId,
      teamId: matched.teamId,
      id: existing.id,
      fields: matched.fields,
    });
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
    mutationsInvoked: false,
    counts: {
      providerRows: options.providerRows.length,
      canonicalGames: options.dbGames.length,
      finalTargetGames: finalRelevantGames.length,
      incompleteTargetGames: incompleteRelevantGames.length,
      expectedFbsParticipantRows: expectedKeys.size,
      resolvedProviderRows: matchedByKey.size,
      ignoredProviderRows,
      unresolvedRows,
      duplicateKeys,
      missingExpectedKeys: missingExpected.length,
      existingRows: options.existingStats.length,
      proposedCreates: plannedCreates.length,
      proposedUpdates: plannedUpdates.length,
      unchangedRows,
    },
    plannedCreates,
    plannedUpdates,
    plannedByKey,
    expectedKeys: Array.from(expectedKeys.keys()),
    matchedKeys: Array.from(matchedByKey.keys()),
  };
}

export function commitEligible(plan: TeamGameStatPlan): boolean {
  return (
    plan.mode === 'COMMIT' && plan.writeSafe && plan.confirmationValid
  );
}

export function buildPreviewExecution(
  providerCalls: number
): TeamGameStatExecutionState {
  return {
    mode: 'PREVIEW',
    commitAttempted: false,
    transactionStarted: false,
    mutationsInvoked: false,
    mutationAttempts: null,
    createCount: null,
    updateCount: null,
    unchangedCount: null,
    commitSucceeded: false,
    postWriteVerificationSucceeded: null,
    error: null,
    providerCalls,
  };
}

export function buildSuccessfulCommitExecution(options: {
  providerCalls: number;
  createCount: number;
  updateCount: number;
  unchangedCount: number;
  postWriteVerificationSucceeded?: boolean;
  error?: string | null;
}): TeamGameStatExecutionState {
  const attempts = options.createCount + options.updateCount;
  return {
    mode: 'COMMIT',
    commitAttempted: true,
    transactionStarted: true,
    mutationsInvoked: attempts > 0,
    mutationAttempts: attempts,
    createCount: options.createCount,
    updateCount: options.updateCount,
    unchangedCount: options.unchangedCount,
    commitSucceeded: true,
    postWriteVerificationSucceeded:
      options.postWriteVerificationSucceeded ?? true,
    error: options.error ?? null,
    providerCalls: options.providerCalls,
  };
}

export function buildRolledBackExecution(options: {
  providerCalls: number;
  mutationAttempts: number;
  error: string;
}): TeamGameStatExecutionState {
  return {
    mode: 'COMMIT',
    commitAttempted: true,
    transactionStarted: true,
    mutationsInvoked: options.mutationAttempts > 0,
    mutationAttempts: options.mutationAttempts,
    createCount: null,
    updateCount: null,
    unchangedCount: null,
    commitSucceeded: false,
    postWriteVerificationSucceeded: null,
    error: options.error,
    providerCalls: options.providerCalls,
  };
}

export function buildFailedCommitExecution(options: {
  providerCalls: number;
  error: string;
}): TeamGameStatExecutionState {
  return {
    mode: 'COMMIT',
    commitAttempted: true,
    transactionStarted: false,
    mutationsInvoked: false,
    mutationAttempts: null,
    createCount: null,
    updateCount: null,
    unchangedCount: null,
    commitSucceeded: false,
    postWriteVerificationSucceeded: null,
    error: options.error,
    providerCalls: options.providerCalls,
  };
}

/**
 * Authoritative TeamGameStat COMMIT inside a transaction callback.
 * Re-reads DB, re-plans, then creates/updates only planned rows.
 */
export async function executeAtomicTeamGameStatCommit(options: {
  plan: TeamGameStatPlan;
  providerRows: CfbdAdvancedGameStatRow[];
  fbsTeamIds: string[];
  teamResolutions: Map<string, TeamResolutionResult>;
  reReadExisting: () => Promise<DbTeamGameStatRow[]>;
  reReadGames?: () => Promise<DbGameRowForStats[]>;
  createRow: (row: PlannedTeamGameStatMutation) => Promise<void>;
  updateRow: (row: PlannedTeamGameStatMutation) => Promise<void>;
}): Promise<{
  createCount: number;
  updateCount: number;
  unchangedCount: number;
  rePlan: TeamGameStatPlan;
  beforeStats: DbTeamGameStatRow[];
}> {
  if (!options.reReadGames) {
    throw new Error(
      'executeAtomicTeamGameStatCommit requires reReadGames callback'
    );
  }

  const beforeStats = await options.reReadExisting();
  const dbGames = await options.reReadGames();

  const rePlan = planTeamGameStats({
    season: options.plan.season,
    week: options.plan.week,
    mode: 'COMMIT',
    confirmation: options.plan.expectedConfirmation,
    providerRows: options.providerRows,
    providerHttpStatus: options.plan.providerHttpStatus,
    providerCalls: options.plan.providerCalls,
    dbGames,
    existingStats: beforeStats,
    fbsTeamIds: options.fbsTeamIds,
    teamResolutions: options.teamResolutions,
  });

  if (!rePlan.writeSafe) {
    throw new Error(
      `transaction aborted: team game stat safety failed: ${rePlan.blockers.join('; ')}`
    );
  }

  for (const row of rePlan.plannedCreates) {
    await options.createRow(row);
  }
  for (const row of rePlan.plannedUpdates) {
    await options.updateRow(row);
  }

  return {
    createCount: rePlan.plannedCreates.length,
    updateCount: rePlan.plannedUpdates.length,
    unchangedCount: rePlan.counts.unchangedRows,
    rePlan,
    beforeStats,
  };
}

export function verifyTeamGameStatPostWrite(options: {
  expectedKeys: string[];
  plannedByKey: Map<string, ManagedTeamGameStatFields>;
  afterRows: DbTeamGameStatRow[];
  expectedCreateCount?: number;
  expectedUpdateCount?: number;
  createCount?: number;
  updateCount?: number;
}): TeamGameStatPostWriteVerification {
  const reasons: string[] = [];
  const afterByKey = new Map<string, DbTeamGameStatRow[]>();
  for (const row of options.afterRows) {
    const key = naturalKey(row.gameId, row.teamId);
    const list = afterByKey.get(key) ?? [];
    list.push(row);
    afterByKey.set(key, list);
  }

  let verifiedKeys = 0;
  for (const key of options.expectedKeys) {
    const rows = afterByKey.get(key) ?? [];
    if (rows.length === 0) {
      reasons.push(`missing_after_write:${key}`);
      continue;
    }
    if (rows.length > 1) {
      reasons.push(`duplicate_after_write:${key} count=${rows.length}`);
      continue;
    }
    const planned = options.plannedByKey.get(key);
    if (!planned) {
      reasons.push(`no_planned_fields_for_expected_key:${key}`);
      continue;
    }
    if (!managedFieldsEqual(rows[0], planned)) {
      reasons.push(`managed_fields_mismatch:${key}`);
      continue;
    }
    verifiedKeys += 1;
  }

  if (
    options.expectedCreateCount !== undefined &&
    options.createCount !== undefined &&
    options.expectedCreateCount !== options.createCount
  ) {
    reasons.push(
      `create_count_mismatch: expected=${options.expectedCreateCount} got=${options.createCount}`
    );
  }
  if (
    options.expectedUpdateCount !== undefined &&
    options.updateCount !== undefined &&
    options.expectedUpdateCount !== options.updateCount
  ) {
    reasons.push(
      `update_count_mismatch: expected=${options.expectedUpdateCount} got=${options.updateCount}`
    );
  }

  return {
    ok: reasons.length === 0,
    reasons,
    afterRows: options.afterRows.length,
    verifiedKeys,
  };
}

export function finalizeTeamGameStatReport(options: {
  plan: TeamGameStatPlan;
  execution: TeamGameStatExecutionState;
  verification: TeamGameStatPostWriteVerification | null;
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
    confirmationValid: options.plan.confirmationValid,
    expectedConfirmation: options.plan.expectedConfirmation,
    blockers: options.plan.blockers,
    counts: options.plan.counts,
    plannedCreates: options.plan.plannedCreates,
    plannedUpdates: options.plan.plannedUpdates,
    plannedByKey: options.plan.plannedByKey,
    expectedKeys: options.plan.expectedKeys,
    matchedKeys: options.plan.matchedKeys,
    mutationsInvoked: options.execution.mutationsInvoked,
    execution: options.execution,
    verification: options.verification,
    meta: {
      venuesCalled: false,
      grading: false,
      odds: false,
      ratings: false,
      betWrites: false,
      marketLineWrites: false,
      gameWrites: false,
      cfbdEffWrites: false,
      ...(options.meta ?? {}),
    },
  };
}

export function resolvePreviewExitCode(writeSafe: boolean): 0 | 1 {
  return writeSafe ? 0 : 1;
}

/** Collect unique provider team/opponent names for batch resolution. */
export function collectProviderTeamNamesFromStats(
  rows: CfbdAdvancedGameStatRow[]
): string[] {
  const names = new Set<string>();
  for (const r of rows) {
    if (r.team) names.add(r.team);
    if (r.opponent) names.add(r.opponent);
  }
  return Array.from(names);
}
