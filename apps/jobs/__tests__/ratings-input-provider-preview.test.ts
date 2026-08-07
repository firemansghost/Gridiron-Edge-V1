/**
 * Phase 2C-2C — Mocked tests for read-only 2026 ratings-input provider preview.
 * No network. No production DB. No providers.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  EXPECTED_FBS_COUNT,
  TARGET_SEASON,
  buildFbsFixture,
  buildIdentityResolver,
  buildRatingsInputPreview,
  investigateConferenceAlignment,
  investigateUnitGrades,
  mapTalentProviderRow,
  parsePreviewRatingsInputArgs,
  previewCommitsInputs,
  previewTalentInputs,
  sanitizeRatingsInputPreviewError,
} from '../src/preseason/ratings-input-provider-preview';

function nameMapForFbs(fbs: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const id of fbs) {
    map[`Name ${id}`] = id;
  }
  return map;
}

/** Official CFBD /talent shape: school / year / talent */
function healthyTalentRows(fbs: string[]) {
  return fbs.map((id, i) => ({
    school: `Name ${id}`,
    year: 2026,
    talent: 600 + i,
  }));
}

function healthyCommitsRows(fbs: string[]) {
  // Realistic /recruiting/teams shape: year/rank/team/points — no commits/averageRating
  return fbs.map((id, i) => ({
    team: `Name ${id}`,
    year: 2026,
    rank: i + 1,
    points: 100 + i,
  }));
}

describe('parse args', () => {
  it('accepts --season 2026 --preview', () => {
    expect(
      parsePreviewRatingsInputArgs(['--season', '2026', '--preview'])
    ).toEqual({ ok: true, season: 2026, preview: true });
  });

  it('rejects wrong season', () => {
    expect(
      parsePreviewRatingsInputArgs(['--season', '2025', '--preview']).ok
    ).toBe(false);
  });

  it('rejects duplicate season', () => {
    const r = parsePreviewRatingsInputArgs([
      '--season',
      '2026',
      '--season',
      '2026',
      '--preview',
    ]);
    expect(r.ok).toBe(false);
  });

  it('rejects write flags', () => {
    for (const flag of [
      '--write',
      '--execute',
      '--upsert',
      '--persist',
      '--confirm-write',
    ]) {
      const r = parsePreviewRatingsInputArgs([
        '--season',
        '2026',
        '--preview',
        flag,
      ]);
      expect(r.ok).toBe(false);
    }
  });
});

