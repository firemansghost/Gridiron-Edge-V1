#!/usr/bin/env node
/**
 * Phase 2C-2J-6D-2 — Guarded Core V1 2026 lifecycle ratings writer.
 *
 * Preview (default):
 *   npx tsx apps/jobs/write-core-v1-lifecycle.ts --season 2026 --completed-through-week 0 --mode PREVIEW
 *
 * Commit (week-tied confirmation required — NOT authorized until production PREVIEW reviewed):
 *   npx tsx apps/jobs/write-core-v1-lifecycle.ts --season 2026 --completed-through-week 3 --mode COMMIT --confirm WRITE_2026_CORE_V1_THROUGH_WEEK_3
 *
 * SELECT-only in PREVIEW. DIRECT_URL only. No CFBD. No Odds.
 * COMMIT: Serializable re-read → re-evaluate → persist → verify (rollback on fail).
 * completedThroughWeek = last week of FINAL results allowed into ratings (not prediction week).
 */

import * as fs from 'fs';
import * as path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  EXPECTED_FBS_COUNT,
  MODEL_VERSION_V1,
  PHASE,
  TARGET_SEASON,
  buildCoreV1LifecycleEvaluation,
  buildFailedCommitExecution,
  buildPreviewExecution,
  buildRolledBackExecution,
  buildSuccessfulCommitExecution,
  commitEligibleFromResult,
  decimalLikeToNumber,
  executeAtomicCoreV1LifecycleCommit,
  expectedCoreV1LifecycleConfirmation,
  finalizeCoreV1LifecycleReport,
  formatCoreV1LifecycleReport,
  parseCoreV1LifecycleArgs,
  persistCoreV1LifecycleRatings,
  resolvePreviewExitCode,
  sanitizeCoreV1LifecycleError,
  type CoreV1LifecycleExecutionState,
  type CoreV1LifecyclePostWriteVerification,
  type CoreV1LifecycleResult,
  type LifecycleMode,
} from './src/ratings/core-v1-lifecycle';

function defaultReportPath(
  completedThroughWeek: number,
  mode: string
): string {
  return path.join(
    process.cwd(),
    'reports',
    `core-v1-lifecycle-2026-through-week-${completedThroughWeek}-${mode.toLowerCase()}.json`
  );
}

function writeReport(
  reportPath: string,
  result: CoreV1LifecycleResult,
  execution: CoreV1LifecycleExecutionState,
  verification: CoreV1LifecyclePostWriteVerification | null,
  meta: Record<string, unknown> = {}
): void {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const report = finalizeCoreV1LifecycleReport({
    result,
    execution,
    verification,
    meta,
  });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`report=${reportPath}`);
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
      date: Date | string;
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
  loadV1Ratings?(
    season: number,
    fbsTeamIds: string[]
  ): Promise<
    Array<{
      teamId: string;
      powerRating: unknown;
      rating: unknown;
      games: unknown;
    }>
  >;
}

export interface CoreV1LifecycleWriteDeps {
  transaction: <T>(
    fn: (txStore: CoreV1LifecycleReadStore & {
      persist: (
        rows: Array<{
          season: number;
          teamId: string;
          powerRating: number;
          games: number;
        }>
      ) => Promise<{ upserted: number }>;
    }) => Promise<T>,
    options?: { isolationLevel: Prisma.TransactionIsolationLevel }
  ) => Promise<T>;
}

function mapGames(
  rows: Array<{
    gameId: string;
    week: number;
    date: Date | string;
    status: string;
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number | null;
    awayScore: number | null;
  }>
) {
  return rows.map((g) => ({
    gameId: g.gameId,
    week: g.week,
    date:
      typeof g.date === 'string'
        ? g.date
        : g.date.toISOString(),
    status: g.status,
    homeTeamId: g.homeTeamId,
    awayTeamId: g.awayTeamId,
    homeScore: g.homeScore,
    awayScore: g.awayScore,
  }));
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
        talentComposite: decimalLikeToNumber(r.talentComposite),
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
        epaOff: decimalLikeToNumber(r.epaOff),
        epaDef: decimalLikeToNumber(r.epaDef),
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
    async loadV1Ratings(season, fbsTeamIds) {
      const rows = await prisma.teamSeasonRating.findMany({
        where: {
          season,
          modelVersion: MODEL_VERSION_V1,
          teamId: { in: fbsTeamIds },
        },
        select: {
          teamId: true,
          powerRating: true,
          rating: true,
          games: true,
        },
      });
      return rows;
    },
  };
}

