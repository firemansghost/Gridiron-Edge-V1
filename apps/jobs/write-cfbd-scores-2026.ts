/**
 * CLI — Guarded 2026 CFBD score PREVIEW/COMMIT (Phase 2C-2J-6B).
 *
 * PREVIEW: DB read + one CFBD /games call; zero mutations.
 * COMMIT: Serializable transaction updating only homeScore/awayScore/status.
 *
 * Does NOT call venues/Odds/SGO/weather. Does NOT grade. Does NOT write MarketLine/Bet/ratings.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  createPrismaReadOnlyScheduleStore,
  loadCfbdTeamAliases,
  redactSecretLike,
  teamLookupFromStore,
} from './src/preseason/cfbd-schedule-ingest';
import {
  buildFailedScoreCommitExecution,
  buildPreviewExecution,
  buildRolledBackScoreExecution,
  buildSuccessfulScoreCommitExecution,
  buildTransactionalIdempotentScoreExecution,
  commitEligible,
  executeAtomicScoreCommitWithNormalized,
  expectedScoreConfirmation,
  fetchCfbdScoresWeek,
  finalizeScoreReport,
  normalizeProviderScoreGames,
  parseScoreCliArgs,
  planScoreUpdates,
  resolvePreviewExitCode,
  verifyScorePostWrite,
  type DbScoreGameRow,
  type ScoreExecutionState,
  type ScorePlan,
  type ScorePostWriteVerification,
} from './lib/cfbd-scores-2026';

function defaultReportPath(season: number, week: number, mode: string): string {
  return path.join(
    process.cwd(),
    'reports',
    `cfbd-scores-2026-${season}-week-${week}-${mode.toLowerCase()}.json`
  );
}

function writeReport(
  reportPath: string,
  plan: ScorePlan,
  execution: ScoreExecutionState,
  verification: ScorePostWriteVerification | null,
  meta: Record<string, unknown> = {}
): void {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const report = finalizeScoreReport({ plan, execution, verification, meta });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`report=${reportPath}`);
}

function mapDbRows(
  rows: Array<{
    id: string;
    season: number;
    week: number;
    homeTeamId: string;
    awayTeamId: string;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
  }>
): DbScoreGameRow[] {
  return rows.map((r) => ({
    id: r.id,
    season: r.season,
    week: r.week,
    homeTeamId: r.homeTeamId,
    awayTeamId: r.awayTeamId,
    status: r.status,
    homeScore: r.homeScore,
    awayScore: r.awayScore,
  }));
}

async function main(): Promise<void> {
  const parsed = parseScoreCliArgs(process.argv.slice(2));
  if (!parsed.ok || !parsed.args) {
    for (const e of parsed.errors) console.error(e);
    process.exitCode = 1;
    return;
  }
  const args = parsed.args;
  const reportPath =
    args.reportPath ?? defaultReportPath(args.season, args.week, args.mode);

  console.log('============================================================');
  console.log('GUARDED 2026 CFBD SCORE WRITER (2C-2J-6B)');
  console.log('============================================================');
  console.log(`season=${args.season} week=${args.week} mode=${args.mode}`);
  console.log(
    `expectedConfirmation=${expectedScoreConfirmation(args.week)} (value not echoed from input)`
  );
  console.log('PREVIEW IS DATABASE READ-ONLY except CFBD provider read');
  console.log('mutations: Game.homeScore / Game.awayScore / Game.status only');

  if (args.mode === 'COMMIT') {
    // Validate confirmation before provider call (already in parse, but fail loud).
    if (args.confirmation !== expectedScoreConfirmation(args.week)) {
      console.error('COMMIT confirmation invalid — provider call skipped');
      process.exitCode = 1;
      return;
    }
  }

  const apiKey = process.env.CFBD_API_KEY ?? '';
  if (!apiKey.trim()) {
    console.error('CFBD_API_KEY is missing or empty');
    process.exitCode = 1;
    return;
  }

  const url = process.env.DIRECT_URL;
  if (!url) {
    console.error('DIRECT_URL required');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  let execution: ScoreExecutionState = buildPreviewExecution(0);
  let verification: ScorePostWriteVerification | null = null;
  let plan: ScorePlan | null = null;

  try {
    const dbRows = mapDbRows(
      await prisma.game.findMany({
        where: { season: args.season, week: args.week },
        select: {
          id: true,
          season: true,
          week: true,
          homeTeamId: true,
          awayTeamId: true,
          status: true,
          homeScore: true,
          awayScore: true,
        },
      })
    );

    const fetchResult = await fetchCfbdScoresWeek({
      season: args.season,
      week: args.week,
      apiKey,
      baseUrl: process.env.CFBD_BASE_URL,
    });

    const store = createPrismaReadOnlyScheduleStore(prisma);
    const lookup = teamLookupFromStore(store);
    const aliases = loadCfbdTeamAliases();

    const normalizedResult = await normalizeProviderScoreGames({
      season: args.season,
      week: args.week,
      providerGames: fetchResult.games,
      teamLookup: lookup,
      aliases,
    });

    plan = planScoreUpdates({
      season: args.season,
      week: args.week,
      mode: args.mode,
      confirmation: args.confirmation,
      normalized: normalizedResult.normalized,
      dbGames: dbRows,
      providerRows: fetchResult.games.length,
      providerHttpStatus: fetchResult.httpStatus,
      providerCalls: fetchResult.providerCalls,
      unresolvedTeams: normalizedResult.unresolvedTeams,
      duplicateGames: normalizedResult.duplicateGames,
      extraBlockers: normalizedResult.blockers,
    });

    console.log(
      `writeSafe=${plan.writeSafe} providerFbs=${plan.counts.providerFbsGames} db=${plan.counts.dbGames} planned=${plan.counts.plannedUpdates} blockers=${plan.blockers.length}`
    );
    if (plan.blockers.length) {
      console.log(`blockers=${plan.blockers.join(' | ')}`);
    }

    if (args.mode === 'PREVIEW') {
      execution = buildPreviewExecution(plan.providerCalls);
      writeReport(reportPath, plan, execution, null, {});
      process.exitCode = resolvePreviewExitCode(plan.writeSafe);
      return;
    }

    if (!commitEligible(plan)) {
      execution = buildFailedScoreCommitExecution({
        providerCalls: plan.providerCalls,
        error: `COMMIT blocked: writeSafe=${plan.writeSafe} confirmationValid=${plan.confirmationValid}`,
      });
      writeReport(reportPath, plan, execution, null, {});
      process.exitCode = 1;
      return;
    }

    let updateCount = 0;
    /** Incremented immediately before each tx.game.update() (truthful attempt audit). */
    let txMutationAttempts = 0;
    let beforeDb = dbRows;
    const normalized = normalizedResult.normalized;

    try {
      const txResult = await prisma.$transaction(
        async (tx) => {
          const result = await executeAtomicScoreCommitWithNormalized({
            plan: plan!,
            normalized,
            reReadDbGames: async () =>
              mapDbRows(
                await tx.game.findMany({
                  where: { season: args.season, week: args.week },
                  select: {
                    id: true,
                    season: true,
                    week: true,
                    homeTeamId: true,
                    awayTeamId: true,
                    status: true,
                    homeScore: true,
                    awayScore: true,
                  },
                })
              ),
            updateGameScores: async (row) => {
              txMutationAttempts += 1;
              await tx.game.update({
                where: { id: row.gameId },
                data: {
                  homeScore: row.homeScore,
                  awayScore: row.awayScore,
                  status: row.status,
                },
              });
            },
          });
          return result;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      updateCount = txResult.updateCount;
      beforeDb = txResult.beforeDb;
      plan = txResult.rePlan;
    } catch (err) {
      const msg = redactSecretLike(
        err instanceof Error ? err.message : String(err)
      );
      execution = buildRolledBackScoreExecution({
        providerCalls: plan.providerCalls,
        gameMutationAttempts: txMutationAttempts,
        error: msg,
      });
      writeReport(reportPath, plan, execution, null, {
        rolledBack: true,
        isolationLevel: 'Serializable',
      });
      throw err;
    }

    const afterRows = mapDbRows(
      await prisma.game.findMany({
        where: { season: args.season, week: args.week },
        select: {
          id: true,
          season: true,
          week: true,
          homeTeamId: true,
          awayTeamId: true,
          status: true,
          homeScore: true,
          awayScore: true,
        },
      })
    );

    verification = verifyScorePostWrite({
      normalized,
      dbGamesBefore: beforeDb,
      dbGamesAfter: afterRows,
    });

    if (updateCount === 0 && txMutationAttempts === 0) {
      if (!verification.ok) {
        execution = {
          ...buildTransactionalIdempotentScoreExecution(plan.providerCalls),
          postWriteVerificationSucceeded: false,
          error: `idempotent COMMIT verification failed: ${verification.reasons.join('; ')}`,
        };
        writeReport(reportPath, plan, execution, verification, {
          transactionalIdempotentNoOp: true,
        });
        process.exitCode = 1;
        return;
      }
      execution = buildTransactionalIdempotentScoreExecution(plan.providerCalls);
      writeReport(reportPath, plan, execution, verification, {
        transactionalIdempotentNoOp: true,
        isolationLevel: 'Serializable',
      });
      console.log('COMMIT transactional idempotent no-op');
      return;
    }

    if (!verification.ok) {
      execution = buildSuccessfulScoreCommitExecution({
        providerCalls: plan.providerCalls,
        gameUpdateCount: updateCount,
        postWriteVerificationSucceeded: false,
        error: `post-write verification failed: ${verification.reasons.join('; ')}`,
      });
      writeReport(reportPath, plan, execution, verification, {
        verificationFailed: true,
      });
      process.exitCode = 1;
      return;
    }

    execution = buildSuccessfulScoreCommitExecution({
      providerCalls: plan.providerCalls,
      gameUpdateCount: updateCount,
      postWriteVerificationSucceeded: true,
    });
    writeReport(reportPath, plan, execution, verification, {
      isolationLevel: 'Serializable',
    });
    console.log(`COMMIT succeeded: gameUpdateCount=${updateCount}`);
  } catch (err) {
    const msg = redactSecretLike(
      err instanceof Error ? err.message : String(err)
    );
    console.error(msg);
    if (plan) {
      if (!execution.commitAttempted) {
        execution = {
          ...buildPreviewExecution(plan.providerCalls),
          error: msg,
        };
      }
      writeReport(reportPath, plan, execution, verification, { fatal: true });
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(redactSecretLike(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
