/**
 * Isolated CFBD schedule-only helpers (preseason).
 *
 * Phase 2C-1A2 executable surface (ingest-schedules / preview script) is PREVIEW-ONLY.
 * Guarded 2026 write surface is apps/jobs/write-cfbd-schedules-2026.ts.
 * apps/jobs/write-schedules.ts is legacy / REPAIR_BEFORE_USE / NOT AUTHORIZED.
 * Preview pathway must never call writeValidatedScheduleBatch.
 *
 * No ratings, odds, weather, injuries, talent, bets, scores, grading, or PBP.
 * No team stub creation. No mock adapters.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export const CFBD_BASE_URL_DEFAULT = 'https://api.collegefootballdata.com';
export const MAX_REGULAR_SEASON_WEEK = 20;

export const PREVIEW_ONLY_WRITE_DISABLED_MESSAGE =
  'Production schedule writes are disabled. Phase 2C-1B approval is required. Re-run with --preview.';

export type TeamResolutionKind =
  | 'exact_canonical'
  | 'alias'
  | 'missing'
  | 'ambiguous'
  | 'conflicting';

export interface TeamRecord {
  id: string;
  name: string;
}

/**
 * Narrow query-only store for schedule preview.
 * Must not expose Prisma mutation methods or raw SQL execution.
 */
export interface ReadOnlyScheduleStore {
  findTeamById(id: string): Promise<TeamRecord | null>;
  findTeamsByNameInsensitive(name: string): Promise<TeamRecord[]>;
  findGamesForSeasonWeek(season: number, week: number): Promise<DbGameRow[]>;
}

/** Adapter used by team resolution against a ReadOnlyScheduleStore. */
export interface TeamLookup {
  findById(id: string): Promise<TeamRecord | null>;
  findByNameInsensitive(name: string): Promise<TeamRecord[]>;
}

export function teamLookupFromStore(store: ReadOnlyScheduleStore): TeamLookup {
  return {
    findById: (id) => store.findTeamById(id),
    findByNameInsensitive: (name) => store.findTeamsByNameInsensitive(name),
  };
}

/**
 * Bind only read query methods from a Prisma-like client.
 * The returned object never retains a reference usable for mutations.
 */
export function createPrismaReadOnlyScheduleStore(prisma: {
  team: {
    findUnique(args: unknown): Promise<TeamRecord | null>;
    findMany(args: unknown): Promise<TeamRecord[]>;
  };
  game: {
    findMany(args: unknown): Promise<DbGameRow[]>;
  };
}): ReadOnlyScheduleStore {
  const findTeamById = prisma.team.findUnique.bind(prisma.team);
  const findTeams = prisma.team.findMany.bind(prisma.team);
  const findGames = prisma.game.findMany.bind(prisma.game);

  return {
    async findTeamById(id: string): Promise<TeamRecord | null> {
      return findTeamById({
        where: { id },
        select: { id: true, name: true },
      });
    },
    async findTeamsByNameInsensitive(name: string): Promise<TeamRecord[]> {
      return findTeams({
        where: { name: { equals: name, mode: 'insensitive' } },
        select: { id: true, name: true },
      });
    },
    async findGamesForSeasonWeek(
      season: number,
      week: number
    ): Promise<DbGameRow[]> {
      return findGames({
        where: { season, week },
        select: {
          id: true,
          season: true,
          week: true,
          homeTeamId: true,
          awayTeamId: true,
          date: true,
          homeScore: true,
          awayScore: true,
          status: true,
        },
      });
    },
  };
}

export interface ScheduleOnlyArgs {
  season: number;
  week: number;
  preview: boolean;
}

export interface ParseArgsResult {
  ok: boolean;
  args?: ScheduleOnlyArgs;
  errors: string[];
}

export interface CfbdProviderGame {
  id?: number;
  season: number;
  week: number;
  seasonType?: string;
  startDate?: string;
  start_date?: string;
  neutralSite?: boolean;
  conferenceGame?: boolean;
  homeTeam: string;
  awayTeam: string;
  homeClassification?: string;
  awayClassification?: string;
  venue?: string;
  venueId?: number;
  completed?: boolean;
  homePoints?: number | null;
  awayPoints?: number | null;
}

export interface CfbdVenue {
  id?: number;
  name?: string;
  city?: string;
  timezone?: string;
}

export interface NormalizedScheduleGame {
  id: string;
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  /** Normalized UTC instant (only when provider string had an explicit zone). */
  date: Date;
  /** Raw provider kickoff string (preserved for preview reporting). */
  rawKickoff: string;
  providerWeek: number;
  venue: string;
  city: string;
  neutralSite: boolean;
  conferenceGame: boolean;
  providerHomeName: string;
  providerAwayName: string;
}

