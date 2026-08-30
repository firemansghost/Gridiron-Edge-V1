/**
 * 2C-2J-6C-2 — static workflow security for canonical guarded CFBD scores.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const WF_LEGACY = path.join(ROOT, '.github/workflows/cfbd-scores-sync.yml');
const WF_MANUAL = path.join(
  ROOT,
  '.github/workflows/cfbd-scores-2026-manual.yml'
);
const WF_ONETIME = path.join(
  ROOT,
  '.github/workflows/one-time-week1-odds-core-preview-2026-08-29.yml'
);
const CLI = path.join(ROOT, 'apps/jobs/write-cfbd-scores-2026.ts');
const LEGACY = path.join(ROOT, 'apps/jobs/src/cfbd-game-results.ts');

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

describe('2C-2J-6C-2 canonical CFBD scores workflow', () => {
  const wf = fs.readFileSync(WF_MANUAL, 'utf8');
  const cli = fs.readFileSync(CLI, 'utf8');

  it('legacy score workflow and expired one-time workflow are absent', () => {
    expect(fs.existsSync(WF_LEGACY)).toBe(false);
    expect(fs.existsSync(WF_ONETIME)).toBe(false);
    expect(wf).not.toContain('name: CFBD Scores Sync');
  });

  it('manual workflow exists; workflow_dispatch only; no schedule/cron', () => {
    expect(fs.existsSync(WF_MANUAL)).toBe(true);
    expect(wf).toContain('name: 2026 CFBD Scores (Manual, Guarded)');
    expect(wf).toMatch(/^\s*workflow_dispatch:\s*$/m);
    expect(wf).not.toMatch(/^\s*schedule:\s*$/m);
    expect(wf).not.toMatch(/^\s*push:\s*$/m);
    expect(wf).not.toMatch(/^\s*pull_request:\s*$/m);
    expect(wf).not.toMatch(/cron:/);
  });

  it('fresh concurrency; PREVIEW default; exact COMMIT confirmation', () => {
    expect(wf).toContain(
      'cfbd-scores-2026-manual-v1-${{ inputs.season }}-${{ inputs.week }}'
    );
    expect(wf).toContain('cancel-in-progress: false');
    expect(wf).not.toMatch(/cfbd-scores-sync-2026-/);
    expect(wf).toMatch(/default:\s*PREVIEW/);
    expect(wf).toContain('WRITE_2026_WEEK_');
    expect(wf).toContain('_SCORES');
    expect(wf).not.toMatch(/default:\s*['"]?current['"]?/i);
    expect(wf).not.toMatch(/^\s*force:/m);
  });

  it('invokes only write-cfbd-scores-2026; historical script retained but unused', () => {
    expect(wf).toContain('write-cfbd-scores-2026.ts');
    expect(wf).not.toMatch(/cfbd-game-results\.js/);
    expect(wf).not.toMatch(/dist\/src\/cfbd-game-results/);
    expect(cli).toContain('2C-2J-6B');
    expect(cli).not.toContain('--force');
    expect(fs.existsSync(LEGACY)).toBe(true);
  });

  it('missing CFBD key fails hard; no Odds/SGO/weather; artifact upload', () => {
    expect(wf).toContain('CFBD_API_KEY is missing or empty');
    expect(wf).not.toMatch(/if:.*CFBD_API_KEY\s*!=\s*''/);
    expect(wf).not.toMatch(/secrets\.ODDS_API_KEY/);
    expect(wf).not.toMatch(/secrets\.SGO_API_KEY/);
    expect(wf).not.toMatch(/secrets\.VISUALCROSSING/);
    expect(wf).toContain('Upload CFBD score audit report');
    expect(wf).toContain('if-no-files-found: warn');
    expect(wf).toContain('actions/upload-artifact');
  });

  it('no direct inputs in run bodies; DIRECT_URL only on score DB step', () => {
    const preflight = stepBlock(wf, 'Preflight (names/presence only)');
    const card = stepBlock(wf, 'Run guarded 2026 CFBD score writer');
    expect(preflight).not.toMatch(/secrets\.DIRECT_URL/);
    expect(preflight).not.toContain('CFBD_API_KEY');
    expect(card).toMatch(/DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/);
    expect(card).toMatch(/CFBD_API_KEY:\s*\$\{\{\s*secrets\.CFBD_API_KEY\s*\}\}/);
    expect(collectRunBodies(wf)).not.toMatch(/\$\{\{\s*inputs\./);
  });

  it('CLI uses Serializable isolation and confirmation-before-provider gate', () => {
    expect(cli).toContain('TransactionIsolationLevel.Serializable');
    expect(cli).toContain('executeAtomicScoreCommitWithNormalized');
    expect(cli).toContain('expectedScoreConfirmation');
    expect(cli).toContain('provider call skipped');
  });
});
