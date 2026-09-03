/**
 * Guarded 2026 weekly CFBD schedule rollover PREVIEW/COMMIT helpers.
 *
 * Reuses audited pure ingest helpers. Does not use writeValidatedScheduleBatch,
 * skipDuplicates, upsert, delete, or outer-client mutations.
 */

import { EXPECTED_2026_FBS_COUNT } from './balanced-v1-preseason-bridge-eval';
import {
  CFBD_BASE_URL_DEFAULT,
  MAX_REGULAR_SEASON_WEEK,
  assertProviderWeeksMatch,
  buildCfbdVenuesUrl,
  buildCfbdWeekGamesUrl,
  collectProviderTeamNames,
  filterAndNormalizeProviderGames,
  isProtectedExistingGame,
  kickoffRangeIso,
  redactSecretLike,
  teamResolutionFailed,
  toScheduleInsertRow,
  validateNormalizedBatch,
  type CfbdProviderGame,
  type CfbdVenue,
  type NormalizedScheduleGame,
  type TeamResolutionResult,
} from './cfbd-schedule-ingest';

export { EXPECTED_2026_FBS_COUNT };
export const SCHEDULE_ROLLOVER_SEASON = 2026;
export const PHASE = 'cfbd-schedule-rollover-2026';
export const CFBD_SCHEDULE_TIMEOUT_MS = 20_000;

export type ScheduleRolloverMode = 'PREVIEW' | 'COMMIT';

export interface ScheduleRolloverCliArgs {
  season: number;
  week: number;
  mode: ScheduleRolloverMode;
  confirmation: string;
  reportPath?: string;
}

export interface DbScheduleGameRow {
  id: string;
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  date: Date;
  venue: string;
  city: string;
  neutralSite: boolean;
  conferenceGame: boolean;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
}

export interface ScheduleMetadataFields {
  date: Date;
  venue: string;
  city: string;
  neutralSite: boolean;
  conferenceGame: boolean;
}

export interface PlannedScheduleCreate {
  row: ReturnType<typeof toScheduleInsertRow>;
}

export interface PlannedScheduleUpdate {
  id: string;
  fields: ScheduleMetadataFields;
}

export interface ScheduleRolloverPlan {
  phase: typeof PHASE;
  season: number;
  week: number;
  generatedAt: string;
  mode: ScheduleRolloverMode;
  providerCalls: number;
  providerHttpStatus: number | null;
  providerVenueHttpStatus: number | null;
  providerRowCount: number;
  normalizedFbsVsFbsCount: number;
  skippedNonFbsCount: number;
  authoritativeFbsCount: number;
  resolutionCounts: {
    distinctIncomingTeams: number;
    exactCanonical: number;
    alias: number;
    missing: number;
    ambiguous: number;
    conflicting: number;
  };
  providerKickoffRange: { earliest: string | null; latest: string | null };
  normalizedKickoffRange: { earliest: string | null; latest: string | null };
  existingDbRowCount: number;
  proposedCreates: number;
  proposedMetadataUpdates: number;
  unchangedRows: number;
  dbOnlyRowCount: number;
  protectedRowCount: number;
  plannedCreateIds: string[];
  plannedUpdateIds: string[];
  unchangedIds: string[];
  dbOnlyIds: string[];
  protectedIds: string[];
  plannedCreates: PlannedScheduleCreate[];
  plannedUpdates: PlannedScheduleUpdate[];
  normalizedGames: NormalizedScheduleGame[];
  blockers: string[];
  writeSafe: boolean;
  confirmationValid: boolean;
  expectedConfirmation: string;
  mutationsInvoked: false;
  planFingerprint: string;
}

export interface ScheduleRolloverExecutionState {
  mode: ScheduleRolloverMode;
  commitAttempted: boolean;
  transactionStarted: boolean;
  mutationsInvoked: boolean;
  createCount: number | null;
  updateCount: number | null;
  commitSucceeded: boolean;
  postWriteVerificationSucceeded: boolean | null;
  error: string | null;
  providerCalls: number;
}

export interface ScheduleRolloverPostWriteVerification {
  ok: boolean;
  reasons: string[];
  afterRows: number;
  verifiedIds: number;
}