export interface TeamResolutionResult {
  providerName: string;
  slugCandidate: string;
  kind: TeamResolutionKind;
  resolvedId: string | null;
  detail?: string;
}

export interface BatchValidationIssue {
  code: string;
  message: string;
}

export interface BatchValidationResult {
  ok: boolean;
  issues: BatchValidationIssue[];
}

export interface DbGameRow {
  id: string;
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  date: Date;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
}

export interface DbComparison {
  existingCount: number;
  existingIds: string[];
  wouldInsertIds: string[];
  wouldUpdateIds: string[];
  dbOnlyIds: string[];
}

export interface ScheduleWriteDeps {
  createMany(games: Array<Record<string, unknown>>): Promise<number>;
  updateScheduleFields(
    id: string,
    data: {
      date: Date;
      venue: string;
      city: string;
      neutralSite: boolean;
      conferenceGame: boolean;
    }
  ): Promise<void>;
  /** Re-read existing rows for the week inside the transaction when practical. */
  loadExistingForWeek(season: number, week: number): Promise<DbGameRow[]>;
  /** Required — nontransactional fallback is not allowed. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

export interface ScheduleWriteResult {
  inserted: number;
  updated: number;
  insertedIds: string[];
  updatedIds: string[];
  dbOnlyIds: string[];
}

export interface PostWriteVerification {
  ok: boolean;
  issues: BatchValidationIssue[];
  expectedNormalizedCount: number;
  actualDbCount: number;
  insertedCount: number;
  updatedCount: number;
  missingExpectedIds: string[];
  unexpectedDbOnlyIds: string[];
  retainedDbOnlyIds: string[];
}

export function buildWriteConfirmPhrase(week: number): string {
  return `WRITE_2026_WEEK_${week}`;
}

export interface WriteScheduleArgs {
  season: number;
  week: number;
  confirmWrite: string;
}

export interface ParseWriteArgsResult {
  ok: boolean;
  args?: WriteScheduleArgs;
  errors: string[];
}

/**
 * Parse production one-week write CLI args.
 * Season must be 2026. Week must be a single integer 1..MAX. Confirmation must match exactly.
 */
export function parseWriteScheduleArgs(argv: string[]): ParseWriteArgsResult {
  const errors: string[] = [];
  let season: number | undefined;
  let week: number | undefined;
  let confirmWrite: string | undefined;
  const unknown: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--season') {
      const raw = argv[++i];
      if (raw === undefined || raw === '') {
        errors.push('--season requires an integer value');
        continue;
      }
      if (/[,-]/.test(raw)) {
        errors.push(`--season rejects lists/ranges: ${raw}`);
        continue;
      }
      const n = Number(raw);
      if (!Number.isInteger(n) || Number.isNaN(n)) {
        errors.push(`--season must be an integer (got ${raw})`);
        continue;
      }
      season = n;
      continue;
    }
    if (arg === '--week') {
      const raw = argv[++i];
      if (raw === undefined || raw === '') {
        errors.push('--week requires a single integer value');
        continue;
      }
      if (raw.includes(',') || raw.includes('-')) {
        errors.push(
          `--week accepts exactly one integer (no comma lists or ranges). Got: ${raw}`
        );
        continue;
      }
      const n = Number(raw);
      if (!Number.isInteger(n) || Number.isNaN(n)) {
        errors.push(`--week must be an integer (got ${raw})`);
        continue;
      }
      week = n;
      continue;
    }
    if (arg === '--confirm-write') {
      const raw = argv[++i];
      if (raw === undefined || raw === '') {
        errors.push('--confirm-write requires the exact confirmation phrase');
        continue;
      }
      confirmWrite = raw;
      continue;
    }
    if (arg === '--weeks') {
      errors.push('Use singular --week <integer>, not --weeks');
      continue;
    }
    if (arg === '--preview') {
      errors.push(
        '--preview is not valid on the write CLI; use the preview pathway instead'
      );
      continue;
    }
    if (arg.startsWith('-')) {
      unknown.push(arg);
      continue;
    }
    unknown.push(arg);
  }

  if (unknown.length) {
    errors.push(`Unknown flag(s) or arguments: ${unknown.join(', ')}`);
  }
  if (season === undefined) {
    errors.push('--season is required');
  } else if (season !== 2026) {
    errors.push(`--season must be 2026 for Phase 2C-1B (got ${season})`);
  }
  if (week === undefined) {
    errors.push('--week is required');
  } else if (week === 0) {
    errors.push(
      '--week 0 is prohibited (CFBD has no provider week 0 for 2026; use week 1+)'
    );
  } else if (week < 1 || week > MAX_REGULAR_SEASON_WEEK) {
    errors.push(
      `--week must be between 1 and ${MAX_REGULAR_SEASON_WEEK} inclusive (got ${week})`
    );
  }
  if (confirmWrite === undefined) {
    errors.push('--confirm-write is required');
  } else if (week !== undefined && week >= 1) {
    const expected = buildWriteConfirmPhrase(week);
    if (confirmWrite !== expected) {
      errors.push(
        `--confirm-write must be exactly "${expected}" (got "${confirmWrite}")`
      );
    }
  }

  // Environment variables cannot bypass confirmation — parse never reads them for auth.
  if (errors.length) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    args: { season: season!, week: week!, confirmWrite: confirmWrite! },
    errors: [],
  };
}

