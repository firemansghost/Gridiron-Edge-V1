/**
 * Phase 2C-2C / 2C-2H-1 — Mocked tests for read-only 2026 ratings-input provider preview.
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

/** Season-aware TeamMembership.conference map (all recognized). */
function healthyMembershipConferences(
  fbs: string[]
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const id of fbs) {
    if (id === 'north-dakota-state') out[id] = 'Mountain West';
    else if (id === 'sacramento-state') out[id] = 'Mid-American';
    else out[id] = 'SEC';
  }
  return out;
}

function previewOpts(
  fbs: string[],
  overrides: Partial<Parameters<typeof buildRatingsInputPreview>[0]> = {}
) {
  const resolve = buildIdentityResolver(nameMapForFbs(fbs));
  return {
    fbsIds: fbs,
    talentRaw: healthyTalentRows(fbs),
    commitsRaw: healthyCommitsRows(fbs),
    resolveTeamId: resolve,
    membershipConferenceByTeamId: healthyMembershipConferences(fbs),
    providerRequestCount: 2,
    providerEndpoints: ['/talent?year=2026', '/recruiting/teams?year=2026'],
    ...overrides,
  };
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
      requestedSeason: TARGET_SEASON,
    });
    expect(summary.matchedFbsCount).toBe(EXPECTED_FBS_COUNT);
    expect(summary.talentCompositeFiniteCount).toBe(EXPECTED_FBS_COUNT);
    expect(summary.missingFbsIds).toHaveLength(0);
  });

  it('legacy team/season fields still map', () => {
    const row = mapTalentProviderRow(
      { team: `Name ${fbs[0]}`, season: 2026, talent: 700 },
      resolve,
      TARGET_SEASON
    );
    expect('teamId' in row && row.teamId).toBe(fbs[0]);
  });

  it('0 rows → 0 matched', () => {
    const summary = previewTalentInputs({
      fbsIds: fbs,
      rawRows: [],
      resolveTeamId: resolve,
      requestedSeason: TARGET_SEASON,
    });
    expect(summary.matchedFbsCount).toBe(0);
    expect(summary.talentCompositeFiniteCount).toBe(0);
    expect(summary.missingFbsIds).toHaveLength(EXPECTED_FBS_COUNT);
  });
});

describe('commits preview', () => {
  const fbs = buildFbsFixture();
  const resolve = buildIdentityResolver(nameMapForFbs(fbs));

  it('schema mismatch when points present without commits/averageRating', () => {
    const summary = previewCommitsInputs({
      fbsIds: fbs,
      rawRows: healthyCommitsRows(fbs),
      resolveTeamId: resolve,
      requestedSeason: TARGET_SEASON,
    });
    expect(summary.schemaMismatchLikely).toBe(true);
    expect(summary.wouldRepeat2025ZeroCommitAnomaly).toBe(true);
    expect(summary.matchedFbsCount).toBe(EXPECTED_FBS_COUNT);
    expect(summary.classRankFiniteCount).toBe(EXPECTED_FBS_COUNT);
    expect(summary.avgRatingFiniteCount).toBe(0);
    expect(summary.totalCommitsNonNullCount).toBe(0);
  });

  it('zero commit rows detection', () => {
    const summary = previewCommitsInputs({
      fbsIds: fbs.slice(0, 2),
      rawRows: [
        {
          team: `Name ${fbs[0]}`,
          year: 2026,
          commits: 0,
          averageRating: 0.9,
          rank: 1,
        },
        {
          team: `Name ${fbs[1]}`,
          year: 2026,
          commits: 5,
          averageRating: 0.8,
          rank: 2,
        },
      ],
      resolveTeamId: resolve,
    });
    expect(summary.zeroCommitRows).toBe(1);
    expect(summary.wouldPersistZeroCommitCount).toBeGreaterThan(0);
    expect(summary.avgRatingFiniteCount).toBe(2);
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

  it('provider returns 2025 when 2026 requested', () => {
    const result = buildRatingsInputPreview(
      previewOpts(fbs, {
        talentRaw: fbs.map((id) => ({
          school: `Name ${id}`,
          year: 2025,
          talent: 600,
        })),
        commitsRaw: healthyCommitsRows(fbs).map((r) => ({ ...r, year: 2025 })),
      })
    );
    expect(result.talent.seasonMismatch).toBe(true);
    expect(result.commits.seasonMismatch).toBe(true);
    expect(result.structuralOk).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.ratingsComputeAuthorized).toBe(false);
  });

  it('FBS membership count not 138 => structural fail', () => {
    const short = fbs.slice(0, 100);
    const result = buildRatingsInputPreview(previewOpts(short));
    expect(result.structuralOk).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.dbFbsCount).toBe(100);
  });

  it('provider response cannot redefine FBS membership', () => {
    const map = nameMapForFbs(fbs);
    map['Extra FCS'] = 'extra-fcs-team';
    const resolveExtra = buildIdentityResolver(map);
    const result = buildRatingsInputPreview(
      previewOpts(fbs, {
        resolveTeamId: resolveExtra,
        talentRaw: [
          ...healthyTalentRows(fbs),
          { school: 'Extra FCS', year: 2026, talent: 400 },
        ],
      })
    );
    expect(result.dbFbsCount).toBe(138);
    expect(result.talent.unexpectedNonFbsIds).toContain('extra-fcs-team');
    expect(result.talent.matchedFbsCount).toBe(138);
  });

  it('ok=true may coexist with review findings but not contradictory structural findings', () => {
    const result = buildRatingsInputPreview(previewOpts(fbs));
    expect(result.ok).toBe(true);
    expect(result.structuralOk).toBe(true);
    expect(result.previewCompleted).toBe(true);
    expect(result.findings.some((f) => f.severity === 'review')).toBe(true);
    expect(result.findings.every((f) => f.severity !== 'structural')).toBe(
      true
    );
  });

  it('ratingsComputeAuthorized=false always; conference ready when membership complete', () => {
    const result = buildRatingsInputPreview(previewOpts(fbs));
    expect(result.ratingsComputeAuthorized).toBe(false);
    expect(result.ratingsComputeBlocked).toBe(true);
    expect(result.conferenceReadyForRatings).toBe(true);
    expect(result.commitPersistenceSafe).toBe(false);
    expect(result.providerRequestCount).toBe(2);
  });

  it('recruiting schema anomaly → commitPersistenceSafe=false', () => {
    const result = buildRatingsInputPreview(previewOpts(fbs));
    expect(result.commits.schemaMismatchLikely).toBe(true);
    expect(result.commitPersistenceSafe).toBe(false);
    expect(result.ratingsComputeAuthorized).toBe(false);
  });
});

