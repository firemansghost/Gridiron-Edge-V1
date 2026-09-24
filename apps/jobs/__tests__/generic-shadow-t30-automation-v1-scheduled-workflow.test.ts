/**
 * Static checks for the activation-gated recurring Generic Shadow T-30 Automation V1 external-clock coordinator.
 * No network, DB, provider, or production mutation.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const WF = path.join(ROOT, '.github/workflows/run-generic-shadow-t30-automation-v1-scheduled-2026.yml');
const RUNBOOK = path.join(ROOT, 'research/generic-shadow/GENERIC_SHADOW_T30_AUTOMATION_V1_SCHEDULE_RUNBOOK.md');

function stepBlock(src: string, stepName: string): string {
  const marker = '- name: ' + stepName;
  const idx = src.indexOf(marker);
  if (idx < 0) return '';
  const rest = src.slice(idx);
  const next = rest.search(/\n\s*- name:/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('Generic Shadow T-30 Automation V1 external-clock coordinator', () => {
  const wf = fs.readFileSync(WF, 'utf8');
  const runbook = fs.readFileSync(RUNBOOK, 'utf8');

  it('uses workflow_dispatch only and preserves the explicit activation gate', () => {
    expect(wf).toContain('workflow_dispatch:');
    expect(wf).not.toMatch(/\nschedule:\s*\n/m);
    expect(wf).not.toMatch(/cron:\s*['\"]2-59\/5 \* \* \* \*['\"]/m);
    expect(wf).toContain("vars.GENERIC_SHADOW_T30_AUTOMATION_V1_ENABLED == 'true'");
    expect(wf).toContain('vars.GENERIC_SHADOW_T30_AUTOMATION_V1_WEEK');
    expect(runbook).toContain('Supabase external clock is the sole recurring scheduler');
  });

  it('preserves main-only execution and one production concurrency group', () => {
    expect(wf).toContain('refs/heads/main');
    expect(wf).toContain('git rev-parse HEAD');
    expect(wf).toContain('generic-shadow-t30-automation-v1-production');
    expect(wf).toContain('cancel-in-progress: false');
    expect(wf).not.toContain('expected_main_sha');
  });

  it('keeps the provider secret only in the conditional Stage C refresh step', () => {
    const plan = stepBlock(wf, 'Stage C plan market-refresh cycle (read-only)');
    const refresh = stepBlock(wf, 'Stage C conditional Live Odds board refresh');
    const terminal = stepBlock(wf, 'Stage C terminal no-refresh/blocked report');
    expect(plan).toContain('--mode PLAN');
    expect(plan).not.toContain('ODDS_API_KEY');
    expect(refresh).toContain("steps.market_plan.outputs.should_refresh == 'true'");
    expect(refresh).toContain('ODDS_API_KEY: ${{ secrets.ODDS_API_KEY }}');
    expect(refresh).toContain('REFRESH_2026_WEEK_${INPUT_WEEK}_GENERIC_SHADOW_T30_MARKET');
    expect(refresh).toContain('--mode COMMIT');
    expect(terminal).not.toContain('ODDS_API_KEY');
    expect(wf.match(/secrets\.ODDS_API_KEY/g)).toHaveLength(1);
  });

  it('keeps Stage D provider-free and uses the frozen automated closing confirmation', () => {
    const plan = stepBlock(wf, 'Stage D plan closing cycle (read-only)');
    const commit = stepBlock(wf, 'Stage D terminal closing COMMIT/no-op');
    expect(plan).toContain('--mode PLAN');
    expect(commit).toContain('CAPTURE_2026_WEEK_${INPUT_WEEK}_GENERIC_SHADOW_T30_AUTOMATED_CLOSINGS');
    expect(commit).toContain('--mode COMMIT');
    expect(commit).not.toContain('ODDS_API_KEY: ${{ secrets.ODDS_API_KEY }}');
    expect(wf).toContain('Stage D providerCalls=0');
  });

  it('does not create predictions or invoke unrelated writers', () => {
    expect(wf).not.toContain('capture-shadow-model-predictions-2026.ts');
    expect(wf).not.toContain('write-core-v1-weekly-card');
    expect(wf).not.toContain('capture-shadow-snapshot-v1');
    expect(wf).not.toContain('prisma migrate deploy');
    expect(wf).not.toContain('prisma migrate dev');
    expect(wf).not.toContain('prisma db push');
    expect(wf).toContain('prediction/capture-run writes: false');
    expect(wf).toContain('Hybrid writes: false');
    expect(wf).toContain('Bet writes: false');
    expect(wf).toContain('evaluation writes: false');
  });

  it('writes and uploads a top-level machine-readable scheduled-cycle report', () => {
    const report = stepBlock(wf, 'Write scheduled-cycle machine-readable report');
    const upload = stepBlock(wf, 'Upload scheduled-cycle audit artifact');
    expect(report).toContain('scheduleEnabled: false');
    expect(report).toContain("clockAuthority: 'SUPABASE_EXTERNAL'");
    expect(report).toContain('externalClockDispatchEnabled: true');
    expect(report).toContain('nativeGithubScheduleEnabled: false');
    expect(report).toContain('MARKET_REFRESHED_AND_CLOSINGS_CAPTURED');
    expect(report).toContain('providerCallsAttempted');
    expect(report).toContain('triggerEvent');
    expect(report).toContain('closingRowsInserted');
    expect(report).toContain('mutationTargetsInvoked');
    expect(upload).toContain('if: always()');
    expect(report).toContain('SCHEDULED-CYCLE.json');
    expect(upload).toContain('reports/generic-shadow-t30-automation-v1-2026-*.json');
  });
});