/** Every provider row must carry the requested week (fail closed on full-season leakage). */
export function assertProviderWeeksMatch(
  games: CfbdProviderGame[],
  week: number
): BatchValidationIssue[] {
  const issues: BatchValidationIssue[] = [];
  const unexpected = [
    ...new Set(games.map((g) => g.week).filter((w) => w !== week)),
  ].sort((a, b) => a - b);
  if (unexpected.length) {
    issues.push({
      code: 'unexpected_provider_week',
      message: `Provider returned week(s) [${unexpected.join(', ')}] in addition to requested week ${week}`,
    });
  }
  return issues;
}

export function isProtectedExistingGame(row: DbGameRow): boolean {
  if (row.homeScore != null || row.awayScore != null) return true;
  const status = String(row.status || '').toLowerCase();
  return status === 'final' || status === 'in_progress' || status === 'completed';
}

export function findProtectedUpdateTargets(
  wouldUpdateIds: string[],
  existing: DbGameRow[]
): DbGameRow[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  return wouldUpdateIds
    .map((id) => byId.get(id))
    .filter((row): row is DbGameRow => !!row && isProtectedExistingGame(row));
}

export function kickoffRangeIso(games: NormalizedScheduleGame[]): {
  earliest: string | null;
  latest: string | null;
} {
  if (games.length === 0) return { earliest: null, latest: null };
  const times = games.map((g) => g.date.getTime());
  return {
    earliest: new Date(Math.min(...times)).toISOString(),
    latest: new Date(Math.max(...times)).toISOString(),
  };
}

/**
 * Atomic one-week schedule write. Accurate insert/update counts.
 * Inserts only missing IDs; updates only unprotected existing IDs.
 * Never deletes DB-only rows. Never writes scores/status on update.
 */
export async function writeValidatedScheduleBatch(
  games: NormalizedScheduleGame[],
  deps: ScheduleWriteDeps,
  expected: { season: number; week: number }
): Promise<ScheduleWriteResult> {
  if (typeof deps.transaction !== 'function') {
    throw new Error(
      'writeValidatedScheduleBatch requires deps.transaction — nontransactional writes are not allowed'
    );
  }
  if (typeof deps.loadExistingForWeek !== 'function') {
    throw new Error(
      'writeValidatedScheduleBatch requires deps.loadExistingForWeek'
    );
  }

  const precheck = validateNormalizedBatch(
    games,
    expected.season,
    expected.week,
    {
      allowEmpty: false,
      source: 'cfbd',
    }
  );
  if (!precheck.ok) {
    throw new Error(
      `writeValidatedScheduleBatch refused: ${precheck.issues.map((i) => i.code).join(', ')}`
    );
  }

  return deps.transaction(async () => {
    const existingNow = await deps.loadExistingForWeek(
      expected.season,
      expected.week
    );
    const comparison = compareToExistingDb(games, existingNow);
    const protectedRows = findProtectedUpdateTargets(
      comparison.wouldUpdateIds,
      existingNow
    );
    if (protectedRows.length) {
      throw new Error(
        `Refusing metadata update for protected games with scores/completed status: ${protectedRows
          .map((r) => r.id)
          .join(', ')}`
      );
    }

    const byId = new Map(games.map((g) => [g.id, g]));
    const insertGames = comparison.wouldInsertIds.map((id) => byId.get(id)!);
    const updateGames = comparison.wouldUpdateIds.map((id) => byId.get(id)!);

    let inserted = 0;
    if (insertGames.length) {
      inserted = await deps.createMany(insertGames.map(toScheduleInsertRow));
    }

    for (const g of updateGames) {
      await deps.updateScheduleFields(g.id, {
        date: g.date,
        venue: g.venue || 'TBD',
        city: g.city || 'TBD',
        neutralSite: g.neutralSite,
        conferenceGame: g.conferenceGame,
      });
    }

    return {
      inserted,
      updated: updateGames.length,
      insertedIds: comparison.wouldInsertIds,
      updatedIds: comparison.wouldUpdateIds,
      dbOnlyIds: comparison.dbOnlyIds,
    };
  });
}

