/**
 * Static checks for Generic Shadow T-30 Automation V1 Stage A.
 * No network, DB, provider, or production mutation.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const WF = path.join(
  ROOT,
  '.github/workflows/preview-generic-shadow-t30-automation-v1-2026-manual.yml'
);
const CLI = path.join(ROOT, 'apps/jobs/preview-generic-shadow-t30-automation-v1-2026.ts');
const ADAPTER = path.join(ROOT, 'apps/jobs/src/generic-shadow-t30-automation-v1-adapter.ts');
const PLANNER = path.join(ROOT, 'apps/web/lib/generic-shadow-t30-automation-v1.ts');
const CONTRACT = path.join(
  ROOT,
  'research/generic-shadow/GENERIC_SHADOW_T30_AUTOMATION_V1_CONTRACT.md'
);

function stepBlock(src: string, stepName: string): string {
  const marker = `- name: ${stepName}`;
  const idx = src.indexOf(marker);
  if (idx < 0) return '';
  const rest = src.slice(idx);
  const next = rest.search(/\n\s*- name:/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('Generic Shadow T-30 Automation V1 Stage A workflow', () => {
  const wf = fs.readFileSync(WF, 'utf8');
  const cli = fs.readFileSync(CLI, 'utf8');
  const adapter = fs.readFileSync(ADAPTER, 'utf8');
  const planner = fs.readFileSync(PLANNER, 'utf8');
  const contract = fs.readFileSync(CONTRACT, 'utf8');

  it('is manual workflow_dispatch only with no recurring or event schedule', () => {
    expect(wf).toContain('workflow_dispatch');
    expect(wf).not.toMatch(/^\s*schedule:/m);
    expect(wf).not.toMatch(/^\s*push:/m);
    expect(wf).not.toMatch(/^\s*pull_request:/m);
    expect(wf).not.toMatch(/^\s*workflow_run:/m);
  });

  it('requires main plus exact expected SHA before dependency install or DB access', () => {
    const guard = stepBlock(wf, 'Source SHA guard');
    expect(guard).toContain('git rev-parse HEAD');
    expect(guard).toContain('refs/heads/main');
    expect(guard).toContain('EXPECTED_MAIN_SHA');
    expect(guard).toContain('ACTUAL_SHA');
    expect(wf.indexOf('- name: Source SHA guard')).toBeLessThan(
      wf.indexOf('- name: Install dependencies')
    );
    expect(wf.indexOf('- name: Source SHA guard')).toBeLessThan(
      wf.indexOf('- name: Run Generic Shadow T-30 Automation V1 PREVIEW')
    );
  });

  it('injects only DIRECT_URL into the execution step and no provider secrets', () => {
    const runStep = stepBlock(wf, 'Run Generic Shadow T-30 Automation V1 PREVIEW');
    expect(runStep).toMatch(/DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/);
    expect(wf.match(/secrets\.DIRECT_URL/g)).toHaveLength(1);
    expect(wf).not.toMatch(/secrets\.ODDS_API_KEY/);
    expect(wf).not.toMatch(/secrets\.CFBD_API_KEY/);
    expect(wf).not.toMatch(/secrets\.SGO_API_KEY/);
    expect(wf).not.toMatch(/secrets\.VISUALCROSSING_API_KEY/);
  });

  it('invokes the PREVIEW-only coordinator CLI with season/week/report only', () => {
    const runStep = stepBlock(wf, 'Run Generic Shadow T-30 Automation V1 PREVIEW');
    expect(runStep).toContain('preview-generic-shadow-t30-automation-v1-2026.ts');
    expect(runStep).toContain('--season');
    expect(runStep).toContain('--week');
    expect(runStep).toContain('--report');
    expect(runStep).not.toContain('--mode');
    expect(runStep).not.toContain('--confirm');
    expect(runStep).not.toContain('write-live-odds-2026.ts');
    expect(runStep).not.toContain('capture-shadow-model-t30-closing-v1-2026.ts');
  });

  it('contains no production write or migration invocation', () => {
    expect(wf).not.toContain('prisma migrate deploy');
    expect(wf).not.toContain('prisma migrate dev');
    expect(wf).not.toContain('prisma db push');
    expect(wf).not.toContain('write-live-odds-2026.ts');
    expect(wf).not.toContain('capture-shadow-model-t30-closing-v1-2026.ts');
    expect(cli).not.toContain('.create(');
    expect(cli).not.toContain('.createMany(');
    expect(cli).not.toContain('.update(');
    expect(cli).not.toContain('.updateMany(');
    expect(cli).not.toContain('.delete(');
    expect(cli).not.toContain('.deleteMany(');
    expect(cli).not.toContain('$transaction');
    expect(cli).not.toContain('fetch(');
    expect(cli).not.toContain('axios');
  });

  it('keeps discovery read-only and restricted to the existing supported model allowlist', () => {
    expect(adapter).toContain('shadowModelCaptureRun.findMany');
    expect(adapter).toContain('GENERIC_SHADOW_T30_SUPPORTED_MODEL_IDS');
    expect(adapter).toContain("String(row.status) === 'COMPLETE'");
    expect(adapter).toContain('loadGenericShadowT30OperationalFrame');
    expect(adapter).not.toContain('.create(');
    expect(adapter).not.toContain('.createMany(');
    expect(adapter).not.toContain('.update(');
    expect(adapter).not.toContain('.delete(');
    expect(adapter).not.toContain('$transaction');
  });

  it('freezes T-45/T-35 orchestration without changing the T-30 closing implementation', () => {
    expect(planner).toContain('GENERIC_SHADOW_T30_AUTOMATION_MARKET_WINDOW_OPEN_MINUTES = 45');
    expect(planner).toContain('GENERIC_SHADOW_T30_AUTOMATION_MARKET_WINDOW_CLOSE_MINUTES = 35');
    expect(planner).toContain('planGenericShadowT30Closing');
    expect(planner).toContain("mode: 'PREVIEW'");
    expect(planner).toContain('providerCallsAttempted: 0');
    expect(planner).toContain('mutationTargetsInvoked: []');
    expect(contract).toContain('closing target remains exactly: **30 minutes before kickoff**');
    expect(contract).toContain('market look-ahead opens: **45 minutes before kickoff**');
    expect(contract).toContain('market look-ahead closes: **35 minutes before kickoff**');
  });

  it('uploads a machine-readable PREVIEW artifact even for no-op cycles', () => {
    expect(wf).toContain('actions/upload-artifact@v4');
    expect(wf).toContain('generic-shadow-t30-automation-v1-2026-w');
    expect(wf).toContain('if-no-files-found: warn');
    expect(cli).toContain('writeReport');
    expect(cli).toContain("stage: 'A_PREVIEW_ONLY'");
    expect(cli).toContain('scheduleEnabled: false');
  });
});
