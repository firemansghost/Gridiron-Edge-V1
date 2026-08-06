/**
 * Phase 2C-1C — Mocked tests for read-only 2026 schedule inventory audit.
 * No network. No production DB. No mutations.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  runScheduleInventoryAudit,
  sanitizeAuditRuntimeError,
} from '../audit-schedule-inventory';
import {
  EXPECTED_2026_TOTAL,
  EXPECTED_2026_WEEKLY_BASELINE,
  EXPECTED_ABSENT_WEEKS_2026,
  auditScheduleInventory,
  buildHealthyInventoryFixture,
  parseAuditScheduleArgs,
  type InventoryGameRow,
} from '../src/preseason/schedule-inventory-audit';

const SMALL_BASELINE: Readonly<Record<number, number>> = {
  1: 2,
  2: 3,
  15: 1,
};
const SMALL_TOTAL = 6;

function auditWith(
  rows: InventoryGameRow[],
  baseline: Readonly<Record<number, number>> = SMALL_BASELINE,
  total: number = SMALL_TOTAL
) {
  return auditScheduleInventory({
    season: 2026,
    rows,
    expectedWeeklyBaseline: baseline,
    expectedTotal: total,
    expectedAbsentWeeks: EXPECTED_ABSENT_WEEKS_2026,
  });
}

describe('parseAuditScheduleArgs', () => {
  it('accepts --season 2026', () => {
    const r = parseAuditScheduleArgs(['--season', '2026']);
    expect(r).toEqual({ ok: true, season: 2026 });
  });

  it('rejects a season other than 2026', () => {
    const r = parseAuditScheduleArgs(['--season', '2025']);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.errors.some((e) => e.includes('2026'))).toBe(
      true
    );
  });

  it('rejects missing season', () => {
    const r = parseAuditScheduleArgs([]);
    expect(r.ok).toBe(false);
  });

  it('rejects write-related flags', () => {
    const r = parseAuditScheduleArgs([
      '--season',
      '2026',
      '--confirm-write',
      'WRITE_2026_WEEK_1',
    ]);
    expect(r.ok).toBe(false);
    expect(
      r.ok === false && r.errors.some((e) => e.includes('--confirm-write'))
    ).toBe(true);
  });

  it('rejects unexpected positional arguments', () => {
    const r = parseAuditScheduleArgs(['--season', '2026', 'extra']);
    expect(r.ok).toBe(false);
  });

  it('rejects duplicate identical --season values', () => {
    const r = parseAuditScheduleArgs([
      '--season',
      '2026',
      '--season',
      '2026',
    ]);
    expect(r.ok).toBe(false);
    expect(
      r.ok === false &&
        r.errors.some((e) => e.includes('--season may be provided exactly once'))
    ).toBe(true);
  });

  it('rejects invalid --season followed by valid --season (no rescue)', () => {
    const r = parseAuditScheduleArgs([
      '--season',
      '2025',
      '--season',
      '2026',
    ]);
    expect(r.ok).toBe(false);
    expect(
      r.ok === false &&
        r.errors.some((e) => e.includes('--season may be provided exactly once'))
    ).toBe(true);
    expect(
      r.ok === false && r.errors.some((e) => e.includes('must be 2026'))
    ).toBe(true);
  });

  it('rejects valid --season followed by invalid --season', () => {
    const r = parseAuditScheduleArgs([
      '--season',
      '2026',
      '--season',
      '2025',
    ]);
    expect(r.ok).toBe(false);
    expect(
      r.ok === false &&
        r.errors.some((e) => e.includes('--season may be provided exactly once'))
    ).toBe(true);
  });
});

describe('sanitizeAuditRuntimeError / runScheduleInventoryAudit catch', () => {
  it('sanitizes fake postgres URL and password from thrown errors', async () => {
    const fakeUrl =
      'postgresql://audit_user:SuperSecretPassw0rd!@db.example.internal:5432/gridiron';
    const fakePassword = 'SuperSecretPassw0rd!';
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const { exitCode } = await runScheduleInventoryAudit({
        season: 2026,
        store: {
          async loadGamesForSeason() {
            throw new Error(
              `Can't reach database server at ${fakeUrl} password=${fakePassword}`
            );
          },
        },
      });

      expect(exitCode).toBe(1);
      const output = [...errorSpy.mock.calls, ...logSpy.mock.calls]
        .map((c) => c.map(String).join(' '))
        .join('\n');

      expect(output).not.toContain(fakeUrl);
      expect(output).not.toContain('postgresql://');
      expect(output).not.toContain('postgres://');
      expect(output).not.toContain('audit_user');
      expect(output).not.toContain(fakePassword);
      expect(output).not.toContain('SuperSecretPassw0rd');
      expect(output).toContain(
        'Database read failed; connection details suppressed'
      );
      expect(output).toContain(
        'FAILED — read-only findings require operator review; no repair attempted'
      );
      expect(sanitizeAuditRuntimeError(new Error(fakeUrl))).toBe(
        'Database read failed; connection details suppressed'
      );
      expect(sanitizeAuditRuntimeError(new Error(fakeUrl))).not.toContain(
        'postgresql://'
      );
    } finally {
      errorSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  it('does not emit arbitrary name/code/message from a malicious thrown object', async () => {
    const malicious = {
      name: 'postgresql://audit_user:Password@db.example/gridiron',
      code: 'SuperSecretPassw0rd',
      message: 'password=SuperSecretPassw0rd',
    };
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const { exitCode } = await runScheduleInventoryAudit({
        season: 2026,
        store: {
          async loadGamesForSeason() {
            throw malicious;
          },
        },
      });

      expect(exitCode).toBe(1);
      const output = [...errorSpy.mock.calls, ...logSpy.mock.calls]
        .map((c) => c.map(String).join(' '))
        .join('\n');

      expect(output).not.toContain('postgresql://');
      expect(output).not.toContain('audit_user');
      expect(output).not.toContain('Password');
      expect(output).not.toContain('SuperSecretPassw0rd');
      expect(output).not.toContain(malicious.name);
      expect(output).not.toContain(malicious.code);
      expect(output).not.toContain(malicious.message);
      expect(output).toContain(
        'Database read failed; connection details suppressed'
      );
      expect(output).toContain(
        'FAILED — read-only findings require operator review; no repair attempted'
      );
      expect(sanitizeAuditRuntimeError(malicious)).toBe(
        'Database read failed; connection details suppressed'
      );
    } finally {
      errorSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});

describe('auditScheduleInventory', () => {
  it('healthy inventory returns ok=true', () => {
    const rows = buildHealthyInventoryFixture({
      baseline: SMALL_BASELINE,
    });
    const result = auditWith(rows);
    expect(result.ok).toBe(true);
    expect(result.summary.totalRows).toBe(SMALL_TOTAL);
    expect(result.baseline.week14AbsentAsExpected).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('full expected baseline fixture totals 761 and passes', () => {
    const rows = buildHealthyInventoryFixture();
    const result = auditScheduleInventory({
      season: 2026,
      rows,
      expectedWeeklyBaseline: EXPECTED_2026_WEEKLY_BASELINE,
      expectedTotal: EXPECTED_2026_TOTAL,
      expectedAbsentWeeks: EXPECTED_ABSENT_WEEKS_2026,
    });
    expect(rows.length).toBe(761);
    expect(result.ok).toBe(true);
    expect(result.summary.distinctWeeks).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15,
    ]);
  });

  it('missing expected week fails', () => {
    const rows = buildHealthyInventoryFixture({ baseline: SMALL_BASELINE }).filter(
      (r) => r.week !== 2
    );
    const result = auditWith(rows, SMALL_BASELINE, SMALL_TOTAL);
    expect(result.ok).toBe(false);
    expect(result.baseline.missingExpectedWeeks).toContain(2);
    expect(result.issues.some((i) => i.code === 'missing_expected_weeks')).toBe(
      true
    );
  });

  it('unexpected Week 14 row fails', () => {
    const rows = buildHealthyInventoryFixture({ baseline: SMALL_BASELINE });
    rows.push({
      id: '2026-wk14-a-b',
      season: 2026,
      week: 14,
      date: new Date('2026-11-28T17:00:00.000Z'),
      status: 'scheduled',
      homeScore: null,
      awayScore: null,
      homeTeamId: 'b',
      awayTeamId: 'a',
      venue: 'x',
      city: 'y',
      neutralSite: false,
      conferenceGame: false,
    });
    const result = auditWith(rows, SMALL_BASELINE, SMALL_TOTAL);
    expect(result.ok).toBe(false);
    expect(result.baseline.unexpectedStoredWeeks).toContain(14);
    expect(result.baseline.week14AbsentAsExpected).toBe(false);
    expect(
      result.issues.some(
        (i) => i.code === 'week_14_present' || i.code === 'unexpected_week'
      )
    ).toBe(true);
  });

  it('incorrect weekly count fails', () => {
    const rows = buildHealthyInventoryFixture({ baseline: SMALL_BASELINE });
    rows.pop();
    const result = auditWith(rows, SMALL_BASELINE, SMALL_TOTAL);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'week_count_mismatch')).toBe(
      true
    );
  });

  it('incorrect total count fails', () => {
    const rows = buildHealthyInventoryFixture({ baseline: SMALL_BASELINE });
    const result = auditWith(rows, SMALL_BASELINE, 99);
    expect(result.ok).toBe(false);
    expect(result.baseline.totalMismatch).toBe(true);
    expect(result.issues.some((i) => i.code === 'total_count_mismatch')).toBe(
      true
    );
  });

  it('non-scheduled status fails', () => {
    const rows = buildHealthyInventoryFixture({ baseline: SMALL_BASELINE });
    rows[0].status = 'final';
    const result = auditWith(rows);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'non_scheduled_status')).toBe(
      true
    );
  });

  it('populated score fails', () => {
    const rows = buildHealthyInventoryFixture({ baseline: SMALL_BASELINE });
    rows[0].homeScore = 21;
    const result = auditWith(rows);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'score_populated')).toBe(true);
  });

  it('incorrect ID week prefix fails', () => {
    const rows = buildHealthyInventoryFixture({ baseline: SMALL_BASELINE });
    rows[0].id = '2026-wk99-wrong-prefix';
    const result = auditWith(rows);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'id_prefix_mismatch')).toBe(
      true
    );
  });

  it('home team equal to away team fails', () => {
    const rows = buildHealthyInventoryFixture({ baseline: SMALL_BASELINE });
    rows[0].awayTeamId = rows[0].homeTeamId;
    const result = auditWith(rows);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'identical_home_away')).toBe(
      true
    );
  });

  it('duplicate logical matchup fails', () => {
    const rows = buildHealthyInventoryFixture({ baseline: SMALL_BASELINE });
    const clone = { ...rows[0], id: `${rows[0].id}-dup` };
    rows.push(clone);
    const result = auditWith(rows, SMALL_BASELINE, SMALL_TOTAL);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'duplicate_matchup')).toBe(
      true
    );
  });

  it('kickoff outside 2026 fails', () => {
    const rows = buildHealthyInventoryFixture({ baseline: SMALL_BASELINE });
    rows[0].date = new Date('2025-12-01T16:00:00.000Z');
    const result = auditWith(rows);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'kickoff_outside_year')).toBe(
      true
    );
  });

  it('blank venue/city are informational and do not fail', () => {
    const rows = buildHealthyInventoryFixture({ baseline: SMALL_BASELINE });
    rows[0].venue = '';
    rows[0].city = null;
    const result = auditWith(rows);
    expect(result.ok).toBe(true);
    expect(result.summary.blankVenueCount).toBeGreaterThanOrEqual(1);
    expect(result.summary.blankCityCount).toBeGreaterThanOrEqual(1);
  });

  it('audit code has no mutation path', () => {
    const srcPath = path.join(
      __dirname,
      '../src/preseason/schedule-inventory-audit.ts'
    );
    const src = fs.readFileSync(srcPath, 'utf8');
    expect(src).not.toMatch(/from ['"]@prisma\/client['"]/);
    expect(src).not.toMatch(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/);
    expect(src).not.toMatch(/\$executeRaw|\$queryRawUnsafe/);
    expect(src).not.toMatch(/writeValidatedScheduleBatch|seed-ratings|OddsApi|ingest\.ts/);

    const cliPath = path.join(__dirname, '../audit-schedule-inventory.ts');
    const cli = fs.readFileSync(cliPath, 'utf8');
    expect(cli).not.toMatch(/createMany|updateMany|upsert|deleteMany|\$transaction/);
    expect(cli).not.toMatch(/from ['"].*write-schedules/);
    expect(cli).not.toMatch(/from ['"].*seed-ratings/);
    expect(cli).not.toMatch(/from ['"].*OddsApi/);
    expect(cli).not.toMatch(/CFBD_API_KEY|ODDS_API_KEY/);
    expect(cli).toMatch(/findMany/);
  });

  it('workflow is manual-only and provider-free', () => {
    const wfPath = path.join(
      __dirname,
      '../../../.github/workflows/audit-2026-schedule-inventory.yml'
    );
    const text = fs.readFileSync(wfPath, 'utf8');
    expect(text).toMatch(/workflow_dispatch:/);
    expect(text).not.toMatch(/^\s*schedule:/m);
    expect(text).not.toMatch(/^\s*push:/m);
    expect(text).not.toMatch(/^\s*pull_request:/m);
    expect(text).toMatch(/contents:\s*read/);
    expect(text).toMatch(/actions\/checkout@v6/);
    expect(text).toMatch(/actions\/setup-node@v6/);
    expect(text).toMatch(/node-version:\s*'20'/);
    expect(text).toMatch(/default:\s*'2026'/);
    expect(text).toMatch(/CFBD_API_KEY: not provided/);
    expect(text).toMatch(/ODDS_API_KEY: not provided/);
    expect(text).toMatch(/database mutations: not invoked/);
    expect(text).toMatch(/audit-schedule-inventory\.ts/);
    expect(text).not.toMatch(/secrets\.CFBD_API_KEY|secrets\.ODDS_API_KEY/);
    expect(text).not.toMatch(/write-schedules|seed-ratings|ingest\.js\s+cfbd/);
    expect(text).not.toMatch(/prisma migrate|ingest-simple\.js\s+mock/);
  });
});