describe('talent preview (official /talent school/year/talent)', () => {
  const fbs = buildFbsFixture();
  const resolve = buildIdentityResolver(nameMapForFbs(fbs));

  it('138 official-shape school/year/talent rows → 138 matched', () => {
    const summary = previewTalentInputs({
      fbsIds: fbs,
      rawRows: healthyTalentRows(fbs),
      resolveTeamId: resolve,
    });
    expect(fbs.length).toBe(EXPECTED_FBS_COUNT);
    expect(summary.matchedFbsCount).toBe(138);
    expect(summary.missingFbsIds).toHaveLength(0);
    expect(summary.talentCompositeFiniteCount).toBe(138);
    expect(summary.seasonMismatch).toBe(false);
    expect(summary.blueChipDataAvailableFromTalentEndpoint).toBe(false);
  });

  it('talent partial official-shape coverage', () => {
    const summary = previewTalentInputs({
      fbsIds: fbs,
      rawRows: healthyTalentRows(fbs.slice(0, 100)),
      resolveTeamId: resolve,
    });
    expect(summary.matchedFbsCount).toBe(100);
    expect(summary.missingFbsIds).toHaveLength(38);
  });

  it('talent duplicate school', () => {
    const rows = [
      ...healthyTalentRows(fbs.slice(0, 1)),
      { school: `Name ${fbs[0]}`, year: 2026, talent: 700 },
    ];
    const summary = previewTalentInputs({
      fbsIds: fbs,
      rawRows: rows,
      resolveTeamId: resolve,
    });
    expect(summary.duplicateTeamIds).toContain(fbs[0]);
  });

  it('talent unresolved school', () => {
    const summary = previewTalentInputs({
      fbsIds: fbs,
      rawRows: [{ school: 'Unknown U', year: 2026, talent: 500 }],
      resolveTeamId: resolve,
    });
    expect(summary.unresolvedProviderNames).toContain('Unknown U');
    expect(summary.matchedFbsCount).toBe(0);
  });

  it('blank/missing school unresolved', () => {
    expect(
      mapTalentProviderRow({ year: 2026, talent: 500 }, resolve, 2026)
    ).toEqual({ unresolved: '(blank)' });
    expect(
      mapTalentProviderRow({ school: '   ', year: 2026, talent: 500 }, resolve, 2026)
    ).toEqual({ unresolved: '(blank)' });
  });

  it('optional legacy team fallback when school absent', () => {
    const mapped = mapTalentProviderRow(
      { team: `Name ${fbs[0]}`, year: 2026, talent: 612 },
      resolve,
      2026
    );
    expect(mapped).toMatchObject({
      teamId: fbs[0],
      talentComposite: 612,
      blueChipDataAvailableFromTalentEndpoint: false,
    });
  });

  it('prefers school over legacy team when both present', () => {
    const mapped = mapTalentProviderRow(
      {
        school: `Name ${fbs[0]}`,
        team: 'Wrong Name',
        year: 2026,
        talent: 700,
      },
      resolve,
      2026
    );
    expect(mapped).toMatchObject({ teamId: fbs[0], providerTeamName: `Name ${fbs[0]}` });
  });

  it('talent nonfinite fields', () => {
    const summary = previewTalentInputs({
      fbsIds: fbs,
      rawRows: [
        { school: `Name ${fbs[0]}`, year: 2026, talent: Number.NaN },
        { school: `Name ${fbs[1]}`, year: 2026, talent: 650 },
      ],
      resolveTeamId: resolve,
    });
    expect(summary.talentCompositeFiniteCount).toBe(1);
  });

  it('year=2025 when 2026 requested → season mismatch', () => {
    const summary = previewTalentInputs({
      fbsIds: fbs,
      rawRows: fbs.map((id) => ({
        school: `Name ${id}`,
        year: 2025,
        talent: 600,
      })),
      resolveTeamId: resolve,
    });
    expect(summary.seasonMismatch).toBe(true);
    expect(summary.providerSeasonValues).toEqual([2025]);
  });

  it('no false blue-chip-data claim from /talent', () => {
    const summary = previewTalentInputs({
      fbsIds: fbs,
      rawRows: healthyTalentRows(fbs),
      resolveTeamId: resolve,
    });
    expect(summary.blueChipDataAvailableFromTalentEndpoint).toBe(false);
    expect(
      summary.wouldBeRows.every(
        (r) => r.blueChipDataAvailableFromTalentEndpoint === false
      )
    ).toBe(true);
  });
});

