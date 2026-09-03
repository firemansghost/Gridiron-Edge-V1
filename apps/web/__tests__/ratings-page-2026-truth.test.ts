/**
 * Phase 3 — Ratings page source/provenance truth.
 * Pure helpers + static API/page checks. No provider / DB / workflow execution.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import {
  CORE_V1_2026_LIFECYCLE_POLICY,
  CORE_V1_LIFECYCLE_DATA_SOURCE,
  CORE_V1_LIFECYCLE_WEIGHTS,
  CORE_V1_RATINGS_MODEL_VERSION,
  CORE_V1_RATINGS_PAGE_COPY,
  RatingsConferenceIntegrityError,
  RatingsFrameIntegrityError,
  assertRatingsPageConferences,
  assertRatingsPopulationFrame,
  buildRatingsProvenance,
  isCoreV12026LifecycleSeason,
  isSeasonAwareConferenceSeason,
  lifecycleGamesSample,
  lifecycleOffenseDefenseAvailable,
  ratingsConferenceSource,
  ratingsGamesColumnLabel,
  ratingsPageCopyKind,
  resolveRatingsPageConference,
  showRatingsOffenseDefenseColumns,
} from '@/lib/ratings-truth';

const webRoot = path.join(__dirname, '..');
const repoRoot = path.join(__dirname, '../../..');

describe('Phase 3 Ratings conference policy', () => {
  it('uses TeamMembership.conference for 2026 and ignores stale Team.conference', () => {
    const texas = resolveRatingsPageConference({
      season: 2026,
      teamId: 'texas',
      membershipConference: 'SEC',
      teamConference: 'Big 12',
    });
    const oregon = resolveRatingsPageConference({
      season: 2026,
      teamId: 'oregon',
      membershipConference: 'Big Ten',
      teamConference: 'Pac-12',
    });
    expect(texas).toEqual({ ok: true, conference: 'SEC' });
    expect(oregon).toEqual({ ok: true, conference: 'Big Ten' });
    expect(ratingsConferenceSource(2026)).toBe('TeamMembership.conference');
    expect(ratingsConferenceSource(2027)).toBe('TeamMembership.conference');
  });

  it('fails closed when 2026 membership conference is missing, null, or blank', () => {
    expect(
      resolveRatingsPageConference({
        season: 2026,
        teamId: 'texas',
        membershipConference: null,
        teamConference: 'Big 12',
      }).ok
    ).toBe(false);
    expect(
      resolveRatingsPageConference({
        season: 2026,
        teamId: 'oregon',
        membershipConference: '   ',
        teamConference: 'Pac-12',
      }).ok
    ).toBe(false);
    expect(
      resolveRatingsPageConference({
        season: 2026,
        teamId: 'independent-stale',
        teamConference: 'Independent',
      }).ok
    ).toBe(false);

    expect(() =>
      assertRatingsPageConferences(2026, [
        {
          teamId: 'texas',
          membershipConference: null,
          teamConference: 'Big 12',
        },
      ])
    ).toThrow(RatingsConferenceIntegrityError);
  });

  it('fails closed on a 2026 blank membership conference even when that team has no rating', () => {
    expect(() =>
      assertRatingsPageConferences(2026, [
        { teamId: 'texas', membershipConference: 'SEC' },
        { teamId: 'no-rating-yet', membershipConference: '   ' },
      ])
    ).toThrow(RatingsConferenceIntegrityError);

    try {
      assertRatingsPageConferences(2026, [
        { teamId: 'texas', membershipConference: 'SEC' },
        { teamId: 'no-rating-yet', membershipConference: null },
      ]);
      throw new Error('expected integrity failure');
    } catch (error) {
      expect(error).toBeInstanceOf(RatingsConferenceIntegrityError);
      expect((error as RatingsConferenceIntegrityError).teamIds).toContain(
        'no-rating-yet'
      );
    }
  });

  it('retains legacy Team.conference semantics for seasons before 2026', () => {
    expect(
      resolveRatingsPageConference({
        season: 2025,
        teamId: 'texas',
        membershipConference: 'SEC',
        teamConference: 'Big 12',
      })
    ).toEqual({ ok: true, conference: 'Big 12' });
    expect(
      resolveRatingsPageConference({
        season: 2025,
        teamId: 'unknown',
        membershipConference: 'SEC',
        teamConference: null,
      })
    ).toEqual({ ok: true, conference: 'Unknown' });
    expect(ratingsConferenceSource(2025)).toBe('Team.conference');
    expect(isSeasonAwareConferenceSeason(2025)).toBe(false);
  });
});

describe('Phase 3 Ratings 2026+ population frame', () => {
  it('fails closed when 2026 membership and v1 rating team IDs do not match', () => {
    expect(() =>
      assertRatingsPopulationFrame({
        season: 2026,
        membershipTeamIds: ['texas', 'oregon'],
        ratingTeamIds: ['texas'],
        displayTeamIds: ['texas', 'oregon'],
      })
    ).toThrow(RatingsFrameIntegrityError);

    try {
      assertRatingsPopulationFrame({
        season: 2026,
        membershipTeamIds: ['texas', 'oregon'],
        ratingTeamIds: ['texas', 'oregon', 'extra-v1'],
        displayTeamIds: ['texas', 'oregon'],
      });
      throw new Error('expected integrity failure');
    } catch (error) {
      expect(error).toBeInstanceOf(RatingsFrameIntegrityError);
      expect((error as RatingsFrameIntegrityError).extraRatingTeamIds).toEqual([
        'extra-v1',
      ]);
      expect((error as RatingsFrameIntegrityError).missingRatingTeamIds).toEqual(
        []
      );
    }
  });

  it('fails closed when 2026 rating/membership teams are missing Team display rows', () => {
    try {
      assertRatingsPopulationFrame({
        season: 2026,
        membershipTeamIds: ['texas', 'oregon'],
        ratingTeamIds: ['texas', 'oregon'],
        displayTeamIds: ['texas'],
      });
      throw new Error('expected integrity failure');
    } catch (error) {
      expect(error).toBeInstanceOf(RatingsFrameIntegrityError);
      expect((error as RatingsFrameIntegrityError).missingDisplayTeamIds).toEqual(
        ['oregon']
      );
    }
  });

  it('succeeds when the 2026 membership, v1 rating, and Team display sets match exactly', () => {
    expect(() =>
      assertRatingsPopulationFrame({
        season: 2026,
        membershipTeamIds: ['oregon', 'texas'],
        ratingTeamIds: ['texas', 'oregon'],
        displayTeamIds: ['TEXAS', 'Oregon'],
      })
    ).not.toThrow();
  });

  it('does not apply 2026+ frame equality to legacy seasons', () => {
    expect(() =>
      assertRatingsPopulationFrame({
        season: 2025,
        membershipTeamIds: ['texas'],
        ratingTeamIds: [],
        displayTeamIds: [],
      })
    ).not.toThrow();
  });
});

describe('Phase 3 Ratings numerical source and lifecycle presentation', () => {
  it('keeps TeamSeasonRating modelVersion v1 as the numerical source', () => {
    const provenance = buildRatingsProvenance(2026);
    expect(provenance.ratingSource).toBe('TeamSeasonRating');
    expect(provenance.modelVersion).toBe('v1');
    expect(CORE_V1_RATINGS_MODEL_VERSION).toBe('v1');
    expect(provenance.conferenceSource).toBe('TeamMembership.conference');
    expect(provenance.lifecyclePolicy).toBe('GLOBAL_BLEND_W3_W6');
    expect(CORE_V1_2026_LIFECYCLE_POLICY).toBe('GLOBAL_BLEND_W3_W6');
    expect(buildRatingsProvenance(2025).lifecyclePolicy).toBeNull();
    expect(buildRatingsProvenance(2025).conferenceSource).toBe('Team.conference');
  });

  it('keeps 2027 on TeamMembership.conference without claiming GLOBAL_BLEND_W3_W6', () => {
    expect(isSeasonAwareConferenceSeason(2027)).toBe(true);
    expect(isCoreV12026LifecycleSeason(2027)).toBe(false);
    expect(isCoreV12026LifecycleSeason(2026)).toBe(true);
    expect(buildRatingsProvenance(2027).conferenceSource).toBe(
      'TeamMembership.conference'
    );
    expect(buildRatingsProvenance(2027).lifecyclePolicy).toBeNull();
    expect(buildRatingsProvenance(2026).lifecyclePolicy).toBe(
      'GLOBAL_BLEND_W3_W6'
    );
  });

  it('does not treat Core V1 lifecycle offense/defense zeros as components', () => {
    expect(lifecycleOffenseDefenseAvailable(CORE_V1_LIFECYCLE_DATA_SOURCE)).toBe(
      false
    );
    expect(lifecycleOffenseDefenseAvailable('legacy_v1')).toBe(true);
    expect(lifecycleOffenseDefenseAvailable(null)).toBe(true);
  });

  it('does not treat zero games as a meaningful current sample', () => {
    expect(lifecycleGamesSample(0)).toBeNull();
    expect(lifecycleGamesSample(null)).toBeNull();
    expect(lifecycleGamesSample(8)).toBe(8);
    expect(ratingsGamesColumnLabel(2026)).toBe('Rating sample');
    expect(ratingsGamesColumnLabel(2025)).toBe('Games');
    expect(ratingsGamesColumnLabel(2027)).toBe('Games');
  });

  it('documents the durable W3–W6 lifecycle weights', () => {
    expect(CORE_V1_LIFECYCLE_WEIGHTS.throughCompletedWeek2).toBe(0);
    expect(CORE_V1_LIFECYCLE_WEIGHTS.completedWeek3).toBe(0.25);
    expect(CORE_V1_LIFECYCLE_WEIGHTS.completedWeek4).toBe(0.5);
    expect(CORE_V1_LIFECYCLE_WEIGHTS.completedWeek5).toBe(0.75);
    expect(CORE_V1_LIFECYCLE_WEIGHTS.completedWeek6Plus).toBe(1);
    expect(CORE_V1_RATINGS_PAGE_COPY.baseline).toContain(
      '0 through completed Week 2'
    );
    expect(CORE_V1_RATINGS_PAGE_COPY.baseline).toContain(
      '25% after completed Week 3'
    );
    expect(CORE_V1_RATINGS_PAGE_COPY.baseline).toContain('50% after Week 4');
    expect(CORE_V1_RATINGS_PAGE_COPY.baseline).toContain('75% after Week 5');
    expect(CORE_V1_RATINGS_PAGE_COPY.baseline).toContain(
      '100% after Week 6 and later'
    );
  });

  it('shows 2026 lifecycle copy only for the authorized 2026 season', () => {
    expect(ratingsPageCopyKind(2026)).toBe('core_v1_2026_lifecycle');
    expect(ratingsPageCopyKind(2027)).toBe('membership_conference');
    expect(ratingsPageCopyKind(2025)).toBe('legacy');
    expect(CORE_V1_RATINGS_PAGE_COPY.conference).toBe(
      'Conference is the season-specific TeamMembership conference.'
    );
    expect(CORE_V1_RATINGS_PAGE_COPY.conference).not.toContain(
      '2026 season membership'
    );
    expect(CORE_V1_RATINGS_PAGE_COPY.baseline).toContain('2026 ratings begin');
    expect(CORE_V1_RATINGS_PAGE_COPY.ratingSample).toContain(
      'FBS-vs-FBS final games through the persisted lifecycle cutoff'
    );
    expect(CORE_V1_RATINGS_PAGE_COPY.ratingSample).toContain(
      'persisted sample count is zero or unavailable'
    );
    expect(CORE_V1_RATINGS_PAGE_COPY.ratingSample).toContain(
      'does not mean canonical in-season weight has begun'
    );
  });

  it('keeps legacy Offense/Defense columns and only hides 2026+ columns when components are unavailable', () => {
    const legacyRows = [
      { offenseRating: 4.1, defenseRating: -2.2 },
    ];
    const lifecycleNullRows = [
      { offenseRating: null, defenseRating: null },
    ];
    const futureComponentRows = [
      { offenseRating: 3.2, defenseRating: null },
    ];

    expect(
      showRatingsOffenseDefenseColumns({ season: 2025, ratings: legacyRows })
    ).toBe(true);
    expect(
      showRatingsOffenseDefenseColumns({
        season: 2025,
        ratings: [{ offenseRating: null, defenseRating: null }],
      })
    ).toBe(true);
    expect(
      showRatingsOffenseDefenseColumns({
        season: 2026,
        ratings: lifecycleNullRows,
      })
    ).toBe(false);
    expect(
      showRatingsOffenseDefenseColumns({
        season: 2027,
        ratings: futureComponentRows,
      })
    ).toBe(true);
    expect(
      showRatingsOffenseDefenseColumns({
        season: 2027,
        ratings: lifecycleNullRows,
      })
    ).toBe(false);
    expect(buildRatingsProvenance(2027).lifecyclePolicy).toBeNull();
    expect(isSeasonAwareConferenceSeason(2027)).toBe(true);
  });
});

describe('Phase 3 Ratings static API/page gates', () => {
  const helper = fs.readFileSync(path.join(webRoot, 'lib/ratings-truth.ts'), 'utf8');
  const route = fs.readFileSync(path.join(webRoot, 'app/api/ratings/route.ts'), 'utf8');
  const page = fs.readFileSync(path.join(webRoot, 'app/ratings/page.tsx'), 'utf8');

  it('2026 ratings API reads membership conference and persisted v1 ratings only', () => {
    expect(route).toContain('export async function GET');
    expect(route).not.toContain('export async function POST');
    expect(route).not.toContain('export async function PUT');
    expect(route).not.toContain('export async function PATCH');
    expect(route).not.toContain('export async function DELETE');
    expect(route).toContain('prisma.teamMembership.findMany');
    expect(route).toContain('conference: true');
    expect(route).toContain('prisma.teamSeasonRating.findMany');
    expect(route).toContain('CORE_V1_RATINGS_MODEL_VERSION');
    expect(route).toContain('assertRatingsPageConferences');
    expect(route).toContain('assertRatingsPopulationFrame');
    expect(route).toContain('buildRatingsProvenance');
    expect(route).toContain('status: 409');
    expect(route).toContain('RatingsFrameIntegrityError');
    expect(route).not.toContain('prisma.teamSeasonRating.create');
    expect(route).not.toContain('prisma.teamSeasonRating.update');
    expect(route).not.toContain("from '@/jobs");
    expect(route).not.toContain('core-v1-lifecycle');
    expect(route).not.toContain('compute_balanced_v1');
    expect(helper).not.toContain('apps/jobs');
    expect(helper).toContain('isCoreV12026LifecycleSeason');
    expect(helper).toContain('isSeasonAwareConferenceSeason');
  });

  it('validates 2026+ membership conferences before loading ratings, then requires exact frame parity', () => {
    const membershipConferenceAssert = route.indexOf(
      'assertRatingsPageConferences('
    );
    const ratingsQuery = route.indexOf('prisma.teamSeasonRating.findMany');
    const frameAssert = route.indexOf('assertRatingsPopulationFrame({');
    expect(membershipConferenceAssert).toBeGreaterThan(-1);
    expect(ratingsQuery).toBeGreaterThan(-1);
    expect(frameAssert).toBeGreaterThan(-1);
    expect(membershipConferenceAssert).toBeLessThan(ratingsQuery);
    expect(ratingsQuery).toBeLessThan(frameAssert);
    expect(route).toContain('fbsMemberships.map((row) => ({');
    expect(route).toContain('membershipConference: row.conference');
  });

  it('2026 page suppresses lifecycle Offense/Defense and zero games as current evidence', () => {
    expect(page).toContain('CORE_V1_RATINGS_PAGE_COPY');
    expect(page).toContain('showOffenseDefense');
    expect(page).toContain('showRatingsOffenseDefenseColumns');
    expect(page).not.toContain('data != null && !seasonAware');
    expect(page).toContain('ratingsGamesColumnLabel');
    expect(page).toContain('gamesSample');
    expect(page).toContain('CORE_V1_RATINGS_PAGE_COPY.baseline');
    expect(page).toContain('CORE_V1_RATINGS_PAGE_COPY.components');
    expect(page).toContain('ratingsPageCopyKind');
    expect(page).toContain("copyKind === 'core_v1_2026_lifecycle'");
    expect(page).toContain("copyKind === 'membership_conference'");
    expect(page).not.toContain('the current lifecycle weight is 0');
    expect(page).not.toContain('2026 season membership conference');
    expect(page).toContain("placeholder=\"2026\"");
  });
});

describe('Phase 3 does not modify model, persistence, workflows, or providers', () => {
  function gitDiffNames(paths: string[]): string[] {
    const result = spawnSync(
      'git',
      ['diff', '--name-only', 'origin/main', '--', ...paths],
      { encoding: 'utf8', cwd: repoRoot }
    );
    expect(result.status).toBe(0);
    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  it('does not modify guarded workflows or Prisma schema', () => {
    expect(gitDiffNames(['.github/workflows', 'prisma', 'apps/web/prisma'])).toEqual(
      []
    );
  });

  it('does not modify Core/Hybrid/Odds/scores/grading/lifecycle calculation or persistence', () => {
    expect(
      gitDiffNames([
        'apps/jobs/src/ratings/core-v1-lifecycle.ts',
        'apps/jobs/src/ratings/compute_balanced_v1.ts',
        'apps/jobs/src/ratings/v1-conference-loader.ts',
        'apps/web/lib/core-v2-spread.ts',
        'apps/jobs/src/odds',
        'apps/jobs/src/cfbd-game-results.ts',
        'apps/jobs/lib/grade-bets-2026.ts',
        'apps/jobs/write-live-odds-2026.ts',
        'apps/jobs/write-core-v1-weekly-card-2026.ts',
        'apps/jobs/write-cfbd-scores-2026.ts',
        'apps/jobs/grade-bets-2026.ts',
      ])
    ).toEqual([]);
  });
});
