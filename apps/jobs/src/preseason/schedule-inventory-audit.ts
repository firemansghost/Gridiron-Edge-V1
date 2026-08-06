/**
 * Phase 2C-1C — Read-only 2026 production schedule inventory audit.
 *
 * Pure audit logic has no Prisma import and no mutation path.
 * Provider adapters, ratings, odds, and write CLIs are not used.
 */

export const AUDIT_SEASON = 2026 as const;

/** Expected FBS-vs-FBS weekly counts after guarded one-week writes. */
export const EXPECTED_2026_WEEKLY_BASELINE: Readonly<Record<number, number>> = {
  1: 51,
  2: 49,
  3: 57,
  4: 58,
  5: 56,
  6: 58,
  7: 59,
  8: 56,
  9: 56,
  10: 62,
  11: 67,
  12: 66,
  13: 65,
  15: 1,
};

export const EXPECTED_2026_TOTAL = 761 as const;
export const EXPECTED_ABSENT_WEEKS_2026: readonly number[] = [14];

export type InventoryGameStatus = 'scheduled' | 'in_progress' | 'final' | string;

export interface InventoryGameRow {
  id: string;
  season: number;
  week: number;
  date: Date | string | null;
  status: InventoryGameStatus;
  homeScore: number | null;
  awayScore: number | null;
  homeTeamId: string;
  awayTeamId: string;
  venue: string | null;
  city: string | null;
  neutralSite: boolean;
  conferenceGame: boolean;
}

/** Narrow read-store — load only. No create/update/delete. */
export interface InventoryAuditReadStore {
  loadGamesForSeason(season: number): Promise<InventoryGameRow[]>;
}

export interface AuditIssue {
  code: string;
  message: string;
  gameId?: string;
  week?: number;
}

export interface PerWeekInventory {
  week: number;
  gameCount: number;
  earliestKickoff: string | null;
  latestKickoff: string | null;
  scheduledCount: number;
  inProgressCount: number;
  finalCount: number;
  scoredRowCount: number;
}

export interface InventorySummary {
  requestedSeason: number;
  totalRows: number;
  distinctWeeks: number[];
  earliestKickoff: string | null;
  latestKickoff: string | null;
  statusCounts: Record<string, number>;
  scoredRowCount: number;
  blankVenueCount: number;
  blankCityCount: number;
  providersInvoked: false;
  mutationsInvoked: false;
}

export interface BaselineComparison {
  missingExpectedWeeks: number[];
  unexpectedStoredWeeks: number[];
  weekCountMismatches: Array<{
    week: number;
    expected: number;
    actual: number;
  }>;
  totalExpected: number;
  totalActual: number;
  totalMismatch: boolean;
  week14AbsentAsExpected: boolean;
}

export interface ScheduleInventoryAuditResult {
  ok: boolean;
  summary: InventorySummary;
  perWeek: PerWeekInventory[];
  baseline: BaselineComparison;
  issues: AuditIssue[];
}

export interface AuditInventoryInput {
  season: number;
  rows: InventoryGameRow[];
  expectedWeeklyBaseline: Readonly<Record<number, number>>;
  expectedTotal: number;
  expectedAbsentWeeks: readonly number[];
}

export type ParseAuditArgsResult =
  | { ok: true; season: number }
  | { ok: false; errors: string[] };

const WRITE_FLAGS = new Set([
  '--write',
  '--force-write',
  '--allow-write',
  '--execute',
  '--confirm-write',
]);

