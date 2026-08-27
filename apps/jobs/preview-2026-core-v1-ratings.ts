#!/usr/bin/env node
/**
 * Phase 2C-2H-3 — Read-only 2026 Core V1 preseason ratings preview.
 *
 * Usage:
 *   npx tsx apps/jobs/preview-2026-core-v1-ratings.ts --season 2026 --preview
 *
 * SELECT-only DB access. No CFBD. No Odds. No TeamSeasonRating/PowerRating writes.
 * Reuses computeV1SeasonRatings (same path as legacy writer).
 */

import { PrismaClient } from '@prisma/client';
import { FeatureLoader } from './src/ratings/feature-loader';
import { getModelConfig } from './src/config/model-weights';
import {
  createPrismaV1ConferenceStore,
  formatV1ConferenceLoadFailure,
  loadV1ConferenceMap,
} from './src/ratings/v1-conference-loader';
import {
  TARGET_SEASON,
  EXPECTED_FBS_COUNT,
  buildCoreV1RatingsPreview,
  formatCoreV1RatingsPreviewReport,
  parseCoreV1RatingsPreviewArgs,
  sanitizeCoreV1RatingsPreviewError,
  type CoreV1PreviewAuxiliaryInput,
  type CoreV1PreviewGatesInput,
} from './src/preseason/core-v1-ratings-preview';
import type { TeamFeatures } from './src/ratings/feature-loader';

/** Read-only store — SELECT only; no mutation methods. */
export interface CoreV1RatingsPreviewReadStore {
  loadFbsTeamIds(season: number): Promise<string[]>;
  loadScheduleTeamIds(season: number): Promise<string[]>;
  loadTalentRows(
    season: number
  ): Promise<
    Array<{
      teamId: string;
      talentComposite: number | null;
      blueChipsPct: number | null;
    }>
  >;
  countTeamSeasonRatings(season: number): Promise<number>;
  countPowerRatings(season: number): Promise<number>;
  countSeasonStatsTeams(season: number): Promise<number>;
  countGameStatsTeams(season: number): Promise<number>;
  countUnitGradesTeams(season: number): Promise<number>;
  countCommitsTeams(season: number): Promise<number>;
  loadTeamFeatures(teamId: string, season: number): Promise<TeamFeatures>;
}

export function createPrismaCoreV1RatingsPreviewReadStore(
  prisma: PrismaClient
): CoreV1RatingsPreviewReadStore {
  const loader = new FeatureLoader(prisma);
  return {
    async loadFbsTeamIds(season) {
      const rows = await prisma.teamMembership.findMany({
        where: { season },
        select: { teamId: true, level: true },
      });
      return rows
        .filter((r) => r.level.toLowerCase() === 'fbs')
        .map((r) => r.teamId)
        .sort();
    },
    async loadScheduleTeamIds(season) {
      const rows = await prisma.game.findMany({
        where: { season },
        select: { homeTeamId: true, awayTeamId: true },
      });
      const ids = new Set<string>();
      for (const g of rows) {
        ids.add(g.homeTeamId);
        ids.add(g.awayTeamId);
      }
      return [...ids].sort();
    },
    async loadTalentRows(season) {
      return prisma.teamSeasonTalent.findMany({
        where: { season },
        select: {
          teamId: true,
          talentComposite: true,
          blueChipsPct: true,
        },
        orderBy: { teamId: 'asc' },
      });
    },
    async countTeamSeasonRatings(season) {
      return prisma.teamSeasonRating.count({ where: { season } });
    },
    async countPowerRatings(season) {
      return prisma.powerRating.count({ where: { season } });
    },
    async countSeasonStatsTeams(season) {
      const rows = await prisma.teamSeasonStat.findMany({
        where: { season },
        select: { teamId: true },
        distinct: ['teamId'],
      });
      return rows.length;
    },
    async countGameStatsTeams(season) {
      const rows = await prisma.teamGameStat.findMany({
        where: { season },
        select: { teamId: true },
        distinct: ['teamId'],
      });
      return rows.length;
    },
    async countUnitGradesTeams(season) {
      const rows = await prisma.teamUnitGrades.findMany({
        where: { season },
        select: { teamId: true },
        distinct: ['teamId'],
      });
      return rows.length;
    },
    async countCommitsTeams(season) {
      const rows = await prisma.teamClassCommits.findMany({
        where: { season },
        select: { teamId: true },
        distinct: ['teamId'],
      });
      return rows.length;
    },
    async loadTeamFeatures(teamId, season) {
      return loader.loadTeamFeatures(teamId, season);
    },
  };
}

