/**
 * Static checks for the guarded generic Shadow Model Capture V1 workflow.
 * No network. No DB. No production capture.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const WF = path.join(
  ROOT,
  '.github/workflows/capture-shadow-model-predictions-2026-manual.yml'
);
const CLI = path.join(ROOT, 'apps/jobs/capture-shadow-model-predictions-2026.ts');
const LIB = path.join(ROOT, 'apps/web/lib/shadow-model-capture-v1.ts');
const HYBRID_LIB = path.join(ROOT, 'apps/web/lib/shadow-snapshot-v1.ts');
const HYBRID_CLI = path.join(ROOT, 'apps/jobs/capture-shadow-snapshot-v1-2026.ts');

function stepBlock(src: string, stepName: string): string {
  const marker = `- name: ${stepName}`;
  const idx = src.indexOf(marker);
  if (idx < 0) return '';
  const rest = src.slice(idx);
  const next = rest.search(/\n\s*- name:/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('Shadow Model Capture V1 workflow', () => {
  const wf = fs.readFileSync(WF, 'utf8');
  const cli = fs.readFileSync(CLI, 'utf8');
  const lib = fs.readFileSync(LIB, 'utf8');

  it('workflow_dispatch only; no push / PR / schedule', () => {
    expect(wf).toContain('workflow_dispatch');
    expect(wf).not.toMatch(/^\s*schedule:/m);
    expect(wf).not.toMatch(/^\s*push:/m);
    expect(wf).not.toMatch(/^\s*pull_request:/m);
    expect(wf).toMatch(/default:\s*PREVIEW/);
  });

  it('allowlists only core_v1_shadow_baseline_v1', () => {
    expect(wf).toContain('core_v1_shadow_baseline_v1');
    expect(wf).toMatch(/options:\s*\n\s*- core_v1_shadow_baseline_v1/);
    expect(wf).not.toContain('candidate_b');
    expect(wf).not.toContain('wepa_shadow');
    expect(cli).toContain('isShadowModelAllowlisted');
    expect(lib).toContain("SHADOW_MODEL_ALLOWLIST = ['core_v1_shadow_baseline_v1']");
  });

  it('requires expected_main_sha and capture_context; no operator prediction timestamp', () => {
    expect(wf).toMatch(/expected_main_sha:/);
    expect(wf).toMatch(/capture_context:/);
    expect(wf).not.toMatch(/prediction_timestamp/);
    expect(wf).not.toMatch(/as_of/);
    expect(cli).not.toContain('--prediction-timestamp');
    expect(cli).not.toContain('--as-of');
  });

  it('source ref must be main and SHA mismatch stops before capture', () => {
    const guard = stepBlock(wf, 'Source SHA guard');
    const capture = stepBlock(wf, 'Run guarded Shadow Model capture');
    expect(guard).toContain('refs/heads/main');
    expect(guard).toContain('EXPECTED_MAIN_SHA');
    expect(wf.indexOf('- name: Source SHA guard')).toBeLessThan(
      wf.indexOf('- name: Run guarded Shadow Model capture')
    );
    expect(capture).not.toContain('git rev-parse HEAD');
  });

  it('no job-level DB secret; capture gets DIRECT_URL only', () => {
    const jobsPreamble = wf.split(/^\s+steps:\s*$/m)[0] ?? '';
    expect(jobsPreamble).not.toMatch(/secrets\.DIRECT_URL/);
    const capture = stepBlock(wf, 'Run guarded Shadow Model capture');
    expect(capture).toContain('DIRECT_URL');
    expect(capture).toContain('capture-shadow-model-predictions-2026.ts');
    expect(capture).not.toContain('prisma migrate');
  });

  it('does not touch Hybrid Snapshot V1 writer paths', () => {
    expect(cli).not.toContain('shadowCaptureRun');
    expect(cli).not.toContain('shadowPredictionSnapshot');
    expect(cli).toContain('shadowModelCaptureRun');
    expect(cli).toContain('hybridShadowWrites');
    expect(cli).toContain('fingerprintOfficialFlat100Bets');
    expect(cli).not.toMatch(/\.bet\.create\b/);
    expect(cli).not.toMatch(/\.bet\.update\b/);
    expect(cli).not.toMatch(/\.bet\.delete\b/);
    expect(cli).not.toMatch(/\.bet\.createMany\b/);
    expect(fs.existsSync(HYBRID_LIB)).toBe(true);
    expect(fs.existsSync(HYBRID_CLI)).toBe(true);
  });
});
