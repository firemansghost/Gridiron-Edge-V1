/**
 * Phase 3 — Ratings page source/provenance truth.
 * Read-only conference + presentation helpers. Does not compute or persist ratings.
 *
 * Conference policy (matches jobs v1-conference-loader, without importing jobs):
 *   season >= 2026 → TeamMembership.conference only; no Team.conference fallback
 *   season < 2026  → legacy Team.conference
 */

export const RATINGS_MEMBERSHIP_CONFERENCE_MIN_SEASON = 2026;
export const CORE_V1_RATINGS_MODEL_VERSION = 'v1' as const;
export const CORE_V1_LIFECYCLE_DATA_SOURCE = 'core_v1_lifecycle' as const;
export const CORE_V1_2026_LIFECYCLE_POLICY = 'GLOBAL_BLEND_W3_W6' as const;

/** Durable GLOBAL_BLEND_W3_W6 weights. Not a live completedThroughWeek reading. */
export const CORE_V1_LIFECYCLE_WEIGHTS = {
  throughCompletedWeek2: 0,
  completedWeek3: 0.25,
  completedWeek4: 0.5,
  completedWeek5: 0.75,
  completedWeek6Plus: 1,
} as const;

export type RatingsConferenceSource =
  | 'TeamMembership.conference'
  | 'Team.conference';

export interface RatingsProvenance {
  ratingSource: 'TeamSeasonRating';
  modelVersion: typeof CORE_V1_RATINGS_MODEL_VERSION;
  conferenceSource: RatingsConferenceSource;
  lifecyclePolicy: typeof CORE_V1_2026_LIFECYCLE_POLICY | null;
}

export class RatingsConferenceIntegrityError extends Error {
  readonly season: number;
  readonly teamIds: string[];

  constructor(season: number, teamIds: string[]) {
    const unique = Array.from(new Set(teamIds));
    super(
      `Ratings data integrity error: 2026+ conference must come from TeamMembership.conference with no Team.conference fallback (season=${season}; teams=${unique.join(', ')})`
    );
    this.name = 'RatingsConferenceIntegrityError';
    this.season = season;
    this.teamIds = unique;
    Object.setPrototypeOf(this, RatingsConferenceIntegrityError.prototype);
  }
}

export function isSeasonAwareConferenceSeason(season: number): boolean {
  return Number.isInteger(season) && season >= RATINGS_MEMBERSHIP_CONFERENCE_MIN_SEASON;
}

export function ratingsConferenceSource(season: number): RatingsConferenceSource {
  return isSeasonAwareConferenceSeason(season)
    ? 'TeamMembership.conference'
    : 'Team.conference';
}

export function buildRatingsProvenance(season: number): RatingsProvenance {
  return {
    ratingSource: 'TeamSeasonRating',
    modelVersion: CORE_V1_RATINGS_MODEL_VERSION,
    conferenceSource: ratingsConferenceSource(season),
    lifecyclePolicy: isSeasonAwareConferenceSeason(season)
      ? CORE_V1_2026_LIFECYCLE_POLICY
      : null,
  };
}

function usableConference(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

/**
 * Resolve the conference string that the Ratings page may display.
 * For 2026+, Team.conference is ignored even if present.
 */
export function resolveRatingsPageConference(input: {
  season: number;
  teamId: string;
  membershipConference?: string | null;
  teamConference?: string | null;
}): { ok: true; conference: string } | { ok: false; teamId: string } {
  if (isSeasonAwareConferenceSeason(input.season)) {
    const membership = usableConference(input.membershipConference);
    if (membership == null) {
      return { ok: false, teamId: input.teamId };
    }
    return { ok: true, conference: membership };
  }

  return {
    ok: true,
    conference: usableConference(input.teamConference) ?? 'Unknown',
  };
}

export function assertRatingsPageConferences(
  season: number,
  rows: Array<{
    teamId: string;
    membershipConference?: string | null;
    teamConference?: string | null;
  }>
): string[] {
  const conferences: string[] = [];
  const failedTeamIds: string[] = [];
  for (const row of rows) {
    const resolved = resolveRatingsPageConference({ season, ...row });
    if (!resolved.ok) {
      failedTeamIds.push(row.teamId);
    } else {
      conferences.push(resolved.conference);
    }
  }
  if (failedTeamIds.length > 0) {
    throw new RatingsConferenceIntegrityError(season, failedTeamIds);
  }
  return conferences;
}

export function isCoreV1LifecycleDataSource(dataSource: string | null | undefined): boolean {
  return dataSource === CORE_V1_LIFECYCLE_DATA_SOURCE;
}

export function lifecycleOffenseDefenseAvailable(
  dataSource: string | null | undefined
): boolean {
  return !isCoreV1LifecycleDataSource(dataSource);
}

export function lifecycleGamesSample(games: number | null | undefined): number | null {
  if (games == null) return null;
  return games > 0 ? games : null;
}

export function ratingsGamesColumnLabel(season: number): string {
  return isSeasonAwareConferenceSeason(season) ? 'Rating sample' : 'Games';
}

export const CORE_V1_RATINGS_PAGE_COPY = {
  headline:
    'Persisted Core V1 power ratings. Points above or below an average FBS team on a neutral field.',
  baseline:
    '2026 ratings begin from the preseason Core V1 baseline. Canonical in-season contribution remains 0 through completed Week 2, then steps to 25% after completed Week 3, 50% after Week 4, 75% after Week 5, and 100% after Week 6 and later.',
  components:
    'Offense and Defense are not maintained Core V1 lifecycle components and are not shown as current rating parts.',
  conference: 'Conference is the 2026 season membership conference.',
} as const;
