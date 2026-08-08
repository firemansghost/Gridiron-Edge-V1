/**
 * Phase 2C-2G-4 — Core V1 conference source loader.
 *
 * Policy:
 *   season >= 2026 → TeamMembership.conference only (fail closed; no Team.conference fallback)
 *   season < 2026  → legacy Team.conference (preserve historical Unknown/Independent behavior)
 *
 * Pure orchestration over a narrow store interface — no Prisma import, no providers, no writes.
 */

import {
  TARGET_SEASON,
  resolveSeasonAwareConferenceMap,
} from '../preseason/season-conference-preview';

export { TARGET_SEASON };

export interface V1ConferenceStore {
  loadSeasonMembershipConferences(
    season: number,
    teamIds: string[]
  ): Promise<Array<{ teamId: string; conference: string | null }>>;
  loadLegacyTeamConferences(
    teamIds: string[]
  ): Promise<Array<{ teamId: string; conference: string | null }>>;
}

export type V1ConferenceSource =
  | 'TeamMembership.conference'
  | 'Team.conference';

export interface V1ConferenceLoadResult {
  ok: boolean;
  season: number;
  conferenceSource: V1ConferenceSource;
  legacyConferenceMode: boolean;
  usedLegacyFallback: boolean;
  expectedFbsCount: number;
  loadedMembershipRowCount: number;
  loadedConferenceCount: number;
  missingTeamIds: string[];
  unrecognizedTeamIds: string[];
  duplicateTeamIds: string[];
  /** Lowercase teamId keys — matches V1 conferenceMap lookup. */
  conferenceMap: Map<string, string | null>;
  /** Canonical distribution (2026+ only when ok); empty for legacy mode. */
  distribution: Record<string, number>;
  error: string | null;
}

function sortedUnique(ids: string[]): string[] {
  return [...new Set(ids.map((s) => s.trim()).filter(Boolean))].sort();
}

