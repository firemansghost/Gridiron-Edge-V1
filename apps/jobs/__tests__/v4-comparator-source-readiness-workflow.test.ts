import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const WF = path.join(
  ROOT,
  '.github/workflows/audit-v4-comparator-source-readiness-2026.yml'
);
const CLI = path.join(
  ROOT,
  'apps/jobs/audit-v4-comparator-source-readiness-2026.ts'
);

describe('V4 comparator source-readiness workflow', () => {
  const wf = fs.readFileSync(WF, 'utf8');
  const cli = fs.readFileSync(CLI, 'utf8');

  it('is workflow_dispatch only and main-SHA guarded', () => {
    expect(wf).toContain('workflow_dispatch:');
    expect(wf).not.toMatch(/\nschedule:\s*\n/m);
    expect(wf).not.toContain('pull_request:');
    expect(wf).not.toContain('push:');
    expect(wf).toContain('expected_main_sha');
    expect(wf).toContain('refs/heads/main');
    expect(wf).toContain('git rev-parse HEAD');
  });

  it('exposes no provider secrets and declares zero provider calls', () => {
    expect(wf).not.toContain('secrets.CFBD_API_KEY');
    expect(wf).not.toContain('secrets.ODDS_API_KEY');
    expect(wf).not.toContain('secrets.SGO_API_KEY');
    expect(wf).not.toContain('secrets.VISUALCROSSING_API_KEY');
    expect(wf).toContain('providerCalls=0');
    expect(cli).not.toContain('CFBDClient');
    expect(cli).not.toContain('OddsApiAdapter');
  });

  it('does not invoke legacy V4 or mutation paths', () => {
    expect(wf).not.toMatch(/(?:npx|node)\\s+[^\\n]*compute_ratings_v4\\.ts/);
    expect(wf).not.toMatch(/(?:npx|node)\\s+[^\\n]*sync-drives\\.ts/);
    expect(wf).not.toMatch(/(?:npx|node)\\s+[^\\n]*sync-v4-bets\\.ts/);
    expect(wf).not.toMatch(/npx\\s+prisma\\s+migrate/);
    expect(cli).not.toMatch(/\.create\s*\(/);
    expect(cli).not.toMatch(/\.update\s*\(/);
    expect(cli).not.toMatch(/\.upsert\s*\(/);
    expect(cli).not.toMatch(/\.delete\s*\(/);
    expect(cli).not.toMatch(/\.deleteMany\s*\(/);
    expect(cli).not.toMatch(/\.updateMany\s*\(/);
  });

  it('runs only the read-only readiness CLI and uploads a report', () => {
    expect(wf).toContain(
      'npx tsx apps/jobs/audit-v4-comparator-source-readiness-2026.ts'
    );
    expect(wf).toContain('v4-comparator-source-readiness-*.json');
    expect(wf).toContain('mutationsInvoked=false');
    expect(wf).toContain('V4 rating writes: false');
    expect(wf).toContain('V4 Bet writes: false');
    expect(wf).toContain('Shadow writes: false');
  });
});
