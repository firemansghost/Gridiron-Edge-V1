/**
 * Phase 2C-2H-1 — Mocked tests for read-only 2026 talent availability probe.
 * No network. No production DB. No providers.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  EXPECTED_FBS_COUNT,
  buildFbsFixture,
  buildIdentityResolver,
} from '../src/preseason/ratings-input-provider-preview';
import {
  buildTalentAvailabilityProbe,
  classifyTalentStructuralCompleteness,
  parseTalentAvailabilityProbeArgs,
  sanitizeTalentAvailabilityProbeError,
} from '../src/preseason/talent-availability-probe';

function nameMapForFbs(fbs: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const id of fbs) map[`Name ${id}`] = id;
  return map;
}

function healthyTalentRows(fbs: string[]) {
  return fbs.map((id, i) => ({
    school: `Name ${id}`,
    year: 2026,
    talent: 600 + i,
  }));
}

describe('parse talent probe args', () => {
  it('accepts --season 2026 --preview', () => {
    expect(
      parseTalentAvailabilityProbeArgs(['--season', '2026', '--preview'])
    ).toEqual({ ok: true, season: 2026, preview: true });
  });

  it('rejects wrong season and write flags', () => {
    expect(
      parseTalentAvailabilityProbeArgs(['--season', '2025', '--preview']).ok
    ).toBe(false);
    expect(
      parseTalentAvailabilityProbeArgs([
        '--season',
        '2026',
        '--preview',
        '--write',
      ]).ok
    ).toBe(false);
  });
});

describe('talent availability classification', () => {
  const fbs = buildFbsFixture();
  const resolve = buildIdentityResolver(nameMapForFbs(fbs));

  it('18. provider budget exactly 1', () => {
    const result = buildTalentAvailabilityProbe({
      fbsIds: fbs,
      talentRaw: [],
      resolveTeamId: resolve,
      providerRequestCount: 1,
      endpoint: '/talent?year=2026',
    });
    expect(result.providerRequestCount).toBe(1);
    expect(result.endpoint).toBe('/talent?year=2026');
  });

  it('19. zero rows classifies unavailable', () => {
    const result = buildTalentAvailabilityProbe({
      fbsIds: fbs,
      talentRaw: [],
      resolveTeamId: resolve,
      providerRequestCount: 1,
    });
    expect(result.rawTalentRows).toBe(0);
    expect(result.matchedFbsCount).toBe(0);
    expect(result.missingFbsCount).toBe(138);
    expect(result.talentCompositeFinite).toBe(0);
    expect(result.talentAvailable).toBe(false);
    expect(result.structurallyComplete).toBe(false);
    expect(result.persistenceAuthorized).toBe(false);
    expect(result.ratingsComputeAuthorized).toBe(false);
    expect(result.mutationsInvoked).toBe(false);
  });

  it('20. 138 exact valid rows structurally complete but not authorized', () => {
    const result = buildTalentAvailabilityProbe({
      fbsIds: fbs,
      talentRaw: healthyTalentRows(fbs),
      resolveTeamId: resolve,
      providerRequestCount: 1,
    });
    expect(result.structurallyComplete).toBe(true);
    expect(result.talentAvailable).toBe(true);
    expect(result.matchedFbsCount).toBe(EXPECTED_FBS_COUNT);
    expect(result.talentCompositeFinite).toBe(EXPECTED_FBS_COUNT);
    expect(result.persistenceAuthorized).toBe(false);
    expect(result.ratingsComputeAuthorized).toBe(false);
  });

  it('21. one missing talent row fails completeness', () => {
    const result = buildTalentAvailabilityProbe({
      fbsIds: fbs,
      talentRaw: healthyTalentRows(fbs.slice(1)),
      resolveTeamId: resolve,
      providerRequestCount: 1,
    });
    expect(result.structurallyComplete).toBe(false);
    expect(result.missingFbsCount).toBe(1);
  });

  it('22. duplicate talent mapping fails completeness', () => {
    const rows = healthyTalentRows(fbs);
    rows.push({ school: `Name ${fbs[0]}`, year: 2026, talent: 999 });
    const result = buildTalentAvailabilityProbe({
      fbsIds: fbs,
      talentRaw: rows,
      resolveTeamId: resolve,
      providerRequestCount: 1,
    });
    expect(result.duplicateTeamIds).toBeGreaterThan(0);
    expect(result.structurallyComplete).toBe(false);
  });

  it('23. wrong provider season fails completeness', () => {
    const result = buildTalentAvailabilityProbe({
      fbsIds: fbs,
      talentRaw: fbs.map((id, i) => ({
        school: `Name ${id}`,
        year: 2025,
        talent: 600 + i,
      })),
      resolveTeamId: resolve,
      providerRequestCount: 1,
    });
    expect(result.seasonMismatch).toBe(true);
    expect(result.structurallyComplete).toBe(false);
  });

  it('24. nonfinite talent value fails completeness', () => {
    const rows = healthyTalentRows(fbs);
    (rows[0] as { talent: number | null }).talent = null as unknown as number;
    rows[0] = { school: `Name ${fbs[0]}`, year: 2026, talent: Number.NaN };
    const result = buildTalentAvailabilityProbe({
      fbsIds: fbs,
      talentRaw: rows,
      resolveTeamId: resolve,
      providerRequestCount: 1,
    });
    expect(result.talentCompositeFinite).toBe(EXPECTED_FBS_COUNT - 1);
    expect(result.structurallyComplete).toBe(false);
  });

  it('classify helper requires all completeness gates', () => {
    const ok = classifyTalentStructuralCompleteness({
      dbFbsCount: 138,
      matchedFbsCount: 138,
      missingFbsCount: 0,
      unresolvedRelevantCount: 0,
      duplicateTeamIds: 0,
      seasonMismatch: false,
      talentCompositeFinite: 138,
    });
    expect(ok.structurallyComplete).toBe(true);
    expect(ok.talentAvailable).toBe(true);
  });
});

describe('talent probe isolation', () => {
  it('25-28. no writes / Odds / ratings / migrate in CLI or workflow', () => {
    const cli = fs.readFileSync(
      path.join(__dirname, '../probe-2026-talent-availability.ts'),
      'utf8'
    );
    expect(cli).not.toMatch(
      /\.(create|update|upsert|delete|createMany|updateMany|deleteMany)\s*\(/
    );
    expect(cli).not.toMatch(/ODDS_API_KEY|OddsApi/);
    expect(cli).not.toMatch(/compute_ratings|recruiting\/teams/);
    expect(cli).toMatch(/providerBudget=1/);
    expect(cli).toMatch(/sharedResolver/);

    const wf = fs.readFileSync(
      path.join(
        __dirname,
        '../../../.github/workflows/probe-2026-talent-availability.yml'
      ),
      'utf8'
    );
    expect(wf).toMatch(/workflow_dispatch:/);
    expect(wf).not.toMatch(/^\s*schedule:/m);
    expect(wf).toMatch(/contents:\s*read/);
    expect(wf).toMatch(/checkout@v6/);
    expect(wf).toMatch(/setup-node@v6/);
    expect(wf).toMatch(/node-version:\s*'20'/);
    expect(wf).toMatch(/npm ci/);
    expect(wf).toMatch(/prisma:generate/);
    expect(wf).toMatch(/CFBD_API_KEY/);
    expect(wf).toMatch(/ODDS_API_KEY: not provided/);
    expect(wf).not.toMatch(/secrets\.ODDS_API_KEY/);
    expect(wf).toMatch(/PROBE_SEASON/);
    expect(wf).toMatch(/provider budget: 1/);
    expect(wf).not.toMatch(
      /npx tsx[^\n]*\$\{\{\s*inputs\./
    );
  });

  it('errors sanitized; pure module has no fetch', () => {
    expect(
      sanitizeTalentAvailabilityProbeError({
        message: 'postgresql://u:p@h/db CFBD_API_KEY=x',
      })
    ).toMatch(/suppressed/);
    const src = fs.readFileSync(
      path.join(__dirname, '../src/preseason/talent-availability-probe.ts'),
      'utf8'
    );
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/from ['"]@prisma\/client['"]/);
  });
});