export async function runCoreV1RatingsPreview(options: {
  season: number;
  store: CoreV1RatingsPreviewReadStore;
  loadConferenceMap: (args: {
    season: number;
    expectedFbsIds: string[];
  }) => ReturnType<typeof loadV1ConferenceMap>;
}): Promise<{ exitCode: number }> {
  if (options.season !== TARGET_SEASON) {
    console.error(`[core-v1-preview] season must be ${TARGET_SEASON}`);
    return { exitCode: 1 };
  }

  console.log('mode=READ_ONLY');
  console.log(`targetSeason=${options.season}`);
  console.log('providersInvoked=false');
  console.log('mutationsInvoked=false');
  console.log('ratingsPersistenceInvoked=false');
  console.log('teamSeasonRatingWrites=false');
  console.log('powerRatingWrites=false');
  console.log('Odds=false');
  console.log('CFBD_API_KEY=not provided');
  console.log('ODDS_API_KEY=not provided');

  const { store } = options;

  try {
    const fbsIds = await store.loadFbsTeamIds(TARGET_SEASON);
    const scheduleTeamIds = await store.loadScheduleTeamIds(TARGET_SEASON);
    const talentRowsRaw = await store.loadTalentRows(TARGET_SEASON);
    const existingTeamSeasonRatingCount =
      await store.countTeamSeasonRatings(TARGET_SEASON);
    const existingPowerRatingCount =
      await store.countPowerRatings(TARGET_SEASON);

    const conferenceLoad = await options.loadConferenceMap({
      season: TARGET_SEASON,
      expectedFbsIds: fbsIds,
    });

    if (!conferenceLoad.ok) {
      console.error(formatV1ConferenceLoadFailure(conferenceLoad));
      return { exitCode: 1 };
    }

    const conferenceByTeamId: Record<string, string> = {};
    for (const id of fbsIds) {
      const conf = conferenceLoad.conferenceMap.get(id.toLowerCase());
      if (conf) conferenceByTeamId[id] = conf;
    }

    const gates: CoreV1PreviewGatesInput = {
      season: TARGET_SEASON,
      fbsIds,
      scheduleTeamIds,
      conferenceByTeamId,
      conferenceMissingCount: conferenceLoad.missingTeamIds.length,
      conferenceUnrecognizedCount: conferenceLoad.unrecognizedTeamIds.length,
      legacyConferenceFallback: conferenceLoad.usedLegacyFallback,
      talentRows: talentRowsRaw.map((r) => ({
        teamId: r.teamId,
        talentComposite: r.talentComposite,
      })),
      existingTeamSeasonRatingCount,
      existingPowerRatingCount,
    };

    const blueChipsPctNonNullCount = talentRowsRaw.filter(
      (r) => r.blueChipsPct !== null && r.blueChipsPct !== undefined
    ).length;

    const auxiliary: CoreV1PreviewAuxiliaryInput = {
      blueChipsPctNonNullCount,
      commitsNonNullCount: await store.countCommitsTeams(TARGET_SEASON),
      seasonStatsTeamCount: await store.countSeasonStatsTeams(TARGET_SEASON),
      gameStatsTeamCount: await store.countGameStatsTeams(TARGET_SEASON),
      unitGradesTeamCount: await store.countUnitGradesTeams(TARGET_SEASON),
    };

    const allFeatures: TeamFeatures[] = [];
    for (const teamId of fbsIds) {
      allFeatures.push(await store.loadTeamFeatures(teamId, TARGET_SEASON));
    }

    const modelConfig = getModelConfig('v1');
    const result = buildCoreV1RatingsPreview({
      gates,
      auxiliary,
      allFeatures,
      conferenceMap: conferenceLoad.conferenceMap,
      modelConfig,
    });

    console.log(formatCoreV1RatingsPreviewReport(result));
    if (!result.ok) {
      console.error(
        '[core-v1-preview] FAILED — structural gates not met; ratings not presented as valid'
      );
      return { exitCode: 1 };
    }
    console.log(
      `[core-v1-preview] COMPLETE — ${EXPECTED_FBS_COUNT} in-memory Core V1 ratings previewed; no writes`
    );
    return { exitCode: 0 };
  } catch (err) {
    console.error(
      `[core-v1-preview] ${sanitizeCoreV1RatingsPreviewError(err)}`
    );
    return { exitCode: 1 };
  }
}

async function main(): Promise<void> {
  const parsed = parseCoreV1RatingsPreviewArgs(process.argv.slice(2));
  if (parsed.ok === false) {
    for (const e of parsed.errors) console.error(`[core-v1-preview] ${e}`);
    console.error(
      'Usage: npx tsx apps/jobs/preview-2026-core-v1-ratings.ts --season 2026 --preview'
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const { exitCode } = await runCoreV1RatingsPreview({
      season: parsed.season,
      store: createPrismaCoreV1RatingsPreviewReadStore(prisma),
      loadConferenceMap: ({ season, expectedFbsIds }) =>
        loadV1ConferenceMap({
          season,
          expectedFbsIds,
          store: createPrismaV1ConferenceStore(prisma),
        }),
    });
    process.exit(exitCode);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(
      `[core-v1-preview] ${sanitizeCoreV1RatingsPreviewError(err)}`
    );
    process.exit(1);
  });
}
