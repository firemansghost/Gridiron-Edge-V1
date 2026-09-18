/**
 * Static checks for Generic Shadow T-30 Automation V1 market-refresh workflow/CLI.
 * No network, DB, provider, or production mutation.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const WF = path.join(
  ROOT,
  '.github/workflows/run-generic-shadow-t30-automation-v1-market-refresh-2026-manual.yml'
);
const CLI = path.join(
  ROOT,
  'apps/jobs/run-generic-shadow-t30-automation-v1-market-refresh-2026.ts'
);
const ADAPTER = path.join(
  ROOT,
  'apps/jobs/src/generic-shadow-t30-automation-v1-market-refresh-adapter.ts'
);
const PLANNER = path.join(
  ROOT,
  'apps/web/lib/generic-shadow-t30-automation-v1-market-refresh.ts'
);
const STAGE_A_WF = path.join(
  ROOT,
  '.github/workflows/preview-generic-shadow-t30-automation-v1-2026-manual.yml'
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

describe('Generic Shadow T-30 Automation V1 market-refresh workflow', () => {
  const wf = fs.readFileSync(WF, 'utf8');
  const cli = fs.readFileSync(CLI, 'utf8');
  const adapter = fs.readFileSync(ADAPTER, 'utf8');
  const planner = fs.readFileSync(PLANNER, 'utf8');
  const runText = extractRunBodies(wf);
  const liveOddsWf = fs.readFileSync(LIVE_ODDS_WF, 'utf8');
  const stageAWf = fs.readFileSync(STAGE_A_WF, 'utf8');

  it('is manual workflow_dispatch only with no schedule or event triggers', () => {
    expect(wf).toContain('workflow_dispatch');
    expect(wf).not.toMatch(/^\s*schedule:/m);
    expect(wf).not.toMatch(/^\s*push:/m);
    expect(wf).not.toMatch(/^\s*pull_request:/m);
    expect(wf).not.toMatch(/^\s*workflow_run:/m);
    expect(wf).toContain('cancel-in-progress: false');
    expect(wf).toContain('generic-shadow-t30-automation-v1-production');
  });

  it('requires main plus exact expected SHA before dependency install or DB/provider access', () => {
    const guard = stepBlock(wf, 'Source SHA guard');
    expect(guard).toContain('git rev-parse HEAD');
    expect(guard).toContain('refs/heads/main');
    expect(guard).toContain('EXPECTED_MAIN_SHA');
    expect(wf.indexOf('- name: Source SHA guard')).toBeLessThan(
      wf.indexOf('- name: Install dependencies')
    );
    expect(wf.indexOf('- name: Source SHA guard')).toBeLessThan(
      wf.indexOf('- name: Plan market-refresh cycle (read-only)')
    );
    expect(wf.indexOf('- name: Source SHA guard')).toBeLessThan(
      wf.indexOf('- name: Conditional Live Odds market refresh')
    );
    expect(wf.indexOf('- name: Source SHA guard')).toBeLessThan(
      wf.indexOf('- name: Write terminal COMMIT cycle report')
    );
    expect(guard).not.toMatch(/secrets\.DIRECT_URL/);
    expect(guard).not.toMatch(/secrets\.ODDS_API_KEY/);
  });

  it('keeps ODDS_API_KEY only on the conditional refresh step', () => {
    const plan = stepBlock(wf, 'Plan market-refresh cycle (read-only)');
    const refresh = stepBlock(wf, 'Conditional Live Odds market refresh');
    const terminal = stepBlock(wf, 'Write terminal COMMIT cycle report');
    const preflight = stepBlock(wf, 'Preflight (names/presence only)');
    expect(plan).toMatch(/DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/);
    expect(plan).not.toMatch(/ODDS_API_KEY/);
    expect(plan).toContain('--mode PLAN');
    expect(refresh).toMatch(/ODDS_API_KEY:\s*\$\{\{\s*secrets\.ODDS_API_KEY\s*\}\}/);
    expect(refresh).toMatch(/DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/);
    expect(refresh).toMatch(/DATABASE_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/);
    expect(terminal).not.toMatch(/ODDS_API_KEY/);
    expect(preflight).not.toMatch(/ODDS_API_KEY/);
    expect(preflight).not.toMatch(/DIRECT_URL/);
    expect(wf.match(/secrets\.ODDS_API_KEY/g)).toHaveLength(1);
    expect(wf).not.toMatch(/secrets\.CFBD_API_KEY/);
    expect(wf).not.toMatch(/secrets\.SGO_API_KEY/);
    expect(wf).not.toMatch(/secrets\.VISUALCROSSING_API_KEY/);
    expect(runText).not.toMatch(/\$\{\{\s*inputs\./);
  });

  it('does not invoke Generic closing COMMIT, migrations, or unrelated writers', () => {
    expect(wf).not.toContain('capture-shadow-model-t30-closing-v1-2026.ts');
    expect(wf).not.toContain('prisma migrate deploy');
    expect(wf).not.toContain('prisma migrate dev');
    expect(wf).not.toContain('prisma db push');
    expect(cli).not.toContain('capture-shadow-model-t30-closing-v1-2026.ts');
    expect(cli).not.toContain('executeGenericShadowT30ClosingCapture');
    expect(adapter).not.toContain('capture-shadow-model-t30-closing-v1-2026.ts');
    expect(adapter).not.toContain('executeGenericShadowT30ClosingCapture');
    expect(adapter).not.toContain('shadowModelClosingMarketSnapshot');
    expect(adapter).not.toContain('shadowModelPrediction');
    expect(cli).not.toContain('prisma migrate');
    expect(planner).toContain("scheduleEnabled: GENERIC_SHADOW_T30_MARKET_REFRESH_SCHEDULE_ENABLED");
    expect(planner).toContain('closingRowsInserted: 0');
  });

  it('composes the existing Live Odds COMMIT CLI exactly once per cycle', () => {
    expect(adapter).toContain('apps/jobs/write-live-odds-2026.ts');
    expect(adapter).toContain("'COMMIT'");
    expect(adapter).toContain('expectedWriteConfirmation');
    expect(adapter.split('apps/jobs/write-live-odds-2026.ts').length - 1).toBe(1);
    expect(adapter).not.toMatch(/for\s*\(.*runLiveOddsCommit/);
    expect(cli).toContain('invokeGuardedLiveOddsCommit');
    expect(refreshMentionsLiveOddsOnce(wf)).toBe(true);
  });

  it('does not alter the existing manual Live Odds workflow', () => {
    expect(liveOddsWf).toContain('name: Preview/Write 2026 Live Odds (Manual, Guarded)');
    expect(liveOddsWf).toContain('write-live-odds-2026.ts');
    expect(stageAWf).not.toContain('write-live-odds-2026.ts');
  });

  it('uploads coordinator reports and the raw Live Odds child report when present', () => {
    const upload = stepBlock(wf, 'Upload Generic Shadow T-30 market-refresh report');
    expect(upload).toContain('generic-shadow-t30-automation-v1-2026-*-market-refresh-*.json');
    expect(upload).toContain('live-odds-2026-*-generic-shadow-t30-market-refresh.json');
    expect(wf).toContain('actions/upload-artifact@v4');
    expect(wf).toContain('if-no-files-found: warn');
    expect(cli).toContain('writeReport');
    expect(cli).toContain('scheduleEnabled=false');
    expect(wf).toContain('IMPLEMENTED / SCHEDULE DISABLED / PRODUCTION EXECUTION NOT AUTHORIZED');
  });

  it('writes a terminal COMMIT report even when PLAN determines no refresh is needed', () => {
    const terminal = stepBlock(wf, 'Write terminal COMMIT cycle report');
    expect(terminal).toContain('--mode COMMIT');
    expect(terminal).toContain('--initial-report');
    expect(terminal).toContain('market-refresh-COMMIT.json');
    expect(terminal).not.toMatch(/ODDS_API_KEY/);
    expect(terminal).toMatch(/DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/);
    expect(wf).toContain("steps.plan.outputs.should_refresh != 'true'");
  });
});

function refreshMentionsLiveOddsOnce(wf: string): boolean {
  const refresh = stepBlock(wf, 'Conditional Live Odds market refresh');
  return (
    refresh.includes('run-generic-shadow-t30-automation-v1-market-refresh-2026.ts') &&
    refresh.includes('--mode COMMIT') &&
    !refresh.includes('capture-shadow-model-t30-closing-v1-2026.ts')
  );
}
