#!/usr/bin/env node
/**
 * Phase 2C-2H-4 — Read-only Core V1 historical parity / calibration forensic.
 *
 * Usage:
 *   npx tsx apps/jobs/audit-v1-historical-parity.ts --comparison-season 2025
 *
 * SELECT-only DB. Strict FeatureLoader. No CFBD. No Odds. No ratings writes.
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
  COMPARISON_SEASON,
  buildV1HistoricalParityAudit,
  formatV1HistoricalParityReport,
  parseV1HistoricalParityArgs,
  sanitizeV1HistoricalParityError,
  type PersistedV1RatingRow,
} from './src/preseason/v1-historical-parity-audit';
import type { TeamFeatures } from './src/ratings/feature-loader';

function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof (value as { toNumber?: () => number }).toNumber === 'function') {
    const n = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Read-only store — SELECT only; no mutation methods. */
export interface V1HistoricalParityReadStore {
  loadFbsTeamIds(season: number): Promise<string[]>;
  loadPersistedV1Ratings(season: number): Promise<PersistedV1RatingRow[]>;
  loadTeamFeatures(teamId: string, season: number): Promise<TeamFeatures>;
}

export function createPrismaV1HistoricalParityReadStore(
  prisma: PrismaClient
): V1HistoricalParityReadStore {
  const loader = new FeatureLoader(prisma, { failClosedOnReadError: true });
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
    async loadPersistedV1Ratings(season) {
      const rows = await prisma.teamSeasonRating.findMany({
        where: { season, modelVersion: 'v1' },
        select: {
          teamId: true,
          season: true,
          modelVersion: true,
          powerRating: true,
          confidence: true,
          dataSource: true,
          games: true,
          offenseRating: true,
          defenseRating: true,
        },
      });
      return rows.map((r) => ({
        teamId: r.teamId,
        season: r.season,
        modelVersion: r.modelVersion,
        powerRating: decimalToNumber(r.powerRating),
        confidence: decimalToNumber(r.confidence),
        dataSource: r.dataSource,
        games: r.games,
        offenseRating: decimalToNumber(r.offenseRating),
        defenseRating: decimalToNumber(r.defenseRating),
      }));
    },
    async loadTeamFeatures(teamId, season) {
      return loader.loadTeamFeatures(teamId, season);
    },
  };
}

export async function runV1HistoricalParityAudit(options: {
  comparisonSeason: number;
  store: V1HistoricalParityReadStore;
  loadConferenceMap: (args: {
    season: number;
    expectedFbsIds: string[];
  }) => ReturnType<typeof loadV1ConferenceMap>;
}): Promise<{ exitCode: number }> {
  if (options.comparisonSeason !== COMPARISON_SEASON) {
    console.error(
      `[v1-parity] comparisonSeason must be ${COMPARISON_SEASON}`
    );
    return { exitCode: 1 };
  }

  console.log('mode=READ_ONLY');
  console.log(`comparisonSeason=${options.comparisonSeason}`);
  console.log('featureLoaderStrict=true');
  console.log('providersInvoked=false');
  console.log('mutationsInvoked=false');
  console.log('ratingsPersistenceInvoked=false');
  console.log('Odds=false');
  console.log('CFBD_API_KEY=not provided');
  console.log('ODDS_API_KEY=not provided');
  console.log('ratingsWriteAuthorized=false');
  console.log('modelChangeAuthorized=false');

  try {
    const fbsIds = await options.store.loadFbsTeamIds(COMPARISON_SEASON);
    const persistedV1Rows = await options.store.loadPersistedV1Ratings(
      COMPARISON_SEASON
    );

    const conferenceLoad = await options.loadConferenceMap({
      season: COMPARISON_SEASON,
      expectedFbsIds: fbsIds,
    });

    if (!conferenceLoad.ok) {
      console.error(formatV1ConferenceLoadFailure(conferenceLoad));
      return { exitCode: 1 };
    }

    const allFeatures: TeamFeatures[] = [];
    for (const teamId of fbsIds) {
      allFeatures.push(
        await options.store.loadTeamFeatures(teamId, COMPARISON_SEASON)
      );
    }

    const modelConfig = getModelConfig('v1');
    const result = buildV1HistoricalParityAudit({
      comparisonSeason: COMPARISON_SEASON,
      fbsIds,
      persistedV1Rows,
      allFeatures,
      conferenceMap: conferenceLoad.conferenceMap,
      modelConfig,
      conferenceSource: conferenceLoad.conferenceSource,
      legacyConferenceMode: conferenceLoad.legacyConferenceMode,
      conferenceLoadOk: conferenceLoad.ok,
      featureLoaderStrict: true,
    });

    console.log(formatV1HistoricalParityReport(result));
    if (!result.ok) {
      console.error(
        '[v1-parity] FAILED — structural gates not met; parity not presented as valid'
      );
      return { exitCode: 1 };
    }
    console.log(
      '[v1-parity] COMPLETE — read-only forensic finished; no writes; modelChangeAuthorized=false'
    );
    return { exitCode: 0 };
  } catch (err) {
    console.error(`[v1-parity] ${sanitizeV1HistoricalParityError(err)}`);
    return { exitCode: 1 };
  }
}

async function main(): Promise<void> {
  const parsed = parseV1HistoricalParityArgs(process.argv.slice(2));
  if (parsed.ok === false) {
    for (const e of parsed.errors) console.error(`[v1-parity] ${e}`);
    console.error(
      'Usage: npx tsx apps/jobs/audit-v1-historical-parity.ts --comparison-season 2025'
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const { exitCode } = await runV1HistoricalParityAudit({
      comparisonSeason: parsed.comparisonSeason,
      store: createPrismaV1HistoricalParityReadStore(prisma),
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
    console.error(`[v1-parity] ${sanitizeV1HistoricalParityError(err)}`);
    process.exit(1);
  });
}