export function expectedScheduleRolloverConfirmation(week: number): string {
  return `WRITE_2026_WEEK_${week}_SCHEDULES`;
}

export function parseScheduleRolloverCliArgs(argv: string[]): {
  ok: boolean;
  args: ScheduleRolloverCliArgs | null;
  errors: string[];
} {
  const errors: string[] = [];
  let season: number | null = null;
  let week: number | null = null;
  let mode: ScheduleRolloverMode = 'PREVIEW';
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
        } else mode = m as ScheduleRolloverMode;
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

  if (season !== SCHEDULE_ROLLOVER_SEASON) {
    errors.push(`season must equal ${SCHEDULE_ROLLOVER_SEASON}`);
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
    week != null ? expectedScheduleRolloverConfirmation(week) : '';
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

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function metadataFieldsFromNormalized(
  game: NormalizedScheduleGame
): ScheduleMetadataFields {
  return {
    date: game.date,
    venue: game.venue || 'TBD',
    city: game.city || 'TBD',
    neutralSite: game.neutralSite,
    conferenceGame: game.conferenceGame,
  };
}

export function metadataEqual(
  existing: DbScheduleGameRow,
  incoming: NormalizedScheduleGame
): boolean {
  const fields = metadataFieldsFromNormalized(incoming);
  return (
    toDate(existing.date).getTime() === fields.date.getTime() &&
    (existing.venue || 'TBD') === fields.venue &&
    (existing.city || 'TBD') === fields.city &&
    Boolean(existing.neutralSite) === fields.neutralSite &&
    Boolean(existing.conferenceGame) === fields.conferenceGame
  );
}

export function validateAuthoritativeFbsMembership(fbsTeamIds: string[]): {
  ok: boolean;
  distinct: number;
  duplicateIds: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  const distinctSet = new Set(fbsTeamIds);
  const duplicateIds = fbsTeamIds.length - distinctSet.size;
  if (fbsTeamIds.length !== EXPECTED_2026_FBS_COUNT) {
    reasons.push(
      `authoritative FBS membership must be ${EXPECTED_2026_FBS_COUNT} rows (got ${fbsTeamIds.length})`
    );
  }
  if (distinctSet.size !== EXPECTED_2026_FBS_COUNT) {
    reasons.push(
      `authoritative FBS membership must be ${EXPECTED_2026_FBS_COUNT} distinct team IDs (got ${distinctSet.size})`
    );
  }
  if (duplicateIds > 0) {
    reasons.push(`duplicate FBS membership IDs: ${duplicateIds}`);
  }
  return {
    ok: reasons.length === 0,
    distinct: distinctSet.size,
    duplicateIds,
    reasons,
  };
}

export function planFingerprint(parts: {
  createIds: string[];
  updateIds: string[];
  unchangedIds: string[];
  dbOnlyIds: string[];
  fbsTeamIds: string[];
}): string {
  const sort = (a: string[]) => [...a].sort().join(',');
  return [
    sort(parts.createIds),
    sort(parts.updateIds),
    sort(parts.unchangedIds),
    sort(parts.dbOnlyIds),
    sort(parts.fbsTeamIds),
  ].join('||');
}

export function kickoffRangeFromProvider(
  games: CfbdProviderGame[]
): { earliest: string | null; latest: string | null } {
  const times: number[] = [];
  for (const g of games) {
    const raw = g.startDate ?? g.start_date;
    if (!raw) continue;
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) times.push(d.getTime());
  }
  if (times.length === 0) return { earliest: null, latest: null };
  return {
    earliest: new Date(Math.min(...times)).toISOString(),
    latest: new Date(Math.max(...times)).toISOString(),
  };
}