export function verifyPostWriteSchedule(options: {
  season: number;
  week: number;
  normalized: NormalizedScheduleGame[];
  writeResult: ScheduleWriteResult;
  actualRows: DbGameRow[];
  preWriteComparison: DbComparison;
}): PostWriteVerification {
  const issues: BatchValidationIssue[] = [];
  const expectedIds = new Set(options.normalized.map((g) => g.id));
  const actualIds = options.actualRows.map((r) => r.id);
  const actualSet = new Set(actualIds);

  const missingExpectedIds = [...expectedIds].filter((id) => !actualSet.has(id));
  const unexpectedDbOnlyIds = actualIds.filter((id) => !expectedIds.has(id));
  // DB-only rows that were present pre-write are intentionally retained
  const retainedAllowed = new Set(options.writeResult.dbOnlyIds);
  const unexpectedStructural = unexpectedDbOnlyIds.filter(
    (id) => !retainedAllowed.has(id)
  );

  if (missingExpectedIds.length) {
    issues.push({
      code: 'missing_expected_id',
      message: `Missing expected IDs: ${missingExpectedIds.join(', ')}`,
    });
  }
  if (unexpectedStructural.length) {
    issues.push({
      code: 'unexpected_db_row',
      message: `Unexpected DB-only IDs after write: ${unexpectedStructural.join(', ')}`,
    });
  }

  const idCounts = new Map<string, number>();
  for (const id of actualIds) {
    idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  }
  const duplicates = [...idCounts.entries()]
    .filter(([, n]) => n > 1)
    .map(([id]) => id);
  if (duplicates.length) {
    issues.push({
      code: 'duplicate_id',
      message: `Duplicate IDs in DB: ${duplicates.join(', ')}`,
    });
  }

  for (const row of options.actualRows) {
    if (row.season !== options.season) {
      issues.push({
        code: 'wrong_season',
        message: `Row ${row.id} has season ${row.season}`,
      });
    }
    if (row.week !== options.week) {
      issues.push({
        code: 'wrong_week',
        message: `Row ${row.id} has week ${row.week}`,
      });
    }
    if (!row.homeTeamId || !row.awayTeamId) {
      issues.push({
        code: 'missing_team',
        message: `Row ${row.id} missing team FK`,
      });
    }
    if (!row.date || Number.isNaN(row.date.getTime())) {
      issues.push({
        code: 'invalid_kickoff',
        message: `Row ${row.id} missing/invalid kickoff`,
      });
    }
  }

  const expectedFinalCount =
    options.normalized.length + options.writeResult.dbOnlyIds.length;
  if (options.actualRows.length !== expectedFinalCount) {
    issues.push({
      code: 'count_mismatch',
      message: `Actual DB count ${options.actualRows.length} != expected ${expectedFinalCount} (normalized ${options.normalized.length} + retained DB-only ${options.writeResult.dbOnlyIds.length})`,
    });
  }

  if (
    options.writeResult.inserted !==
    options.preWriteComparison.wouldInsertIds.length
  ) {
    issues.push({
      code: 'insert_count_conflict',
      message: `Inserted ${options.writeResult.inserted} != pre-write wouldInsert ${options.preWriteComparison.wouldInsertIds.length}`,
    });
  }
  if (
    options.writeResult.updated !==
    options.preWriteComparison.wouldUpdateIds.length
  ) {
    issues.push({
      code: 'update_count_conflict',
      message: `Updated ${options.writeResult.updated} != pre-write wouldUpdate ${options.preWriteComparison.wouldUpdateIds.length}`,
    });
  }

  return {
    ok: issues.length === 0,
    issues,
    expectedNormalizedCount: options.normalized.length,
    actualDbCount: options.actualRows.length,
    insertedCount: options.writeResult.inserted,
    updatedCount: options.writeResult.updated,
    missingExpectedIds,
    unexpectedDbOnlyIds,
    retainedDbOnlyIds: options.writeResult.dbOnlyIds,
  };
}

