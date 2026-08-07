/**
 * Phase 2C-2D — Mocked conference + recruiting diagnostic tests.
 * No network. No production DB. No providers.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  EXPECTED_FBS_COUNT,
  buildConferenceRecruitingDiagnostic,
  buildFbsFixture,
  buildIdentityResolver,
  diagnoseConferenceMap,
  diagnoseRecruitingMapping,
  parseConferenceRecruitingDiagnosticArgs,
  sanitizeConferenceRecruitingDiagnosticError,
} from '../src/preseason/conference-recruiting-diagnostic';

function nameMapForFbs(fbs: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const id of fbs) {
    map[`Name ${id}`] = id;
    if (id === 'north-dakota-state') map['North Dakota State'] = id;
    if (id === 'sacramento-state') map['Sacramento State'] = id;
  }
  return map;
}

function healthyTeamsFbs(fbs: string[]) {
  return fbs.map((id) => {
    let school = `Name ${id}`;
    let conference = 'SEC';
    if (id === 'north-dakota-state') {
      school = 'North Dakota State';
      conference = 'Mountain West';
    } else if (id === 'sacramento-state') {
      school = 'Sacramento State';
      conference = 'MAC';
    }
    return {
      school,
      conference,
      classification: 'fbs',
      id: 1,
      abbreviation: 'X',
      mascot: 'M',
      division: 'fbs',
    };
  });
}

describe('parse args', () => {
  it('accepts --season 2026 --preview', () => {
    expect(
      parseConferenceRecruitingDiagnosticArgs([
        '--season',
        '2026',
        '--preview',
      ])
    ).toEqual({ ok: true, season: 2026, preview: true });
  });

  it('rejects wrong season', () => {
    expect(
      parseConferenceRecruitingDiagnosticArgs([
        '--season',
        '2025',
        '--preview',
      ]).ok
    ).toBe(false);
  });

  it('rejects duplicate season', () => {
    expect(
      parseConferenceRecruitingDiagnosticArgs([
        '--season',
        '2026',
        '--season',
        '2026',
        '--preview',
      ]).ok
    ).toBe(false);
  });

  it('rejects write flags', () => {
    expect(
      parseConferenceRecruitingDiagnosticArgs([
        '--season',
        '2026',
        '--preview',
        '--write',
      ]).ok
    ).toBe(false);
  });
});

describe('conference diagnostic', () => {
  const fbs = buildFbsFixture();
  const resolve = buildIdentityResolver(nameMapForFbs(fbs));

  it('138/138 healthy provider FBS map with full conference coverage', () => {
    const conferenceByTeamId = Object.fromEntries(
      fbs.map((id) => [id, 'SEC'])
    );
    const d = diagnoseConferenceMap({
      fbsIds: fbs,
      teamsFbsRaw: healthyTeamsFbs(fbs),
      conferenceByTeamId,
      resolveTeamId: resolve,
    });
    expect(d.matchedDbFbsCount).toBe(EXPECTED_FBS_COUNT);
    expect(d.providerConferenceCoverageComplete).toBe(true);
    expect(d.providerConferenceMapSafeForV1).toBe(true);
    expect(d.ndsu.providerConference).toBe('Mountain West');
    expect(d.sacramentoState.providerConference).toBe('MAC');
  });

  it('provider missing FBS team', () => {
    const rows = healthyTeamsFbs(fbs).filter(
      (r) => r.school !== 'North Dakota State'
    );
    const d = diagnoseConferenceMap({
      fbsIds: fbs,
      teamsFbsRaw: rows,
      conferenceByTeamId: Object.fromEntries(fbs.map((id) => [id, 'SEC'])),
      resolveTeamId: resolve,
    });
    expect(d.dbFbsMissingFromProvider).toContain('north-dakota-state');
    expect(d.providerConferenceCoverageComplete).toBe(false);
  });

  it('unexpected provider FBS team', () => {
    const map = nameMapForFbs(fbs);
    map['Ghost FBS'] = 'ghost-fbs';
    const d = diagnoseConferenceMap({
      fbsIds: fbs,
      teamsFbsRaw: [
        ...healthyTeamsFbs(fbs),
        { school: 'Ghost FBS', conference: 'SEC', classification: 'fbs' },
      ],
      conferenceByTeamId: Object.fromEntries(fbs.map((id) => [id, 'SEC'])),
      resolveTeamId: buildIdentityResolver(map),
    });
    expect(d.providerFbsOutsideDb).toContain('ghost-fbs');
  });

  it('duplicate provider team and unresolved school', () => {
    const rows = [
      ...healthyTeamsFbs(fbs.slice(0, 1)),
      { school: `Name ${fbs[0]}`, conference: 'ACC' },
      { school: 'Unknown School', conference: 'SEC' },
    ];
    const d = diagnoseConferenceMap({
      fbsIds: fbs,
      teamsFbsRaw: rows,
      conferenceByTeamId: Object.fromEntries(fbs.map((id) => [id, 'SEC'])),
      resolveTeamId: resolve,
    });
    expect(d.duplicateTeamIds).toContain(fbs[0]);
    expect(d.unresolvedProviderSchools).toContain('Unknown School');
  });

  it('current Independent versus valid provider conference', () => {
    const conferenceByTeamId = Object.fromEntries(
      fbs.map((id) => [id, 'Independent'])
    );
    const d = diagnoseConferenceMap({
      fbsIds: fbs,
      teamsFbsRaw: healthyTeamsFbs(fbs),
      conferenceByTeamId,
      resolveTeamId: resolve,
    });
    expect(d.currentIndependentCount).toBe(138);
    expect(d.independentButProviderHasConference).toBe(138);
    expect(d.currentTeamConferenceSafeFor2026).toBe(false);
    expect(d.seasonAwareConferenceSolutionRequired).toBe(true);
  });

  it('provider conference unrecognized by V1 adjustment', () => {
    const rows = healthyTeamsFbs(fbs).map((r, i) =>
      i === 0 ? { ...r, conference: 'WAC' } : r
    );
    const d = diagnoseConferenceMap({
      fbsIds: fbs,
      teamsFbsRaw: rows,
      conferenceByTeamId: Object.fromEntries(fbs.map((id) => [id, 'SEC'])),
      resolveTeamId: resolve,
    });
    expect(d.unrecognizedProviderConferences).toContain('WAC');
    expect(d.providerConferenceMapSafeForV1).toBe(false);
  });

  it('NDSU Mountain West and Sac State MAC fixtures', () => {
    const d = diagnoseConferenceMap({
      fbsIds: fbs,
      teamsFbsRaw: healthyTeamsFbs(fbs),
      conferenceByTeamId: Object.fromEntries(
        fbs.map((id) => [id, 'Independent'])
      ),
      resolveTeamId: resolve,
    });
    expect(d.ndsu.presentInProviderFbs).toBe(true);
    expect(d.ndsu.providerConference).toBe('Mountain West');
    expect(d.sacramentoState.presentInProviderFbs).toBe(true);
    expect(d.sacramentoState.providerConference).toBe('MAC');
  });
});

describe('recruiting diagnostic', () => {
  const fbs = buildFbsFixture();
  const resolve = buildIdentityResolver(nameMapForFbs(fbs));
  const providerSchools = healthyTeamsFbs(fbs).map((r) => r.school);
  const providerIds = fbs.filter((id) => resolve(`Name ${id}`) || true);

  it('FBS provider row resolves correctly', () => {
    const d = diagnoseRecruitingMapping({
      fbsIds: fbs,
      recruitingRaw: [
        { team: `Name ${fbs[0]}`, year: 2026, rank: 1, points: 100 },
      ],
      providerFbsSchoolNames: providerSchools,
      providerFbsTeamIds: fbs,
      resolveTeamId: resolve,
    });
    expect(d.bucketCounts.maps_to_db_fbs).toBe(1);
    expect(d.providerFbsValidatedMatchedCount).toBe(1);
  });

  it('FBS provider row resolver failure', () => {
    const d = diagnoseRecruitingMapping({
      fbsIds: fbs,
      recruitingRaw: [
        { team: 'North Dakota State', year: 2026, rank: 50, points: 10 },
      ],
      providerFbsSchoolNames: ['North Dakota State', ...providerSchools],
      providerFbsTeamIds: fbs,
      resolveTeamId: (name) =>
        name === 'North Dakota State' ? null : resolve(name),
    });
    expect(d.bucketCounts.provider_fbs_resolver_failed).toBe(1);
    expect(d.ndsu.unresolvedLikelyMissingAlias).toBe(true);
  });

  it('non-FBS provider row stays unresolved', () => {
    const d = diagnoseRecruitingMapping({
      fbsIds: fbs,
      recruitingRaw: [
        { team: 'Montana State', year: 2026, rank: 1, points: 5 },
      ],
      providerFbsSchoolNames: providerSchools,
      providerFbsTeamIds: fbs,
      resolveTeamId: resolve,
    });
    expect(d.bucketCounts.non_fbs_unresolved).toBe(1);
  });

  it('non-FBS provider row falsely maps to FBS => flagged', () => {
    const map = nameMapForFbs(fbs);
    map['Montana State'] = fbs[0];
    const d = diagnoseRecruitingMapping({
      fbsIds: fbs,
      recruitingRaw: [
        { team: 'Montana State', year: 2026, rank: 1, points: 5 },
      ],
      providerFbsSchoolNames: providerSchools,
      providerFbsTeamIds: fbs,
      resolveTeamId: buildIdentityResolver(map),
    });
    expect(d.bucketCounts.non_fbs_false_positive_fbs).toBe(1);
    expect(d.falsePositiveMappings[0].resolvedTeamId).toBe(fbs[0]);
    expect(d.resolverMatchedFbsCount).toBe(1);
    expect(d.providerFbsValidatedMatchedCount).toBe(0);
  });

  it('duplicate canonical mapping and three excess mapped rows', () => {
    const idA = fbs[0];
    const idB = fbs[1];
    const idC = fbs[2];
    const recruitingRaw = [
      { team: `Name ${idA}`, year: 2026, rank: 1, points: 10 },
      { team: `Alt ${idA}`, year: 2026, rank: 2, points: 9 },
      { team: `Name ${idB}`, year: 2026, rank: 3, points: 8 },
      { team: `Alt ${idB}`, year: 2026, rank: 4, points: 7 },
      { team: `Name ${idC}`, year: 2026, rank: 5, points: 6 },
      { team: `Alt ${idC}`, year: 2026, rank: 6, points: 5 },
    ];
    const map = nameMapForFbs(fbs);
    map[`Alt ${idA}`] = idA;
    map[`Alt ${idB}`] = idB;
    map[`Alt ${idC}`] = idC;
    const schools = [
      ...providerSchools,
      `Alt ${idA}`,
      `Alt ${idB}`,
      `Alt ${idC}`,
    ];
    const d = diagnoseRecruitingMapping({
      fbsIds: fbs,
      recruitingRaw,
      providerFbsSchoolNames: schools,
      providerFbsTeamIds: fbs,
      resolveTeamId: buildIdentityResolver(map),
    });
    expect(d.excessMappedRows).toHaveLength(3);
    expect(d.mappedRowCount).toBe(6);
    expect(d.normalizedUniqueTeamIds).toBe(3);
    expect(d.providerFbsValidatedMatchedCount).toBe(3);
  });

  it('221-style mixed FBS/FCS fixture surfaces naive vs validated coverage', () => {
    const fbsRows = fbs.slice(0, 10).map((id, i) => ({
      team: `Name ${id}`,
      year: 2026,
      rank: i + 1,
      points: 100 - i,
    }));
    const fcsUnresolved = Array.from({ length: 5 }, (_, i) => ({
      team: `FCS Unresolved ${i}`,
      year: 2026,
      rank: 200 + i,
      points: 1,
    }));
    const falsePos = {
      team: 'FCS False Pos',
      year: 2026,
      rank: 300,
      points: 2,
    };
    const map = nameMapForFbs(fbs);
    // Map false-positive onto an FBS ID outside the 10 validated recruiting rows
    map['FCS False Pos'] = fbs[50];
    const d = diagnoseRecruitingMapping({
      fbsIds: fbs,
      recruitingRaw: [...fbsRows, ...fcsUnresolved, falsePos],
      providerFbsSchoolNames: providerSchools,
      providerFbsTeamIds: fbs,
      resolveTeamId: buildIdentityResolver(map),
    });
    expect(d.bucketCounts.non_fbs_unresolved).toBe(5);
    expect(d.bucketCounts.non_fbs_false_positive_fbs).toBe(1);
    expect(d.resolverMatchedFbsCount).toBeGreaterThan(
      d.providerFbsValidatedMatchedCount
    );
  });

  it('NDSU and Sac State unresolved alias cases', () => {
    const resolveNoNew = (name: string) => {
      if (name === 'North Dakota State' || name === 'Sacramento State') {
        return null;
      }
      return resolve(name);
    };
    const d = diagnoseRecruitingMapping({
      fbsIds: fbs,
      recruitingRaw: [
        { team: 'North Dakota State', year: 2026, rank: 90, points: 3 },
        { team: 'Sacramento State', year: 2026, rank: 91, points: 2 },
      ],
      providerFbsSchoolNames: [
        'North Dakota State',
        'Sacramento State',
        ...providerSchools,
      ],
      providerFbsTeamIds: fbs,
      resolveTeamId: resolveNoNew,
    });
    expect(d.ndsu.presentInProviderFbs).toBe(true);
    expect(d.ndsu.presentInRecruiting).toBe(true);
    expect(d.ndsu.resolvedTeamId).toBeNull();
    expect(d.ndsu.unresolvedLikelyMissingAlias).toBe(true);
    expect(d.sacramentoState.unresolvedLikelyMissingAlias).toBe(true);
  });
});

describe('full diagnostic + safety', () => {
  const fbs = buildFbsFixture();
  const resolve = buildIdentityResolver(nameMapForFbs(fbs));

  it('DB FBS denominator authoritative; ratingsComputeAuthorized false', () => {
    const conferenceByTeamId = Object.fromEntries(
      fbs.map((id) => [id, 'Independent'])
    );
    const result = buildConferenceRecruitingDiagnostic({
      fbsIds: fbs,
      teamsFbsRaw: healthyTeamsFbs(fbs),
      recruitingRaw: fbs.slice(0, 5).map((id, i) => ({
        team: `Name ${id}`,
        year: 2026,
        rank: i + 1,
        points: 10,
      })),
      conferenceByTeamId,
      resolveTeamId: resolve,
      providerRequestCount: 2,
    });
    expect(result.dbFbsCount).toBe(138);
    expect(result.ratingsComputeAuthorized).toBe(false);
    expect(result.coreV1.talentAvailableFor2026).toBe(false);
    expect(result.coreV1.recruitingPersistenceReady).toBe(false);
    expect(result.providerRequestCount).toBe(2);
    expect(result.mutationsInvoked).toBe(false);
    expect(result.coreV1.providerConferenceCandidateReady).toBe(
      result.conference.providerConferenceMapSafeForV1
    );
  });

  it('wrong FBS count structural fail', () => {
    const short = fbs.slice(0, 100);
    const result = buildConferenceRecruitingDiagnostic({
      fbsIds: short,
      teamsFbsRaw: healthyTeamsFbs(short),
      recruitingRaw: [],
      conferenceByTeamId: Object.fromEntries(short.map((id) => [id, 'SEC'])),
      resolveTeamId: buildIdentityResolver(nameMapForFbs(short)),
    });
    expect(result.structuralOk).toBe(false);
    expect(result.ok).toBe(false);
  });

  it('sanitized errors', () => {
    expect(
      sanitizeConferenceRecruitingDiagnosticError({
        message: 'postgresql://u:p@h/db CFBD_API_KEY=x',
      })
    ).toBe(
      'Conference/recruiting diagnostic failed; connection and secret details suppressed'
    );
  });

  it('no provider calls in pure module', () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        '../src/preseason/conference-recruiting-diagnostic.ts'
      ),
      'utf8'
    );
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/from ['"]@prisma\/client['"]/);
  });

  it('CLI has no mutation APIs and uses exactly two endpoints', () => {
    const cli = fs.readFileSync(
      path.join(__dirname, '../diagnose-2026-conference-recruiting.ts'),
      'utf8'
    );
    expect(cli).not.toMatch(
      /\.(create|update|upsert|delete|createMany|updateMany|deleteMany)\s*\(/
    );
    expect(cli).toMatch(/\/teams\/fbs/);
    expect(cli).toMatch(/\/recruiting\/teams/);
    expect(cli).not.toMatch(/cfbdGetJson\(\s*['"]\/talent['"]/);
    expect(cli).not.toMatch(/fetchTalent|\/talent\?year/);
    expect(cli).toMatch(/\/talent not called|Does not call \/talent|No \/talent/);
    expect(cli).not.toMatch(/ODDS_API_KEY|OddsApi/);
    expect(cli).not.toMatch(/compute_ratings|seed-ratings/);
  });

  it('workflow is dispatch-only with no Odds', () => {
    const text = fs.readFileSync(
      path.join(
        __dirname,
        '../../../.github/workflows/diagnose-2026-conference-recruiting.yml'
      ),
      'utf8'
    );
    expect(text).toMatch(/workflow_dispatch:/);
    expect(text).not.toMatch(/^\s*schedule:/m);
    expect(text).toMatch(/checkout@v6/);
    expect(text).toMatch(/node-version:\s*'20'/);
    expect(text).toMatch(/ODDS_API_KEY: not provided/);
    expect(text).not.toMatch(/secrets\.ODDS_API_KEY/);
    expect(text).toMatch(/diagnose-2026-conference-recruiting\.ts/);
  });
});