export async function fetchGuardedCfbdScheduleWeek(options: {
  season: number;
  week: number;
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<{
  games: CfbdProviderGame[];
  venueCityByName: Map<string, string>;
  providerCalls: number;
  providerHttpStatus: number;
  providerVenueHttpStatus: number | null;
}> {
  if (!options.apiKey || !String(options.apiKey).trim()) {
    throw new Error('CFBD_API_KEY is missing or empty');
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? CFBD_SCHEDULE_TIMEOUT_MS;
  const baseUrl = options.baseUrl ?? CFBD_BASE_URL_DEFAULT;
  const url = buildCfbdWeekGamesUrl(options.season, options.week, baseUrl);

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
          `CFBD games request timed out after ${timeoutMs}ms`
        )
      );
    }
    throw new Error(redactSecretLike(`CFBD games fetch failed: ${msg}`));
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`CFBD games HTTP ${res.status}`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error('CFBD games payload is not valid JSON');
  }
  if (!Array.isArray(body)) {
    throw new Error('CFBD games payload is not an array');
  }

  const games = body as CfbdProviderGame[];
  let providerCalls = 1;
  let providerVenueHttpStatus: number | null = null;
  const venueCityByName = new Map<string, string>();

  try {
    const venuesRes = await fetchImpl(buildCfbdVenuesUrl(baseUrl), {
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        Accept: 'application/json',
      },
    });
    providerCalls += 1;
    providerVenueHttpStatus = venuesRes.status;
    if (venuesRes.ok) {
      const venues = (await venuesRes.json()) as CfbdVenue[];
      if (Array.isArray(venues)) {
        for (const v of venues) {
          if (v.name && v.city) {
            venueCityByName.set(v.name.toLowerCase(), v.city);
          }
        }
      }
    }
  } catch {
    // Venues remain optional enrichment.
  }

  return {
    games,
    venueCityByName,
    providerCalls,
    providerHttpStatus: res.status,
    providerVenueHttpStatus,
  };
}

