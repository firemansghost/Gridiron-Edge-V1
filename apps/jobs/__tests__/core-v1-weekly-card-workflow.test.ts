/**
 * Phase 2C-2J-5 — static workflow security for Core V1 weekly card + legacy sync.
 * No providers, no DB, no network.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const CARD_WF = path.join(
  ROOT,
  '.github/workflows/write-core-v1-weekly-card-2026.yml'
);
const LEGACY_SYNC_WF = path.join(ROOT, '.github/workflows/sync-weekly-bets.yml');
const CARD_CLI = path.join(ROOT, 'apps/jobs/write-core-v1-weekly-card-2026.ts');

function stepBlock(src: string, stepName: string): string {
  const marker = `- name: ${stepName}`;
  const idx = src.indexOf(marker);
  if (idx < 0) return '';
  const rest = src.slice(idx);
  const next = rest.search(/\n\s*- name:/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('2C-2J-5 Core V1 weekly-card workflow security', () => {
  const wf = fs.readFileSync(CARD_WF, 'utf8');
  const cli = fs.readFileSync(CARD_CLI, 'utf8');
  const legacy = fs.readFileSync(LEGACY_SYNC_WF, 'utf8');

  it('workflow_dispatch only; PREVIEW default; no schedule/push/PR', () => {
    expect(wf).toContain('workflow_dispatch');
    expect(wf).not.toMatch(/^\s*schedule:/m);
    expect(wf).not.toMatch(/^\s*push:/m);
    expect(wf).not.toMatch(/^\s*pull_request:/m);
    expect(wf).toMatch(/default:\s*PREVIEW/);
  });

  it('optional kickoff_before input; reaches shell only via step-level env', () => {
    expect(wf).toMatch(/kickoff_before:/);
    expect(wf).toContain('INPUT_KICKOFF_BEFORE:');
    expect(cli).toContain('--kickoff-before');
    expect(cli).toContain('parseKickoffBefore');
    expect(cli).toContain('executeAtomicAppendCommit');
  });

  it('production DIRECT_URL absent from Preflight; only on card DB step', () => {
    const preflight = stepBlock(wf, 'Preflight (names/presence only)');
    const install = stepBlock(wf, 'Install dependencies');
    const prisma = stepBlock(wf, 'Generate Prisma client');
    const card = stepBlock(wf, 'Run guarded 2026 Core V1 weekly card');
    const upload = stepBlock(wf, 'Upload Core V1 card audit report');
    const summary = stepBlock(wf, 'Summary');

    expect(preflight).not.toMatch(/secrets\.DIRECT_URL/);
    expect(preflight).not.toMatch(/DIRECT_URL:/);
    expect(install).not.toMatch(/secrets\.DIRECT_URL/);
    expect(prisma).not.toMatch(/secrets\.DIRECT_URL/);
    expect(upload).not.toMatch(/secrets\.DIRECT_URL/);
    expect(summary).not.toMatch(/secrets\.DIRECT_URL/);

    expect(card).toMatch(
      /DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/
    );
    // DATABASE_URL alias allowed only on the same card DB step (prisma singleton).
    expect(card).toMatch(
      /DATABASE_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/
    );

    const secretHits = wf.match(
      /DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/g
    );
    expect(secretHits).toHaveLength(1);
  });

  it('no provider keys; providerCalls=0; no direct inputs in run', () => {
    expect(wf).not.toMatch(/secrets\.ODDS_API_KEY/);
    expect(wf).not.toMatch(/secrets\.CFBD_API_KEY/);
    expect(wf).not.toMatch(/secrets\.SGO_API_KEY/);
    expect(wf).not.toMatch(/secrets\.VISUALCROSSING/);
    expect(wf).not.toMatch(/^\s+ODDS_API_KEY:/m);
    expect(wf).not.toMatch(/^\s+CFBD_API_KEY:/m);
    expect(wf).not.toMatch(/^\s+SGO_API_KEY:/m);
    expect(wf).toContain('providerCalls=0');
    expect(wf).not.toMatch(/GITHUB_ENV/);

    // No `${{ inputs.* }}` inside run: shell bodies (env: is OK).
    const runBodies: string[] = [];
    const lines = wf.split(/\r?\n/);
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
    const runText = runBodies.join('\n');
    expect(runText).not.toMatch(/\$\{\{\s*inputs\./);
  });

  it('CLI separates transaction failure from committed verification failure', () => {
    expect(cli).toContain('resolvePreviewExitCode');
    expect(cli).toContain('buildCommittedVerificationFailureExecution');
    expect(cli).toContain('buildRolledBackTransactionExecution');
    expect(cli).toContain('txMutationInvoked');
    expect(cli).toContain('BET ROWS MAY / DO EXIST');
    expect(cli).toContain('NOT a rollback');
    expect(cli).toContain('mutationAttempted');
    expect(cli).toContain('persistenceCommitted');
    expect(cli).toContain('executeAtomicAppendCommit');
  });

  it('legacy sync-weekly-bets rejects season >= 2026', () => {
    expect(legacy).toContain('LEGACY');
    expect(legacy).toMatch(/season.*-ge 2026|SEASON.*-ge 2026/);
    expect(legacy).toContain('write-core-v1-weekly-card-2026');
  });
});