/** Slugify a CFBD team name the same way production CFBDAdapter does. */
export function slugifyTeamName(teamName: string): string {
  if (!teamName) return '';
  return teamName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Deterministic game ID using resolved canonical team IDs (season-scoped). */
export function buildGameId(
  season: number,
  week: number,
  awayTeamId: string,
  homeTeamId: string
): string {
  return `${season}-wk${week}-${awayTeamId}-${homeTeamId}`;
}

/**
 * Parse CLI args. Phase 2C-1A2 requires --preview for a successful parse used by executables.
 * Write flags are never accepted.
 */
export function parseScheduleOnlyArgs(argv: string[]): ParseArgsResult {
  const errors: string[] = [];
  let season: number | undefined;
  let week: number | undefined;
  let preview = false;
  const unknown: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--preview') {
      preview = true;
      continue;
    }
    if (
      arg === '--write' ||
      arg === '--force-write' ||
      arg === '--allow-write' ||
      arg === '--execute'
    ) {
      errors.push(
        `${arg} is not allowed. ${PREVIEW_ONLY_WRITE_DISABLED_MESSAGE}`
      );
      continue;
    }
    if (arg === '--season') {
      const raw = argv[++i];
      if (raw === undefined || raw === '') {
        errors.push('--season requires an integer value');
        continue;
      }
      if (/[,-]/.test(raw)) {
        errors.push(`--season rejects lists/ranges: ${raw}`);
        continue;
      }
      const n = Number(raw);
      if (!Number.isInteger(n) || Number.isNaN(n)) {
        errors.push(`--season must be an integer (got ${raw})`);
        continue;
      }
      season = n;
      continue;
    }
    if (arg === '--week') {
      const raw = argv[++i];
      if (raw === undefined || raw === '') {
        errors.push('--week requires a single integer value');
        continue;
      }
      if (raw.includes(',') || raw.includes('-')) {
        errors.push(
          `--week accepts exactly one integer (no comma lists or ranges). Got: ${raw}`
        );
        continue;
      }
      const n = Number(raw);
      if (!Number.isInteger(n) || Number.isNaN(n)) {
        errors.push(`--week must be an integer (got ${raw})`);
        continue;
      }
      week = n;
      continue;
    }
    if (arg === '--weeks') {
      errors.push('Use singular --week <integer>, not --weeks');
      continue;
    }
    if (arg.startsWith('-')) {
      unknown.push(arg);
      continue;
    }
    unknown.push(arg);
  }

  if (unknown.length) {
    errors.push(`Unknown flag(s) or arguments: ${unknown.join(', ')}`);
  }
  if (season === undefined) {
    errors.push('--season is required');
  }
  if (week === undefined) {
    errors.push('--week is required');
  } else if (week < 0 || week > MAX_REGULAR_SEASON_WEEK) {
    errors.push(
      `--week must be between 0 and ${MAX_REGULAR_SEASON_WEEK} inclusive (got ${week})`
    );
  }

  if (!preview) {
    errors.push(`--preview is required. ${PREVIEW_ONLY_WRITE_DISABLED_MESSAGE}`);
  }

  // Explicitly do NOT inspect GITHUB_ACTIONS — never trim/alter week.
  // Explicitly ignore any SCHEDULE_*_WRITE env — executables have no write path.
  if (errors.length) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    args: { season: season!, week: week!, preview: true },
    errors: [],
  };
}

export function loadCfbdTeamAliases(
  aliasFilePath?: string
): Map<string, string> {
  const filePath =
    aliasFilePath ??
    path.join(process.cwd(), 'apps/jobs/config/team_aliases_cfbd.yml');
  const map = new Map<string, string>();
  if (!fs.existsSync(filePath)) {
    return map;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const loaded = yaml.load(content) as unknown;
  if (Array.isArray(loaded)) {
    for (const row of loaded) {
      const r = row as { cfbd?: string; internal?: string };
      if (r.cfbd && r.internal) {
        map.set(r.cfbd.toLowerCase(), r.internal);
      }
    }
  } else if (loaded && typeof loaded === 'object') {
    for (const [cfbdName, internalId] of Object.entries(
      loaded as Record<string, unknown>
    )) {
      if (typeof internalId === 'string') {
        map.set(cfbdName.toLowerCase(), internalId);
      }
    }
  }
  return map;
}

export async function resolveProviderTeam(
  providerName: string,
  lookup: TeamLookup,
  aliases: Map<string, string>
): Promise<TeamResolutionResult> {
  const slugCandidate = slugifyTeamName(providerName);
  const aliasTarget = aliases.get(providerName.toLowerCase()) ?? null;
  const byName = await lookup.findByNameInsensitive(providerName);

  if (byName.length > 1) {
    return {
      providerName,
      slugCandidate,
      kind: 'ambiguous',
      resolvedId: null,
      detail: `Multiple teams named "${providerName}": ${byName.map((t) => t.id).join(', ')}`,
    };
  }

  if (aliasTarget) {
    const aliasTeam = await lookup.findById(aliasTarget);
    if (!aliasTeam) {
      return {
        providerName,
        slugCandidate,
        kind: 'conflicting',
        resolvedId: null,
        detail: `Alias target "${aliasTarget}" not found in teams table`,
      };
    }
    if (byName.length === 1 && byName[0].id !== aliasTarget) {
      return {
        providerName,
        slugCandidate,
        kind: 'conflicting',
        resolvedId: null,
        detail: `Alias "${aliasTarget}" conflicts with name match "${byName[0].id}"`,
      };
    }
    return {
      providerName,
      slugCandidate,
      kind: 'alias',
      resolvedId: aliasTarget,
    };
  }

  if (byName.length === 1) {
    const byId = slugCandidate
      ? await lookup.findById(slugCandidate)
      : null;
    if (byId && byId.id !== byName[0].id) {
      return {
        providerName,
        slugCandidate,
        kind: 'conflicting',
        resolvedId: null,
        detail: `Slug id "${slugCandidate}" conflicts with name match "${byName[0].id}"`,
      };
    }
    return {
      providerName,
      slugCandidate,
      kind: 'exact_canonical',
      resolvedId: byName[0].id,
    };
  }

  if (slugCandidate) {
    const byId = await lookup.findById(slugCandidate);
    if (byId) {
      return {
        providerName,
        slugCandidate,
        kind: 'exact_canonical',
        resolvedId: byId.id,
      };
    }
  }

  return {
    providerName,
    slugCandidate,
    kind: 'missing',
    resolvedId: null,
    detail: 'No canonical team or alias match',
  };
}

export function isFbsMatchup(game: CfbdProviderGame): boolean {
  return (
    game.homeClassification === 'fbs' && game.awayClassification === 'fbs'
  );
}

/**
 * Explicit-zone kickoff parsing only.
 * Accepts trailing Z or numeric offset (±HH:MM). Rejects timezone-less strings
 * (no silent UTC / runner / America/Chicago assumption).
 */
export type KickoffParseResult =
  | { ok: true; date: Date; raw: string; utcIso: string }
  | { ok: false; raw: string; reason: string };

const EXPLICIT_ZONE_KICKOFF =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}:\d{2})$/;