describe('recruiting preview', () => {
  const fbs = buildFbsFixture();
  const resolve = buildIdentityResolver(nameMapForFbs(fbs));

  it('recruiting full coverage with schema mismatch detection', () => {
    const summary = previewCommitsInputs({
      fbsIds: fbs,
      rawRows: healthyCommitsRows(fbs),
      resolveTeamId: resolve,
    });
    expect(summary.matchedFbsCount).toBe(138);
    expect(summary.classRankFiniteCount).toBe(138);
    expect(summary.avgRatingFiniteCount).toBe(0);
    expect(summary.schemaMismatchLikely).toBe(true);
    expect(summary.wouldRepeat2025ZeroCommitAnomaly).toBe(true);
    expect(summary.pointsPresentCount).toBe(138);
    expect(summary.commitsFieldPresentCount).toBe(0);
  });

  it('recruiting partial coverage', () => {
    const summary = previewCommitsInputs({
      fbsIds: fbs,
      rawRows: healthyCommitsRows(fbs.slice(0, 50)),
      resolveTeamId: resolve,
    });
    expect(summary.matchedFbsCount).toBe(50);
    expect(summary.missingFbsIds).toHaveLength(88);
  });

  it('recruiting duplicate/unresolved team', () => {
    const summary = previewCommitsInputs({
      fbsIds: fbs,
      rawRows: [
        { team: `Name ${fbs[0]}`, year: 2026, rank: 1, points: 10 },
        { team: `Name ${fbs[0]}`, year: 2026, rank: 2, points: 11 },
        { team: 'Ghost College', year: 2026, rank: 3, points: 1 },
      ],
      resolveTeamId: resolve,
    });
    expect(summary.duplicateTeamIds).toContain(fbs[0]);
    expect(summary.unresolvedProviderNames).toContain('Ghost College');
  });

  it('zero-commit anomaly detection when commits field present as 0', () => {
    const summary = previewCommitsInputs({
      fbsIds: fbs.slice(0, 2),
      rawRows: [
        {
          team: `Name ${fbs[0]}`,
          year: 2026,
          commits: 0,
          averageRating: undefined,
          rank: 1,
        },
        {
          team: `Name ${fbs[1]}`,
          year: 2026,
          commits: 0,
          averageRating: 0.8,
          rank: 2,
        },
      ],
      resolveTeamId: resolve,
    });
    expect(summary.zeroCommitRows).toBe(2);
    expect(summary.wouldPersistZeroCommitCount).toBeGreaterThan(0);
    expect(summary.avgRatingFiniteCount).toBe(1);
  });

  it('missing avgRating/classRank detection', () => {
    const summary = previewCommitsInputs({
      fbsIds: fbs.slice(0, 1),
      rawRows: [{ team: `Name ${fbs[0]}`, year: 2026, points: 50 }],
      resolveTeamId: resolve,
    });
    expect(summary.classRankFiniteCount).toBe(0);
    expect(summary.avgRatingFiniteCount).toBe(0);
  });
});

