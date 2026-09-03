/**
 * Static workflow/CLI safety for guarded 2026 CFBD schedule rollover.
 * No providers, no production DB.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const WF_MANUAL = path.join(
  ROOT,
  '.github/workflows/write-cfbd-schedules-2026-manual.yml'
);
const WF_PREVIEW = path.join(ROOT, '.github/workflows/preview-2026-schedules.yml');
const WF_LEGACY = path.join(ROOT, '.github/workflows/ingest-2026-schedules.yml');
const CLI = path.join(ROOT, 'apps/jobs/write-cfbd-schedules-2026.ts');
const LIB = path.join(
  ROOT,
  'apps/jobs/src/preseason/cfbd-schedule-rollover-2026.ts'
);
const LEGACY_CLI = path.join(ROOT, 'apps/jobs/write-schedules.ts');

function stepBlock(src: string, stepName: string): string {
  const marker = `- name: ${stepName}`;
  const idx = src.indexOf(marker);
  if (idx < 0) return '';
  const rest = src.slice(idx);
  const next = rest.search(/\n\s*- name:/);
  return next === -1 ? rest : rest.slice(0, next);
}

function collectRunBodies(src: string): string {
  const runBodies: string[] = [];
  const lines = src.split(/\r?\n/);
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

function transactionCallback(src: string): string {
  const start = src.indexOf('prisma.$transaction');
  const iso = src.indexOf('isolationLevel');
  expect(start).toBeGreaterThanOrEqual(0);
  expect(iso).toBeGreaterThan(start);
  return src.slice(start, iso);
}

describe('write-cfbd-schedules-2026-manual workflow', () => {
  const wf = fs.readFileSync(WF_MANUAL, 'utf8');
  const cli = fs.readFileSync(CLI, 'utf8');
  const lib = fs.readFileSync(LIB, 'utf8');
  const preview = fs.readFileSync(WF_PREVIEW, 'utf8');

  it('is workflow_dispatch only with PREVIEW default', () => {
    expect(fs.existsSync(WF_MANUAL)).toBe(true);
    expect(wf).toMatch(/^\s*workflow_dispatch:\s*$/m);
    expect(wf).not.toMatch(/^\s*schedule:\s*$/m);
    expect(wf).not.toMatch(/^\s*push:\s*$/m);
    expect(wf).not.toMatch(/^\s*pull_request:\s*$/m);
    expect(wf).not.toMatch(/cron:/);
    expect(wf).toMatch(/default:\s*PREVIEW/);
    expect(wf).toMatch(/permissions:\s*\n\s*contents:\s*read/);
    expect(wf).toContain('group: cfbd-schedule-rollover-2026-${{ inputs.week }}');
    expect(wf).toContain('cancel-in-progress: false');
  });

  it('uses exact dynamic confirmation and rejects week 0 in preflight', () => {
    expect(wf).toContain('WRITE_2026_WEEK_');
    expect(wf).toContain('_SCHEDULES');
    expect(wf).toContain('week 0 rejected');
    expect(collectRunBodies(wf)).toContain('^[1-9][0-9]*$');
  });

  it('does not interpolate inputs directly inside run shells', () => {
    expect(collectRunBodies(wf)).not.toMatch(/\$\{\{\s*inputs\./);
  });

  it('never echoes the confirmation input value', () => {
    const runs = collectRunBodies(wf);
    expect(runs).not.toMatch(/echo\s+"\$CONFIRM"/);
    expect(runs).not.toMatch(/echo\s+"\$INPUT_CONFIRMATION"/);
    expect(runs).not.toMatch(/echo\s+.*\$CONFIRM[^A-Z]/);
    expect(cli).not.toMatch(/console\.log\([^)]*args\.confirmation/);
    expect(cli).toContain('value not echoed from input');
  });

  it('scopes production secrets to the writer step; no Odds/SGO/weather', () => {
    const preflight = stepBlock(wf, 'Preflight (names/presence only)');
    const writer = stepBlock(wf, 'Run guarded 2026 CFBD schedule rollover');
    expect(preflight).not.toMatch(/secrets\.DIRECT_URL/);
    expect(preflight).not.toContain('CFBD_API_KEY');
    expect(writer).toMatch(/DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/);
    expect(writer).toMatch(/CFBD_API_KEY:\s*\$\{\{\s*secrets\.CFBD_API_KEY\s*\}\}/);
    expect(wf).not.toMatch(/secrets\.ODDS_API_KEY/);
    expect(wf).not.toMatch(/secrets\.SGO_API_KEY/);
    expect(wf).not.toMatch(/secrets\.VISUALCROSSING/);
  });

  it('invokes only write-cfbd-schedules-2026.ts', () => {
    const runs = collectRunBodies(wf);
    expect(runs).toContain('write-cfbd-schedules-2026.ts');
    expect(runs).not.toMatch(/npx tsx\s+.*write-schedules\.ts/);
    expect(runs).not.toMatch(/npx tsx\s+.*ingest-schedules\.ts/);
    expect(wf).not.toMatch(/workflow_call:/);
  });

  it('PREVIEW CLI path has zero mutation / no $transaction', () => {
    expect(cli).toMatch(
      /if \(args\.mode === 'PREVIEW'\) \{[\s\S]*buildPreviewExecution[\s\S]*return;/
    );
    expect(cli).toContain('provider call skipped');
    expect(lib).toContain('mutationsInvoked: false');
  });

  it('COMMIT uses tx client and Serializable isolation', () => {
    const txBody = transactionCallback(cli);
    expect(cli).toContain('TransactionIsolationLevel.Serializable');
    expect(txBody).toMatch(/tx\.game\.create/);
    expect(txBody).toMatch(/tx\.game\.update/);
    expect(txBody).toMatch(/tx\.game\.findMany/);
    expect(txBody).toMatch(/tx\.teamMembership\.findMany/);
    expect(txBody).not.toMatch(/prisma\.game\./);
    expect(txBody).not.toMatch(/prisma\.teamMembership/);
    expect(cli).not.toMatch(/skipDuplicates:\s*true/);
    expect(cli).not.toMatch(/createMany\s*\(/);
    expect(cli).not.toMatch(/\.upsert\s*\(/);
    expect(cli).not.toMatch(/game\.delete/);
    expect(lib).not.toMatch(/skipDuplicates:\s*true/);
    expect(lib).not.toMatch(/\.upsert\s*\(/);
    expect(lib).not.toMatch(/writeValidatedScheduleBatch\s*\(/);
    expect(cli).not.toMatch(/writeValidatedScheduleBatch/);
  });

  it('in-transaction postverify throws; CLI does not verify after commit', () => {
    expect(lib).toMatch(
      /export async function executeAtomicScheduleRolloverCommit[\s\S]*verifyScheduleRolloverPostWrite[\s\S]*post-write verification failed/
    );
    expect(cli).not.toContain('verifyScheduleRolloverPostWrite');
    expect(cli).toContain('transactionalVerification');
    expect(cli).toContain('buildRolledBackExecution');
  });

  it('does not write Odds/Core/Bet/ratings/scores/grading/TeamGameStat', () => {
    for (const src of [cli, lib, wf]) {
      expect(src).not.toMatch(/secrets\.ODDS_API_KEY/);
      expect(src).not.toMatch(/secrets\.SGO_API_KEY/);
      expect(src).not.toMatch(/tx\.marketLine|prisma\.marketLine/);
      expect(src).not.toMatch(/tx\.bet\.|prisma\.bet\./);
      expect(src).not.toMatch(/tx\.teamGameStat|prisma\.teamGameStat/);
      expect(src).not.toMatch(/tx\.teamSeasonRating|prisma\.teamSeasonRating/);
      expect(src).not.toMatch(/seed-ratings|runRatings/);
      expect(src).not.toMatch(/npx tsx\s+.*grade-bets/);
    }
    expect(cli).toMatch(/homeScore:\s*null/);
    expect(cli).toContain("status: 'scheduled'");
    expect(cli).not.toMatch(/data:\s*\{[^}]*homeScore:\s*[1-9]/);
  });

  it('legacy ingest workflow is retired; preview-2026-schedules remains read-only', () => {
    expect(fs.existsSync(WF_LEGACY)).toBe(false);
    expect(fs.existsSync(LEGACY_CLI)).toBe(true);
    expect(fs.readFileSync(LEGACY_CLI, 'utf8')).toMatch(/NOT AUTHORIZED/);
    expect(preview).toMatch(/workflow_dispatch:/);
    expect(preview).toMatch(/--preview/);
    expect(preview).not.toMatch(/write-cfbd-schedules-2026\.ts/);
    expect(preview).not.toMatch(/npx tsx apps\/jobs\/write-schedules\.ts/);
    expect(collectRunBodies(preview)).not.toMatch(/\b(createMany|upsert|deleteMany)\b/);
  });
});
