/**
 * Static checks for Generic Shadow T-30 Automation V1 closing-commit workflow/CLI.
 * No network, DB, provider, or production mutation.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const WF = path.join(
  ROOT,
  '.github/workflows/run-generic-shadow-t30-automation-v1-closing-commit-2026-manual.yml'
);
const CLI = path.join(
  ROOT,
  'apps/jobs/run-generic-shadow-t30-automation-v1-closing-commit-2026.ts'
);
const ADAPTER = path.join(
  ROOT,
  'apps/jobs/src/generic-shadow-t30-automation-v1-closing-commit-adapter.ts'
);
const PLANNER = path.join(
  ROOT,
  'apps/web/lib/generic-shadow-t30-automation-v1-closing-commit.ts'
);
const STAGE_C_WF = path.join(
  ROOT,
  '.github/workflows/run-generic-shadow-t30-automation-v1-market-refresh-2026-manual.yml'
);
const MANUAL_CLOSING_WF = path.join(
  ROOT,
  '.github/workflows/capture-shadow-model-t30-closing-v1-2026-manual.yml'
);
const LIVE_ODDS_WF = path.join(ROOT, '.github/workflows/write-live-odds-2026.yml');

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

describe('Generic Shadow T-30 Automation V1 closing-commit workflow', () => {
  const wf = fs.readFileSync(WF, 'utf8');
  const cli = fs.readFileSync(CLI, 'utf8');
  const adapter = fs.readFileSync(ADAPTER, 'utf8');
  const planner = fs.readFileSync(PLANNER, 'utf8');
  const runText = extractRunBodies(wf);
  const stageCWf = fs.readFileSync(STAGE_C_WF, 'utf8');
  const manualClosingWf = fs.readFileSync(MANUAL_CLOSING_WF, 'utf8');
  const liveOddsWf = fs.readFileSync(LIVE_ODDS_WF, 'utf8');

  it('is manual workflow_dispatch only with no schedule or event triggers', () => {
    expect(wf).toContain('workflow_dispatch');
    expect(wf).not.toMatch(/^\s*schedule:/m);
    expect(wf).not.toMatch(/^\s*push:/m);
    expect(wf).not.toMatch(/^\s*pull_request:/m);
    expect(wf).not.toMatch(/^\s*workflow_run:/m);
    expect(wf).toContain('cancel-in-progress: false');
    expect(wf).toContain('generic-shadow-t30-automation-v1-production');
    expect(planner).toContain('GENERIC_SHADOW_T30_CLOSING_COMMIT_SCHEDULE_ENABLED = false');
  });

  it('requires main plus exact expected SHA before dependency install or DB/writer access', () => {
    const guard = stepBlock(wf, 'Source SHA guard');
    expect(guard).toContain('git rev-parse HEAD');
    expect(guard).toContain('refs/heads/main');
    expect(guard).toContain('EXPECTED_MAIN_SHA');
    expect(wf.indexOf('- name: Source SHA guard')).toBeLessThan(
      wf.indexOf('- name: Install dependencies')
    );
    expect(wf.indexOf('- name: Source SHA guard')).toBeLessThan(
      wf.indexOf('- name: Plan closing-commit cycle (read-only)')
    );
    expect(wf.indexOf('- name: Source SHA guard')).toBeLessThan(
      wf.indexOf('- name: Write terminal COMMIT cycle report')
    );
    expect(guard).not.toMatch(/secrets\.DIRECT_URL/);
    expect(guard).not.toMatch(/ODDS_API_KEY/);
  });

  it('does not receive ODDS_API_KEY or other provider secrets', () => {
    expect(wf).not.toMatch(/secrets\.ODDS_API_KEY/);
    expect(cli).not.toMatch(/process\.env\.ODDS_API_KEY/);
    expect(adapter).not.toMatch(/process\.env\.ODDS_API_KEY/);
    expect(adapter).not.toMatch(/secrets\.ODDS_API_KEY/);
    expect(planner).not.toMatch(/ODDS_API_KEY/);
    expect(wf).not.toMatch(/secrets\.CFBD_API_KEY/);
    expect(wf).not.toMatch(/secrets\.SGO_API_KEY/);
    expect(wf).not.toMatch(/secrets\.VISUALCROSSING_API_KEY/);
    expect(runText).not.toMatch(/\$\{\{\s*inputs\./);
    const plan = stepBlock(wf, 'Plan closing-commit cycle (read-only)');
    const commit = stepBlock(wf, 'Write terminal COMMIT cycle report');
    expect(plan).toMatch(/DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/);
    expect(commit).toMatch(/DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/);
    expect(plan).not.toMatch(/secrets\.ODDS_API_KEY/);
    expect(commit).not.toMatch(/secrets\.ODDS_API_KEY/);
  });

  it('does not invoke Live Odds, MarketLine, migrations, or unrelated writers', () => {
    expect(wf).not.toContain('write-live-odds-2026.ts');
    expect(cli).not.toContain('write-live-odds-2026.ts');
    expect(adapter).not.toContain('write-live-odds-2026.ts');
    expect(adapter).not.toContain('invokeGuardedLiveOddsCommit');
    expect(wf).not.toContain('prisma migrate deploy');
    expect(wf).not.toContain('prisma migrate dev');
    expect(wf).not.toContain('prisma db push');
    expect(cli).not.toContain('prisma migrate');
    expect(adapter).not.toMatch(/prisma\.marketLine/);
    expect(adapter).not.toMatch(/prisma\.shadowModelPrediction/);
    expect(planner).toContain("'ShadowModelClosingMarketSnapshot'");
    expect(planner).toContain('closingRowsInserted');
  });

  it('composes the existing Generic closing COMMIT CLI per DUE capture run', () => {
    expect(adapter).toContain('apps/jobs/capture-shadow-model-t30-closing-v1-2026.ts');
    expect(adapter).toContain("'COMMIT'");
    expect(adapter).toContain('expectedGenericShadowT30ClosingChildConfirmation');
    expect(adapter.split('apps/jobs/capture-shadow-model-t30-closing-v1-2026.ts').length - 1).toBe(1);
    expect(cli).toContain('invokeGuardedGenericShadowT30ClosingCommit');
  });

  it('does not alter the existing manual closing or Stage C market-refresh workflows', () => {
    expect(manualClosingWf).toContain('name: Capture Generic Shadow Model T-30 Closing V1 2026 (Manual, Guarded)');
    expect(manualClosingWf).toContain('capture-shadow-model-t30-closing-v1-2026.ts');
    expect(stageCWf).toContain('name: Generic Shadow T-30 Automation V1 Market Refresh 2026 (Manual, Guarded, Schedule Disabled)');
    expect(stageCWf).toContain('No Generic closing COMMIT');
    expect(liveOddsWf).toContain('name: Preview/Write 2026 Live Odds (Manual, Guarded)');
  });

  it('writes a terminal COMMIT report for no-op COMMIT and preserves per-run child artifacts', () => {
    const commit = stepBlock(wf, 'Write terminal COMMIT cycle report');
    const upload = stepBlock(wf, 'Upload Generic Shadow T-30 closing-commit report');
    expect(commit).toContain('--mode COMMIT');
    expect(commit).toContain('--initial-report');
    expect(commit).toContain('closing-commit-COMMIT.json');
    expect(commit).toContain('--child-report-dir');
    expect(upload).toContain('generic-shadow-t30-automation-v1-2026-*-closing-commit-*.json');
    expect(upload).toContain('generic-shadow-t30-automation-v1-closing-child-*.json');
    expect(adapter).toContain('generic-shadow-t30-automation-v1-closing-child-');
    expect(cli).toContain('scheduleEnabled=false');
    expect(wf).toContain('IMPLEMENTED / SCHEDULE DISABLED / PRODUCTION EXECUTION NOT AUTHORIZED');
  });
});
