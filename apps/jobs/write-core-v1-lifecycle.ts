#!/usr/bin/env node
/**
 * Phase 2C-2H-9 — Guarded Core V1 2026 lifecycle ratings writer.
 *
 * Preview (default):
 *   npx tsx apps/jobs/write-core-v1-lifecycle.ts --season 2026 --completed-through-week 0 --mode PREVIEW
 *
 * Commit (exact confirmation required — NOT authorized until production PREVIEW reviewed):
 *   npx tsx apps/jobs/write-core-v1-lifecycle.ts --season 2026 --completed-through-week 0 --mode COMMIT --confirm WRITE_2026_CORE_V1
 *
 * SELECT-only in PREVIEW. DIRECT_URL only. No CFBD. No Odds.
 * completedThroughWeek = last week of FINAL results allowed into ratings (not prediction week).
 */

import { PrismaClient } from '@prisma/client';
import {
  EXPECTED_FBS_COUNT,
  MODEL_VERSION_V1,
  TARGET_SEASON,
  WRITE_CONFIRM_PHRASE,
  buildCoreV1LifecycleEvaluation,
  formatCoreV1LifecycleReport,
  parseCoreV1LifecycleArgs,
  persistCoreV1LifecycleRatings,
  sanitizeCoreV1LifecycleError,
  toPersistRows,
  type CoreV1LifecycleResult,
  type LifecycleMode,
} from './src/ratings/core-v1-lifecycle';

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

/** Read-only store — SELECT only. */
export interface CoreV1LifecycleReadStore {
  loadFbsTeamIds(season: number): Promise<string[]>;
  loadTalentRows(
    season: number,
    fbsTeamIds: string[]
  ): Promise<Array<{ teamId: string; talentComposite: number | null }>>;
  loadGames(season: number): Promise<
    Array<{
      gameId: string;
      week: number;
      date: Date;
      status: string;
      homeTeamId: string;
      awayTeamId: string;
      homeScore: number | null;
      awayScore: number | null;
    }>
  >;
  loadEpaRows(season: number, fbsTeamIds: string[]): Promise<
    Array<{
      gameId: string;
      week: number;
      teamId: string;
      epaOff: number | null;
      epaDef: number | null;
    }>
  >;
  loadExistingV1Fbs(
    season: number,
    fbsTeamIds: string[]
  ): Promise<Array<{ teamId: string }>>;
}

export interface CoreV1LifecycleWriteDeps {
  transaction: <T>(
    fn: (store: {
      teamSeasonRating: {
        upsert: (args: unknown) => Promise<unknown>;
      };
    }) => Promise<T>
  ) => Promise<T>;
}

export function createPrismaCoreV1LifecycleReadStore(
  prisma: PrismaClient
): CoreV1LifecycleReadStore {
  return {
    async loadFbsTeamIds(season) {
      const rows = await prisma.teamMembership.findMany({
        where: { season, level: 'fbs' },
        select: { teamId: true },
      });
      return rows.map((r) => r.teamId).sort();
    },
    async loadTalentRows(season, fbsTeamIds) {
      const rows = await prisma.teamSeasonTalent.findMany({
        where: { season, teamId: { in: fbsTeamIds } },
        select: { teamId: true, talentComposite: true },
      });
      return rows.map((r) => ({
        teamId: r.teamId,
        talentComposite: decimalToNumber(r.talentComposite),
      }));
    },
    async loadGames(season) {
      const rows = await prisma.game.findMany({
        where: { season },
        select: {
          id: true,
          week: true,
          date: true,
          status: true,
          homeTeamId: true,
          awayTeamId: true,
          homeScore: true,
          awayScore: true,
        },
      });
      return rows.map((r) => ({
        gameId: r.id,
        week: r.week,
        date: r.date,
        status: r.status,
        homeTeamId: r.homeTeamId,
        awayTeamId: r.awayTeamId,
        homeScore: r.homeScore,
        awayScore: r.awayScore,
      }));
    },
    async loadEpaRows(season, fbsTeamIds) {
      const rows = await prisma.teamGameStat.findMany({
        where: {
          season,
          teamId: { in: fbsTeamIds },
          game: { status: 'final' },
        },
        select: {
          gameId: true,
          week: true,
          teamId: true,
          epaOff: true,
          epaDef: true,
        },
      });
      return rows.map((r) => ({
        gameId: r.gameId,
        week: r.week,
        teamId: r.teamId,
        epaOff: decimalToNumber(r.epaOff),
        epaDef: decimalToNumber(r.epaDef),
      }));
    },
    async loadExistingV1Fbs(season, fbsTeamIds) {
      const rows = await prisma.teamSeasonRating.findMany({
        where: {
          season,
          modelVersion: MODEL_VERSION_V1,
          teamId: { in: fbsTeamIds },
        },
        select: { teamId: true },
      });
      return rows;
    },
  };
}