export function planScheduleRollover(options: {
  season: number;
  week: number;
  mode: ScheduleRolloverMode;
  confirmation: string;
  providerGames: CfbdProviderGame[];
  venueCityByName?: Map<string, string>;
  providerHttpStatus: number | null;
  providerVenueHttpStatus?: number | null;
  providerCalls: number;
  fbsTeamIds: string[];
  existingGames: DbScheduleGameRow[];
  teamResolutions: Map<string, TeamResolutionResult>;
  generatedAt?: string;
}): ScheduleRolloverPlan {
  const blockers: string[] = [];
  const expectedConfirmation = expectedScheduleRolloverConfirmation(
    options.week
  );
  const confirmationValid =
    options.mode === 'COMMIT'
      ? options.confirmation === expectedConfirmation
      : true;

  if (options.season !== SCHEDULE_ROLLOVER_SEASON) {
    blockers.push(`season must equal ${SCHEDULE_ROLLOVER_SEASON}`);
  }

  const fbsGate = validateAuthoritativeFbsMembership(options.fbsTeamIds);
  blockers.push(...fbsGate.reasons);
  const fbsSet = new Set(options.fbsTeamIds);

  if (options.providerGames.length === 0) {
    blockers.push('empty provider games');
  }

  const wrongSeason = options.providerGames.filter(
    (g) => g.season != null && g.season !== options.season
  );
  if (wrongSeason.length) {
    blockers.push(
      `wrong provider season present (${wrongSeason.length} row(s))`
    );
  }

  const weekIssues = assertProviderWeeksMatch(
    options.providerGames,
    options.week
  );
  for (const issue of weekIssues) {
    blockers.push(`${issue.code}: ${issue.message}`);
  }

  const resolutionList = [...options.teamResolutions.values()];
  const resolutionCounts = {
    distinctIncomingTeams: resolutionList.length,
    exactCanonical: resolutionList.filter((r) => r.kind === 'exact_canonical')
      .length,
    alias: resolutionList.filter((r) => r.kind === 'alias').length,
    missing: resolutionList.filter((r) => r.kind === 'missing').length,
    ambiguous: resolutionList.filter((r) => r.kind === 'ambiguous').length,
    conflicting: resolutionList.filter((r) => r.kind === 'conflicting').length,
  };
  if (teamResolutionFailed(resolutionList)) {
    blockers.push('unresolved or ambiguous FBS team');
  }

  const { games: normalized, skippedNonFbs, kickoffIssues } =
    filterAndNormalizeProviderGames(
      options.providerGames,
      options.season,
      options.week,
      options.teamResolutions,
      options.venueCityByName
    );
  for (const issue of kickoffIssues) {
    blockers.push(`${issue.code}: ${issue.message}`);
  }

  const batch = validateNormalizedBatch(normalized, options.season, options.week, {
    allowEmpty: options.providerGames.length === 0,
    source: 'cfbd',
  });
  for (const issue of batch.issues) {
    blockers.push(`${issue.code}: ${issue.message}`);
  }

  for (const g of normalized) {
    if (!fbsSet.has(g.homeTeamId) || !fbsSet.has(g.awayTeamId)) {
      blockers.push(
        `non-authoritative FBS mapping: ${g.id} (${g.awayTeamId}@${g.homeTeamId})`
      );
    }
  }

  const existingById = new Map(options.existingGames.map((g) => [g.id, g]));
  const incomingIds = new Set(normalized.map((g) => g.id));
  const plannedCreates: PlannedScheduleCreate[] = [];
  const plannedUpdates: PlannedScheduleUpdate[] = [];
  const unchangedIds: string[] = [];
  const protectedIds: string[] = [];

  for (const g of normalized) {
    const existing = existingById.get(g.id);
    if (!existing) {
      plannedCreates.push({ row: toScheduleInsertRow(g) });
      continue;
    }
    if (
      existing.season !== g.season ||
      existing.week !== g.week ||
      existing.homeTeamId !== g.homeTeamId ||
      existing.awayTeamId !== g.awayTeamId
    ) {
      blockers.push(
        `identity fields differ for existing game ${g.id}; season/week/home/away are not updatable`
      );
      continue;
    }
    const protectedRow = isProtectedExistingGame(existing);
    if (protectedRow) protectedIds.push(g.id);
    if (metadataEqual(existing, g)) {
      unchangedIds.push(g.id);
      continue;
    }
    if (protectedRow) {
      blockers.push(
        `protected/scored game blocks metadata update: ${g.id}`
      );
      continue;
    }
    plannedUpdates.push({
      id: g.id,
      fields: metadataFieldsFromNormalized(g),
    });
  }

  const dbOnlyIds = options.existingGames
    .map((g) => g.id)
    .filter((id) => !incomingIds.has(id));
  if (dbOnlyIds.length) {
    blockers.push(
      `DB-only Game rows absent from provider (investigate; no automatic delete): ${dbOnlyIds.join(', ')}`
    );
  }

  const writeSafe = blockers.length === 0;
  const fingerprint = planFingerprint({
    createIds: plannedCreates.map((c) => c.row.id),
    updateIds: plannedUpdates.map((u) => u.id),
    unchangedIds,
    dbOnlyIds,
    fbsTeamIds: options.fbsTeamIds,
  });

  return {
    phase: PHASE,
    season: options.season,
    week: options.week,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    mode: options.mode,
    providerCalls: options.providerCalls,
    providerHttpStatus: options.providerHttpStatus,
    providerVenueHttpStatus: options.providerVenueHttpStatus ?? null,
    providerRowCount: options.providerGames.length,
    normalizedFbsVsFbsCount: normalized.length,
    skippedNonFbsCount: skippedNonFbs,
    authoritativeFbsCount: options.fbsTeamIds.length,
    resolutionCounts,
    providerKickoffRange: kickoffRangeFromProvider(options.providerGames),
    normalizedKickoffRange: kickoffRangeIso(normalized),
    existingDbRowCount: options.existingGames.length,
    proposedCreates: plannedCreates.length,
    proposedMetadataUpdates: plannedUpdates.length,
    unchangedRows: unchangedIds.length,
    dbOnlyRowCount: dbOnlyIds.length,
    protectedRowCount: protectedIds.length,
    plannedCreateIds: plannedCreates.map((c) => c.row.id),
    plannedUpdateIds: plannedUpdates.map((u) => u.id),
    unchangedIds,
    dbOnlyIds,
    protectedIds,
    plannedCreates,
    plannedUpdates,
    normalizedGames: normalized,
    blockers,
    writeSafe,
    confirmationValid,
    expectedConfirmation,
    mutationsInvoked: false,
    planFingerprint: fingerprint,
  };
}

export function commitEligible(plan: ScheduleRolloverPlan): boolean {
  return plan.mode === 'COMMIT' && plan.writeSafe && plan.confirmationValid;
}

