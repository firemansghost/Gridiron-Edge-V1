/**
 * Guard/static tests for the manual rollback-only 2026 TeamUnitGrades write-path validator.
 * No network. No DB. No production writes.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  TEAM_UNIT_GRADES_2026_EXPECTED_GRADE_VALUE_COUNT,
  TEAM_UNIT_GRADES_2026_PERSISTED_SIGNIFICANT_DIGITS,
  canonicalizeProposedGradeRows,
} from '../write-team-unit-grades-2026';
import {
  TEAM_UNIT_GRADES_2026_ROLLBACK_VALIDATION_CONFIRMATION,
  firstGradeMismatch,
  parseRollbackValidationArgs,
} from '../validate-team-unit-grades-2026-write-path';

const ROOT = path.resolve(__dirname, '../../..');
const WF = path.join(
  ROOT,
  '.github/workflows/validate-team-unit-grades-2026-write-path-manual.yml'
);
const CLI = path.join(ROOT, 'apps/jobs/validate-team-unit-grades-2026-write-path.ts');

function stepBlock(src: string, stepName: string): string {
  const marker = `- name: ${stepName}`;
  const idx = src.indexOf(marker);
  if (idx < 0) return '';
  const rest = src.slice(idx);
  const next = rest.search(/\n\s*- name:/);
  return next === -1 ? rest : rest.slice(0, next);
}

function makeRows() {
  return Array.from({ length: 138 }, (_, i) => ({
    teamId: `team-${String(i).padStart(3, '0')}`,
    offRunGrade: i + 0.1,
    defRunGrade: i + 0.2,
    offPassGrade: i + 0.3,
    defPassGrade: i + 0.4,
    offExplosiveness: i + 0.5,
    defExplosiveness: i + 0.6,
    havocGrade: i + 0.7,
  }));
}

describe('2026 TeamUnitGrades rollback-only validator', () => {
  const wf = fs.readFileSync(WF, 'utf8').replace(/\r\n/g, '\n');
  const cli = fs.readFileSync(CLI, 'utf8');

  it('is manual-only, exact-main-SHA guarded, and shares the writer lock', () => {
    expect(wf).toContain('workflow_dispatch');
    expect(wf).not.toMatch(/^\s*schedule:/m);
    expect(wf).not.toMatch(/^\s*push:/m);
    expect(wf).not.toMatch(/^\s*pull_request:/m);
    expect(wf).not.toMatch(/cron:/);
    expect(wf).not.toMatch(/matrix:/);
    expect(wf).toContain('permissions:\n  contents: read');
    expect(wf).toContain('group: write-team-unit-grades-2026');

    const guard = stepBlock(wf, 'Source SHA guard');
    expect(guard).toContain('refs/heads/main');
    expect(guard).toContain('EXPECTED_MAIN_SHA');
    expect(guard).toContain('git rev-parse HEAD');
  });

  it('requires season 2026 and explicit rollback-validation confirmation', () => {
    expect(TEAM_UNIT_GRADES_2026_ROLLBACK_VALIDATION_CONFIRMATION).toBe(
      'VALIDATE_2026_TEAM_UNIT_GRADES_ROLLBACK'
    );
    expect(parseRollbackValidationArgs(['--season', '2026']).ok).toBe(false);
    expect(
      parseRollbackValidationArgs([
        '--season',
        '2026',
        '--confirm',
        'VALIDATE_2026_TEAM_UNIT_GRADES_ROLLBACK',
      ]).ok
    ).toBe(true);
    expect(
      parseRollbackValidationArgs([
        '--season',
        '2025',
        '--confirm',
        'VALIDATE_2026_TEAM_UNIT_GRADES_ROLLBACK',
      ]).ok
    ).toBe(false);
  });

  it('has zero providers and no prohibited persistent writer paths', () => {
    expect(wf).toContain('providersInvoked=false');
    expect(wf).toContain('providerCalls=0');
    expect(wf).toContain('CFBD_API_KEY: not provided');
    expect(wf).toContain('ODDS_API_KEY: not provided');
    expect(wf).not.toMatch(/secrets\.CFBD_API_KEY/);
    expect(wf).not.toMatch(/secrets\.ODDS_API_KEY/);
    expect(wf).toContain('compute_unit_grades: not invoked');
    expect(cli).not.toMatch(/CFBD_API_KEY|ODDS_API_KEY/);
    expect(cli).not.toMatch(/collegefootballdata|api\.the-odds-api/i);
    expect(cli).not.toMatch(/prisma migrate deploy|capture-shadow-snapshot|write-cfbd-unit-grade-sources/);
  });

  it('mirrors canonical persistence and deliberately rolls it back', () => {
    expect(cli).toContain('Prisma.TransactionIsolationLevel.Serializable');
    expect(cli).toContain('runTeamUnitGrades2026Preview(store');
    expect(cli).toContain('validatePlanForTeamUnitGradesWrite(plan)');
    expect(cli).toContain("stage = 'canonicalizing_rows'");
    expect(cli).toContain('canonicalizeProposedGradeRows(plan.planning.proposedGradeRows)');
    expect(cli).toContain('for (const row of canonicalized.rows)');
    expect(cli).toContain('tx.teamUnitGrades.create');
    expect(cli).not.toContain('teamUnitGrades.upsert');
    expect(cli).not.toContain('teamUnitGrades.update');
    expect(cli).not.toContain('teamUnitGrades.delete');
    expect(cli).toContain("stage = 'in_transaction_compare'");
    expect(cli).toContain('firstGradeMismatch(\n            canonicalized.rows');
    expect(cli).toContain("comparisonTarget: 'canonicalized_planner_values'");
    expect(cli).toContain("stage = 'intentional_rollback'");
    expect(cli).toContain('throw new RollbackOnlyValidationComplete()');
    expect(cli).toContain("stage = 'post_rollback_select'");
    expect(cli).toContain('rollbackVerified = postRollbackRowCount === 0');
    expect(cli).toContain('process.exit(validationSucceeded ? 0 : 1)');
  });

  it('requires the full 966-value canonicalization contract before validation can succeed', () => {
    expect(TEAM_UNIT_GRADES_2026_PERSISTED_SIGNIFICANT_DIGITS).toBe(15);
    expect(TEAM_UNIT_GRADES_2026_EXPECTED_GRADE_VALUE_COUNT).toBe(966);
    expect(cli).toContain('canonicalization.valueCount === TEAM_UNIT_GRADES_2026_EXPECTED_GRADE_VALUE_COUNT');
    expect(cli).toContain('canonicalization.withinDeltaGuard');

    const proposed = makeRows();
    proposed[0] = { ...proposed[0], offRunGrade: 1.4852971677973312 };
    const canonicalized = canonicalizeProposedGradeRows(proposed);
    expect(canonicalized.summary.valueCount).toBe(966);
    expect(canonicalized.summary.withinDeltaGuard).toBe(true);
    expect(canonicalized.rows[0].offRunGrade).toBe(1.48529716779733);
  });

  it('reports the first exact canonical grade mismatch instead of weakening equality', () => {
    const proposed = makeRows();
    const canonicalized = canonicalizeProposedGradeRows(proposed);
    const persisted = canonicalized.rows.map((row) => ({ ...row, season: 2026 }));
    expect(firstGradeMismatch(canonicalized.rows, persisted, 2026)).toBeNull();

    persisted[17] = {
      ...persisted[17],
      offPassGrade: persisted[17].offPassGrade + 1e-9,
    };
    const mismatch = firstGradeMismatch(canonicalized.rows, persisted, 2026);
    expect(mismatch).not.toBeNull();
    expect(mismatch?.reason).toBe('grade_value');
    expect(mismatch?.teamId).toBe(proposed[17].teamId);
    expect(mismatch?.field).toBe('offPassGrade');
  });
});