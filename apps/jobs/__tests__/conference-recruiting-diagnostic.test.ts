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
  formatConferenceRecruitingDiagnosticReport,
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

/** Current Team.conference values that exactly match provider rows. */
function matchingConferenceByTeamId(fbs: string[]): Record<string, string> {
  const bySchool = Object.fromEntries(
    healthyTeamsFbs(fbs).map((r) => {
      const id =
        r.school === 'North Dakota State'
          ? 'north-dakota-state'
          : r.school === 'Sacramento State'
            ? 'sacramento-state'
            : r.school.replace(/^Name /, '');
      return [id, r.conference];
    })
  );
  return Object.fromEntries(fbs.map((id) => [id, bySchool[id]]));
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

  it('exact provider FBS set 138/138 with recognized conferences', () => {
    const d = diagnoseConferenceMap({
      fbsIds: fbs,
      teamsFbsRaw: healthyTeamsFbs(fbs),
      conferenceByTeamId: matchingConferenceByTeamId(fbs),
      resolveTeamId: resolve,
    });
    expect(d.matchedDbFbsCount).toBe(EXPECTED_FBS_COUNT);
    expect(d.providerFbsSetExact).toBe(true);
    expect(d.providerConferenceCoverageComplete).toBe(true);
    expect(d.providerConferenceMapSafeForV1).toBe(true);
    expect(d.currentTeamConferenceSafeFor2026).toBe(true);
    expect(d.seasonAwareConferenceSolutionRequired).toBe(false);
    expect(d.ndsu.providerConference).toBe('Mountain West');
    expect(d.sacramentoState.providerConference).toBe('MAC');
    expect(d.conferenceDifferences).toHaveLength(0);
  });

  it('missing provider FBS => providerFbsSetExact false', () => {
    const rows = healthyTeamsFbs(fbs).filter(
      (r) => r.school !== 'North Dakota State'
    );
    const d = diagnoseConferenceMap({
      fbsIds: fbs,
      teamsFbsRaw: rows,
      conferenceByTeamId: matchingConferenceByTeamId(fbs),
      resolveTeamId: resolve,
    });
    expect(d.dbFbsMissingFromProvider).toContain('north-dakota-state');
    expect(d.providerFbsSetExact).toBe(false);
    expect(d.providerConferenceCoverageComplete).toBe(false);
    expect(d.providerConferenceMapSafeForV1).toBe(false);
    expect(d.currentTeamConferenceSafeFor2026).toBe(false);
  });

  it('extra provider FBS => providerFbsSetExact false', () => {
    const map = nameMapForFbs(fbs);
    map['Ghost FBS'] = 'ghost-fbs';
    const d = diagnoseConferenceMap({
      fbsIds: fbs,
      teamsFbsRaw: [
        ...healthyTeamsFbs(fbs),
        { school: 'Ghost FBS', conference: 'SEC', classification: 'fbs' },
      ],
      conferenceByTeamId: matchingConferenceByTeamId(fbs),
      resolveTeamId: buildIdentityResolver(map),
    });
    expect(d.providerFbsOutsideDb).toContain('ghost-fbs');
    expect(d.providerFbsSetExact).toBe(false);
    expect(d.providerConferenceMapSafeForV1).toBe(false);
  });

  it('unresolved provider FBS school => providerFbsSetExact false', () => {
    const rows = [
      ...healthyTeamsFbs(fbs).slice(0, -1),
      { school: 'Unknown School', conference: 'SEC', classification: 'fbs' },
    ];
    const d = diagnoseConferenceMap({
      fbsIds: fbs,
      teamsFbsRaw: rows,
      conferenceByTeamId: matchingConferenceByTeamId(fbs),
      resolveTeamId: resolve,
    });
    expect(d.unresolvedProviderSchools).toContain('Unknown School');
    expect(d.providerFbsSetExact).toBe(false);
    expect(d.providerConferenceMapSafeForV1).toBe(false);
  });

  it('duplicate canonical provider FBS => provider map not safe', () => {
    const rows = [
      ...healthyTeamsFbs(fbs),
      { school: `Name ${fbs[0]}`, conference: 'ACC', classification: 'fbs' },
    ];
    // Second row uses same school name → duplicate mapping to same ID
    const d = diagnoseConferenceMap({
      fbsIds: fbs,
      teamsFbsRaw: rows,
      conferenceByTeamId: matchingConferenceByTeamId(fbs),
      resolveTeamId: resolve,
    });
    expect(d.duplicateTeamIds).toContain(fbs[0]);
    expect(d.mappingCollisions.some((m) => m.teamId === fbs[0])).toBe(true);
    expect(d.providerFbsSetExact).toBe(false);
    expect(d.providerConferenceMapSafeForV1).toBe(false);
  });

  it('provider conference incomplete => safe false', () => {
    const rows = healthyTeamsFbs(fbs).map((r, i) =>
      i === 0 ? { ...r, conference: undefined } : r
    );
    const d = diagnoseConferenceMap({
      fbsIds: fbs,
      teamsFbsRaw: rows,
      conferenceByTeamId: matchingConferenceByTeamId(fbs),
      resolveTeamId: resolve,
    });
    expect(d.providerConferenceCoverage).toBe(EXPECTED_FBS_COUNT - 1);
    expect(d.providerFbsSetExact).toBe(false);
    expect(d.providerConferenceMapSafeForV1).toBe(false);
  });

  it('unrecognized provider conference => provider candidate unsafe', () => {
    const rows = healthyTeamsFbs(fbs).map((r, i) =>
      i === 0 ? { ...r, conference: 'WAC' } : r
    );
    const d = diagnoseConferenceMap({
      fbsIds: fbs,
      teamsFbsRaw: rows,
      conferenceByTeamId: matchingConferenceByTeamId(fbs),
      resolveTeamId: resolve,
    });
    expect(d.unrecognizedProviderConferences).toContain('WAC');
    expect(d.providerFbsSetExact).toBe(true);
    expect(d.providerConferenceMapSafeForV1).toBe(false);
    expect(d.currentTeamConferenceSafeFor2026).toBe(false);
  });

  it('one stale current conference => current map unsafe', () => {
    const conferenceByTeamId = matchingConferenceByTeamId(fbs);
    conferenceByTeamId[fbs[0]] = 'ACC';
    const d = diagnoseConferenceMap({
      fbsIds: fbs,
      teamsFbsRaw: healthyTeamsFbs(fbs),
      conferenceByTeamId,
      resolveTeamId: resolve,
    });
    expect(d.providerConferenceMapSafeForV1).toBe(true);
    expect(d.currentTeamConferenceSafeFor2026).toBe(false);
    expect(d.conferenceDifferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          teamId: fbs[0],
          currentConference: 'ACC',
          providerConference: 'SEC',
        }),
      ])
    );
    expect(d.seasonAwareConferenceSolutionRequired).toBe(true);
  });

  it('19 stale current conferences => still unsafe (no count threshold)', () => {
    const conferenceByTeamId = matchingConferenceByTeamId(fbs);
    for (let i = 0; i < 19; i++) {
      conferenceByTeamId[fbs[i]] = 'Independent';
    }
    const d = diagnoseConferenceMap({
      fbsIds: fbs,
      teamsFbsRaw: healthyTeamsFbs(fbs),
      conferenceByTeamId,
      resolveTeamId: resolve,
    });
    expect(d.currentIndependentCount).toBe(19);
    expect(d.differFromProviderCount).toBe(19);
    expect(d.currentTeamConferenceSafeFor2026).toBe(false);
    expect(d.seasonAwareConferenceSolutionRequired).toBe(true);
  });

  it('legitimate Independent agreement is not automatically unsafe', () => {
    const rows = healthyTeamsFbs(fbs).map((r, i) =>
      i === 0 ? { ...r, conference: 'Independent' } : r
    );
    const conferenceByTeamId = matchingConferenceByTeamId(fbs);
    conferenceByTeamId[fbs[0]] = 'Independent';
    // Fix NDSU/Sac from matching helper against modified provider for index 0 only
    const d = diagnoseConferenceMap({
      fbsIds: fbs,
      teamsFbsRaw: rows,
      conferenceByTeamId,
      resolveTeamId: resolve,
    });
    expect(d.providerConferenceMapSafeForV1).toBe(true);
    expect(d.currentTeamConferenceSafeFor2026).toBe(true);
    expect(d.matchedRows.find((r) => r.teamId === fbs[0])?.conferencesAgree).toBe(
      true
    );
  });

  it('all Independent current vs provider conferences => unsafe', () => {
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
    expect(d.providerConferenceMapSafeForV1).toBe(true);
    expect(d.currentTeamConferenceSafeFor2026).toBe(false);
    expect(d.seasonAwareConferenceSolutionRequired).toBe(true);
  });

  it('NDSU Mountain West and Sac State MAC fixtures', () => {
    const d = diagnoseConferenceMap({
      fbsIds: fbs,
      teamsFbsRaw: healthyTeamsFbs(fbs),
      conferenceByTeamId: matchingConferenceByTeamId(fbs),
      resolveTeamId: resolve,
    });
    expect(d.ndsu.presentInProviderFbs).toBe(true);
    expect(d.ndsu.providerSchool).toBe('North Dakota State');
    expect(d.ndsu.providerConference).toBe('Mountain West');
    expect(d.sacramentoState.presentInProviderFbs).toBe(true);
    expect(d.sacramentoState.providerSchool).toBe('Sacramento State');
    expect(d.sacramentoState.providerConference).toBe('MAC');
  });

  it('FBS Independents normalizes for V1 recognition while preserving raw', () => {
    const rows = healthyTeamsFbs(fbs).map((r, i) =>
      i === 0 ? { ...r, conference: 'FBS Independents' } : r
    );
    const conferenceByTeamId = matchingConferenceByTeamId(fbs);
    conferenceByTeamId[fbs[0]] = 'Independent';
    const d = diagnoseConferenceMap({
      fbsIds: fbs,
      teamsFbsRaw: rows,
      conferenceByTeamId,
      resolveTeamId: resolve,
    });
    const row = d.matchedRows.find((r) => r.teamId === fbs[0])!;
    expect(row.providerConference).toBe('FBS Independents');
    expect(row.providerConferenceNormalized).toBe('Independent');
    expect(row.providerRecognizedByV1).toBe(true);
    expect(row.conferencesAgree).toBe(true);
    expect(d.unrecognizedProviderConferences).not.toContain('FBS Independents');
    expect(d.providerConferenceMapSafeForV1).toBe(true);
    expect(d.currentTeamConferenceSafeFor2026).toBe(true);
  });

  it('138 exact provider map can be V1-safe while static Team.conference remains unsafe', () => {
    const rows = healthyTeamsFbs(fbs).map((r) => {
      if (r.school === 'Sacramento State') {
        return { ...r, conference: 'Mid-American' };
      }
      if (r.school === `Name ${fbs[0]}`) {
        return { ...r, conference: 'FBS Independents' };
      }
      return r;
    });
    const d = diagnoseConferenceMap({
      fbsIds: fbs,
      teamsFbsRaw: rows,
      conferenceByTeamId: Object.fromEntries(
        fbs.map((id) => [id, 'Independent'])
      ),
      resolveTeamId: resolve,
    });
    expect(d.matchedDbFbsCount).toBe(EXPECTED_FBS_COUNT);
    expect(d.unresolvedProviderSchools).toEqual([]);
    expect(d.providerFbsOutsideDb).toEqual([]);
    expect(d.duplicateTeamIds).toEqual([]);
    expect(d.mappingCollisions).toEqual([]);
    expect(d.providerFbsSetExact).toBe(true);
    expect(d.providerConferenceMapSafeForV1).toBe(true);
    expect(d.currentTeamConferenceSafeFor2026).toBe(false);
    expect(d.seasonAwareConferenceSolutionRequired).toBe(true);
    expect(d.ndsu.providerConference).toBe('Mountain West');
    expect(d.sacramentoState.providerConference).toBe('Mid-American');
  });

  it('report prints exact evidence lists and conference counts', () => {
    const conferenceByTeamId = matchingConferenceByTeamId(fbs);
    conferenceByTeamId[fbs[0]] = 'ACC';
    const result = buildConferenceRecruitingDiagnostic({
      fbsIds: fbs,
      teamsFbsRaw: healthyTeamsFbs(fbs),
      recruitingRaw: [],
      conferenceByTeamId,
      resolveTeamId: resolve,
    });
    const report = formatConferenceRecruitingDiagnosticReport(result);
    expect(report).toMatch(/providerFbsSetExact: true/);
    expect(report).toMatch(/providerConferenceCounts:/);
    expect(report).toMatch(/SEC:/);
    expect(report).toMatch(/conferenceDifferences \(1\):/);
    expect(report).toContain(fbs[0]);
    expect(report).toMatch(/NDSU: present=true school=North Dakota State conf=Mountain West/);
    expect(report).toMatch(/SacState: present=true school=Sacramento State conf=MAC/);
  });
});

