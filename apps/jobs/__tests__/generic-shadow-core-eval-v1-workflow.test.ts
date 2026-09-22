import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const WF = path.join(
  ROOT,
  '.github/workflows/evaluate-generic-shadow-core-eval-v1-2026-manual.yml'
);
const CLI = path.join(ROOT, 'apps/jobs/evaluate-generic-shadow-core-eval-v1-2026.ts');
const ADAPTER = path.join(ROOT, 'apps/jobs/src/generic-shadow-core-eval-v1-adapter.ts');
const EVALUATOR = path.join(ROOT, 'apps/web/lib/generic-shadow-core-eval-v1.ts');
const CONTRACT = path.join(
  ROOT,
  'research/generic-shadow/GENERIC_SHADOW_CORE_EVAL_V1_READONLY_CONTRACT.md'
);

function stepBlock(src: string, stepName: string): string {
  const marker = `- name: ${stepName}`;
  const idx = src.indexOf(marker);
  if (idx < 0) return '';
  const rest = src.slice(idx);
  const next = rest.search(/\n\s*- name:/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('Generic Shadow CORE_EVAL_V1 read-only workflow boundary', () => {
  const wf = fs.readFileSync(WF, 'utf8');
  const cli = fs.readFileSync(CLI, 'utf8');
  const adapter = fs.readFileSync(ADAPTER, 'utf8');
  const evaluator = fs.readFileSync(EVALUATOR, 'utf8');
  const contract = fs.readFileSync(CONTRACT, 'utf8');

  it('is manual workflow_dispatch only and evaluates one exact capture run', () => {
    expect(wf).toContain('workflow_dispatch');
    expect(wf).toContain('capture_run_id:');
    expect(wf).toContain('expected_main_sha:');
    expect(wf).not.toMatch(/^\s*schedule:/m);
    expect(wf).not.toMatch(/^\s*push:/m);
    expect(wf).not.toMatch(/^\s*pull_request:/m);
    expect(wf).not.toMatch(/^\s*workflow_run:/m);
  });

  it('requires main plus exact SHA before dependency install or DB access', () => {
    const guard = stepBlock(wf, 'Source SHA guard');
    expect(guard).toContain('git rev-parse HEAD');
    expect(guard).toContain('refs/heads/main');
    expect(guard).toContain('EXPECTED_MAIN_SHA');
    expect(guard).toContain('ACTUAL_SHA');
    expect(wf.indexOf('- name: Source SHA guard')).toBeLessThan(
      wf.indexOf('- name: Install dependencies')
    );
    expect(wf.indexOf('- name: Source SHA guard')).toBeLessThan(
      wf.indexOf('- name: Run Generic Shadow CORE_EVAL_V1 read-only evaluator')
    );
  });

  it('exposes only DIRECT_URL to the execution step and no provider secrets', () => {
    const runStep = stepBlock(
      wf,
      'Run Generic Shadow CORE_EVAL_V1 read-only evaluator'
    );
    expect(runStep).toMatch(/DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/);
    expect(wf.match(/secrets\.DIRECT_URL/g)).toHaveLength(1);
    expect(wf).not.toMatch(/secrets\.ODDS_API_KEY/);
    expect(wf).not.toMatch(/secrets\.CFBD_API_KEY/);
    expect(wf).not.toMatch(/secrets\.SGO_API_KEY/);
    expect(wf).not.toMatch(/secrets\.VISUALCROSSING_API_KEY/);
  });

  it('loads only Generic capture/prediction/closing plus canonical Game evidence', () => {
    expect(adapter).toContain('shadowModelCaptureRun.findUnique');
    expect(adapter).toContain('shadowModelPrediction.findMany');
    expect(adapter).toContain('shadowModelClosingMarketSnapshot.findMany');
    expect(adapter).toContain('game.findMany');
    expect(adapter).not.toContain('shadowCaptureRun');
    expect(adapter).not.toContain('shadowPredictionSnapshot');
    expect(adapter).not.toContain('shadowClosingMarketSnapshot');
    expect(adapter).not.toContain('shadowEvaluationResult');
    expect(adapter).not.toContain('bet.');
    expect(adapter).not.toContain('matchupOutput');
  });

  it('contains no Prisma mutation, transaction, network, or migration path', () => {
    const sources = [adapter, cli, evaluator, wf].join('\n');
    for (const token of [
      '.create(',
      '.createMany(',
      '.update(',
      '.updateMany(',
      '.upsert(',
      '.delete(',
      '.deleteMany(',
      '$transaction',
      'fetch(',
      'axios',
      'prisma migrate deploy',
      'prisma migrate dev',
      'prisma db push',
    ]) {
      expect(sources).not.toContain(token);
    }
  });

  it('preserves explicit no-write/provider reporting and uploads a JSON artifact', () => {
    expect(cli).toContain('providerCalls: 0');
    expect(cli).toContain('mutationsInvoked: false');
    expect(cli).toContain('evaluationWrites: false');
    expect(cli).toContain('betWrites: false');
    expect(cli).toContain('gameWrites: false');
    expect(wf).toContain('providerCalls=0');
    expect(wf).toContain('ShadowEvaluationResult writes: false');
    expect(wf).toContain('actions/upload-artifact@v4');
    expect(wf).toContain('generic-shadow-core-eval-v1-');
    expect(wf).toContain('if-no-files-found: warn');
  });

  it('implements the frozen contract rather than a separate protocol', () => {
    expect(evaluator).toContain(
      "GENERIC_SHADOW_CORE_EVAL_V1_PROTOCOL = 'CORE_EVAL_V1'"
    );
    expect(evaluator).toContain(
      "GENERIC_SHADOW_CORE_EVAL_V1_DEFINITION_ID ="
    );
    expect(evaluator).toContain('generic_shadow_core_eval_v1_readonly_v1');
    expect(evaluator).toContain('GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID');
    expect(evaluator).toContain('GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH');
    expect(contract).toContain('No-retrospective-repair rule');
  });
});