export function parseAuditScheduleArgs(argv: string[]): ParseAuditArgsResult {
  const errors: string[] = [];
  let season: number | undefined;
  let seasonSeen = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (WRITE_FLAGS.has(arg)) {
      errors.push(
        `${arg} is not allowed — inventory audit is read-only (no mutations)`
      );
      continue;
    }
    if (arg === '--season') {
      if (seasonSeen) {
        errors.push('--season may be provided exactly once');
        // Consume the following token so it is not treated as a positional arg,
        // but never overwrite the first season value (no rescue by a later flag).
        i += 1;
        continue;
      }
      seasonSeen = true;
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
    if (arg.startsWith('-')) {
      errors.push(`Unknown flag: ${arg}`);
      continue;
    }
    errors.push(`Unexpected positional argument: ${arg}`);
  }

  if (season === undefined) {
    errors.push('--season is required (must be 2026)');
  } else if (season !== AUDIT_SEASON) {
    errors.push(`--season must be ${AUDIT_SEASON} (got ${season})`);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, season: AUDIT_SEASON };
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoOrNull(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function isBlank(value: string | null | undefined): boolean {
  return value == null || String(value).trim() === '';
}

function hasScore(row: InventoryGameRow): boolean {
  return row.homeScore != null || row.awayScore != null;
}

function expectedIdPrefix(season: number, week: number): string {
  return `${season}-wk${week}-`;
}

function sortRows(rows: InventoryGameRow[]): InventoryGameRow[] {
  return [...rows].sort((a, b) => {
    if (a.week !== b.week) return a.week - b.week;
    const da = toDate(a.date)?.getTime() ?? 0;
    const db = toDate(b.date)?.getTime() ?? 0;
    if (da !== db) return da - db;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Pure inventory audit. Does not import Prisma or mutate anything.
 */
export function auditScheduleInventory(
  input: AuditInventoryInput
): ScheduleInventoryAuditResult {
  const { season, expectedWeeklyBaseline, expectedTotal, expectedAbsentWeeks } =
    input;
  const rows = sortRows(input.rows);
  const issues: AuditIssue[] = [];

  const expectedWeeks = Object.keys(expectedWeeklyBaseline)
    .map(Number)
    .sort((a, b) => a - b);
  const expectedWeekSet = new Set(expectedWeeks);
  const absentSet = new Set(expectedAbsentWeeks);

  const statusCounts: Record<string, number> = {};
  let scoredRowCount = 0;
  let blankVenueCount = 0;
  let blankCityCount = 0;
  let earliest: Date | null = null;
  let latest: Date | null = null;

  const byWeek = new Map<number, InventoryGameRow[]>();
  const seenIds = new Map<string, number>();
  const matchupKeys = new Map<string, string[]>();

  for (const row of rows) {
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
    if (hasScore(row)) scoredRowCount += 1;
    if (isBlank(row.venue)) blankVenueCount += 1;
    if (isBlank(row.city)) blankCityCount += 1;

    const d = toDate(row.date);
    if (d) {
      if (!earliest || d < earliest) earliest = d;
      if (!latest || d > latest) latest = d;
    }

    const list = byWeek.get(row.week) ?? [];
    list.push(row);
    byWeek.set(row.week, list);

    seenIds.set(row.id, (seenIds.get(row.id) ?? 0) + 1);

    const matchupKey = `${row.season}|${row.week}|${row.homeTeamId}|${row.awayTeamId}`;
    const ids = matchupKeys.get(matchupKey) ?? [];
    ids.push(row.id);
    matchupKeys.set(matchupKey, ids);

    // --- integrity ---
    if (row.season !== season) {
      issues.push({
        code: 'wrong_season',
        message: `Row season ${row.season} !== requested ${season}`,
        gameId: row.id,
        week: row.week,
      });
    }

    if (!expectedWeekSet.has(row.week)) {
      issues.push({
        code: 'unexpected_week',
        message: `Week ${row.week} is not an expected stored week`,
        gameId: row.id,
        week: row.week,
      });
    }

    const prefix = expectedIdPrefix(season, row.week);
    if (!row.id.startsWith(prefix)) {
      issues.push({
        code: 'id_prefix_mismatch',
        message: `ID "${row.id}" does not begin with "${prefix}"`,
        gameId: row.id,
        week: row.week,
      });
    }

    if (row.homeTeamId === row.awayTeamId) {
      issues.push({
        code: 'identical_home_away',
        message: `homeTeamId === awayTeamId (${row.homeTeamId})`,
        gameId: row.id,
        week: row.week,
      });
    }

    if (d == null) {
      issues.push({
        code: 'invalid_date',
        message: `Invalid or missing kickoff date`,
        gameId: row.id,
        week: row.week,
      });
    } else {
      const y = d.getUTCFullYear();
      if (y !== season) {
        issues.push({
          code: 'kickoff_outside_year',
          message: `Kickoff ${d.toISOString()} is outside calendar year ${season}`,
          gameId: row.id,
          week: row.week,
        });
      }
    }

    if (row.status !== 'scheduled') {
      issues.push({
        code: 'non_scheduled_status',
        message: `status="${row.status}" (expected scheduled)`,
        gameId: row.id,
        week: row.week,
      });
    }

    if (row.homeScore != null || row.awayScore != null) {
      issues.push({
        code: 'score_populated',
        message: `Scores present home=${row.homeScore} away=${row.awayScore}`,
        gameId: row.id,
        week: row.week,
      });
    }
  }

  for (const [id, count] of seenIds) {
    if (count > 1) {
      issues.push({
        code: 'duplicate_id',
        message: `Duplicate game id "${id}" appeared ${count} times in loaded result`,
        gameId: id,
      });
    }
  }

  for (const [key, ids] of matchupKeys) {
    if (ids.length > 1) {
      const [s, w, home, away] = key.split('|');
      issues.push({
        code: 'duplicate_matchup',
        message: `Duplicate logical matchup season=${s} week=${w} ${away}@${home} ids=[${ids.join(', ')}]`,
        week: Number(w),
      });
    }
  }

  const storedWeeks = [...byWeek.keys()].sort((a, b) => a - b);

  const missingExpectedWeeks = expectedWeeks.filter((w) => !byWeek.has(w));
  const unexpectedStoredWeeks = storedWeeks.filter(
    (w) => !expectedWeekSet.has(w)
  );
  const weekCountMismatches: BaselineComparison['weekCountMismatches'] = [];
  for (const w of expectedWeeks) {
    const expected = expectedWeeklyBaseline[w] ?? 0;
    const actual = byWeek.get(w)?.length ?? 0;
    if (actual !== expected) {
      weekCountMismatches.push({ week: w, expected, actual });
    }
  }
  // Also flag unexpected weeks that have counts (already in unexpectedStoredWeeks)
  for (const w of unexpectedStoredWeeks) {
    if (!weekCountMismatches.some((m) => m.week === w)) {
      weekCountMismatches.push({
        week: w,
        expected: 0,
        actual: byWeek.get(w)?.length ?? 0,
      });
    }
  }

  const totalActual = rows.length;
  const totalMismatch = totalActual !== expectedTotal;

  const week14AbsentAsExpected =
    absentSet.has(14) && !byWeek.has(14) && !expectedWeekSet.has(14);

  if (missingExpectedWeeks.length > 0) {
    issues.push({
      code: 'missing_expected_weeks',
      message: `Missing expected weeks: ${missingExpectedWeeks.join(', ')}`,
    });
  }
  if (unexpectedStoredWeeks.length > 0) {
    issues.push({
      code: 'unexpected_stored_weeks',
      message: `Unexpected stored weeks: ${unexpectedStoredWeeks.join(', ')}`,
    });
  }
  for (const m of weekCountMismatches) {
    issues.push({
      code: 'week_count_mismatch',
      message: `Week ${m.week}: expected ${m.expected}, actual ${m.actual}`,
      week: m.week,
    });
  }
  if (totalMismatch) {
    issues.push({
      code: 'total_count_mismatch',
      message: `Total expected ${expectedTotal}, actual ${totalActual}`,
    });
  }
  if (absentSet.has(14) && byWeek.has(14)) {
    issues.push({
      code: 'week_14_present',
      message: 'Week 14 is present but expected absent',
      week: 14,
    });
  }

  const perWeek: PerWeekInventory[] = storedWeeks.map((week) => {
    const weekRows = byWeek.get(week) ?? [];
    let wEarliest: Date | null = null;
    let wLatest: Date | null = null;
    let scheduledCount = 0;
    let inProgressCount = 0;
    let finalCount = 0;
    let scored = 0;
    for (const r of weekRows) {
      const d = toDate(r.date);
      if (d) {
        if (!wEarliest || d < wEarliest) wEarliest = d;
        if (!wLatest || d > wLatest) wLatest = d;
      }
      if (r.status === 'scheduled') scheduledCount += 1;
      else if (r.status === 'in_progress') inProgressCount += 1;
      else if (r.status === 'final') finalCount += 1;
      if (hasScore(r)) scored += 1;
    }
    return {
      week,
      gameCount: weekRows.length,
      earliestKickoff: isoOrNull(wEarliest),
      latestKickoff: isoOrNull(wLatest),
      scheduledCount,
      inProgressCount,
      finalCount,
      scoredRowCount: scored,
    };
  });

  const baseline: BaselineComparison = {
    missingExpectedWeeks,
    unexpectedStoredWeeks,
    weekCountMismatches,
    totalExpected: expectedTotal,
    totalActual,
    totalMismatch,
    week14AbsentAsExpected,
  };

  const summary: InventorySummary = {
    requestedSeason: season,
    totalRows: totalActual,
    distinctWeeks: storedWeeks,
    earliestKickoff: isoOrNull(earliest),
    latestKickoff: isoOrNull(latest),
    statusCounts,
    scoredRowCount,
    blankVenueCount,
    blankCityCount,
    providersInvoked: false,
    mutationsInvoked: false,
  };

  return {
    ok: issues.length === 0,
    summary,
    perWeek,
    baseline,
    issues,
  };
}

/** Deterministic fixture generator for tests (not production). */
export function buildHealthyInventoryFixture(options?: {
  baseline?: Readonly<Record<number, number>>;
  season?: number;
}): InventoryGameRow[] {
  const season = options?.season ?? AUDIT_SEASON;
  const baseline = options?.baseline ?? EXPECTED_2026_WEEKLY_BASELINE;
  const rows: InventoryGameRow[] = [];
  let teamCounter = 0;

  for (const week of Object.keys(baseline)
    .map(Number)
    .sort((a, b) => a - b)) {
    const count = baseline[week] ?? 0;
    for (let i = 0; i < count; i++) {
      teamCounter += 1;
      const away = `away${teamCounter}`;
      const home = `home${teamCounter}`;
      const month = Math.min(8 + Math.floor((week - 1) / 4), 11);
      const day = Math.min(1 + ((week + i) % 27), 28);
      const date = new Date(
        Date.UTC(season, month - 1, day, 16 + (i % 8), 0, 0)
      );
      rows.push({
        id: `${season}-wk${week}-${away}-${home}`,
        season,
        week,
        date,
        status: 'scheduled',
        homeScore: null,
        awayScore: null,
        homeTeamId: home,
        awayTeamId: away,
        venue: `Venue ${week}-${i}`,
        city: `City ${week}`,
        neutralSite: false,
        conferenceGame: false,
      });
    }
  }
  return sortRows(rows);
}

export function formatAuditReport(result: ScheduleInventoryAuditResult): string {
  const lines: string[] = [];
  const { summary, perWeek, baseline, issues, ok } = result;

  lines.push('============================================');
  lines.push('2026 SCHEDULE INVENTORY AUDIT (READ ONLY)');
  lines.push('============================================');
  lines.push('');
  lines.push('A. Overall inventory');
  lines.push(`  requestedSeason: ${summary.requestedSeason}`);
  lines.push(`  totalRows: ${summary.totalRows}`);
  lines.push(`  distinctWeeks: [${summary.distinctWeeks.join(', ')}]`);
  lines.push(`  earliestKickoff: ${summary.earliestKickoff ?? 'n/a'}`);
  lines.push(`  latestKickoff: ${summary.latestKickoff ?? 'n/a'}`);
  lines.push(`  statusCounts: ${JSON.stringify(summary.statusCounts)}`);
  lines.push(`  scoredRowCount: ${summary.scoredRowCount}`);
  lines.push(`  blankVenueCount: ${summary.blankVenueCount} (informational)`);
  lines.push(`  blankCityCount: ${summary.blankCityCount} (informational)`);
  lines.push('  providersInvoked: false');
  lines.push('  mutationsInvoked: false');
  lines.push('');

  lines.push('B. Per-week inventory');
  for (const w of perWeek) {
    lines.push(
      `  week=${w.week} games=${w.gameCount} earliest=${w.earliestKickoff ?? 'n/a'} latest=${w.latestKickoff ?? 'n/a'} scheduled=${w.scheduledCount} in_progress=${w.inProgressCount} final=${w.finalCount} scored=${w.scoredRowCount}`
    );
  }
  lines.push('');

  lines.push('C. Baseline comparison');
  lines.push(
    `  missingExpectedWeeks: [${baseline.missingExpectedWeeks.join(', ')}]`
  );
  lines.push(
    `  unexpectedStoredWeeks: [${baseline.unexpectedStoredWeeks.join(', ')}]`
  );
  lines.push(
    `  weekCountMismatches: ${JSON.stringify(baseline.weekCountMismatches)}`
  );
  lines.push(
    `  total: expected=${baseline.totalExpected} actual=${baseline.totalActual} mismatch=${baseline.totalMismatch}`
  );
  lines.push(
    `  week14AbsentAsExpected: ${baseline.week14AbsentAsExpected}`
  );
  lines.push('');

  lines.push('D. Integrity issues');
  if (issues.length === 0) {
    lines.push('  (none)');
  } else {
    for (const issue of issues) {
      lines.push(
        `  [${issue.code}] ${issue.message}${issue.gameId ? ` id=${issue.gameId}` : ''}`
      );
    }
  }
  lines.push('');
  lines.push(`ok: ${ok}`);
  return lines.join('\n');
}
