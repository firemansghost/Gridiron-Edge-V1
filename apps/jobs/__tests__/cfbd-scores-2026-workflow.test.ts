/**
 * 2C-2J-6B — static workflow security for guarded CFBD score sync.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const WF = path.join(ROOT, '.github/workflows/cfbd-scores-sync.yml');
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

describe('2C-2J-6B CFBD scores workflow security', () => {
  const wf = fs.readFileSync(WF, 'utf8');
  const cli = fs.readFileSync(CLI, 'utf8');

  it('invokes new 2026 writer; legacy cfbd-game-results not invoked', () => {
    expect(wf).toContain('write-cfbd-scores-2026.ts');
    expect(wf).not.toMatch(/cfbd-game-results\.js/);
    expect(wf).not.toMatch(/dist\/src\/cfbd-game-results/);
    expect(cli).toContain('2C-2J-6B');
    expect(fs.existsSync(LEGACY)).toBe(true); // retained historically
  });

  it('PREVIEW default; COMMIT confirmation wired; no current/force', () => {
    expect(wf).toMatch(/default:\s*PREVIEW/);
    expect(wf).toContain('WRITE_2026_WEEK_');
    expect(wf).toContain('_SCORES');
    expect(wf).not.toMatch(/default:\s*['"]?current['"]?/i);
    expect(wf).not.toMatch(/^\s*force:/m);
    expect(cli).not.toContain('--force');
  });

  it('schedule cannot reach provider/DB path in 6B', () => {
    expect(wf).toContain('scheduled-hold');
    expect(wf).toMatch(/if:\s*github\.event_name\s*==\s*'schedule'/);
    expect(wf).toMatch(/if:\s*github\.event_name\s*==\s*'workflow_dispatch'/);
    const hold = stepBlock(wf, 'Hold scheduled score sync (2C-2J-6B)');
    expect(hold).toContain('providerCalls=0');
    expect(hold).not.toMatch(/secrets\./);
    expect(hold).not.toContain('CFBD_API_KEY');
    expect(hold).not.toContain('DIRECT_URL');
    expect(hold).not.toContain('write-cfbd-scores-2026');
  });

  it('missing CFBD key fails hard; no Odds/SGO/weather; artifact upload', () => {
    expect(wf).toContain('CFBD_API_KEY is missing or empty');
    expect(wf).not.toMatch(/if:.*CFBD_API_KEY\s*!=\s*''/);
    expect(wf).not.toMatch(/secrets\.ODDS_API_KEY/);
    expect(wf).not.toMatch(/secrets\.SGO_API_KEY/);
    expect(wf).not.toMatch(/secrets\.VISUALCROSSING/);
    expect(wf).toContain('Upload CFBD score audit report');
    expect(wf).toContain('if-no-files-found: warn');
  });

  it('no direct inputs in run bodies; DIRECT_URL only on score DB step', () => {
    const preflight = stepBlock(wf, 'Preflight (names/presence only)');
    const card = stepBlock(wf, 'Run guarded 2026 CFBD score writer');
    expect(preflight).not.toMatch(/secrets\.DIRECT_URL/);
    expect(card).toMatch(/DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/);

    const runBodies: string[] = [];
    const lines = wf.split(/\r?\n/);
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
    expect(runBodies.join('\n')).not.toMatch(/\$\{\{\s*inputs\./);
  });

  it('CLI uses Serializable isolation and confirmation-before-provider gate', () => {
    expect(cli).toContain('TransactionIsolationLevel.Serializable');
    expect(cli).toContain('executeAtomicScoreCommitWithNormalized');
    expect(cli).toContain('expectedScoreConfirmation');
    // confirmation validated in parse before fetch; COMMIT path also checks before call
    expect(cli).toContain('provider call skipped');
  });
});