export function createPrismaCoreV1LifecycleWriteDeps(
  prisma: PrismaClient
): CoreV1LifecycleWriteDeps {
  return {
    async transaction(fn, options) {
      return prisma.$transaction(
        async (tx) => {
          const store: CoreV1LifecycleReadStore & {
            persist: (
              rows: Array<{
                season: number;
                teamId: string;
                powerRating: number;
                games: number;
              }>
            ) => Promise<{ upserted: number }>;
          } = {
            ...createPrismaCoreV1LifecycleReadStore(
              tx as unknown as PrismaClient
            ),
            persist: (rows) =>
              persistCoreV1LifecycleRatings(
                {
                  teamSeasonRating: {
                    upsert: (args) =>
                      tx.teamSeasonRating.upsert(args as never),
                  },
                },
                rows
              ),
          };
          return fn(store);
        },
        {
          isolationLevel:
            options?.isolationLevel ??
            Prisma.TransactionIsolationLevel.Serializable,
        }
      );
    },
  };
}

export async function runCoreV1Lifecycle(options: {
  season: number;
  completedThroughWeek: number;
  mode: LifecycleMode;
  confirmation: string;
  reportPath: string;
  store: CoreV1LifecycleReadStore;
  writeDeps?: CoreV1LifecycleWriteDeps;
}): Promise<{
  exitCode: number;
  result?: CoreV1LifecycleResult;
  execution: CoreV1LifecycleExecutionState;
}> {
  console.log(`phase=${PHASE}`);
  console.log(`season=${options.season}`);
  console.log(`completedThroughWeek=${options.completedThroughWeek}`);
  console.log(`mode=${options.mode}`);
  console.log(
    `expectedConfirmation=${expectedCoreV1LifecycleConfirmation(options.completedThroughWeek)} (value not echoed from input)`
  );
  console.log('providersInvoked=false');
  console.log('Odds=false');
  console.log('providerCalls=0');
  console.log('CFBD_API_KEY=not provided');
  console.log('ODDS_API_KEY=not provided');

  let execution: CoreV1LifecycleExecutionState = buildPreviewExecution();
  let verification: CoreV1LifecyclePostWriteVerification | null = null;
  let result: CoreV1LifecycleResult | undefined;

  try {
    const fbsIds = await options.store.loadFbsTeamIds(options.season);
    const fbsLower = fbsIds.map((id) => id.toLowerCase());
    const talentRows = await options.store.loadTalentRows(
      options.season,
      fbsLower
    );
    const gamesRaw = await options.store.loadGames(options.season);
    const games = mapGames(gamesRaw);
    const epaRows = await options.store.loadEpaRows(options.season, fbsLower);
    const existing = await options.store.loadExistingV1Fbs(
      options.season,
      fbsLower
    );

    result = buildCoreV1LifecycleEvaluation({
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
      execution = buildPreviewExecution();
      writeReport(options.reportPath, result, execution, null, {
        isolationLevel: null,
      });
      console.log('mutationsInvoked=false');
      console.log('ratingsPersistenceInvoked=false');
      console.log('ratingsWriteAuthorized=false');
      if (!result.ok) {
        console.error('[core-v1-lifecycle] PREVIEW FAILED — gates not met');
        return {
          exitCode: resolvePreviewExitCode(false),
          result,
          execution,
        };
      }
      console.log(
        '[core-v1-lifecycle] PREVIEW COMPLETE — diagnostic only; production COMMIT not authorized by this run'
      );
      return { exitCode: 0, result, execution };
    }

    // COMMIT path — pre-tx evaluation is diagnostic only.
    if (!commitEligibleFromResult(result) || !result.ok) {
      execution = buildFailedCommitExecution({
        error: `COMMIT blocked: writeSafe=${result.writeSafe} confirmationValid=${result.confirmationValid}`,
      });
      writeReport(options.reportPath, result, execution, null, {});
      console.error(
        `[core-v1-lifecycle] COMMIT blocked — require confirmation=${result.expectedConfirmation} and all gates`
      );
      return { exitCode: 1, result, execution };
    }
    if (!options.writeDeps) {
      execution = buildFailedCommitExecution({
        error: 'COMMIT requires write deps',
      });
      writeReport(options.reportPath, result, execution, null, {});
      console.error('[core-v1-lifecycle] COMMIT requires write deps');
      return { exitCode: 1, result, execution };
    }
    if (result.outputCount !== EXPECTED_FBS_COUNT) {
      execution = buildFailedCommitExecution({
        error: 'refuse write: outputCount != 138',
      });
      writeReport(options.reportPath, result, execution, null, {});
      console.error('[core-v1-lifecycle] refuse write: outputCount != 138');
      return { exitCode: 1, result, execution };
    }

    let mutationAttempts = 0;
    try {
      const txOutcome = await options.writeDeps.transaction(
        async (txStore) => {
          const outcome = await executeAtomicCoreV1LifecycleCommit({
            season: options.season,
            completedThroughWeek: options.completedThroughWeek,
            confirmation: options.confirmation,
            loadFbsTeamIds: () => txStore.loadFbsTeamIds(options.season),
            loadTalentRows: (ids) =>
              txStore.loadTalentRows(options.season, ids),
            loadGames: async () => mapGames(await txStore.loadGames(options.season)),
            loadEpaRows: (ids) => txStore.loadEpaRows(options.season, ids),
            loadExistingV1Fbs: (ids) =>
              txStore.loadExistingV1Fbs(options.season, ids),
            persist: async (rows) => {
              mutationAttempts = rows.length;
              return txStore.persist(rows);
            },
            loadAfterV1Ratings: async (ids) => {
              if (txStore.loadV1Ratings) {
                return txStore.loadV1Ratings(options.season, ids);
              }
              throw new Error('loadV1Ratings required for post-write verification');
            },
          });
          return outcome;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

      result = {
        ...txOutcome.result,
        mutationsInvoked: true,
        ratingsPersistenceInvoked: true,
        ratingsWriteAuthorized: true,
      };
      verification = txOutcome.verification;
      execution = buildSuccessfulCommitExecution({
        upsertCount: txOutcome.upserted,
      });
      // Invariant: commitSucceeded=true requires postWriteVerificationSucceeded=true
      if (
        execution.commitSucceeded &&
        execution.postWriteVerificationSucceeded !== true
      ) {
        throw new Error(
          'invariant violated: commitSucceeded without postWriteVerificationSucceeded'
        );
      }
      writeReport(options.reportPath, result, execution, verification, {
        isolationLevel: 'Serializable',
        transactionalVerification: true,
      });
      console.log('mutationsInvoked=true');
      console.log('ratingsPersistenceInvoked=true');
      console.log(`upserted=${txOutcome.upserted}`);
      console.log(
        '[core-v1-lifecycle] COMMIT COMPLETE — TeamSeasonRating season=2026 modelVersion=v1'
      );
      return { exitCode: 0, result, execution };
    } catch (err) {
      const msg = sanitizeCoreV1LifecycleError(err);
      const verificationFailed = /post-write verification failed/i.test(
        err instanceof Error ? err.message : String(err)
      );
      execution = buildRolledBackExecution({
        mutationAttempts,
        error: msg,
        postWriteVerificationSucceeded: verificationFailed ? false : null,
      });
      if (result) {
        writeReport(options.reportPath, result, execution, verification, {
          rolledBack: true,
          isolationLevel: 'Serializable',
          transactionalVerificationFailed: verificationFailed,
        });
      }
      console.error(`[core-v1-lifecycle] ${msg}`);
      return { exitCode: 1, result, execution };
    }
  } catch (err) {
    const msg = sanitizeCoreV1LifecycleError(err);
    console.error(`[core-v1-lifecycle] ${msg}`);
    if (result && !execution.commitAttempted) {
      execution = {
        ...buildPreviewExecution(),
        error: msg,
      };
      writeReport(options.reportPath, result, execution, verification, {
        fatal: true,
      });
    }
    return { exitCode: 1, result, execution };
  }
}

async function main(): Promise<void> {
  const parsed = parseCoreV1LifecycleArgs(process.argv.slice(2));
  if (parsed.ok === false) {
    for (const e of parsed.errors) {
      console.error(`[core-v1-lifecycle] ${e}`);
    }
    console.error(
      'Usage: npx tsx apps/jobs/write-core-v1-lifecycle.ts --season 2026 --completed-through-week 0 --mode PREVIEW --report reports/core-v1-lifecycle.json'
    );
    process.exit(1);
  }

  const reportPath =
    parsed.reportPath ??
    defaultReportPath(parsed.completedThroughWeek, parsed.mode);

  const prisma = new PrismaClient();
  try {
    const { exitCode } = await runCoreV1Lifecycle({
      season: parsed.season,
      completedThroughWeek: parsed.completedThroughWeek,
      mode: parsed.mode,
      confirmation: parsed.confirmation,
      reportPath,
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
