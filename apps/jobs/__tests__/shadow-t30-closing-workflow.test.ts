/**
 * Static checks for the guarded Shadow T-30 closing-market workflow.
 * No network. No DB. No production capture.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const WF = path.join(ROOT, '.github/workflows/capture-shadow-t30-closing-v1-2026-manual.yml');
const CLI = path.join(ROOT, 'apps/jobs/capture-shadow-t30-closing-v1-2026.ts');
const LIB = path.join(ROOT, 'apps/web/lib/shadow-closing-market-v1.ts');

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

describe('Shadow T-30 closing-market workflow', () => {
  const wf = fs.readFileSync(WF, 'utf8');
  const cli = fs.readFileSync(CLI, 'utf8');
  const lib = fs.readFileSync(LIB, 'utf8');
  const runText = extractRunBodies(wf);

  it('is workflow_dispatch only and defaults to PREVIEW', () => {
    expect(wf).toContain('workflow_dispatch');
    expect(wf).not.toMatch(/^\s*schedule:/m);
    expect(wf).not.toMatch(/^\s*push:/m);
    expect(wf).not.toMatch(/^\s*pull_request:/m);
    expect(wf).toMatch(/default:\s*PREVIEW/);
  });

  it('requires exact main SHA and exposes no operator target/capture timestamp', () => {
    expect(wf).toMatch(/expected_main_sha:/);
    expect(wf).not.toMatch(/target_timestamp:/);
    expect(wf).not.toMatch(/capture_timestamp:/);
    expect(wf).not.toMatch(/as_of:/);
    expect(cli).not.toContain('--target-timestamp');
    expect(cli).not.toContain('--capture-timestamp');
    expect(cli).not.toContain('--as-of');
    const guard = stepBlock(wf, 'Source SHA guard');
    expect(guard).toContain('refs/heads/main');
    expect(guard).toContain('git rev-parse HEAD');
    expect(guard).toContain('EXPECTED_MAIN_SHA');
  });

  it('requires exact COMMIT confirmation and preserves T-30/no-fall-forward semantics', () => {
    expect(wf).toContain('CAPTURE_2026_WEEK_${INPUT_WEEK}_T30_CLOSING_V1');
    expect(cli).toContain('expectedClosingWriteConfirmation');
    expect(lib).toContain('SHADOW_T30_OFFSET_MS');
    expect(lib).toContain("state: 'MISSED'");
    expect(lib).toContain('marketObservationTimestamp');
    expect(lib).toContain('<= input.targetTimestamp.getTime()');
  });

  it('has zero provider access and uses only persisted MarketLine rows', () => {
    expect(wf).not.toMatch(/secrets\.ODDS_API_KEY/);
    expect(wf).not.toMatch(/secrets\.CFBD_API_KEY/);
    expect(wf).not.toMatch(/secrets\.SGO_API_KEY/);
    expect(wf).not.toMatch(/secrets\.VISUALCROSSING/);
    expect(wf).toContain('providerCalls=0');
    expect(cli).toContain('marketLine.findMany');
    expect(cli).not.toContain('fetch(');
    expect(cli).not.toContain('axios');
  });

  it('scopes DIRECT_URL only to the capture step and never interpolates inputs into run bodies', () => {
    const jobsPreamble = wf.split(/^\s+steps:\s*$/m)[0] ?? '';
    expect(jobsPreamble).not.toMatch(/secrets\.DIRECT_URL/);
    const capture = stepBlock(wf, 'Run guarded Shadow T-30 Closing Market V1 capture');
    const install = stepBlock(wf, 'Install dependencies');
    const preflight = stepBlock(wf, 'Preflight (names/presence only)');
    expect(capture).toMatch(/DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/);
    expect(install).not.toMatch(/DIRECT_URL:/);
    expect(preflight).not.toMatch(/secrets\.DIRECT_URL/);
    const secretHits = wf.match(/DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/g);
    expect(secretHits).toHaveLength(1);
    expect(runText).not.toMatch(/\$\{\{\s*inputs\./);
  });

  it('writes closing snapshots only; no prediction/evaluation/Bet/MatchupOutput/migration path', () => {
    expect(cli).toContain('shadowClosingMarketSnapshot.createMany');
    expect(cli).not.toContain('shadowPredictionSnapshot.create');
    expect(cli).not.toContain('shadowPredictionSnapshot.createMany');
    expect(cli).not.toContain('shadowEvaluationResult.create');
    expect(cli).not.toContain('bet.create');
    expect(cli).not.toContain('matchupOutput');
    expect(wf).not.toMatch(/prisma migrate deploy/);
    expect(wf).not.toMatch(/npx prisma migrate/);
    expect(wf).not.toMatch(/db push/);
    expect(cli).not.toContain('skipDuplicates');
    expect(cli).not.toContain('.upsert(');
    expect(cli).toContain('shadowEvaluationResult.count');
    expect(cli).toContain('closingMarketSnapshotId: { in: ids }');
  });
});