export function buildPreviewExecution(
  providerCalls: number
): ScheduleRolloverExecutionState {
  return {
    mode: 'PREVIEW',
    commitAttempted: false,
    transactionStarted: false,
    mutationsInvoked: false,
    createCount: null,
    updateCount: null,
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
}): ScheduleRolloverExecutionState {
  return {
    mode: 'COMMIT',
    commitAttempted: true,
    transactionStarted: true,
    mutationsInvoked: options.createCount + options.updateCount > 0,
    createCount: options.createCount,
    updateCount: options.updateCount,
    commitSucceeded: true,
    postWriteVerificationSucceeded: true,
    error: null,
    providerCalls: options.providerCalls,
  };
}

export function buildRolledBackExecution(options: {
  providerCalls: number;
  error: string;
  mutationsInvoked?: boolean;
  postWriteVerificationSucceeded?: false | null;
}): ScheduleRolloverExecutionState {
  return {
    mode: 'COMMIT',
    commitAttempted: true,
    transactionStarted: true,
    mutationsInvoked: options.mutationsInvoked ?? false,
    createCount: null,
    updateCount: null,
    commitSucceeded: false,
    postWriteVerificationSucceeded:
      options.postWriteVerificationSucceeded === false ? false : null,
    error: options.error,
    providerCalls: options.providerCalls,
  };
}

export function buildFailedCommitExecution(options: {
  providerCalls: number;
  error: string;
}): ScheduleRolloverExecutionState {
  return {
    mode: 'COMMIT',
    commitAttempted: true,
    transactionStarted: false,
    mutationsInvoked: false,
    createCount: null,
    updateCount: null,
    commitSucceeded: false,
    postWriteVerificationSucceeded: null,
    error: options.error,
    providerCalls: options.providerCalls,
  };
}

export function resolvePreviewExitCode(writeSafe: boolean): number {
  return writeSafe ? 0 : 1;
}

export function verifyScheduleRolloverPostWrite(options: {
  plan: ScheduleRolloverPlan;
  beforeRows: DbScheduleGameRow[];
  afterRows: DbScheduleGameRow[];
  createCount: number;
  updateCount: number;
}): ScheduleRolloverPostWriteVerification {
  const reasons: string[] = [];
  const afterById = new Map<string, DbScheduleGameRow[]>();
  for (const row of options.afterRows) {
    const list = afterById.get(row.id) ?? [];
    list.push(row);
    afterById.set(row.id, list);
  }
  const beforeById = new Map(options.beforeRows.map((r) => [r.id, r]));

  let verifiedIds = 0;
  for (const g of options.plan.normalizedGames) {
    const rows = afterById.get(g.id) ?? [];
    if (rows.length === 0) {
      reasons.push(`missing_after_write:${g.id}`);
      continue;
    }
    if (rows.length > 1) {
      reasons.push(`duplicate_after_write:${g.id} count=${rows.length}`);
      continue;
    }
    const row = rows[0];
    if (row.season !== g.season) {
      reasons.push(`season_mismatch:${g.id}`);
    }
    if (row.week !== g.week) {
      reasons.push(`week_mismatch:${g.id}`);
    }
    if (row.homeTeamId !== g.homeTeamId || row.awayTeamId !== g.awayTeamId) {
      reasons.push(`team_mismatch:${g.id}`);
    }
    if (toDate(row.date).getTime() !== g.date.getTime()) {
      reasons.push(`kickoff_mismatch:${g.id}`);
    }
    const fields = metadataFieldsFromNormalized(g);
    if (
      (row.venue || 'TBD') !== fields.venue ||
      (row.city || 'TBD') !== fields.city ||
      Boolean(row.neutralSite) !== fields.neutralSite ||
      Boolean(row.conferenceGame) !== fields.conferenceGame
    ) {
      reasons.push(`metadata_mismatch:${g.id}`);
    }
    const before = beforeById.get(g.id);
    if (before && isProtectedExistingGame(before)) {
      if (
        before.homeScore !== row.homeScore ||
        before.awayScore !== row.awayScore ||
        String(before.status) !== String(row.status)
      ) {
        reasons.push(`protected_status_changed:${g.id}`);
      }
    }
    verifiedIds += 1;
  }

  const expectedIds = new Set(options.plan.normalizedGames.map((g) => g.id));
  for (const row of options.afterRows) {
    if (!expectedIds.has(row.id)) {
      reasons.push(`unexpected_db_only_after_write:${row.id}`);
    }
  }

  if (options.createCount !== options.plan.proposedCreates) {
    reasons.push(
      `create_count_mismatch actual=${options.createCount} planned=${options.plan.proposedCreates}`
    );
  }
  if (options.updateCount !== options.plan.proposedMetadataUpdates) {
    reasons.push(
      `update_count_mismatch actual=${options.updateCount} planned=${options.plan.proposedMetadataUpdates}`
    );
  }
  if (options.afterRows.length !== options.plan.normalizedGames.length) {
    reasons.push(
      `after_count_mismatch actual=${options.afterRows.length} expected=${options.plan.normalizedGames.length}`
    );
  }

  return {
    ok: reasons.length === 0,
    reasons,
    afterRows: options.afterRows.length,
    verifiedIds,
  };
}

