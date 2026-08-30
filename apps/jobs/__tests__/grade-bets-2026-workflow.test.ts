/**
 * 2C-2J-6C-1 — static workflow security for guarded official grading.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const WF_LEGACY = path.join(ROOT, '.github/workflows/grade-bets.yml');
const WF_MANUAL = path.join(
  ROOT,
  '.github/workflows/grade-bets-2026-manual.yml'
);
const CLI = path.join(ROOT, 'apps/jobs/grade-bets-2026.ts');
const LEGACY_CLI = path.join(ROOT, 'apps/jobs/grade-bets.ts');

function stepBlock(src: string, stepName: string): string {
  const marker = `- name: ${stepName}`;
  const idx = src.indexOf(marker);
  if (idx < 0) return '';
  const rest = src.slice(idx);
  const next = rest.search(/\n\s*- name:/);
  return next === -1 ? rest : rest.slice(0, next);
}

function collectRunBodies(src: string): string {
  const runBodies: string[] = [];
  const lines = src.split(/\r?\n/);
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

describe('2C-2J-6C-1 legacy Grade Bets hold', () => {
  const wf = fs.readFileSync(WF_LEGACY, 'utf8');

  it('schedule/dispatch are hold-only; cannot invoke grading writer', () => {
    expect(wf).toContain('grading-hold');
    expect(wf).toContain('Hold Grade Bets (2C-2J-6C-1)');
    expect(wf).toContain('gradingWrites=false');
    expect(wf).toContain('dbAccess=false');
    expect(wf).not.toMatch(/actions\/checkout/);
    expect(wf).not.toMatch(/npm ci/);
    expect(wf).not.toMatch(/npm run build:jobs/);
    expect(wf).not.toMatch(/npm run grade:bets --/);
    expect(wf).not.toMatch(/run:\s*npm run grade:bets/);
    expect(wf).not.toContain('grade-bets-2026.ts');
    expect(wf).not.toMatch(/secrets\.(DIRECT_URL|DATABASE_URL|CFBD|ODDS|SGO)/);
    const hold = stepBlock(wf, 'Hold Grade Bets (2C-2J-6C-1)');
    expect(hold).toContain('not invoked');
    expect(hold).not.toMatch(/secrets\./);
  });
});

describe('2C-2J-6C-1 fresh manual grading workflow', () => {
  const wf = fs.readFileSync(WF_MANUAL, 'utf8');
  const cli = fs.readFileSync(CLI, 'utf8');
  const legacyCli = fs.readFileSync(LEGACY_CLI, 'utf8');

  it('manual-only; PREVIEW default; fresh concurrency; confirmation gate', () => {
    expect(fs.existsSync(WF_MANUAL)).toBe(true);
    expect(wf).toContain('name: 2026 Grade Bets (Manual, Guarded)');
    expect(wf).toMatch(/^\s*workflow_dispatch:\s*$/m);
    expect(wf).not.toMatch(/^\s*schedule:\s*$/m);
    expect(wf).not.toMatch(/cron:/);
    expect(wf).toMatch(/default:\s*PREVIEW/);
    expect(wf).toContain(
      'grade-bets-2026-manual-v1-${{ inputs.season }}-${{ inputs.week }}'
    );
    expect(wf).toContain('cancel-in-progress: false');
    expect(wf).toContain('GRADE_2026_WEEK_');
    expect(wf).toContain('_OFFICIAL');
    expect(wf).toContain('grade-bets-2026.ts');
    expect(wf).not.toMatch(/npm run grade:bets --/);
    expect(wf).not.toMatch(/run:\s*npm run grade:bets/);
  });

  it('no provider secrets/calls; DIRECT_URL only on grading step; artifact upload', () => {
    expect(wf).not.toMatch(/secrets\.CFBD_API_KEY/);
    expect(wf).not.toMatch(/secrets\.ODDS_API_KEY/);
    expect(wf).not.toMatch(/secrets\.SGO_API_KEY/);
    expect(wf).not.toMatch(/secrets\.VISUALCROSSING/);
    const preflight = stepBlock(wf, 'Preflight (names/presence only)');
    const grade = stepBlock(wf, 'Run guarded 2026 official bet grading');
    expect(preflight).not.toMatch(/secrets\.DIRECT_URL/);
    expect(grade).toMatch(/DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/);
    expect(collectRunBodies(wf)).not.toMatch(/\$\{\{\s*inputs\./);
    expect(wf).toContain('Upload grading audit report');
    expect(wf).toContain('if: always()');
    expect(wf).toContain('if-no-files-found: warn');
  });

  it('CLI is Serializable, official_flat_100 only, no closePrice mutation, no --force', () => {
    expect(cli).toContain('TransactionIsolationLevel.Serializable');
    expect(cli).toContain('executeAtomicOfficialGradeCommit');
    expect(cli).toContain('official_flat_100');
    expect(cli).toContain('OFFICIAL_SOURCE');
    expect(cli).toContain('OFFICIAL_STRATEGY_TAG');
    expect(cli).not.toContain('--force');
    expect(cli).toMatch(/result:\s*row\.result/);
    expect(cli).toMatch(/pnl:\s*row\.pnl/);
    expect(cli).toMatch(/clv:\s*row\.clv/);
    expect(cli).not.toMatch(/data:\s*\{[^}]*closePrice/s);
    // Legacy writer retained but not invoked by new workflow
    expect(legacyCli).toContain('gradeMoneyline');
    expect(wf).not.toContain('apps/jobs/grade-bets.ts');
  });
});
