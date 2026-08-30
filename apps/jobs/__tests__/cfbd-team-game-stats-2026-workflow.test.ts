/**
 * 2C-2J-6D-1 — static workflow security for guarded CFBD TeamGameStat writer.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const WF_MANUAL = path.join(
  ROOT,
  '.github/workflows/cfbd-team-game-stats-2026-manual.yml'
);
const WF_LEGACY_STATS = path.join(ROOT, '.github/workflows/stats-cfbd.yml');
const WF_FEATURE = path.join(
  ROOT,
  '.github/workflows/cfbd-feature-ingest.yml'
);
const CLI = path.join(ROOT, 'apps/jobs/write-cfbd-team-game-stats-2026.ts');
const LEGACY_STATS = path.join(
  ROOT,
  'apps/jobs/src/stats/cfbd_team_stats.ts'
);

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

describe('2C-2J-6D-1 canonical CFBD TeamGameStat workflow', () => {
  const wf = fs.readFileSync(WF_MANUAL, 'utf8');
  const cli = fs.readFileSync(CLI, 'utf8');

  it('legacy stats-cfbd.yml and cfbd_team_stats.ts still exist on disk', () => {
    expect(fs.existsSync(WF_LEGACY_STATS)).toBe(true);
    expect(fs.existsSync(LEGACY_STATS)).toBe(true);
    expect(fs.existsSync(WF_FEATURE)).toBe(true);
  });

  it('manual workflow exists; workflow_dispatch only; no schedule/cron', () => {
    expect(fs.existsSync(WF_MANUAL)).toBe(true);
    expect(wf).toContain('name: 2026 CFBD TeamGameStat (Manual, Guarded)');
    expect(wf).toMatch(/^\s*workflow_dispatch:\s*$/m);
    expect(wf).not.toMatch(/^\s*schedule:\s*$/m);
    expect(wf).not.toMatch(/^\s*push:\s*$/m);
    expect(wf).not.toMatch(/^\s*pull_request:\s*$/m);
    expect(wf).not.toMatch(/cron:/);
  });

  it('fresh concurrency; PREVIEW default; exact COMMIT confirmation', () => {
    expect(wf).toContain(
      'cfbd-team-game-stats-2026-manual-v1-${{ inputs.season }}-${{ inputs.week }}'
    );
    expect(wf).toContain('cancel-in-progress: false');
    expect(wf).toMatch(/default:\s*PREVIEW/);
    expect(wf).toContain('WRITE_2026_WEEK_');
    expect(wf).toContain('_TEAM_GAME_STATS');
    expect(wf).not.toMatch(/default:\s*['"]?current['"]?/i);
  });

  it('invokes only write-cfbd-team-game-stats-2026; does not invoke legacy paths', () => {
    const runBodies = collectRunBodies(wf);
    expect(wf).toContain('write-cfbd-team-game-stats-2026.ts');
    expect(runBodies).toContain('write-cfbd-team-game-stats-2026.ts');
    const tsxInvocations = runBodies.match(/npx tsx\s+\S+/g) ?? [];
    expect(tsxInvocations.length).toBeGreaterThan(0);
    for (const inv of tsxInvocations) {
      expect(inv).toContain('write-cfbd-team-game-stats-2026.ts');
    }
    expect(runBodies).not.toMatch(/npx tsx\s+.*cfbd_team_stats/);
    expect(runBodies).not.toMatch(/npx tsx\s+.*cfbd-feature-ingest/);
    expect(wf).not.toMatch(/uses:\s*.*stats-cfbd/);
    expect(wf).not.toMatch(/workflow_call:/);
    expect(cli).toContain('2C-2J-6D-1');
    expect(cli).not.toContain('--force');
  });

  it('missing CFBD key fails hard; no Odds/SGO/weather; artifact upload', () => {
    expect(wf).toContain('CFBD_API_KEY is missing or empty');
    expect(wf).not.toMatch(/if:.*CFBD_API_KEY\s*!=\s*''/);
    expect(wf).not.toMatch(/secrets\.ODDS_API_KEY/);
    expect(wf).not.toMatch(/secrets\.SGO_API_KEY/);
    expect(wf).not.toMatch(/secrets\.VISUALCROSSING/);
    expect(wf).toContain('Upload CFBD TeamGameStat audit report');
    expect(wf).toContain('if-no-files-found: warn');
    expect(wf).toContain('actions/upload-artifact');
    expect(wf).toContain('reports/cfbd-team-game-stats-2026-*.json');
  });

  it('no direct inputs in run bodies; DIRECT_URL only on writer step', () => {
    const preflight = stepBlock(wf, 'Preflight (names/presence only)');
    const card = stepBlock(wf, 'Run guarded 2026 CFBD TeamGameStat writer');
    expect(preflight).not.toMatch(/secrets\.DIRECT_URL/);
    expect(preflight).not.toContain('CFBD_API_KEY');
    expect(card).toMatch(/DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/);
    expect(card).toMatch(/CFBD_API_KEY:\s*\$\{\{\s*secrets\.CFBD_API_KEY\s*\}\}/);
    expect(collectRunBodies(wf)).not.toMatch(/\$\{\{\s*inputs\./);
  });

  it('CLI uses Serializable isolation and confirmation-before-provider gate', () => {
    expect(cli).toContain('TransactionIsolationLevel.Serializable');
    expect(cli).toContain('executeAtomicTeamGameStatCommit');
    expect(cli).toContain('expectedTeamGameStatConfirmation');
    expect(cli).toContain('provider call skipped');
  });

  it('checkout@v6 setup-node@v6 node 20; summary mentions providerCalls/write status', () => {
    expect(wf).toContain('actions/checkout@v6');
    expect(wf).toContain('actions/setup-node@v6');
    expect(wf).toContain("node-version: '20'");
    expect(wf).toMatch(/providerCalls/i);
    expect(wf).toMatch(/write status/i);
    expect(wf).toMatch(/not production-authorized merely by merge/i);
  });
});
