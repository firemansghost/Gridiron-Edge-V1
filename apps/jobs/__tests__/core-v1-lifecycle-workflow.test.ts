/**
 * Phase 2C-2J-6D-2 — focused static workflow security for Core V1 lifecycle.
 * No providers, no DB, no network.
 */

import * as fs from 'fs';
import * as path from 'path';

const WF = path.join(
  __dirname,
  '../../../.github/workflows/write-core-v1-lifecycle-ratings.yml'
);
const CLI = path.join(__dirname, '../write-core-v1-lifecycle.ts');
const PURE = path.join(__dirname, '../src/ratings/core-v1-lifecycle.ts');

describe('2C-2J-6D-2 Core V1 lifecycle workflow security', () => {
  const wf = fs.readFileSync(WF, 'utf8').replace(/\r\n/g, '\n');
  const cli = fs.readFileSync(CLI, 'utf8');
  const pure = fs.readFileSync(PURE, 'utf8');

  it('dispatch only, PREVIEW default, no cron', () => {
    expect(wf).toContain('workflow_dispatch');
    expect(wf).not.toMatch(/^\s*schedule:/m);
    expect(wf).not.toMatch(/^\s*push:/m);
    expect(wf).not.toMatch(/^\s*pull_request:/m);
    expect(wf).toMatch(/default:\s*PREVIEW/);
    expect(wf).toContain('cancel-in-progress: false');
  });

  it('dynamic through-week confirmation and report/artifact', () => {
    expect(wf).toContain('WRITE_2026_CORE_V1_THROUGH_WEEK_');
    expect(wf).toContain('EXPECTED_CONFIRM="WRITE_2026_CORE_V1_THROUGH_WEEK_${WEEK}"');
    expect(wf).toContain('--report');
    expect(wf).toContain('upload-artifact');
    expect(wf).toContain('core-v1-lifecycle-2026-through-w');
    expect(wf).toContain('if: always()');
    expect(wf).toContain('providerCalls: 0');
  });

  it('guarded lifecycle writer only; no legacy ratings writer / provider secrets', () => {
    expect(wf).toContain('apps/jobs/write-core-v1-lifecycle.ts');
    expect(wf).not.toContain('compute_ratings_v1');
    expect(wf).not.toContain('compute_ratings_balanced');
    expect(wf).not.toMatch(/CFBD_API_KEY:\s*\$\{\{\s*secrets/);
    expect(wf).not.toMatch(/ODDS_API_KEY:\s*\$\{\{\s*secrets/);
    expect(wf).toContain('CFBD_API_KEY: not provided');
  });

  it('DIRECT_URL scoped; no inputs interpolated in run bodies', () => {
    const jobsWriteIdx = wf.indexOf('jobs:\n  write:');
    const stepsIdx = wf.indexOf('\n    steps:', jobsWriteIdx);
    const preamble = wf.slice(jobsWriteIdx, stepsIdx);
    expect(preamble).not.toMatch(/DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL/);
    for (const block of [...wf.matchAll(/run:\s*\|\n((?:[ \t]+.*\n)*)/g)].map(
      (m) => m[1]
    )) {
      expect(block).not.toMatch(/\$\{\{\s*inputs\./);
    }
  });

  it('CLI Serializable transaction + week-tied confirmation helper', () => {
    expect(cli).toContain('Prisma.TransactionIsolationLevel.Serializable');
    expect(cli).toContain('executeAtomicCoreV1LifecycleCommit');
    expect(pure).toContain('expectedCoreV1LifecycleConfirmation');
    expect(pure).toContain('PHASE = \'2C-2J-6D-2\'');
    expect(pure).toContain(
      "WRITE_CONFIRM_PHRASE = 'WRITE_2026_CORE_V1'"
    );
    expect(pure).toMatch(/@deprecated[\s\S]*WRITE_CONFIRM_PHRASE/);
  });
});