describe('recruiting diagnostic', () => {
  const fbs = buildFbsFixture();
  const resolve = buildIdentityResolver(nameMapForFbs(fbs));
  const providerSchools = healthyTeamsFbs(fbs).map((r) => r.school);

  it('FBS provider row resolves correctly', () => {
    const d = diagnoseRecruitingMapping({
      fbsIds: fbs,
      recruitingRaw: [
        { team: `Name ${fbs[0]}`, year: 2026, rank: 1, points: 100 },
      ],
      providerFbsSchoolNames: providerSchools,
      resolveTeamId: resolve,
    });
    expect(d.bucketCounts.maps_to_db_fbs).toBe(1);
    expect(d.providerFbsValidatedMatchedCount).toBe(1);
    expect(d.recruitingResolverSafe).toBe(true);
  });

  it('FBS provider row resolver failure => resolver safe false', () => {
    const d = diagnoseRecruitingMapping({
      fbsIds: fbs,
      recruitingRaw: [
        { team: 'North Dakota State', year: 2026, rank: 50, points: 10 },
      ],
      providerFbsSchoolNames: ['North Dakota State', ...providerSchools],
      resolveTeamId: (name) =>
        name === 'North Dakota State' ? null : resolve(name),
    });
    expect(d.bucketCounts.provider_fbs_resolver_failed).toBe(1);
    expect(d.unresolvedProviderFbsSchools).toContain('North Dakota State');
    expect(d.recruitingResolverSafe).toBe(false);
    expect(d.ndsu.unresolvedLikelyMissingAlias).toBe(true);
  });

  it('non-FBS provider row stays unresolved', () => {
    const d = diagnoseRecruitingMapping({
      fbsIds: fbs,
      recruitingRaw: [
        { team: 'Montana State', year: 2026, rank: 1, points: 5 },
      ],
      providerFbsSchoolNames: providerSchools,
      resolveTeamId: resolve,
    });
    expect(d.bucketCounts.non_fbs_unresolved).toBe(1);
    expect(d.recruitingResolverSafe).toBe(true);
  });

  it('false-positive mapping => resolver safe false; review not structural', () => {
    const map = nameMapForFbs(fbs);
    map['Montana State'] = fbs[0];
    const d = diagnoseRecruitingMapping({
      fbsIds: fbs,
      recruitingRaw: [
        { team: 'Montana State', year: 2026, rank: 1, points: 5 },
      ],
      providerFbsSchoolNames: providerSchools,
      resolveTeamId: buildIdentityResolver(map),
    });
    expect(d.bucketCounts.non_fbs_false_positive_fbs).toBe(1);
    expect(d.falsePositiveMappings[0].resolvedTeamId).toBe(fbs[0]);
    expect(d.recruitingResolverSafe).toBe(false);
    expect(
      d.findings.find((f) => f.code === 'recruiting_false_positive_fbs_mapping')
        ?.severity
    ).toBe('review');
  });

  it('duplicate/ambiguous recruiting canonical collision surfaced', () => {
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
      resolveTeamId: buildIdentityResolver(map),
    });
    expect(d.excessMappedRows).toHaveLength(3);
    expect(d.collisions).toHaveLength(3);
    expect(d.recruitingResolverSafe).toBe(false);
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
    map['FCS False Pos'] = fbs[50];
    const d = diagnoseRecruitingMapping({
      fbsIds: fbs,
      recruitingRaw: [...fbsRows, ...fcsUnresolved, falsePos],
      providerFbsSchoolNames: providerSchools,
      resolveTeamId: buildIdentityResolver(map),
    });
    expect(d.bucketCounts.non_fbs_unresolved).toBe(5);
    expect(d.bucketCounts.non_fbs_false_positive_fbs).toBe(1);
    expect(d.recruitingResolverSafe).toBe(false);
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
      resolveTeamId: resolveNoNew,
    });
    expect(d.ndsu.presentInProviderFbs).toBe(true);
    expect(d.ndsu.presentInRecruiting).toBe(true);
    expect(d.ndsu.resolvedTeamId).toBeNull();
    expect(d.ndsu.unresolvedLikelyMissingAlias).toBe(true);
    expect(d.sacramentoState.unresolvedLikelyMissingAlias).toBe(true);
    expect(d.recruitingResolverSafe).toBe(false);
  });
});