describe('season mismatch, membership authority, readiness classification', () => {
  const fbs = buildFbsFixture();
  const resolve = buildIdentityResolver(nameMapForFbs(fbs));

  it('provider returns 2025 when 2026 requested', () => {
    const result = buildRatingsInputPreview({
      fbsIds: fbs,
      talentRaw: fbs.map((id) => ({
        school: `Name ${id}`,
        year: 2025,
        talent: 600,
      })),
      commitsRaw: healthyCommitsRows(fbs).map((r) => ({ ...r, year: 2025 })),
      resolveTeamId: resolve,
      conferenceByTeamId: Object.fromEntries(fbs.map((id) => [id, 'SEC'])),
      providerRequestCount: 2,
      providerEndpoints: ['/talent?year=2026', '/recruiting/teams?year=2026'],
    });
    expect(result.talent.seasonMismatch).toBe(true);
    expect(result.commits.seasonMismatch).toBe(true);
    expect(result.structuralOk).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.ratingsComputeAuthorized).toBe(false);
  });

  it('FBS membership count not 138 => structural fail', () => {
    const short = fbs.slice(0, 100);
    const resolveShort = buildIdentityResolver(nameMapForFbs(short));
    const result = buildRatingsInputPreview({
      fbsIds: short,
      talentRaw: healthyTalentRows(short),
      commitsRaw: healthyCommitsRows(short),
      resolveTeamId: resolveShort,
      conferenceByTeamId: Object.fromEntries(short.map((id) => [id, 'SEC'])),
      providerRequestCount: 2,
      providerEndpoints: ['/talent?year=2026', '/recruiting/teams?year=2026'],
    });
    expect(result.structuralOk).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.dbFbsCount).toBe(100);
  });

  it('provider response cannot redefine FBS membership', () => {
    const map = nameMapForFbs(fbs);
    map['Extra FCS'] = 'extra-fcs-team';
    const resolveExtra = buildIdentityResolver(map);
    const result = buildRatingsInputPreview({
      fbsIds: fbs,
      talentRaw: [
        ...healthyTalentRows(fbs),
        { school: 'Extra FCS', year: 2026, talent: 400 },
      ],
      commitsRaw: healthyCommitsRows(fbs),
      resolveTeamId: resolveExtra,
      conferenceByTeamId: Object.fromEntries(fbs.map((id) => [id, 'ACC'])),
      providerRequestCount: 2,
      providerEndpoints: ['/talent?year=2026', '/recruiting/teams?year=2026'],
    });
    expect(result.dbFbsCount).toBe(138);
    expect(result.talent.unexpectedNonFbsIds).toContain('extra-fcs-team');
    expect(result.talent.matchedFbsCount).toBe(138);
  });

  it('ok=true may coexist with review findings but not contradictory structural findings', () => {
    const conferenceByTeamId: Record<string, string | null> = {};
    for (let i = 0; i < fbs.length; i++) {
      conferenceByTeamId[fbs[i]] = i < 88 ? 'Independent' : 'SEC';
    }
    const result = buildRatingsInputPreview({
      fbsIds: fbs,
      talentRaw: healthyTalentRows(fbs),
      commitsRaw: healthyCommitsRows(fbs),
      resolveTeamId: resolve,
      conferenceByTeamId,
      providerRequestCount: 2,
      providerEndpoints: ['/talent?year=2026', '/recruiting/teams?year=2026'],
    });
    expect(result.ok).toBe(true);
    expect(result.structuralOk).toBe(true);
    expect(result.previewCompleted).toBe(true);
    expect(result.findings.some((f) => f.severity === 'review')).toBe(true);
    expect(result.findings.every((f) => f.severity !== 'structural')).toBe(
      true
    );
  });

  it('ratingsComputeAuthorized=false always; unsafe conference blocks ratings readiness', () => {
    const conferenceByTeamId: Record<string, string | null> = {};
    for (let i = 0; i < fbs.length; i++) {
      conferenceByTeamId[fbs[i]] = i < 88 ? 'Independent' : 'SEC';
    }
    const result = buildRatingsInputPreview({
      fbsIds: fbs,
      talentRaw: healthyTalentRows(fbs),
      commitsRaw: healthyCommitsRows(fbs),
      resolveTeamId: resolve,
      conferenceByTeamId,
      providerRequestCount: 2,
      providerEndpoints: ['/talent?year=2026', '/recruiting/teams?year=2026'],
    });
    expect(result.ratingsComputeAuthorized).toBe(false);
    expect(result.ratingsComputeBlocked).toBe(true);
    expect(result.conferenceReadyForRatings).toBe(false);
    expect(result.commitPersistenceSafe).toBe(false);
    expect(result.providerRequestCount).toBe(2);
  });

  it('recruiting schema anomaly → commitPersistenceSafe=false', () => {
    const result = buildRatingsInputPreview({
      fbsIds: fbs,
      talentRaw: healthyTalentRows(fbs),
      commitsRaw: healthyCommitsRows(fbs),
      resolveTeamId: resolve,
      conferenceByTeamId: Object.fromEntries(fbs.map((id) => [id, 'SEC'])),
      providerRequestCount: 2,
      providerEndpoints: ['/talent?year=2026', '/recruiting/teams?year=2026'],
    });
    expect(result.commits.schemaMismatchLikely).toBe(true);
    expect(result.commitPersistenceSafe).toBe(false);
    expect(result.ratingsComputeAuthorized).toBe(false);
  });
});

describe('unit grades and conference investigations', () => {
  it('classifies unit grades as derived_after_games', () => {
    const inv = investigateUnitGrades();
    expect(inv.classification).toBe('derived_after_games');
    expect(inv.meaningfulPreseason).toBe(false);
    expect(inv.hybridV2Requires).toBe(true);
    expect(inv.coreV1Requires).toBe(false);
  });

  it('conference investigation uses Team.conference and Independent −5', () => {
    const fbs = buildFbsFixture();
    const conferenceByTeamId: Record<string, string | null> = {};
    for (let i = 0; i < fbs.length; i++) {
      conferenceByTeamId[fbs[i]] = i < 88 ? 'Independent' : 'SEC';
    }
    const inv = investigateConferenceAlignment({ fbsIds: fbs, conferenceByTeamId });
    expect(inv.sourceField).toBe('Team.conference');
    expect(inv.seasonSpecific).toBe(false);
    expect(inv.teamMembershipHasConference).toBe(false);
    expect(inv.independentAdjustment).toBe(-5);
    expect(inv.independentOrMissingCount).toBe(88);
    expect(inv.affectsCoreV1).toBe(true);
    expect(inv.affectsHybridV2ViaV1).toBe(true);
    expect(inv.affectsRatingsV2Directly).toBe(false);
    expect(
      inv.findings.every((f) => f.severity !== 'structural')
    ).toBe(true);
  });
});

