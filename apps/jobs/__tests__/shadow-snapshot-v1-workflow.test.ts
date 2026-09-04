/**
 * Static checks for the guarded Shadow Snapshot V1 capture workflow.
 * No network. No DB. No production capture.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const WF = path.join(
  ROOT,
  '.github/workflows/capture-shadow-snapshot-v1-2026-manual.yml'
);
const CLI = path.join(ROOT, 'apps/jobs/capture-shadow-snapshot-v1-2026.ts');
const LIB = path.join(ROOT, 'apps/web/lib/shadow-snapshot-v1.ts');

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

describe('Shadow Snapshot V1 capture workflow', () => {
  const wf = fs.readFileSync(WF, 'utf8');
  const cli = fs.readFileSync(CLI, 'utf8');
  const lib = fs.readFileSync(LIB, 'utf8');
  const runText = extractRunBodies(wf);

  it('workflow_dispatch only; no push / PR / schedule', () => {
    expect(wf).toContain('workflow_dispatch');
    expect(wf).not.toMatch(/^\s*schedule:/m);
    expect(wf).not.toMatch(/^\s*push:/m);
    expect(wf).not.toMatch(/^\s*pull_request:/m);
    expect(wf).toMatch(/default:\s*PREVIEW/);
  });

  it('requires expected_main_sha and capture_context; no operator prediction timestamp', () => {
    expect(wf).toMatch(/expected_main_sha:/);
    expect(wf).toMatch(/capture_context:/);
    expect(wf).toMatch(/required:\s*true[\s\S]*expected_main_sha:|expected_main_sha:[\s\S]*required:\s*true/);
    expect(wf).not.toMatch(/prediction_timestamp/);
    expect(wf).not.toMatch(/capture_timestamp/);
    expect(wf).not.toMatch(/as_of/);
    expect(cli).not.toContain('--prediction-timestamp');
    expect(cli).not.toContain('--capture-timestamp');
    expect(cli).not.toContain('--as-of');
    expect(cli).toContain('git');
    expect(cli).toContain('rev-parse');
  });

  it('source ref must be main and SHA mismatch stops before capture', () => {
    const guard = stepBlock(wf, 'Source SHA guard');
    const capture = stepBlock(wf, 'Run guarded Shadow Snapshot V1 capture');
    expect(guard).toContain('refs/heads/main');
    expect(guard).toContain('EXPECTED_MAIN_SHA');
    expect(guard).toContain('git rev-parse HEAD');
    expect(wf.indexOf('- name: Source SHA guard')).toBeLessThan(
      wf.indexOf('- name: Run guarded Shadow Snapshot V1 capture')
    );
    expect(capture).not.toContain('git rev-parse HEAD');
    expect(guard).not.toContain('capture-shadow-snapshot-v1-2026.ts');
  });

  it('no job-level DB secret; npm ci receives none; capture gets DIRECT_URL only', () => {
    const jobsPreamble = wf.split(/^\s+steps:\s*$/m)[0] ?? '';
    expect(jobsPreamble).not.toMatch(/secrets\.DIRECT_URL/);
    expect(jobsPreamble).not.toMatch(/DATABASE_URL:/);

    const install = stepBlock(wf, 'Install dependencies');
    const prismaVersion = stepBlock(wf, 'Prisma version');
    const capture = stepBlock(wf, 'Run guarded Shadow Snapshot V1 capture');
    const upload = stepBlock(wf, 'Upload Shadow Snapshot V1 report');
    const summary = stepBlock(wf, 'Summary');
    const preflight = stepBlock(wf, 'Preflight (names/presence only)');
    const guard = stepBlock(wf, 'Source SHA guard');

    expect(install).not.toMatch(/DIRECT_URL:/);
    expect(install).not.toMatch(/DATABASE_URL:/);
    expect(prismaVersion).not.toMatch(/DIRECT_URL:/);
    expect(preflight).not.toMatch(/secrets\.DIRECT_URL/);
    expect(guard).not.toMatch(/secrets\.DIRECT_URL/);
    expect(upload).not.toMatch(/secrets\.DIRECT_URL/);
    expect(summary).not.toMatch(/secrets\.DIRECT_URL/);

    expect(capture).toMatch(/DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/);
    expect(capture).not.toMatch(/DATABASE_URL:/);
    const secretHits = wf.match(/DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/g);
    expect(secretHits).toHaveLength(1);
  });

  it('no provider secrets and no interpolated inputs in run bodies', () => {
    expect(wf).not.toMatch(/secrets\.ODDS_API_KEY/);
    expect(wf).not.toMatch(/secrets\.CFBD_API_KEY/);
    expect(wf).not.toMatch(/secrets\.SGO_API_KEY/);
    expect(wf).not.toMatch(/secrets\.VISUALCROSSING/);
    expect(wf).toContain('providerCalls=0');
    expect(runText).not.toMatch(/\$\{\{\s*inputs\./);
  });

  it('COMMIT exact confirmation required', () => {
    expect(wf).toContain('CAPTURE_2026_WEEK_${INPUT_WEEK}_SHADOW_V1');
    expect(cli).toContain('expectedWriteConfirmation');
    expect(cli).toContain('expectedConfirmation=');
  });

  it('does not invoke migrate, db push, Bet writer, closing/evaluation, or schedule', () => {
    expect(wf).not.toMatch(/prisma migrate deploy/);
    expect(wf).not.toMatch(/npx prisma migrate/);
    expect(wf).not.toMatch(/db push/);
    expect(cli).not.toContain('migrate deploy');
    expect(cli).not.toContain('db push');
    expect(cli).not.toContain('bet.create');
    expect(cli).not.toContain('matchupOutput');
    expect(cli).not.toContain('shadowClosingMarketSnapshot.create');
    expect(cli).not.toContain('shadowEvaluationResult.create');
    expect(cli).not.toContain('countClosingSnapshots');
    expect(lib).not.toContain('countClosingSnapshots');
    expect(cli).not.toMatch(/countEvaluationResults:\s*async\s*\(\)\s*=>\s*0/);
    expect(lib).not.toMatch(/countEvaluationResults:\s*async\s*\(\)\s*=>\s*0/);
    expect(lib).not.toContain('closingCount: 0');
    expect(lib).not.toContain('evaluationCount: 0');
    expect(cli).toContain('shadowEvaluationResult.count');
    expect(cli).toContain('predictionSnapshotId: { in: ids }');
    expect(cli).toContain('closingMutationsInvoked');
    expect(cli).not.toContain('skipDuplicates');
    expect(cli).not.toContain('.upsert(');
    expect(wf).not.toMatch(/grade-bets/);
    expect(wf).not.toMatch(/cron:/);
  });
});
