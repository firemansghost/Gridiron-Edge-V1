/**
 * Static checks for the guarded Generic Shadow Model T-30 Closing V1 workflow/CLI.
 * No network. No DB. No production capture.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const WF = path.join(
  ROOT,
  '.github/workflows/capture-shadow-model-t30-closing-v1-2026-manual.yml'
);
const CLI = path.join(ROOT, 'apps/jobs/capture-shadow-model-t30-closing-v1-2026.ts');
const ADAPTER = path.join(ROOT, 'apps/jobs/src/shadow-model-t30-closing-v1-adapter.ts');
const PLANNER = path.join(ROOT, 'apps/web/lib/shadow-model-t30-closing-v1.ts');

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

describe('Generic Shadow T-30 Closing V1 workflow', () => {
  const wf = fs.readFileSync(WF, 'utf8');
  const cli = fs.readFileSync(CLI, 'utf8');
  const adapter = fs.readFileSync(ADAPTER, 'utf8');
  const planner = fs.readFileSync(PLANNER, 'utf8');
  const runText = extractRunBodies(wf);

  it('is workflow_dispatch only with no schedule/push/pull_request/workflow_run', () => {
    expect(wf).toContain('workflow_dispatch');
    expect(wf).not.toMatch(/^\s*schedule:/m);
    expect(wf).not.toMatch(/^\s*push:/m);
    expect(wf).not.toMatch(/^\s*pull_request:/m);
    expect(wf).not.toMatch(/^\s*workflow_run:/m);
    expect(wf).toMatch(/default:\s*PREVIEW/);
  });

  it('exposes the exact guarded inputs including capture_run_id', () => {
    expect(wf).toMatch(/season:/);
    expect(wf).toMatch(/week:/);
    expect(wf).toMatch(/capture_run_id:/);
    expect(wf).toMatch(/mode:/);
    expect(wf).toMatch(/expected_main_sha:/);
    expect(wf).toMatch(/confirm:/);
    expect(wf).toMatch(/options:\s*\n\s*- PREVIEW\s*\n\s*- COMMIT/);
  });

  it('requires exact main SHA comparison before install or DB access', () => {
    const guard = stepBlock(wf, 'Source SHA guard');
    expect(guard).toContain('git rev-parse HEAD');
    expect(guard).toContain('GITHUB_REF');
    expect(guard).toContain('refs/heads/main');
    expect(guard).toContain('EXPECTED_MAIN_SHA');
    expect(guard).toContain('ACTUAL_SHA');
    expect(wf.indexOf('- name: Source SHA guard')).toBeLessThan(
      wf.indexOf('- name: Install dependencies')
    );
    expect(wf.indexOf('- name: Source SHA guard')).toBeLessThan(
      wf.indexOf('- name: Run guarded Generic Shadow Model T-30 Closing V1 capture')
    );
  });

  it('requires the exact COMMIT confirmation including capture_run_id', () => {
    const preflight = stepBlock(wf, 'Preflight (names/presence only)');
    expect(preflight).toContain(
      'CAPTURE_2026_WEEK_${INPUT_WEEK}_SHADOW_MODEL_T30_${INPUT_CAPTURE_RUN_ID}'
    );
    expect(preflight).toContain('COMMIT requires confirm=${EXPECTED_CONFIRM}');
    expect(cli).toContain('expectedGenericShadowT30WriteConfirmation');
    expect(cli).not.toContain('CAPTURE_2026_WEEK_${INPUT_WEEK}_T30_CLOSING_V1');
  });

  it('does not give DIRECT_URL to preflight; only the execution step receives it', () => {
    const jobsPreamble = wf.split(/^\s+steps:\s*$/m)[0] ?? '';
    expect(jobsPreamble).not.toMatch(/secrets\.DIRECT_URL/);
    const preflight = stepBlock(wf, 'Preflight (names/presence only)');
    const install = stepBlock(wf, 'Install dependencies');
    const guard = stepBlock(wf, 'Source SHA guard');
    const capture = stepBlock(
      wf,
      'Run guarded Generic Shadow Model T-30 Closing V1 capture'
    );
    expect(preflight).not.toMatch(/DIRECT_URL/);
    expect(install).not.toMatch(/DIRECT_URL:/);
    expect(guard).not.toMatch(/secrets\.DIRECT_URL/);
    expect(capture).toMatch(/DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/);
    const secretHits = wf.match(/DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/g);
    expect(secretHits).toHaveLength(1);
    expect(runText).not.toMatch(/\$\{\{\s*inputs\./);
  });

  it('does not inject provider secrets', () => {
    expect(wf).not.toMatch(/secrets\.ODDS_API_KEY/);
    expect(wf).not.toMatch(/secrets\.CFBD_API_KEY/);
    expect(wf).not.toMatch(/secrets\.SGO_API_KEY/);
    expect(wf).not.toMatch(/secrets\.VISUALCROSSING_API_KEY/);
    expect(wf).toContain('ODDS_API_KEY: not provided');
    expect(wf).toContain('providerCalls=0');
  });

  it('invokes only the Generic T-30 closing CLI with exact flags', () => {
    const capture = stepBlock(
      wf,
      'Run guarded Generic Shadow Model T-30 Closing V1 capture'
    );
    expect(capture).toContain('apps/jobs/capture-shadow-model-t30-closing-v1-2026.ts');
    expect(capture).toContain('--season');
    expect(capture).toContain('--week');
    expect(capture).toContain('--capture-run-id');
    expect(capture).toContain('--mode');
    expect(capture).toContain('--report');
    expect(capture).toContain('--confirm');
    expect(capture).not.toContain('capture-shadow-model-predictions-2026.ts');
    expect(capture).not.toContain('capture-shadow-t30-closing-v1-2026.ts');
  });

  it('does not invoke upstream Live Odds, prediction capture, grading, or migrate', () => {
    expect(wf).not.toContain('capture-shadow-model-predictions-2026.ts');
    expect(wf).not.toContain('capture-shadow-t30-closing-v1-2026.ts');
    expect(wf).not.toContain('apps/jobs/backfill-odds');
    expect(wf).not.toContain('apps/jobs/ingest');
    expect(wf).not.toContain('grade-bets');
    expect(wf).not.toContain('npx prisma migrate');
    expect(wf).not.toContain('prisma migrate deploy');
    expect(wf).not.toContain('prisma migrate dev');
    expect(wf).not.toContain('db push');
    expect(wf).not.toContain('candidate-b-v1');
    const capture = stepBlock(
      wf,
      'Run guarded Generic Shadow Model T-30 Closing V1 capture'
    );
    expect(capture).not.toContain('live-odds');
    expect(capture).not.toContain('Live Odds');
  });

  it('uploads a Generic-named artifact and keeps Hybrid naming distinct', () => {
    expect(wf).toContain('actions/upload-artifact@v4');
    expect(wf).toContain('if-no-files-found: warn');
    expect(wf).toContain('generic-shadow-model-t30-closing-v1-2026-w');
    expect(wf).not.toMatch(/name:\s*shadow-t30-closing-v1-2026-w/);
  });

  it('uses a dedicated Generic closing concurrency group that does not cancel in progress', () => {
    expect(wf).toContain('generic-shadow-model-t30-closing-v1-production-capture');
    expect(wf).toMatch(/cancel-in-progress:\s*false/);
  });

  it('CLI statically requires DIRECT_URL, PrismaClient, capture-run-id, and Slice B identity', () => {
    expect(cli).toContain('DIRECT_URL required');
    expect(cli).toContain('new PrismaClient');
    expect(cli).toContain('--capture-run-id');
    expect(cli).toContain("'PREVIEW'");
    expect(cli).toContain("'COMMIT'");
    expect(cli).toContain('expectedGenericShadowT30WriteConfirmation');
    expect(cli).toContain('providerCalls=0');
    expect(cli).toContain('writeReport');
    expect(cli).not.toContain('prisma migrate');
    expect(cli).not.toContain('fetch(');
    expect(cli).not.toContain('axios');
    expect(cli).not.toContain('ODDS_API_KEY');
    expect(adapter).toContain('GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID');
    expect(adapter).toContain('GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH');
    expect(adapter).not.toContain("'generic_shadow_t30_closing_v2'");
    expect(planner).toContain('generic_shadow_t30_closing_v1');
    expect(planner).toContain(
      '1a2b01a893e0d8811d5ffe0c78af2f8a15dc9d4eb165b19ef5f14a9e1e8be898'
    );
    expect(adapter).toContain('from \'../../web/lib/shadow-model-t30-closing-v1\'');
  });
});