function countDistribution(
  values: Array<string | null | undefined>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) {
    const key = v && String(v).trim() !== '' ? String(v).trim() : '(missing)';
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function failResult(
  partial: Omit<V1ConferenceLoadResult, 'ok' | 'conferenceMap' | 'distribution'> & {
    conferenceMap?: Map<string, string | null>;
    distribution?: Record<string, number>;
  }
): V1ConferenceLoadResult {
  return {
    ...partial,
    ok: false,
    conferenceMap: partial.conferenceMap ?? new Map(),
    distribution: partial.distribution ?? {},
  };
}

/**
 * Load the conference map Core V1 should use for `getConferenceAdjustment`.
 */
export async function loadV1ConferenceMap(options: {
  season: number;
  expectedFbsIds: string[];
  store: V1ConferenceStore;
}): Promise<V1ConferenceLoadResult> {
  const expectedFbsIds = sortedUnique(options.expectedFbsIds);
  const expectedFbsCount = expectedFbsIds.length;

  if (expectedFbsCount === 0) {
    return failResult({
      season: options.season,
      conferenceSource:
        options.season >= TARGET_SEASON
          ? 'TeamMembership.conference'
          : 'Team.conference',
      legacyConferenceMode: options.season < TARGET_SEASON,
      usedLegacyFallback: false,
      expectedFbsCount: 0,
      loadedMembershipRowCount: 0,
      loadedConferenceCount: 0,
      missingTeamIds: [],
      unrecognizedTeamIds: [],
      duplicateTeamIds: [],
      error: 'expected FBS IDs must be non-empty',
    });
  }

  // --- Historical: preserve Team.conference semantics ---
  if (options.season < TARGET_SEASON) {
    const rows = await options.store.loadLegacyTeamConferences(expectedFbsIds);
    const conferenceMap = new Map<string, string | null>();
    for (const row of rows) {
      conferenceMap.set(row.teamId.toLowerCase(), row.conference);
    }
    // Teams absent from Team table: leave unset → get() returns undefined → treated as null
    return {
      ok: true,
      season: options.season,
      conferenceSource: 'Team.conference',
      legacyConferenceMode: true,
      usedLegacyFallback: false,
      expectedFbsCount,
      loadedMembershipRowCount: 0,
      loadedConferenceCount: rows.filter(
        (r) => r.conference !== null && String(r.conference).trim() !== ''
      ).length,
      missingTeamIds: [],
      unrecognizedTeamIds: [],
      duplicateTeamIds: [],
      conferenceMap,
      distribution: countDistribution(rows.map((r) => r.conference)),
      error: null,
    };
  }

  // --- 2026+: TeamMembership.conference only ---
  const membershipRows = await options.store.loadSeasonMembershipConferences(
    options.season,
    expectedFbsIds
  );

  const seen = new Map<string, number>();
  for (const row of membershipRows) {
    const id = row.teamId.trim();
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  const duplicateTeamIds = [...seen.entries()]
    .filter(([, c]) => c > 1)
    .map(([id]) => id)
    .sort();

  if (duplicateTeamIds.length > 0) {
    return failResult({
      season: options.season,
      conferenceSource: 'TeamMembership.conference',
      legacyConferenceMode: false,
      usedLegacyFallback: false,
      expectedFbsCount,
      loadedMembershipRowCount: membershipRows.length,
      loadedConferenceCount: 0,
      missingTeamIds: [],
      unrecognizedTeamIds: [],
      duplicateTeamIds,
      error: `Duplicate TeamMembership rows for season ${options.season}: ${duplicateTeamIds.join(', ')}`,
    });
  }

  if (membershipRows.length !== expectedFbsCount) {
    const loadedSet = new Set(membershipRows.map((r) => r.teamId));
    const missing = expectedFbsIds.filter((id) => !loadedSet.has(id));
    return failResult({
      season: options.season,
      conferenceSource: 'TeamMembership.conference',
      legacyConferenceMode: false,
      usedLegacyFallback: false,
      expectedFbsCount,
      loadedMembershipRowCount: membershipRows.length,
      loadedConferenceCount: 0,
      missingTeamIds: missing,
      unrecognizedTeamIds: [],
      duplicateTeamIds: [],
      error: `TeamMembership row count ${membershipRows.length} != expected FBS count ${expectedFbsCount}`,
    });
  }

  const seasonConferenceByTeamId: Record<string, string | null> = {};
  for (const row of membershipRows) {
    seasonConferenceByTeamId[row.teamId] = row.conference;
  }

  // Explicitly do NOT pass legacyTeamConferenceByTeamId — static Team.conference
  // must not rescue missing/null 2026+ membership conferences.
  const resolved = resolveSeasonAwareConferenceMap({
    targetSeason: options.season,
    expectedFbsIds,
    seasonConferenceByTeamId,
    allowLegacyTeamConferenceFallback: false,
  });

  if (
    !resolved.ok ||
    resolved.usedLegacyFallback ||
    resolved.missingTeamIds.length > 0 ||
    resolved.unrecognizedTeamIds.length > 0 ||
    Object.keys(resolved.conferenceByTeamId).length !== expectedFbsCount
  ) {
    return failResult({
      season: options.season,
      conferenceSource: 'TeamMembership.conference',
      legacyConferenceMode: false,
      usedLegacyFallback: resolved.usedLegacyFallback,
      expectedFbsCount,
      loadedMembershipRowCount: membershipRows.length,
      loadedConferenceCount: Object.keys(resolved.conferenceByTeamId).length,
      missingTeamIds: resolved.missingTeamIds,
      unrecognizedTeamIds: resolved.unrecognizedTeamIds,
      duplicateTeamIds: [],
      error:
        resolved.error ??
        'Season-aware conference map incomplete; Team.conference fallback prohibited for 2026+',
    });
  }

  const conferenceMap = new Map<string, string | null>();
  for (const [teamId, conference] of Object.entries(
    resolved.conferenceByTeamId
  )) {
    conferenceMap.set(teamId.toLowerCase(), conference);
  }

  return {
    ok: true,
    season: options.season,
    conferenceSource: 'TeamMembership.conference',
    legacyConferenceMode: false,
    usedLegacyFallback: false,
    expectedFbsCount,
    loadedMembershipRowCount: membershipRows.length,
    loadedConferenceCount: conferenceMap.size,
    missingTeamIds: [],
    unrecognizedTeamIds: [],
    duplicateTeamIds: [],
    conferenceMap,
    distribution: countDistribution([...conferenceMap.values()]),
    error: null,
  };
}

export function formatV1ConferenceLoadFailure(
  result: V1ConferenceLoadResult
): string {
  return [
    `V1 season-aware conference load failed for season=${result.season}`,
    `conferenceSource=${result.conferenceSource}`,
    `expectedFbsCount=${result.expectedFbsCount}`,
    `loadedMembershipRowCount=${result.loadedMembershipRowCount}`,
    `loadedConferenceCount=${result.loadedConferenceCount}`,
    `missingTeamIds=[${result.missingTeamIds.join(', ')}]`,
    `unrecognizedTeamIds=[${result.unrecognizedTeamIds.join(', ')}]`,
    `duplicateTeamIds=[${result.duplicateTeamIds.join(', ')}]`,
    `legacyFallback=${result.usedLegacyFallback}`,
    result.error ? `error=${result.error}` : '',
  ]
    .filter(Boolean)
    .join('; ');
}

export function createPrismaV1ConferenceStore(prisma: {
  teamMembership: {
    findMany: (args: unknown) => Promise<
      Array<{ teamId: string; conference: string | null }>
    >;
  };
  team: {
    findMany: (args: unknown) => Promise<
      Array<{ id: string; conference: string | null }>
    >;
  };
}): V1ConferenceStore {
  return {
    async loadSeasonMembershipConferences(season, teamIds) {
      return prisma.teamMembership.findMany({
        where: {
          season,
          level: 'fbs',
          teamId: { in: teamIds },
        },
        select: {
          teamId: true,
          conference: true,
        },
      });
    },
    async loadLegacyTeamConferences(teamIds) {
      const rows = await prisma.team.findMany({
        where: { id: { in: teamIds } },
        select: { id: true, conference: true },
      });
      return rows.map((r) => ({ teamId: r.id, conference: r.conference }));
    },
  };
}
