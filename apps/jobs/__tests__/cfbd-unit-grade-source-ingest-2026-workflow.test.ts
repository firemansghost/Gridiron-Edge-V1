/**
 * Static checks for guarded 2026 CFBD unit-grade source ingest workflow.
 * No network. No DB. No production ingest.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const WF = path.join(
  ROOT,
  '.github/workflows/write-cfbd-unit-grade-sources-2026-manual.yml'
);
const CLI = path.join(ROOT, 'apps/jobs/write-cfbd-unit-grade-sources-2026.ts');
const LIB = path.join(
  ROOT,
  'apps/jobs/src/v2/cfbd-unit-grade-source-ingest-2026.ts'
);

function commitPlanSource(cliSrc: string): string {
  const idx = cliSrc.indexOf('async function commitPlan');
  if (idx < 0) return '';
  const rest = cliSrc.slice(idx);
  const next = rest.search(/\nasync function /);
  return next === -1 ? rest : rest.slice(0, next);
}

function stepBlock(src: string, stepName: string): string {
  const marker = `- name: ${stepName}`;
  const idx = src.indexOf(marker);
  if (idx < 0) return '';
  const rest = src.slice(idx);
  const next = rest.search(/\n\s*- name:/);
  return next === -1 ? rest : rest.slice(0, next);
}

function extractRunBodies(yaml: string): string {
  const runBodies: string[] = [];
  const lines = yaml.split(/\r?\n/);
  let inRun = false;
  let runIndent = 0;
  for (const line of lines) {
    const runMatch = line.match(/^(\s*)run:\s*(\||>)?\s*$/);
    if (runMatch) {
      inRun = true;
      runIndent = runMatch[1].length;
      continue;
    }
    if (inRun) {
      const m = line.match(/^(\s*)/);
      const indent = m ? m[1].length : 0;
      if (line.trim() !== '' && indent <= runIndent) {
        inRun = false;
      } else {
        runBodies.push(line);
      }
    }
  }
  return runBodies.join('\n');
}

describe('2026 CFBD unit-grade source ingest workflow', () => {
  const wf = fs.readFileSync(WF, 'utf8').replace(/\r\n/g, '\n');
  const cli = fs.readFileSync(CLI, 'utf8');
  const lib = fs.readFileSync(LIB, 'utf8');
  const runText = extractRunBodies(wf);

  it('workflow_dispatch only; PREVIEW default; PREVIEW/COMMIT modes', () => {
    expect(wf).toContain('workflow_dispatch');
    expect(wf).toMatch(/default:\s*PREVIEW/);
    expect(wf).toContain('PREVIEW');
    expect(wf).toContain('COMMIT');
    expect(wf).not.toMatch(/^\s*schedule:/m);
    expect(wf).not.toMatch(/^\s*push:/m);
    expect(wf).not.toMatch(/^\s*pull_request:/m);
    expect(wf).not.toMatch(/cron:/);
    expect(wf).not.toMatch(/strategy:/);
    expect(wf).not.toMatch(/matrix:/);
    expect(wf).toMatch(/jobs:\n  ingest:/);
  });

  it('season 2026 only; exact COMMIT confirmation; SHA + main guards', () => {
    expect(wf).toContain('season must equal 2026');
    expect(wf).toContain('INGEST_2026_CFBD_UNIT_GRADE_SOURCES');
    expect(wf).toContain('expected_main_sha');
    const guard = stepBlock(wf, 'Source SHA guard');
    expect(guard).toContain('refs/heads/main');
    expect(guard).toContain('git rev-parse HEAD');
    expect(wf.indexOf('- name: Source SHA guard')).toBeLessThan(
      wf.indexOf('- name: Setup Node.js')
    );
    expect(cli).toContain('UNIT_GRADE_SOURCE_CONFIRMATION');
    expect(lib).toContain('INGEST_2026_CFBD_UNIT_GRADE_SOURCES');
  });

  it('no Odds key; CFBD key scoped only to execution; DIRECT_URL scoped', () => {
    expect(wf).toContain('ODDS_API_KEY: not provided');
    expect(wf).not.toMatch(/secrets\.ODDS_API_KEY/);
    const jobsPreamble = wf.split(/^\s+steps:\s*$/m)[0] ?? '';
    expect(jobsPreamble).not.toMatch(/secrets\.DIRECT_URL/);
    expect(jobsPreamble).not.toMatch(/secrets\.CFBD_API_KEY/);
    const install = stepBlock(wf, 'Install dependencies');
    const generate = stepBlock(wf, 'Generate Prisma client');
    const preflight = stepBlock(wf, 'Preflight (names/presence only)');
    const exec = stepBlock(wf, 'Run guarded 2026 CFBD unit-grade source ingest');
    const upload = stepBlock(wf, 'Upload unit-grade source ingest report');
    const summary = stepBlock(wf, 'Summary');
    expect(install).not.toMatch(/secrets\.DIRECT_URL/);
    expect(install).not.toMatch(/secrets\.CFBD_API_KEY/);
    expect(generate).not.toMatch(/secrets\.DIRECT_URL/);
    expect(generate).not.toMatch(/secrets\.CFBD_API_KEY/);
    expect(upload).not.toMatch(/secrets\.DIRECT_URL/);
    expect(summary).not.toMatch(/secrets\.DIRECT_URL/);
    expect(summary).not.toMatch(/secrets\.CFBD_API_KEY/);
    expect(preflight).toMatch(/DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/);
    expect(preflight).not.toMatch(/secrets\.CFBD_API_KEY/);
    expect(exec).toMatch(/DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/);
    expect(exec).toMatch(/CFBD_API_KEY:\s*\$\{\{\s*secrets\.CFBD_API_KEY\s*\}\}/);
    expect(runText).not.toMatch(/\$\{\{\s*inputs\./);
  });

  it('does not invoke compute, old feature ingest, Shadow, migrate, or TeamUnitGrades mutation', () => {
    expect(wf).toContain('compute_unit_grades: not invoked');
    expect(wf).toContain('cfbd-feature-ingest: not invoked');
    expect(runText).not.toMatch(/npx tsx[^\n]*compute_unit_grades/);
    expect(runText).not.toMatch(/npx tsx[^\n]*ingest-cfbd-features/);
    expect(runText).not.toMatch(/npx tsx[^\n]*capture-shadow-snapshot/);
    expect(runText).not.toMatch(/prisma migrate deploy/);
    expect(cli).not.toContain('teamUnitGrades.upsert');
    expect(cli).not.toContain('teamUnitGrades.create');
    expect(cli).not.toContain('cfbdPriorsTeamSeason');
    expect(cli).not.toContain('shadowCaptureRun.create');
    expect(cli).not.toContain('migrate deploy');
    expect(cli).toContain('TransactionIsolationLevel.Serializable');
    expect(cli).toContain('timeout: CFBD_UNIT_GRADE_SOURCE_TRANSACTION_TIMEOUT_MS');
    expect(lib).toContain('CFBD_UNIT_GRADE_SOURCE_TRANSACTION_TIMEOUT_MS = 30_000');
    expect(lib).toContain('CFBD_UNIT_GRADE_SOURCE_PROCESS_MAX_CONCURRENCY = 1');
    expect(lib).not.toMatch(/Promise\.all\([\s\S]{0,200}getJson/);
    expect(lib).not.toMatch(/Promise\.all\([\s\S]{0,200}fetchUnitGradeSourcePayloads/);
    const commit = commitPlanSource(cli);
    expect(commit).toContain('isolationLevel: Prisma.TransactionIsolationLevel.Serializable');
    expect(commit).toContain('timeout: CFBD_UNIT_GRADE_SOURCE_TRANSACTION_TIMEOUT_MS');
    expect(commit).not.toMatch(/Promise\.all/);
    expect(commit).not.toMatch(/chunk/i);
    expect(commit).not.toMatch(/partial.?commit/i);
    expect(commit).not.toMatch(/partial.?recover/i);
    expect(commit).not.toMatch(/retryFailedCommit/i);
    expect(cli.split('$transaction(').length).toBe(2);
  });
});