/**
 * Authoritative schedule COMMIT inside a transaction callback.
 * All re-reads and mutations must be supplied via tx-backed callbacks.
 * Verification failure throws so Serializable transaction rolls back.
 */
export async function executeAtomicScheduleRolloverCommit(options: {
  plan: ScheduleRolloverPlan;
  providerGames: CfbdProviderGame[];
  venueCityByName: Map<string, string>;
  teamResolutions: Map<string, TeamResolutionResult>;
  reReadFbsTeamIds: () => Promise<string[]>;
  reReadGames: () => Promise<DbScheduleGameRow[]>;
  createRow: (row: PlannedScheduleCreate) => Promise<void>;
  updateRow: (row: PlannedScheduleUpdate) => Promise<void>;
}): Promise<{
  createCount: number;
  updateCount: number;
  rePlan: ScheduleRolloverPlan;
  beforeRows: DbScheduleGameRow[];
  verification: ScheduleRolloverPostWriteVerification;
}> {
  const fbsTeamIds = await options.reReadFbsTeamIds();
  const beforeRows = await options.reReadGames();

  const rePlan = planScheduleRollover({
    season: options.plan.season,
    week: options.plan.week,
    mode: 'COMMIT',
    confirmation: options.plan.expectedConfirmation,
    providerGames: options.providerGames,
    venueCityByName: options.venueCityByName,
    providerHttpStatus: options.plan.providerHttpStatus,
    providerVenueHttpStatus: options.plan.providerVenueHttpStatus,
    providerCalls: options.plan.providerCalls,
    fbsTeamIds,
    existingGames: beforeRows,
    teamResolutions: options.teamResolutions,
  });

  if (!rePlan.writeSafe) {
    throw new Error(
      `transaction aborted: schedule safety failed: ${rePlan.blockers.join('; ')}`
    );
  }
  if (rePlan.planFingerprint !== options.plan.planFingerprint) {
    throw new Error(
      'transaction aborted: DB state differs from PREVIEW plan fingerprint'
    );
  }

  for (const row of rePlan.plannedCreates) {
    await options.createRow(row);
  }
  for (const row of rePlan.plannedUpdates) {
    await options.updateRow(row);
  }

  const createCount = rePlan.plannedCreates.length;
  const updateCount = rePlan.plannedUpdates.length;
  const afterRows = await options.reReadGames();
  const verification = verifyScheduleRolloverPostWrite({
    plan: rePlan,
    beforeRows,
    afterRows,
    createCount,
    updateCount,
  });
  if (!verification.ok) {
    throw new Error(
      `post-write verification failed: ${verification.reasons.join('; ')}`
    );
  }

  return { createCount, updateCount, rePlan, beforeRows, verification };
}

export function finalizeScheduleRolloverReport(options: {
  plan: ScheduleRolloverPlan;
  execution: ScheduleRolloverExecutionState;
  verification: ScheduleRolloverPostWriteVerification | null;
  meta?: Record<string, unknown>;
}): Record<string, unknown> {
  const {
    plannedCreates: _c,
    plannedUpdates: _u,
    normalizedGames: _n,
    ...publicPlan
  } = options.plan;
  void _c;
  void _u;
  void _n;
  return {
    ...publicPlan,
    execution: options.execution,
    verification: options.verification,
    ...options.meta,
  };
}