export function createPrismaCoreV1LifecycleWriteDeps(
  prisma: PrismaClient
): CoreV1LifecycleWriteDeps {
  return {
    async transaction(fn) {
      return prisma.$transaction(async (tx) =>
        fn({
          teamSeasonRating: {
            upsert: (args) => tx.teamSeasonRating.upsert(args as never),
          },
        })
      );
    },
  };
}

export async function runCoreV1Lifecycle(options: {
  season: number;
  completedThroughWeek: number;
  mode: LifecycleMode;
  confirmation: string;
  store: CoreV1LifecycleReadStore;
  writeDeps?: CoreV1LifecycleWriteDeps;
}): Promise<{ exitCode: number; result?: CoreV1LifecycleResult }> {
  console.log(`season=${options.season}`);
  console.log(`completedThroughWeek=${options.completedThroughWeek}`);
  console.log(`mode=${options.mode}`);
  console.log('providersInvoked=false');
  console.log('Odds=false');
  console.log('CFBD_API_KEY=not provided');
  console.log('ODDS_API_KEY=not provided');

  try {
    const fbsIds = await options.store.loadFbsTeamIds(options.season);
    const fbsLower = fbsIds.map((id) => id.toLowerCase());
    const talentRows = await options.store.loadTalentRows(
      options.season,
      fbsLower
    );
    const gamesRaw = await options.store.loadGames(options.season);
    const games = gamesRaw.map((g) => ({
      gameId: g.gameId,
      week: g.week,
      date: g.date.toISOString(),
      status: g.status,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
    }));
    const epaRows = await options.store.loadEpaRows(options.season, fbsLower);
    const existing = await options.store.loadExistingV1Fbs(
      options.season,
      fbsLower
    );

    let result = buildCoreV1LifecycleEvaluation({
      season: options.season,
      completedThroughWeek: options.completedThroughWeek,
      mode: options.mode,
      confirmation: options.confirmation,
      fbsIds,
      talentRows,
      games,
      epaRows,
      existingV1FbsRows: existing.length,
      existingV1TeamIds: existing.map((r) => r.teamId),
    });

    console.log(formatCoreV1LifecycleReport(result));

    if (options.mode === 'PREVIEW') {
      console.log('mutationsInvoked=false');
      console.log('ratingsPersistenceInvoked=false');
      console.log('ratingsWriteAuthorized=false');
      if (!result.ok) {
        console.error('[core-v1-lifecycle] PREVIEW FAILED — gates not met');
        return { exitCode: 1, result };
      }
      console.log(
        '[core-v1-lifecycle] PREVIEW COMPLETE — diagnostic only; production COMMIT not authorized by this run'
      );
      return { exitCode: 0, result };
    }

    // COMMIT path
    if (!result.commitEligible || !result.ok) {
      console.error(
        `[core-v1-lifecycle] COMMIT blocked — require confirmation=${WRITE_CONFIRM_PHRASE} and all gates`
      );
      return { exitCode: 1, result };
    }
    if (!options.writeDeps) {
      console.error('[core-v1-lifecycle] COMMIT requires write deps');
      return { exitCode: 1, result };
    }
    if (result.outputCount !== EXPECTED_FBS_COUNT) {
      console.error('[core-v1-lifecycle] refuse write: outputCount != 138');
      return { exitCode: 1, result };
    }

    const persistRows = toPersistRows(result);
    await options.writeDeps.transaction(async (tx) => {
      await persistCoreV1LifecycleRatings(tx, persistRows);
    });

    result = {
      ...result,
      mutationsInvoked: true,
      ratingsPersistenceInvoked: true,
      ratingsWriteAuthorized: true,
    };
    console.log('mutationsInvoked=true');
    console.log('ratingsPersistenceInvoked=true');
    console.log(`upserted=${persistRows.length}`);
    console.log(
      '[core-v1-lifecycle] COMMIT COMPLETE — TeamSeasonRating season=2026 modelVersion=v1'
    );
    return { exitCode: 0, result };
  } catch (err) {
    console.error(`[core-v1-lifecycle] ${sanitizeCoreV1LifecycleError(err)}`);
    return { exitCode: 1 };
  }
}

async function main(): Promise<void> {
  const parsed = parseCoreV1LifecycleArgs(process.argv.slice(2));
  if (parsed.ok === false) {
    for (const e of parsed.errors) {
      console.error(`[core-v1-lifecycle] ${e}`);
    }
    console.error(
      'Usage: npx tsx apps/jobs/write-core-v1-lifecycle.ts --season 2026 --completed-through-week 0 --mode PREVIEW'
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const { exitCode } = await runCoreV1Lifecycle({
      season: parsed.season,
      completedThroughWeek: parsed.completedThroughWeek,
      mode: parsed.mode,
      confirmation: parsed.confirmation,
      store: createPrismaCoreV1LifecycleReadStore(prisma),
      writeDeps:
        parsed.mode === 'COMMIT'
          ? createPrismaCoreV1LifecycleWriteDeps(prisma)
          : undefined,
    });
    process.exit(exitCode);
  } catch (err) {
    console.error(`[core-v1-lifecycle] ${sanitizeCoreV1LifecycleError(err)}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