describe('full diagnostic + safety', () => {
  const fbs = buildFbsFixture();
  const resolve = buildIdentityResolver(nameMapForFbs(fbs));

  it('false-positive mapping completes successfully with recruitingResolverSafe false', () => {
    const map = nameMapForFbs(fbs);
    map['Montana State'] = fbs[0];
    const result = buildConferenceRecruitingDiagnostic({
      fbsIds: fbs,
      teamsFbsRaw: healthyTeamsFbs(fbs),
      recruitingRaw: [
        { team: 'Montana State', year: 2026, rank: 1, points: 5 },
      ],
      conferenceByTeamId: matchingConferenceByTeamId(fbs),
      resolveTeamId: buildIdentityResolver(map),
    });
    expect(result.structuralOk).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.recruitingResolverSafe).toBe(false);
    expect(result.recruiting.falsePositiveMappings).toHaveLength(1);
    expect(
      result.findings.filter((f) => f.severity === 'structural')
    ).toHaveLength(0);
    expect(
      result.findings.some(
        (f) =>
          f.code === 'recruiting_false_positive_fbs_mapping' &&
          f.severity === 'review'
      )
    ).toBe(true);
  });

  it('no contradictory structural finding when structuralOk true', () => {
    const result = buildConferenceRecruitingDiagnostic({
      fbsIds: fbs,
      teamsFbsRaw: healthyTeamsFbs(fbs),
      recruitingRaw: [],
      conferenceByTeamId: Object.fromEntries(
        fbs.map((id) => [id, 'Independent'])
      ),
      resolveTeamId: resolve,
    });
    expect(result.structuralOk).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.findings.every((f) => f.severity !== 'structural')).toBe(
      true
    );
  });

  it('DB FBS denominator authoritative; ratingsComputeAuthorized false', () => {
    const result = buildConferenceRecruitingDiagnostic({
      fbsIds: fbs,
      teamsFbsRaw: healthyTeamsFbs(fbs),
      recruitingRaw: fbs.slice(0, 5).map((id, i) => ({
        team: `Name ${id}`,
        year: 2026,
        rank: i + 1,
        points: 10,
      })),
      conferenceByTeamId: matchingConferenceByTeamId(fbs),
      resolveTeamId: resolve,
      providerRequestCount: 2,
    });
    expect(result.dbFbsCount).toBe(138);
    expect(result.ratingsComputeAuthorized).toBe(false);
    expect(result.coreV1.talentAvailableFor2026).toBe(false);
    expect(result.coreV1.recruitingPersistenceReady).toBe(false);
    expect(result.providerRequestCount).toBe(2);
    expect(result.mutationsInvoked).toBe(false);
    expect(result.oddsInvoked).toBe(false);
    expect(result.recruitingResolverSafe).toBe(true);
    expect(result.coreV1.providerConferenceCandidateReady).toBe(
      result.conference.providerConferenceMapSafeForV1
    );
    expect(result.coreV1.currentConferenceReady).toBe(
      result.conference.currentTeamConferenceSafeFor2026
    );
  });

  it('provider candidate ready with FBS Independents still leaves ratings unauthorized', () => {
    const rows = healthyTeamsFbs(fbs).map((r, i) =>
      i === 1 ? { ...r, conference: 'FBS Independents' } : r
    );
    const conferenceByTeamId = matchingConferenceByTeamId(fbs);
    // Stale static map — does not match provider
    const result = buildConferenceRecruitingDiagnostic({
      fbsIds: fbs,
      teamsFbsRaw: rows,
      recruitingRaw: [],
      conferenceByTeamId: Object.fromEntries(
        fbs.map((id) => [id, 'Independent'])
      ),
      resolveTeamId: resolve,
    });
    expect(result.conference.providerConferenceMapSafeForV1).toBe(true);
    expect(result.conference.currentTeamConferenceSafeFor2026).toBe(false);
    expect(result.ratingsComputeAuthorized).toBe(false);
    expect(result.coreV1.ratingsComputeAuthorized).toBe(false);
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
    expect(src).not.toMatch(/currentIndependentCount\s*<\s*20/);
  });

  it('CLI reuses one TeamResolver and has no mutation APIs', () => {
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
    // Exactly one construction outside any per-name callback
    const resolverNews = cli.match(/new TeamResolver\s*\(/g) ?? [];
    expect(resolverNews).toHaveLength(1);
    expect(cli).toMatch(
      /const teamResolver = options\.resolveTeamId \? null : new TeamResolver\(\)/
    );
    expect(cli).not.toMatch(
      /\(\(name[\s\S]*?new TeamResolver\s*\(/
    );
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
