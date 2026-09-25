/**
 * Hybrid Snapshot V1 -> Generic Shadow V4 consumer safety checks.
 * Static only: no network, no DB, no production writes.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const CLI = path.join(ROOT, 'apps/jobs/capture-shadow-snapshot-v1-2026.ts');
const WF = path.join(
  ROOT,
  '.github/workflows/capture-shadow-snapshot-v1-2026-manual.yml'
);
const LIB = path.join(ROOT, 'apps/web/lib/shadow-snapshot-v1.ts');

describe('Hybrid V4 Generic Shadow consumer wiring', () => {
  const cli = fs.readFileSync(CLI, 'utf8');
  const wf = fs.readFileSync(WF, 'utf8');
  const lib = fs.readFileSync(LIB, 'utf8');

  it('requires an explicit V4 capture run id end to end', () => {
    expect(wf).toMatch(/v4_capture_run_id:/);
    expect(wf).toContain('INPUT_V4_CAPTURE_RUN_ID');
    expect(wf).toContain('--v4-capture-run-id "$INPUT_V4_CAPTURE_RUN_ID"');
    expect(cli).toContain('--v4-capture-run-id');
    expect(cli).toContain('v4_capture_run_id is required');
    expect(cli).toContain('v4CaptureRunId: args.v4CaptureRunId');
    expect(lib).toContain('v4CaptureRunId: string');
    expect(lib).toContain('existing_v4_source_run_mismatch');
  });

  it('loads the exact Generic Shadow V4 run and does not read legacy V4 Bet rows', () => {
    expect(cli).toContain('shadowModelCaptureRun.findUnique');
    expect(cli).toContain('where: { id: v4CaptureRunId }');
    expect(cli).toContain('predictions: {');
    expect(cli).not.toContain('db.bet.findMany');
    expect(cli).not.toContain("strategyTag: 'v4_labs'");
    expect(cli).not.toContain('ShadowV4BetRow');
    expect(lib).toContain("source: 'generic_shadow_capture_run'");
    expect(lib).toContain('requiredModelDefinitionId: SHADOW_V4_MODEL_DEFINITION_ID');
    expect(lib).toContain('exactCaptureRunIdRequired: true');
    expect(lib).toContain('noLatestOrBestRunSelection: true');
    expect(lib).toContain('legacyBetSourceUsed: false');
  });

  it('stays manual/read-only by default with zero provider paths', () => {
    expect(wf).toContain('workflow_dispatch');
    expect(wf).not.toMatch(/^\s*schedule:/m);
    expect(wf).not.toMatch(/^\s*push:/m);
    expect(wf).not.toMatch(/^\s*pull_request:/m);
    expect(wf).toMatch(/default:\s*PREVIEW/);
    expect(wf).toContain('providerCalls=0');
    expect(wf).toContain('ODDS_API_KEY: not provided');
    expect(wf).toContain('CFBD_API_KEY: not provided');
    expect(cli).not.toContain('ODDS_API_KEY');
    expect(cli).not.toContain('CFBD_API_KEY');
    expect(cli).not.toContain('fetch(');
  });

  it('keeps Super Tier A frozen and non-official', () => {
    expect(lib).toContain('SUPER_TIER_A_ABS_EDGE_THRESHOLD = 4.0');
    expect(lib).toContain("requiresHybridStrong: true");
    expect(lib).toContain("status: 'SHADOW / HELD / NOT OFFICIAL'");
  });
});
