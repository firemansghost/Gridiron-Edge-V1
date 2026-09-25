import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const WF = path.join(
  ROOT,
  '.github/workflows/audit-v4-source-equivalence-probe-2026.yml'
);
const CLI = path.join(
  ROOT,
  'apps/jobs/audit-v4-source-equivalence-probe-2026.ts'
);
const MOD = path.join(
  ROOT,
  'apps/jobs/src/research/v4-source-equivalence-probe.ts'
);

describe('V4 source equivalence probe workflow guardrails', () => {
  const wf = fs.readFileSync(WF, 'utf8');
  const cli = fs.readFileSync(CLI, 'utf8');
  const mod = fs.readFileSync(MOD, 'utf8');

  it('is manual-only and exact-main-SHA guarded', () => {
    expect(wf).toContain('workflow_dispatch:');
    expect(wf).not.toContain('pull_request:');
    expect(wf).not.toContain('push:');
    expect(wf).not.toMatch(/\nschedule:\s*\n/m);
    expect(wf).toContain('expected_main_sha');
    expect(wf).toContain('refs/heads/main');
    expect(wf).toContain('git rev-parse HEAD');
  });

  it('freezes the provider-call budget at nine', () => {
    expect(wf).toContain('providerCallBudget=9');
    expect(mod).toContain('V4_EQUIVALENCE_PROVIDER_CALL_BUDGET');
    expect(mod).toContain("'/stats/game/advanced'");
    expect(mod).toContain("'/drives'");
    expect(mod).toContain("'/plays'");
    expect(cli).toContain('provider call budget exceeded');
  });

  it('scopes provider access to the probe and exposes no write mode', () => {
    expect(wf).toContain('secrets.CFBD_API_KEY');
    expect(wf).not.toContain('secrets.ODDS_API_KEY');
    expect(wf).not.toContain('secrets.SGO_API_KEY');
    expect(wf).not.toContain('mode:');
    expect(wf).not.toContain('COMMIT');
    expect(wf).toContain('safeToPersistComparator=false');
    expect(mod).toContain('safeToPersistComparator: false');
    expect(mod).toContain('comparatorPersistenceAuthorized: false');
  });

  it('contains no Prisma mutation calls or migrations', () => {
    const prismaMutation =
      /prisma\.[A-Za-z0-9_]+\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/;
    for (const source of [cli, mod]) {
      expect(source).not.toMatch(prismaMutation);
      expect(source).not.toMatch(/prisma\.\$executeRaw/);
      expect(source).not.toMatch(/prisma\.\$queryRawUnsafe/);
    }
    expect(wf).not.toMatch(/npx\s+prisma\s+migrate/);
    expect(wf).toContain('mutationsInvoked=false');
  });

  it('uploads evidence artifacts instead of persisting research output', () => {
    expect(wf).toContain('actions/upload-artifact@v4');
    expect(wf).toContain('v4-source-equivalence-probe-2026');
    expect(cli).toContain('cfbd-advanced-sample.json');
    expect(cli).toContain('cfbd-drives-sample.json');
    expect(cli).toContain('cfbd-plays-sample.json');
    expect(cli).toContain('provider-calls.json');
    expect(cli).toContain('report.json');
  });
});