export function parseKickoffExplicit(
  startDate: string | undefined | null
): KickoffParseResult {
  if (startDate == null || !String(startDate).trim()) {
    return { ok: false, raw: String(startDate ?? ''), reason: 'missing' };
  }
  const raw = String(startDate).trim();
  const match = EXPLICIT_ZONE_KICKOFF.exec(raw);
  if (!match) {
    // Timezone-less ISO-like local datetime
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)) {
      return {
        ok: false,
        raw,
        reason:
          'timezone-less timestamp rejected (no silent UTC/local assumption)',
      };
    }
    return { ok: false, raw, reason: 'invalid timestamp format' };
  }

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, raw, reason: 'invalid timestamp value' };
  }
  return { ok: true, date: d, raw, utcIso: d.toISOString() };
}

/** @deprecated Use parseKickoffExplicit — kept name alias for clarity in call sites. */
export function parseKickoff(
  startDate: string | undefined | null
): Date | null {
  const r = parseKickoffExplicit(startDate);
  return r.ok ? r.date : null;
}

export function filterAndNormalizeProviderGames(
  providerGames: CfbdProviderGame[],
  season: number,
  week: number,
  resolutions: Map<string, TeamResolutionResult>,
  venueCityByName?: Map<string, string>
): {
  games: NormalizedScheduleGame[];
  skippedNonFbs: number;
  kickoffIssues: BatchValidationIssue[];
} {
  const games: NormalizedScheduleGame[] = [];
  let skippedNonFbs = 0;
  const kickoffIssues: BatchValidationIssue[] = [];

  for (const g of providerGames) {
    if (!isFbsMatchup(g)) {
      skippedNonFbs += 1;
      continue;
    }
    if (g.season !== season || g.week !== week) {
      continue;
    }
    const homeRes = resolutions.get(g.homeTeam);
    const awayRes = resolutions.get(g.awayTeam);
    if (!homeRes?.resolvedId || !awayRes?.resolvedId) {
      continue;
    }
    const start = g.startDate ?? g.start_date;
    const kickoff = parseKickoffExplicit(start);
    if (kickoff.ok === false) {
      kickoffIssues.push({
        code: 'invalid_kickoff',
        message: `${g.awayTeam} @ ${g.homeTeam}: ${kickoff.reason} (raw=${kickoff.raw})`,
      });
      continue;
    }

    const venue = g.venue || '';
    const city = venueCityByName?.get(venue.toLowerCase()) ?? '';

    games.push({
      id: buildGameId(season, week, awayRes.resolvedId, homeRes.resolvedId),
      season,
      week,
      homeTeamId: homeRes.resolvedId,
      awayTeamId: awayRes.resolvedId,
      date: kickoff.date,
      rawKickoff: kickoff.raw,
      providerWeek: g.week,
      venue,
      city,
      neutralSite: Boolean(g.neutralSite),
      conferenceGame: Boolean(g.conferenceGame),
      providerHomeName: g.homeTeam,
      providerAwayName: g.awayTeam,
    });
  }

  return { games, skippedNonFbs, kickoffIssues };
}

