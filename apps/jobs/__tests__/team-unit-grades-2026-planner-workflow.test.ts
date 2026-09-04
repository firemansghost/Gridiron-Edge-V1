/**
 * Static checks for read-only 2026 TeamUnitGrades PREVIEW workflow.
 * No network. No DB. No production preview.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const WF = path.join(
  ROOT,
  '.github/workflows/preview-team-unit-grades-2026-manual.yml'
);
const CLI = path.join(ROOT, 'apps/jobs/preview-team-unit-grades-2026.ts');
const LIB = path.join(ROOT, 'apps/jobs/src/v2/team-unit-grades-2026-planner.ts');

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

describe('2026 TeamUnitGrades PREVIEW workflow', () => {
  const wf = fs.readFileSync(WF, 'utf8').replace(/\r\n/g, '\n');
  const cli = fs.readFileSync(CLI, 'utf8');
  const lib = fs.readFileSync(LIB, 'utf8');
  const runText = extractRunBodies(wf);

  it('workflow_dispatch only; PREVIEW only; no COMMIT mode', () => {
    expect(wf).toContain('workflow_dispatch');
    expect(wf).toMatch(/default:\s*'2026'/);
    expect(wf).toContain('mode=PREVIEW');
    expect(wf).toContain('COMMIT mode: not present');
    expect(wf).not.toMatch(/^\s*schedule:/m);
    expect(wf).not.toMatch(/^\s*push:/m);
    expect(wf).not.toMatch(/^\s*pull_request:/m);
    expect(wf).not.toMatch(/cron:/);
    expect(wf).not.toMatch(/strategy:/);
    expect(wf).not.toMatch(/matrix:/);
    expect(wf).not.toMatch(/confirm:/);
    expect(wf).toMatch(/jobs:\n  preview:/);
    expect(cli).toContain('COMMIT is not a mode of this CLI');
    expect(lib).toContain("TEAM_UNIT_GRADES_2026_MODE = 'PREVIEW'");
  });

  it('main ref guard and exact SHA guard run immediately after checkout', () => {
    expect(wf).toContain('permissions:\n  contents: read');
    expect(wf).toContain('expected_main_sha');
    const guard = stepBlock(wf, 'Source SHA guard');
    expect(guard).toContain('refs/heads/main');
    expect(guard).toContain('EXPECTED_MAIN_SHA');
    expect(guard).toContain('git rev-parse HEAD');
    expect(wf.indexOf('- name: Source SHA guard')).toBeGreaterThan(
      wf.indexOf('- name: Checkout repository')
    );
    expect(wf.indexOf('- name: Source SHA guard')).toBeLessThan(
      wf.indexOf('- name: Setup Node.js')
    );
    expect(cli).toContain("execFileSync('git', ['rev-parse', 'HEAD']");
  });

  it('no CFBD/ODDS secrets and no provider invocation', () => {
    expect(wf).toContain('CFBD_API_KEY: not provided');
    expect(wf).toContain('ODDS_API_KEY: not provided');
    expect(wf).not.toMatch(/secrets\.CFBD_API_KEY/);
    expect(wf).not.toMatch(/secrets\.ODDS_API_KEY/);
    expect(cli).not.toMatch(/CFBD_API_KEY|ODDS_API_KEY/);
    expect(cli).not.toMatch(/collegefootballdata|api\.the-odds-api/i);
    expect(lib).not.toMatch(/fetch\(|axios|CFBD_API_KEY|PrismaClient/);
    expect(runText).not.toMatch(/\$\{\{\s*inputs\./);
  });

  it('no compute writer, TeamUnitGrades mutation, Shadow, migrate, or COMMIT', () => {
    expect(wf).toContain('compute_unit_grades: not invoked');
    expect(wf).toContain('TeamUnitGrades writes: false');
    expect(wf).toContain('Shadow PREVIEW: not invoked');
    expect(wf).toContain('Shadow COMMIT: not invoked');
    expect(wf).toContain('prisma migrate: not invoked');
    expect(runText).not.toMatch(/npx tsx[^\n]*compute_unit_grades/);
    expect(runText).not.toMatch(/npx tsx[^\n]*write-cfbd-unit-grade-sources/);
    expect(runText).not.toMatch(/npx tsx[^\n]*capture-shadow-snapshot/);
    expect(runText).not.toMatch(/prisma migrate deploy/);
    expect(cli).not.toContain('teamUnitGrades.upsert');
    expect(cli).not.toContain('teamUnitGrades.create');
    expect(cli).not.toContain('teamUnitGrades.update');
    expect(cli).not.toMatch(/\.upsert\(|\.create\(|\.update\(|\.delete\(/);
    expect(cli).toContain('findMany');
    expect(cli).toContain('DIRECT_URL');
    expect(lib).toContain('LEGACY COMPATIBILITY IS NOT METHODOLOGY AUTHORIZATION.');
    expect(lib).toContain('rawMetricCoverageComplete');
  });
});
