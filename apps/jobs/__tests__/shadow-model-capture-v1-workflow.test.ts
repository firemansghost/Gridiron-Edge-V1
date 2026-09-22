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

  it('allowlists Core + roster-prior for COMMIT and Elo for PREVIEW only', () => {
    expect(wf).toContain('core_v1_shadow_baseline_v1');
    expect(wf).toContain('candidate_b_roster_prior_v1');
    expect(wf).toContain('candidate_b_elo_prior_v1');
    expect(wf).toMatch(
      /options:\s*\n\s*- core_v1_shadow_baseline_v1\s*\n\s*- candidate_b_roster_prior_v1\s*\n\s*- candidate_b_elo_prior_v1/
    );
    expect(wf).not.toContain('wepa_shadow');
    expect(wf).not.toContain('Candidate B V1 COMMIT is not authorized.');
    const preflight = stepBlock(wf, 'Preflight (names/presence only)');
    const capture = stepBlock(wf, 'Run guarded Shadow Model capture');
    expect(preflight).toContain('candidate_b_roster_prior_v1');
    expect(preflight).toContain('candidate_b_elo_prior_v1');
    expect(preflight).toContain('core_v1_shadow_baseline_v1');
    expect(preflight).toContain('first prospective observation is Week 5');
    expect(preflight).toContain('candidate_b_elo_prior_v1 is PREVIEW-only; COMMIT is not authorized');
    expect(preflight).toContain(
      'COMMIT requires confirm=${EXPECTED}'
    );
    expect(preflight).toContain(
      'CAPTURE_2026_WEEK_${INPUT_WEEK}_SHADOW_MODEL_${INPUT_MODEL_ID}'
    );
    expect(preflight).not.toContain('Candidate B V1 COMMIT is not authorized.');
    expect(capture).not.toContain('Candidate B V1 COMMIT is not authorized.');
    expect(cli).toContain('isShadowModelAllowlisted');
    expect(cli).toContain('shadowModelCommitAuthorizationError');
    const mainSrc = cli.slice(cli.indexOf('async function main()'));
    expect(mainSrc.indexOf('isShadowModelAllowlisted')).toBeLessThan(
      mainSrc.indexOf('shadowModelCommitAuthorizationError')
    );
    expect(mainSrc.indexOf('shadowModelCommitAuthorizationError')).toBeLessThan(
      mainSrc.indexOf('new PrismaClient()')
    );
    expect(mainSrc.indexOf('shadowModelCommitAuthorizationError')).toBeLessThan(
      mainSrc.indexOf('createPrismaPersistence')
    );
    expect(cli).toContain('createCandidateBRosterPriorShadowDefinition');
    expect(cli).toContain('createCandidateBEloPriorShadowDefinition');
    expect(cli).toContain('candidate_b_elo_prior_not_authorized_before_week_5');
    expect(cli).toContain('model.modelDefinitionHash');
    expect(cli).toContain('model.featureDefinitionHash');
    expect(cli).toContain('model.policyDefinitionHash');
    expect(lib).toContain("'core_v1_shadow_baseline_v1'");
    expect(lib).toContain("'candidate_b_roster_prior_v1'");
    expect(lib).toContain("'candidate_b_elo_prior_v1'");
    expect(lib).toContain('SHADOW_MODEL_COMMIT_ALLOWLIST');
    const commitAllowlist = lib.slice(
      lib.indexOf('export const SHADOW_MODEL_COMMIT_ALLOWLIST'),
      lib.indexOf('export type ShadowModelCommitAllowlistId')
    );
    expect(commitAllowlist).not.toContain("'candidate_b_elo_prior_v1'");
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

  it('no job-level DB secret; capture step provides DATABASE_URL and DIRECT_URL from secrets.DIRECT_URL', () => {
    const jobsPreamble = wf.split(/^\s+steps:\s*$/m)[0] ?? '';
    expect(jobsPreamble).not.toMatch(/secrets\.DIRECT_URL/);
    expect(jobsPreamble).not.toMatch(/DATABASE_URL:/);
    expect(jobsPreamble).not.toMatch(/DIRECT_URL:/);

    const install = stepBlock(wf, 'Install dependencies');
    const prismaVersion = stepBlock(wf, 'Prisma version');
    const preflight = stepBlock(wf, 'Preflight (names/presence only)');
    const guard = stepBlock(wf, 'Source SHA guard');
    const upload = stepBlock(wf, 'Upload Shadow Model Capture report');
    const summary = stepBlock(wf, 'Summary');
    const capture = stepBlock(wf, 'Run guarded Shadow Model capture');

    expect(install).not.toMatch(/DIRECT_URL:/);
    expect(install).not.toMatch(/DATABASE_URL:/);
    expect(prismaVersion).not.toMatch(/DIRECT_URL:/);
    expect(prismaVersion).not.toMatch(/DATABASE_URL:/);
    expect(preflight).not.toMatch(/secrets\.DIRECT_URL/);
    expect(guard).not.toMatch(/secrets\.DIRECT_URL/);
    expect(upload).not.toMatch(/secrets\.DIRECT_URL/);
    expect(summary).not.toMatch(/secrets\.DIRECT_URL/);

    expect(capture).toMatch(/DATABASE_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/);
    expect(capture).toMatch(/DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/);
    expect(capture).toContain('capture-shadow-model-predictions-2026.ts');
    expect(capture).not.toContain('prisma migrate');

    const databaseHits = wf.match(/DATABASE_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/g);
    const directHits = wf.match(/DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/g);
    expect(databaseHits).toHaveLength(1);
    expect(directHits).toHaveLength(1);
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