export function validateNormalizedBatch(
  games: NormalizedScheduleGame[],
  season: number,
  week: number,
  options?: {
    allowEmpty?: boolean;
    source?: string;
    extraIssues?: BatchValidationIssue[];
  }
): BatchValidationResult {
  const issues: BatchValidationIssue[] = [...(options?.extraIssues ?? [])];

  if (options?.source && options.source !== 'cfbd') {
    issues.push({ code: 'mock_source', message: `Unexpected source: ${options.source}` });
  }
  if (!options?.allowEmpty && games.length === 0) {
    issues.push({
      code: 'empty_batch',
      message: `No FBS games to ingest for season=${season} week=${week}`,
    });
  }

  const ids = new Set<string>();
  const matchupKeys = new Set<string>();

  for (const g of games) {
    if (g.season !== season) {
      issues.push({
        code: 'season_mismatch',
        message: `Game ${g.id} season ${g.season} != requested ${season}`,
      });
    }
    if (g.week !== week) {
      issues.push({
        code: 'week_mismatch',
        message: `Game ${g.id} week ${g.week} != requested ${week}`,
      });
    }
    if (!g.homeTeamId || !g.awayTeamId) {
      issues.push({
        code: 'missing_team_id',
        message: `Game ${g.id} missing home or away team id`,
      });
    }
    if (g.homeTeamId === g.awayTeamId) {
      issues.push({
        code: 'identical_teams',
        message: `Game ${g.id} has identical home/away ${g.homeTeamId}`,
      });
    }
    if (!g.date || Number.isNaN(g.date.getTime())) {
      issues.push({
        code: 'missing_kickoff',
        message: `Game ${g.id} has invalid kickoff`,
      });
    }
    if (!String(g.id).startsWith(`${season}-`)) {
      issues.push({
        code: 'cross_season_id',
        message: `Game id ${g.id} does not belong to season ${season}`,
      });
    }
    if (ids.has(g.id)) {
      issues.push({ code: 'duplicate_id', message: `Duplicate game id ${g.id}` });
    }
    ids.add(g.id);

    const matchupKey = Number.isNaN(g.date.getTime())
      ? `${g.awayTeamId}|${g.homeTeamId}|invalid-date`
      : `${g.awayTeamId}|${g.homeTeamId}|${g.date.toISOString()}`;
    if (matchupKeys.has(matchupKey)) {
      issues.push({
        code: 'duplicate_matchup_date',
        message: `Duplicate matchup/date ${matchupKey}`,
      });
    }
    matchupKeys.add(matchupKey);
  }

  if (games.length > 0) {
    const times = games.map((g) => g.date.getTime());
    const earliest = Math.min(...times);
    const latest = Math.max(...times);
    const spanDays = (latest - earliest) / (1000 * 60 * 60 * 24);
    if (spanDays > 21) {
      issues.push({
        code: 'kickoff_range',
        message: `Kickoff span ${spanDays.toFixed(1)} days exceeds 21-day single-week bound`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

export function teamResolutionFailed(
  results: TeamResolutionResult[]
): boolean {
  return results.some(
    (r) =>
      r.kind === 'missing' ||
      r.kind === 'ambiguous' ||
      r.kind === 'conflicting'
  );
}

export function summarizeTeamResolutions(results: TeamResolutionResult[]) {
  const distinct = results.length;
  const exact = results.filter((r) => r.kind === 'exact_canonical').length;
  const alias = results.filter((r) => r.kind === 'alias').length;
  const missing = results.filter((r) => r.kind === 'missing');
  const ambiguous = results.filter((r) => r.kind === 'ambiguous');
  const conflicting = results.filter((r) => r.kind === 'conflicting');
  return {
    distinctIncomingTeams: distinct,
    exactCanonicalMatches: exact,
    recognizedAliases: alias,
    missingTeams: missing,
    ambiguousTeams: ambiguous,
    conflictingTeams: conflicting,
    unresolved: [...missing, ...ambiguous, ...conflicting],
  };
}

export function compareToExistingDb(
  normalized: NormalizedScheduleGame[],
  existing: DbGameRow[]
): DbComparison {
  const existingIds = existing.map((g) => g.id);
  const existingSet = new Set(existingIds);
  const incomingIds = normalized.map((g) => g.id);
  const incomingSet = new Set(incomingIds);

  return {
    existingCount: existing.length,
    existingIds,
    wouldInsertIds: incomingIds.filter((id) => !existingSet.has(id)),
    wouldUpdateIds: incomingIds.filter((id) => existingSet.has(id)),
    dbOnlyIds: existingIds.filter((id) => !incomingSet.has(id)),
  };
}

export function toScheduleInsertRow(game: NormalizedScheduleGame) {
  return {
    id: game.id,
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    season: game.season,
    week: game.week,
    date: game.date,
    status: 'scheduled' as const,
    venue: game.venue || 'TBD',
    city: game.city || 'TBD',
    neutralSite: game.neutralSite,
    conferenceGame: game.conferenceGame,
    homeScore: null,
    awayScore: null,
  };
}

export function buildCfbdWeekGamesUrl(
  season: number,
  week: number,
  baseUrl = CFBD_BASE_URL_DEFAULT
): string {
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/games`);
  url.searchParams.set('year', String(season));
  url.searchParams.set('week', String(week));
  url.searchParams.set('seasonType', 'regular');
  url.searchParams.set('division', 'fbs');
  return url.toString();
}

export function buildCfbdVenuesUrl(baseUrl = CFBD_BASE_URL_DEFAULT): string {
  return `${baseUrl.replace(/\/$/, '')}/venues`;
}

export function redactSecretLike(text: string): string {
  return text
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/apiKey=[^&\s]+/gi, 'apiKey=[REDACTED]')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DB_URL]');
}

export interface FetchScheduleWeekResult {
  games: CfbdProviderGame[];
  venueCityByName: Map<string, string>;
  estimatedCfbdCalls: number;
  httpStatus: number;
}

export async function fetchCfbdScheduleWeek(options: {
  season: number;
  week: number;
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<FetchScheduleWeekResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? CFBD_BASE_URL_DEFAULT;
  const gamesUrl = buildCfbdWeekGamesUrl(options.season, options.week, baseUrl);

  const gamesRes = await fetchImpl(gamesUrl, {
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      Accept: 'application/json',
    },
  });

  if (!gamesRes.ok) {
    throw new Error(`CFBD games HTTP ${gamesRes.status}`);
  }

  const games = (await gamesRes.json()) as CfbdProviderGame[];
  let estimatedCfbdCalls = 1;
  const venueCityByName = new Map<string, string>();

  try {
    const venuesRes = await fetchImpl(buildCfbdVenuesUrl(baseUrl), {
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        Accept: 'application/json',
      },
    });
    estimatedCfbdCalls += 1;
    if (venuesRes.ok) {
      const venues = (await venuesRes.json()) as CfbdVenue[];
      for (const v of venues) {
        if (v.name && v.city) {
          venueCityByName.set(v.name.toLowerCase(), v.city);
        }
      }
    }
  } catch {
    // Venues optional for city enrichment only.
  }

  return {
    games,
    venueCityByName,
    estimatedCfbdCalls,
    httpStatus: gamesRes.status,
  };
}

export async function resolveAllTeams(
  providerNames: string[],
  lookup: TeamLookup,
  aliases: Map<string, string>
): Promise<Map<string, TeamResolutionResult>> {
  const unique = [...new Set(providerNames.filter(Boolean))];
  const map = new Map<string, TeamResolutionResult>();
  for (const name of unique) {
    map.set(name, await resolveProviderTeam(name, lookup, aliases));
  }
  return map;
}

export function collectProviderTeamNames(games: CfbdProviderGame[]): string[] {
  const names: string[] = [];
  for (const g of games) {
    if (isFbsMatchup(g)) {
      names.push(g.homeTeam, g.awayTeam);
    }
  }
  return names;
}

export function summarizeProviderGames(
  games: CfbdProviderGame[],
  season: number,
  week: number
) {
  const weeks = new Set(games.map((g) => g.week));
  const classifications = new Map<string, number>();
  for (const g of games) {
    const key = `${g.homeClassification ?? '?'}|${g.awayClassification ?? '?'}`;
    classifications.set(key, (classifications.get(key) ?? 0) + 1);
  }
  const starts = games
    .map((g) => parseKickoffExplicit(g.startDate ?? g.start_date))
    .filter((r) => r.ok === true)
    .map((r) => (r as Extract<KickoffParseResult, { ok: true }>).date.getTime());

  return {
    requestedSeason: season,
    requestedWeek: week,
    providerGameCount: games.length,
    earliestKickoff:
      starts.length > 0 ? new Date(Math.min(...starts)).toISOString() : null,
    latestKickoff:
      starts.length > 0 ? new Date(Math.max(...starts)).toISOString() : null,
    distinctProviderWeeks: [...weeks].sort((a, b) => a - b),
    classificationCounts: Object.fromEntries(classifications),
  };
}

export function sampleNormalizedGames(games: NormalizedScheduleGame[]) {
  return games.map((g) => ({
    id: g.id,
    away: g.awayTeamId,
    home: g.homeTeamId,
    providerWeek: g.providerWeek,
    rawKickoff: g.rawKickoff,
    normalizedUtcKickoff: g.date.toISOString(),
  }));
}
