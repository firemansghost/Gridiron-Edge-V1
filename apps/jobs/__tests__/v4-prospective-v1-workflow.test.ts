import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const WF = path.join(
  ROOT,
  '.github/workflows/preview-v4-prospective-v1-2026-manual.yml'
);
const CLI = path.join(
  ROOT,
  'apps/jobs/audit-v4-prospective-v1-preview-2026.ts'
);
const MOD = path.join(
  ROOT,
  'apps/jobs/src/research/v4-prospective-v1.ts'
);
const CONTRACT = path.join(
  ROOT,
  'research/v4-prospective/V4_PROSPECTIVE_V1_CONTRACT.md'
);

describe('V4 prospective v1 preview workflow guardrails', () => {
  const wf = fs.readFileSync(WF, 'utf8');
  const cli = fs.readFileSync(CLI, 'utf8');
  const mod = fs.readFileSync(MOD, 'utf8');
  const contract = fs.readFileSync(CONTRACT, 'utf8');

  it('is manual-only and exact-main-SHA guarded', () => {
    expect(wf).toContain('workflow_dispatch:');
    expect(wf).not.toContain('pull_request:');
    expect(wf).not.toContain('push:');
    expect(wf).not.toMatch(/\nschedule:\s*\n/m);
    expect(wf).toContain('expected_main_sha');
    expect(wf).toContain('refs/heads/main');
    expect(wf).toContain('git rev-parse HEAD');
  });

  it('freezes the provider budget at six and only uses advanced plus drives', () => {
    expect(wf).toContain('providerCallBudget=6');
    expect(mod).toContain('V4_PROSPECTIVE_V1_PROVIDER_CALL_BUDGET = 6');
    expect(cli).toContain("'/stats/game/advanced'");
    expect(cli).toContain("'/drives'");
    expect(cli).not.toContain("'/plays'");
    expect(cli).toContain('provider call budget exceeded');
  });

  it('does not expose a write mode or authorize comparator persistence', () => {
    expect(wf).toContain('safeToPersistComparator=false');
    expect(wf).toContain('persistenceAuthorized=false');
    expect(wf).toContain('superTierAActivationAuthorized=false');
    expect(wf).toContain('historicalBackfillAuthorized=false');
    expect(cli).toContain('safeToPersistComparator: false');
    expect(cli).toContain('persistenceAuthorized: false');
    expect(cli).toContain('superTierAActivationAuthorized: false');
    expect(cli).toContain('historicalBackfillAuthorized: false');
    expect(wf).not.toContain('mode:');
    expect(wf).not.toContain('COMMIT');
  });

  it('contains no Prisma mutations or migrations', () => {
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

  it('uses artifact-only output and preserves the versioning boundary', () => {
    expect(wf).toContain('actions/upload-artifact@v4');
    expect(wf).toContain('v4-prospective-v1-2026-week4-preview');
    expect(contract).toContain('is not historical V4');
    expect(contract).toContain('retrospective Week 1–4 comparator decisions');
  });

  it('keeps null provider numerics fail-closed rather than Number(null)=0', () => {
    for (const source of [cli, mod]) {
      expect(source).toContain(
        "if (value === null || value === undefined || value === '') return null;"
      );
    }
  });
});
