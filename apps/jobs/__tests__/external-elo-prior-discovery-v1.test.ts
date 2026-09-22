import * as fs from 'fs';
import * as path from 'path';
import {
  EXPECTED_FBS_COUNT,
  buildExternalEloPriorDiscovery,
  type DiscoveryInput,
  type RawCfbdEloRow,
} from '../src/research/candidate-b/external-elo-prior-discovery-v1';

function fixture(extraRaw: RawCfbdEloRow[] = []): DiscoveryInput {
  const memberships = Array.from({ length: EXPECTED_FBS_COUNT }, (_, i) => ({
    teamId: 't' + String(i).padStart(3, '0'),
    conference: 'C' + (i % 10),
  }));
  const talentRows = memberships.map((m, i) => ({
    teamId: m.teamId,
    talentComposite: 100 + i * 2,
  }));
  const rawRows: RawCfbdEloRow[] = [
    ...memberships.map((m, i) => ({
      year: 2026,
      team: 'Team ' + i,
      conference: 'Provider C' + (i % 10),
      elo: 1000 + i * 10,
    })),
    ...extraRaw,
  ];

  return {
    season: 2026,
    memberships,
    talentRows,
    rawRows,
    resolveTeam: name => {
      const m = /^Team (\d+)$/.exec(name);
      if (m) {
        return {
          teamId: 't' + String(Number(m[1])).padStart(3, '0'),
          method: 'cfbd_alias',
        };
      }
      if (name === 'Alias 0') return { teamId: 't000', method: 'alias' };
      return { teamId: null, method: null };
    },
  };
}

describe('External Elo Prior Discovery V1 pure audit', () => {
  it('passes a complete 138-team canonical snapshot and reuses Candidate A scale', () => {
    const result = buildExternalEloPriorDiscovery(fixture());
    expect(result.qaPass).toBe(true);
    expect(result.authoritativeFbs.uniqueCount).toBe(138);
    expect(result.resolution.usableFbsEloCount).toBe(138);
    expect(result.resolution.missingCanonicalTeamIds).toEqual([]);
    expect(result.comparison.comparedCount).toBe(138);
    expect(result.comparison.pearsonEloVsTalentZ).toBeCloseTo(1, 12);
    expect(result.comparison.spearmanEloVsTalentZ).toBeCloseTo(1, 12);
    expect(result.comparison.pearsonZEloVsTalentZ).toBeCloseTo(1, 12);
    for (const row of result.comparison.rows) {
      expect(row.candidateAPoints).toBeCloseTo(row.talentZ * 3.5, 12);
    }
    expect(result.noImputation).toBe(true);
    expect(result.modelChangeAuthorized).toBe(false);
    expect(result.historicalRetrofitAuthorized).toBe(false);
  });

  it('fails closed on a missing canonical Elo without imputing it', () => {
    const input = fixture();
    input.rawRows = input.rawRows.slice(0, -1);
    const result = buildExternalEloPriorDiscovery(input);
    expect(result.qaPass).toBe(false);
    expect(result.resolution.missingCanonicalTeamIds).toEqual(['t137']);
    expect(result.resolution.usableFbsEloCount).toBe(137);
    expect(result.comparison.comparedCount).toBe(137);
    expect(result.noImputation).toBe(true);
  });

  it('fails closed on duplicate canonical resolution and invalid Elo', () => {
    const input = fixture([{ year: 2026, team: 'Alias 0', conference: 'X', elo: 1200 }]);
    input.rawRows[4] = { year: 2026, team: 'Team 4', conference: 'X', elo: null };
    const result = buildExternalEloPriorDiscovery(input);
    expect(result.qaPass).toBe(false);
    expect(result.resolution.duplicateCanonicalTeamIds).toContain('t000');
    expect(result.resolution.invalidCanonicalEloTeamIds).toContain('t004');
    expect(result.raw.nullEloTeams).toContain('Team 4');
  });

  it('reports an unexpected non-FBS row without letting it redefine the denominator', () => {
    const result = buildExternalEloPriorDiscovery(
      fixture([{ year: 2026, team: 'Non FBS University', conference: 'Other', elo: 1400 }])
    );
    expect(result.qaPass).toBe(true);
    expect(result.raw.rowCount).toBe(139);
    expect(result.authoritativeFbs.uniqueCount).toBe(138);
    expect(result.resolution.usableFbsEloCount).toBe(138);
    expect(result.resolution.unexpectedProviderRows).toEqual([
      expect.objectContaining({
        providerTeam: 'Non FBS University',
        reason: 'unresolved',
      }),
    ]);
  });

  it('rejects forbidden resolution methods instead of accepting fuzzy identity', () => {
    const input = fixture();
    input.resolveTeam = name => {
      const m = /^Team (\d+)$/.exec(name);
      if (!m) return { teamId: null, method: null };
      return {
        teamId: 't' + String(Number(m[1])).padStart(3, '0'),
        method: Number(m[1]) === 7 ? 'fuzzy' : 'cfbd_alias',
      };
    };
    const result = buildExternalEloPriorDiscovery(input);
    expect(result.qaPass).toBe(false);
    expect(result.resolution.missingCanonicalTeamIds).toContain('t007');
    expect(result.resolution.unexpectedProviderRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerTeam: 'Team 7',
          reason: 'forbidden_resolution_method',
        }),
      ])
    );
  });
});