describe('isolation and safety', () => {
  it('provider errors sanitized', () => {
    expect(
      sanitizeRatingsInputPreviewError({
        message: 'postgresql://user:pass@host/db CFBD_API_KEY=secret',
      })
    ).toBe(
      'Ratings input preview failed; connection and secret details suppressed'
    );
  });

  it('no provider calls in tests (pure module has no fetch)', () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        '../src/preseason/ratings-input-provider-preview.ts'
      ),
      'utf8'
    );
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/from ['"]@prisma\/client['"]/);
    expect(src).not.toMatch(/CFBD_API_KEY|ODDS_API_KEY/);
  });

  it('preview CLI has no mutation APIs', () => {
    const cli = fs.readFileSync(
      path.join(__dirname, '../preview-2026-ratings-inputs.ts'),
      'utf8'
    );
    expect(cli).not.toMatch(
      /\.(create|update|upsert|delete|createMany|updateMany|deleteMany)\s*\(/
    );
    expect(cli).not.toMatch(/ODDS_API_KEY|OddsApi/);
    expect(cli).not.toMatch(/compute_ratings|seed-ratings|compute_unit_grades/);
    expect(cli).toMatch(/\/talent/);
    expect(cli).toMatch(/\/recruiting\/teams/);
  });

  it('workflow is dispatch-only, no Odds, no write jobs', () => {
    const text = fs.readFileSync(
      path.join(
        __dirname,
        '../../../.github/workflows/preview-2026-ratings-inputs.yml'
      ),
      'utf8'
    );
    expect(text).toMatch(/workflow_dispatch:/);
    expect(text).not.toMatch(/^\s*schedule:/m);
    expect(text).toMatch(/contents:\s*read/);
    expect(text).toMatch(/checkout@v6/);
    expect(text).toMatch(/node-version:\s*'20'/);
    expect(text).toMatch(/CFBD_API_KEY/);
    expect(text).toMatch(/ODDS_API_KEY: not provided/);
    expect(text).not.toMatch(/secrets\.ODDS_API_KEY/);
    expect(text).not.toMatch(
      /talent-cfbd|talent-commits|compute_ratings|seed-talent/
    );
    expect(text).toMatch(/preview-2026-ratings-inputs\.ts/);
  });

  it('mutationsInvoked remains false; provider budget exactly 2', () => {
    const fbs = buildFbsFixture();
    const resolve = buildIdentityResolver(nameMapForFbs(fbs));
    const result = buildRatingsInputPreview({
      fbsIds: fbs,
      talentRaw: healthyTalentRows(fbs),
      commitsRaw: healthyCommitsRows(fbs),
      resolveTeamId: resolve,
      conferenceByTeamId: Object.fromEntries(
        fbs.map((id) => [id, 'Mountain West'])
      ),
      providerRequestCount: 2,
      providerEndpoints: ['/talent?year=2026', '/recruiting/teams?year=2026'],
    });
    expect(result.mutationsInvoked).toBe(false);
    expect(result.talentWrites).toBe(false);
    expect(result.commitWrites).toBe(false);
    expect(result.ratingsComputed).toBe(false);
    expect(result.oddsInvoked).toBe(false);
    expect(result.providerRequestCount).toBe(2);
    expect(result.targetSeason).toBe(TARGET_SEASON);
    expect(result.ratingsComputeAuthorized).toBe(false);
  });
});