describe('unit grades and season-aware conference investigations', () => {
  it('classifies unit grades as derived_after_games', () => {
    const inv = investigateUnitGrades();
    expect(inv.classification).toBe('derived_after_games');
    expect(inv.meaningfulPreseason).toBe(false);
    expect(inv.hybridV2Requires).toBe(true);
    expect(inv.coreV1Requires).toBe(false);
  });

  it('1. 2026 valid 138 season conferences → conferenceReadyForRatings=true', () => {
    const fbs = buildFbsFixture();
    const result = buildRatingsInputPreview(previewOpts(fbs));
    expect(result.conferenceReadyForRatings).toBe(true);
    expect(result.conference.sourceField).toBe('TeamMembership.conference');
    expect(result.conference.seasonSpecific).toBe(true);
    expect(result.conference.expectedCount).toBe(138);
    expect(result.conference.loadedCount).toBe(138);
    expect(result.conference.missingCount).toBe(0);
    expect(result.conference.unrecognizedCount).toBe(0);
    expect(result.conference.legacyFallback).toBe(false);
  });

  it('2. 2026 one membership conference NULL → conferenceReadyForRatings=false', () => {
    const fbs = buildFbsFixture();
    const membership = healthyMembershipConferences(fbs);
    membership[fbs[0]] = null;
    const result = buildRatingsInputPreview(
      previewOpts(fbs, { membershipConferenceByTeamId: membership })
    );
    expect(result.conferenceReadyForRatings).toBe(false);
    expect(result.conference.missingCount).toBe(1);
  });

  it('3. 2026 one membership conference blank → false', () => {
    const fbs = buildFbsFixture();
    const membership = healthyMembershipConferences(fbs);
    membership[fbs[0]] = '   ';
    const result = buildRatingsInputPreview(
      previewOpts(fbs, { membershipConferenceByTeamId: membership })
    );
    expect(result.conferenceReadyForRatings).toBe(false);
  });

  it('4. 2026 one unrecognized conference → false', () => {
    const fbs = buildFbsFixture();
    const membership = healthyMembershipConferences(fbs);
    membership[fbs[0]] = 'Not A Real Conference';
    const result = buildRatingsInputPreview(
      previewOpts(fbs, { membershipConferenceByTeamId: membership })
    );
    expect(result.conferenceReadyForRatings).toBe(false);
    expect(result.conference.unrecognizedCount).toBe(1);
  });

  it('5-6. stale static Team.conference cannot override membership readiness', () => {
    const fbs = buildFbsFixture();
    const staticMap: Record<string, string | null> = {};
    for (let i = 0; i < fbs.length; i++) {
      staticMap[fbs[i]] = i < 88 ? 'Independent' : 'SEC';
    }
    const result = buildRatingsInputPreview(
      previewOpts(fbs, {
        membershipConferenceByTeamId: healthyMembershipConferences(fbs),
        staticTeamConferenceByTeamId: staticMap,
      })
    );
    expect(result.conferenceReadyForRatings).toBe(true);
    expect(result.conference.staticTeamConferenceIgnoredFor2026).toBe(true);
    expect(
      result.ratingsComputeBlockReasons.some((r) =>
        r.includes('Team.conference unsafe')
      )
    ).toBe(false);
  });

  it('7-9. conference distribution totals 138; NDSU/Sac special cases', () => {
    const fbs = buildFbsFixture().map((id, i) => {
      if (i === 0) return 'north-dakota-state';
      if (i === 1) return 'sacramento-state';
      return id;
    });
    const membership = healthyMembershipConferences(fbs);
    // Mix recognized conferences so distribution is meaningful
    for (let i = 2; i < fbs.length; i++) {
      const confs = [
        'SEC',
        'Big Ten',
        'ACC',
        'Big 12',
        'Pac-12',
        'American Athletic',
        'Mountain West',
        'Sun Belt',
        'Mid-American',
        'Conference USA',
        'Independent',
      ];
      membership[fbs[i]] = confs[i % confs.length];
    }
    const inv = investigateConferenceAlignment({
      season: 2026,
      fbsIds: fbs,
      membershipConferenceByTeamId: membership,
    });
    expect(inv.conferenceReadyForRatings).toBe(true);
    const total = Object.values(inv.conferenceCounts).reduce((a, b) => a + b, 0);
    expect(total).toBe(138);
    expect(inv.conferenceCounts['Mountain West']).toBeGreaterThanOrEqual(1);
    expect(inv.conferenceCounts['Mid-American']).toBeGreaterThanOrEqual(1);
    // Resolved map includes special cases
    const result = buildRatingsInputPreview(
      previewOpts(fbs, {
        membershipConferenceByTeamId: membership,
        resolveTeamId: buildIdentityResolver(nameMapForFbs(fbs)),
        talentRaw: healthyTalentRows(fbs),
        commitsRaw: healthyCommitsRows(fbs),
      })
    );
    expect(result.conferenceReadyForRatings).toBe(true);
  });

  it('10. obsolete TeamMembership has no conference column finding absent', () => {
    const fbs = buildFbsFixture();
    const result = buildRatingsInputPreview(previewOpts(fbs));
    expect(
      result.findings.some((f) => f.code === 'conference_membership_no_field')
    ).toBe(false);
    expect(
      result.findings.some((f) =>
        f.message.includes('TeamMembership has no conference column')
      )
    ).toBe(false);
    expect(
      result.findings.some((f) => f.code === 'conference_source_season_membership')
    ).toBe(true);
  });

  it('11. obsolete Team.conference compute blocker absent when membership ready', () => {
    const fbs = buildFbsFixture();
    const result = buildRatingsInputPreview(previewOpts(fbs));
    expect(
      result.ratingsComputeBlockReasons.some((r) =>
        r.includes('Team.conference unsafe')
      )
    ).toBe(false);
  });

  it('12-13. talent 0/138 remains compute blocker', () => {
    const fbs = buildFbsFixture();
    const result = buildRatingsInputPreview(
      previewOpts(fbs, { talentRaw: [] })
    );
    expect(result.conferenceReadyForRatings).toBe(true);
    expect(
      result.ratingsComputeBlockReasons.some((r) =>
        r.includes('Talent coverage incomplete: 0/138')
      )
    ).toBe(true);
    expect(
      result.ratingsComputeBlockReasons.some((r) =>
        r.includes('Talent composite finite values incomplete: 0/138')
      )
    ).toBe(true);
  });

  it('14. recruiting mismatch remains separate warning classification', () => {
    const fbs = buildFbsFixture();
    const result = buildRatingsInputPreview(previewOpts(fbs));
    expect(
      result.ratingsComputeBlockReasons.some((r) =>
        r.includes('does not alone prevent Core V1')
      )
    ).toBe(true);
    expect(result.commitPersistenceSafe).toBe(false);
  });

  it('15. preview still never authorizes compute', () => {
    const fbs = buildFbsFixture();
    const result = buildRatingsInputPreview(
      previewOpts(fbs, {
        talentRaw: healthyTalentRows(fbs),
        commitsRaw: fbs.map((id, i) => ({
          team: `Name ${id}`,
          year: 2026,
          commits: 20,
          averageRating: 0.9,
          rank: i + 1,
        })),
      })
    );
    expect(result.ratingsComputeAuthorized).toBe(false);
    expect(result.ratingsComputeBlocked).toBe(true);
    expect(
      result.ratingsComputeBlockReasons.some((r) =>
        r.includes('Preview is read-only')
      )
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

  it('preview CLI has no mutation APIs and reuses TeamResolver', () => {
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
    expect(cli).toMatch(/loadMembershipConferences/);
    expect(cli).toMatch(/sharedResolver/);
    expect(cli).not.toMatch(
      /new TeamResolver\(\);\s*\n\s*return teamResolver\.resolveTeam/
    );
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

  it('25-28. mutationsInvoked remains false; provider budget exactly 2; no Odds/ratings', () => {
    const fbs = buildFbsFixture();
    const result = buildRatingsInputPreview(previewOpts(fbs));
    expect(result.mutationsInvoked).toBe(false);
    expect(result.talentWrites).toBe(false);
    expect(result.commitWrites).toBe(false);
    expect(result.ratingsComputed).toBe(false);
    expect(result.oddsInvoked).toBe(false);
    expect(result.providerRequestCount).toBe(2);
  });
});