describe('External Elo Prior Discovery V1 implementation guardrails', () => {
  const cli = fs.readFileSync(
    path.join(process.cwd(), 'apps/jobs/capture-external-elo-prior-discovery-v1.ts'),
    'utf8'
  );
  const workflow = fs.readFileSync(
    path.join(process.cwd(), '.github/workflows/capture-external-elo-prior-discovery-v1.yml'),
    'utf8'
  );
  const contract = fs.readFileSync(
    path.join(process.cwd(), 'research/candidate-b/EXTERNAL_ELO_PRIOR_DISCOVERY_V1_CONTRACT.md'),
    'utf8'
  );

  it('uses exactly one canonical preseason Elo request and no week parameter', () => {
    expect(cli).toContain("baseUrl + '/ratings/elo'");
    expect(cli).toContain("url.searchParams.set('year', String(season))");
    expect(cli).toContain("url.searchParams.set('preseason', 'true')");
    expect(cli).not.toContain("url.searchParams.set('week'");
    expect((cli.match(/await fetch\(/g) ?? []).length).toBe(1);
  });

  it('persists exact raw bytes before parsing and hashes those bytes', () => {
    expect(cli).toContain("createHash('sha256')");
    expect(cli).toContain("writeFileSync(filePath, data, { flag: 'wx' })");
    const rawWrite = cli.indexOf('writeExclusive(args.rawPath, provider.rawBytes)');
    const parse = cli.indexOf("JSON.parse(provider.rawBytes.toString('utf8'))");
    expect(rawWrite).toBeGreaterThan(-1);
    expect(parse).toBeGreaterThan(rawWrite);
  });

  it('uses strict CFBD full-identity resolution and contains no database writer path', () => {
    expect(cli).toContain("provider: 'cfbd'");
    expect(cli).toContain('strictFullIdentity: true');
    expect(cli).toContain('teamMembership.findMany');
    expect(cli).toContain('teamSeasonTalent.findMany');
    expect(cli).not.toMatch(/prisma\.[A-Za-z0-9_]+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/);
    expect(cli).not.toContain('$transaction');
    expect(cli).not.toContain('prisma migrate');
  });

  it('keeps the workflow manual, main-only, exact-SHA guarded, and evidence-preserving', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/^\s*schedule:/m);
    expect(workflow).not.toMatch(/^\s*push:/m);
    expect(workflow).not.toMatch(/^\s*pull_request:/m);
    expect(workflow).toContain('refs/heads/main');
    expect(workflow).toContain('expected_main_sha');
    expect(workflow).toContain('if: always()');
    expect(workflow).toContain('reports/external-elo-prior-discovery-v1/**');
    expect(workflow).not.toContain('ODDS_API_KEY');
    expect(workflow).not.toContain('SGO_API_KEY');
    expect(workflow).not.toContain('VISUALCROSSING_API_KEY');
  });

  it('freezes the no-retrofit/no-blend research boundary', () => {
    expect(contract).toContain('One-call capture rule');
    expect(contract).toContain('Do not reimplement a new talent normalization.');
    expect(contract).toContain('must **not** select');
    expect(contract).toContain('Never retrofit');
  });
});
