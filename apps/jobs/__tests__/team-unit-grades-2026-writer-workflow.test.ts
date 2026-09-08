/**
 * Guard/static tests for the manual 2026 TeamUnitGrades PREVIEW/COMMIT writer.
 * No network. No DB. No production writes.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  TEAM_UNIT_GRADES_2026_CANONICALIZATION_EPSILON_FACTOR,
  TEAM_UNIT_GRADES_2026_CONFIRMATION,
  TEAM_UNIT_GRADES_2026_EXPECTED_GRADE_VALUE_COUNT,
  TEAM_UNIT_GRADES_2026_PERSISTED_SIGNIFICANT_DIGITS,
  canonicalizeProposedGradeRows,
  canonicalizeTeamUnitGradeValue,
  exactGradeRowsMatch,
  parseTeamUnitGrades2026WriterArgs,
} from '../write-team-unit-grades-2026';

const ROOT = path.resolve(__dirname, '../../..');
const WF = path.join(ROOT, '.github/workflows/write-team-unit-grades-2026-manual.yml');
const CLI = path.join(ROOT, 'apps/jobs/write-team-unit-grades-2026.ts');

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

describe('2026 TeamUnitGrades guarded writer', () => {
  const wf = fs.readFileSync(WF, 'utf8').replace(/\r\n/g, '\n');
  const cli = fs.readFileSync(CLI, 'utf8');

  it('is workflow_dispatch only and exact-main-SHA guarded', () => {
    expect(wf).toContain('workflow_dispatch');
    expect(wf).not.toMatch(/^\s*schedule:/m);
    expect(wf).not.toMatch(/^\s*push:/m);
    expect(wf).not.toMatch(/^\s*pull_request:/m);
    expect(wf).not.toMatch(/cron:/);
    expect(wf).not.toMatch(/strategy:/);
    expect(wf).not.toMatch(/matrix:/);
    expect(wf).toContain('permissions:\n  contents: read');
    const guard = stepBlock(wf, 'Source SHA guard');
    expect(guard).toContain('refs/heads/main');
    expect(guard).toContain('EXPECTED_MAIN_SHA');
    expect(guard).toContain('git rev-parse HEAD');
    expect(wf.indexOf('- name: Source SHA guard')).toBeGreaterThan(wf.indexOf('- name: Checkout repository'));
    expect(wf.indexOf('- name: Source SHA guard')).toBeLessThan(wf.indexOf('- name: Setup Node.js'));
  });

  it('requires season 2026 and the exact COMMIT confirmation phrase', () => {
    expect(TEAM_UNIT_GRADES_2026_CONFIRMATION).toBe('WRITE_2026_TEAM_UNIT_GRADES');
    expect(wf).toContain('COMMIT requires confirm=WRITE_2026_TEAM_UNIT_GRADES');
    expect(parseTeamUnitGrades2026WriterArgs(['--season', '2026', '--mode', 'PREVIEW']).ok).toBe(true);
    expect(parseTeamUnitGrades2026WriterArgs(['--season', '2025', '--mode', 'PREVIEW']).ok).toBe(false);
    expect(parseTeamUnitGrades2026WriterArgs(['--season', '2026', '--mode', 'COMMIT']).ok).toBe(false);
    expect(
      parseTeamUnitGrades2026WriterArgs([
        '--season',
        '2026',
        '--mode',
        'COMMIT',
        '--confirm',
        'WRITE_2026_TEAM_UNIT_GRADES',
      ]).ok
    ).toBe(true);
  });

  it('has zero providers and no prohibited writer invocation paths', () => {
    expect(wf).toContain('providersInvoked=false');
    expect(wf).toContain('providerCalls=0');
    expect(wf).toContain('CFBD_API_KEY: not provided');
    expect(wf).toContain('ODDS_API_KEY: not provided');
    expect(wf).not.toMatch(/secrets\.CFBD_API_KEY/);
    expect(wf).not.toMatch(/secrets\.ODDS_API_KEY/);
    expect(wf).toContain('compute_unit_grades: not invoked');
    expect(wf).toContain('cfbd source writes: false');
    expect(wf).toContain('priors writes: false');
    expect(wf).toContain('Shadow writes: false');
    expect(wf).toContain('Bet writes: false');
    expect(wf).toContain('MatchupOutput writes: false');
    expect(wf).toContain('ratings writes: false');
    expect(wf).toContain('prisma migrate: not invoked');
    expect(cli).not.toMatch(/CFBD_API_KEY|ODDS_API_KEY/);
    expect(cli).not.toMatch(/collegefootballdata|api\.the-odds-api/i);
    expect(cli).not.toMatch(/npx tsx[^\n]*compute_unit_grades/i);
    expect(cli).not.toMatch(/capture-shadow-snapshot|write-cfbd-unit-grade-sources|prisma migrate deploy/);
  });

  it('keeps PREVIEW read-only and limits COMMIT mutations to TeamUnitGrades inserts', () => {
    expect(cli).toContain("if (args.mode === 'PREVIEW')");
    expect(cli).toContain('runTeamUnitGrades2026Preview');
    expect(cli).toContain('tx.teamUnitGrades.create');
    expect(cli).not.toContain('teamUnitGrades.upsert');
    expect(cli).not.toContain('teamUnitGrades.update');
    expect(cli).not.toContain('teamUnitGrades.delete');
    expect(cli).not.toMatch(/tx\.cfbd(Game|EffTeamGame|PpaTeamGame|EffTeamSeason)\.(create|update|upsert|delete)/);
    expect(cli).not.toMatch(/tx\.cfbdPriorsTeamSeason\.(create|update|upsert|delete)/);
    expect(cli).not.toMatch(/tx\.(bet|matchupOutput|teamSeasonRating)\.(create|update|upsert|delete)/);
  });

  it('replans, canonicalizes, and writes/verifies inside one Serializable transaction', () => {
    expect(cli).toContain('Prisma.TransactionIsolationLevel.Serializable');
    expect(cli).toContain('createTeamUnitGrades2026ReadStore(tx as unknown as PrismaClient)');
    expect(cli).toContain('runTeamUnitGrades2026Preview(store');
    expect(cli).toContain('validatePlanForTeamUnitGradesWrite(plan)');
    expect(cli).toContain('canonicalizeProposedGradeRows(plan.planning.proposedGradeRows)');
    expect(cli).toContain('for (const row of canonicalized.rows)');
    expect(cli).toContain('exactGradeRowsMatch(\n          canonicalized.rows');
    expect(cli).toContain('persistedInsideTransaction');
    expect(cli).toContain('transaction_postwrite_exact_match_failed');
    expect(cli).toContain('postWriteExactMatch');
    expect(cli).toContain("error = 'postcommit_exact_match_failed'");
    expect(cli).toContain("comparisonTarget: 'canonicalized_planner_values'");
  });

  it('uses the deterministic 15-significant-digit persistence contract without fuzzy equality', () => {
    expect(TEAM_UNIT_GRADES_2026_PERSISTED_SIGNIFICANT_DIGITS).toBe(15);
    expect(TEAM_UNIT_GRADES_2026_CANONICALIZATION_EPSILON_FACTOR).toBe(64);
    expect(TEAM_UNIT_GRADES_2026_EXPECTED_GRADE_VALUE_COUNT).toBe(966);

    const originalAirForce = 1.4852971677973312;
    const canonicalAirForce = canonicalizeTeamUnitGradeValue(originalAirForce);
    expect(canonicalAirForce).toBe(1.48529716779733);
    expect(canonicalAirForce).not.toBe(originalAirForce);

    const proposed = makeRows();
    proposed[0] = { ...proposed[0], offRunGrade: originalAirForce };
    const canonicalized = canonicalizeProposedGradeRows(proposed);
    expect(canonicalized.rows[0].offRunGrade).toBe(canonicalAirForce);
    expect(canonicalized.summary.significantDigits).toBe(15);
    expect(canonicalized.summary.valueCount).toBe(966);
    expect(canonicalized.summary.changedValueCount).toBeGreaterThan(0);
    expect(canonicalized.summary.withinDeltaGuard).toBe(true);
    expect(canonicalized.summary.maxScaledEpsilonUnits).toBeLessThanOrEqual(64);

    const persisted = canonicalized.rows.map((row) => ({ ...row, season: 2026 }));
    expect(exactGradeRowsMatch(canonicalized.rows, persisted, 2026)).toBe(true);
    expect(exactGradeRowsMatch(proposed, persisted, 2026)).toBe(false);

    persisted[0] = { ...persisted[0], havocGrade: persisted[0].havocGrade + 1e-9 };
    expect(exactGradeRowsMatch(canonicalized.rows, persisted, 2026)).toBe(false);
  });

  it('requires exact 138-row, finite, identity-preserving persistence', () => {
    expect(cli).toContain('fbs_population_not_exactly_138');
    expect(cli).toContain('existing_team_unit_grades_not_empty');
    expect(cli).toContain('calculation_input_count_not_138');
    expect(cli).toContain('proposed_rows_not_138');
    expect(cli).toContain('nonfinite_grade:');
    expect(cli).toContain('canonicalized_grade_value_count_not_966');
    expect(cli).toContain('canonicalization_delta_guard_exceeded');
  });
});