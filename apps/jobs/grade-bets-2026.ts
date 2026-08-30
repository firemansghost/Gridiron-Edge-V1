/**
 * CLI — Guarded 2026 official_flat_100 bet grading PREVIEW/COMMIT (Phase 2C-2J-6C-1).
 *
 * PREVIEW: DB read-only; zero mutations; zero provider calls.
 * COMMIT: Serializable transaction updating only Bet.result / Bet.pnl / Bet.clv.
 *
 * Does NOT call CFBD/Odds/SGO/weather. Does NOT mutate closePrice, Game, MarketLine, ratings.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  OFFICIAL_SOURCE,
  OFFICIAL_STRATEGY_TAG,
  buildFailedGradeCommitExecution,
  buildPreviewExecution,
  buildRolledBackGradeExecution,
  buildSuccessfulGradeCommitExecution,
  buildTransactionalIdempotentGradeExecution,
  commitEligible,
  executeAtomicOfficialGradeCommit,
  expectedGradeConfirmation,
  finalizeGradeReport,
  parseGradeCliArgs,
  planOfficialGrades,
  redactSecretLike,
  resolvePreviewExitCode,
  verifyGradePostWrite,
  type GradeBetRow,
  type GradeExecutionState,
  type GradePlan,
  type GradePostWriteVerification,
  type NonTargetBetSnapshot,
} from './lib/grade-bets-2026';

function defaultReportPath(season: number, week: number, mode: string): string {
  return path.join(
    process.cwd(),
    'reports',
    `grade-bets-2026-${season}-week-${week}-${mode.toLowerCase()}.json`
  );
}

function writeReport(
  reportPath: string,
  plan: GradePlan,
  execution: GradeExecutionState,
  verification: GradePostWriteVerification | null,
  meta: Record<string, unknown> = {}
): void {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const report = finalizeGradeReport({ plan, execution, verification, meta });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`report=${reportPath}`);
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapOfficialBet(row: {
  id: string;
  season: number;
  week: number;
  gameId: string;
  marketType: string;
  side: string;
  modelPrice: unknown;
  closePrice: unknown;
  stake: unknown;
  result: string | null;
  pnl: unknown;
  clv: unknown;
  strategyTag: string;
  source: string;
  game: {
    id: string;
    season: number;
    week: number;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
  };
}): GradeBetRow {
  return {
    id: row.id,
    season: row.season,
    week: row.week,
    gameId: row.gameId,
    marketType: row.marketType,
    side: row.side,
    modelPrice: toNum(row.modelPrice),
    closePrice: toNum(row.closePrice),
    stake: toNum(row.stake) ?? Number.NaN,
    result: row.result,
    pnl: toNum(row.pnl),
    clv: toNum(row.clv),
    strategyTag: row.strategyTag,
    source: row.source,
    game: {
      id: row.game.id,
      season: row.game.season,
      week: row.game.week,
      status: row.game.status,
      homeScore: row.game.homeScore,
      awayScore: row.game.awayScore,
    },
  };
}

function mapNonTarget(row: {
  id: string;
  strategyTag: string;
  source: string;
  result: string | null;
  pnl: unknown;
  clv: unknown;
  closePrice: unknown;
  modelPrice: unknown;
  stake: unknown;
}): NonTargetBetSnapshot {
  return {
    id: row.id,
    strategyTag: row.strategyTag,
    source: row.source,
    result: row.result,
    pnl: toNum(row.pnl),
    clv: toNum(row.clv),
    closePrice: toNum(row.closePrice),
    modelPrice: toNum(row.modelPrice),
    stake: toNum(row.stake) ?? Number.NaN,
  };
}

async function loadOfficial(
  prisma: PrismaClient | Prisma.TransactionClient,
  season: number,
  week: number
): Promise<GradeBetRow[]> {
  const rows = await prisma.bet.findMany({
    where: {
      season,
      week,
      source: OFFICIAL_SOURCE,
      strategyTag: OFFICIAL_STRATEGY_TAG,
    },
    include: {
      game: {
        select: {
          id: true,
          season: true,
          week: true,
          status: true,
          homeScore: true,
          awayScore: true,
        },
      },
    },
    orderBy: { id: 'asc' },
  });
  return rows.map(mapOfficialBet);
}

async function loadNonTarget(
  prisma: PrismaClient | Prisma.TransactionClient,
  season: number,
  week: number
): Promise<NonTargetBetSnapshot[]> {
  const rows = await prisma.bet.findMany({
    where: {
      season,
      week,
      NOT: {
        AND: [{ source: OFFICIAL_SOURCE }, { strategyTag: OFFICIAL_STRATEGY_TAG }],
      },
    },
    select: {
      id: true,
      strategyTag: true,
      source: true,
      result: true,
      pnl: true,
      clv: true,
      closePrice: true,
      modelPrice: true,
      stake: true,
    },
    orderBy: { id: 'asc' },
  });
  return rows.map(mapNonTarget);
}

async function main(): Promise<void> {
  const parsed = parseGradeCliArgs(process.argv.slice(2));
  if (!parsed.ok || !parsed.args) {
    for (const e of parsed.errors) console.error(e);
    process.exitCode = 1;
    return;
  }
  const args = parsed.args;
  const reportPath =
    args.reportPath ?? defaultReportPath(args.season, args.week, args.mode);

  console.log('============================================================');
  console.log('GUARDED 2026 OFFICIAL BET GRADING (2C-2J-6C-1)');
  console.log('============================================================');
  console.log(`season=${args.season} week=${args.week} mode=${args.mode}`);
  console.log(
    `expectedConfirmation=${expectedGradeConfirmation(args.week)} (value not echoed from input)`
  );
  console.log(`strategyTag=${OFFICIAL_STRATEGY_TAG} source=${OFFICIAL_SOURCE}`);
  console.log('PREVIEW IS DATABASE READ-ONLY; mutations: Bet.result/pnl/clv only');
  console.log('providerCalls=0');

  if (args.mode === 'COMMIT') {
    if (args.confirmation !== expectedGradeConfirmation(args.week)) {
      console.error('COMMIT confirmation invalid — DB write skipped');
      process.exitCode = 1;
      return;
    }
  }

  const url = process.env.DIRECT_URL;
  if (!url) {
    console.error('DIRECT_URL required');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  let execution: GradeExecutionState = buildPreviewExecution();
  let verification: GradePostWriteVerification | null = null;
  let plan: GradePlan | null = null;

  try {
    const officialBets = await loadOfficial(prisma, args.season, args.week);
    const nonTargetBets = await loadNonTarget(prisma, args.season, args.week);

    plan = planOfficialGrades({
      season: args.season,
      week: args.week,
      mode: args.mode,
      confirmation: args.confirmation,
      officialBets,
      nonTargetBets,
    });

    console.log(
      `writeSafe=${plan.writeSafe} official=${plan.counts.officialBets} planned=${plan.counts.plannedUpdates} pendingGame=${plan.counts.pendingGame} blockers=${plan.blockers.length}`
    );
    if (plan.blockers.length) {
      console.log(`blockers=${plan.blockers.join(' | ')}`);
    }

    if (args.mode === 'PREVIEW') {
      execution = buildPreviewExecution();
      writeReport(reportPath, plan, execution, null, { previewReadOnly: true });
      process.exitCode = resolvePreviewExitCode(plan.writeSafe);
      return;
    }

    if (!commitEligible(plan)) {
      execution = buildFailedGradeCommitExecution({
        error: `COMMIT blocked: writeSafe=${plan.writeSafe} confirmationValid=${plan.confirmationValid}`,
      });
      writeReport(reportPath, plan, execution, null, {});
      process.exitCode = 1;
      return;
    }

    let updateCount = 0;
    let txMutationAttempts = 0;

    try {
      const txResult = await prisma.$transaction(
        async (tx) => {
          return executeAtomicOfficialGradeCommit({
            plan: plan!,
            reReadOfficialBets: () => loadOfficial(tx, args.season, args.week),
            reReadNonTargetBets: () => loadNonTarget(tx, args.season, args.week),
            updateBetGrade: async (row) => {
              txMutationAttempts += 1;
              const res = await tx.bet.updateMany({
                where: { id: row.betId, result: null },
                data: {
                  result: row.result,
                  pnl: row.pnl,
                  clv: row.clv,
                },
              });
              return { count: res.count };
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      updateCount = txResult.updateCount;
      plan = txResult.rePlan;
    } catch (err) {
      const msg = redactSecretLike(
        err instanceof Error ? err.message : String(err)
      );
      execution = buildRolledBackGradeExecution({
        betMutationAttempts: txMutationAttempts,
        error: msg,
      });
      writeReport(reportPath, plan, execution, null, {
        rolledBack: true,
        isolationLevel: 'Serializable',
      });
      throw err;
    }

    const afterOfficial = await loadOfficial(prisma, args.season, args.week);
    const afterNonTarget = await loadNonTarget(prisma, args.season, args.week);

    verification = verifyGradePostWrite({
      plan,
      officialBetsAfter: afterOfficial,
      nonTargetBetsAfter: afterNonTarget,
    });

    if (updateCount === 0 && txMutationAttempts === 0) {
      if (!verification.ok) {
        execution = {
          ...buildTransactionalIdempotentGradeExecution(),
          postWriteVerificationSucceeded: false,
          error: `idempotent COMMIT verification failed: ${verification.reasons.join('; ')}`,
        };
        writeReport(reportPath, plan, execution, verification, {
          transactionalIdempotentNoOp: true,
        });
        process.exitCode = 1;
        return;
      }
      execution = buildTransactionalIdempotentGradeExecution();
      writeReport(reportPath, plan, execution, verification, {
        transactionalIdempotentNoOp: true,
        isolationLevel: 'Serializable',
      });
      console.log('COMMIT transactional idempotent no-op');
      return;
    }

    if (!verification.ok) {
      execution = buildSuccessfulGradeCommitExecution({
        betUpdateCount: updateCount,
        postWriteVerificationSucceeded: false,
        error: `post-write verification failed: ${verification.reasons.join('; ')}`,
      });
      writeReport(reportPath, plan, execution, verification, {
        verificationFailed: true,
      });
      process.exitCode = 1;
      return;
    }

    execution = buildSuccessfulGradeCommitExecution({
      betUpdateCount: updateCount,
      postWriteVerificationSucceeded: true,
    });
    writeReport(reportPath, plan, execution, verification, {
      isolationLevel: 'Serializable',
    });
    console.log(`COMMIT succeeded: betUpdateCount=${updateCount}`);
  } catch (err) {
    const msg = redactSecretLike(
      err instanceof Error ? err.message : String(err)
    );
    console.error(msg);
    if (plan) {
      if (!execution.commitAttempted) {
        execution = { ...buildPreviewExecution(), error: msg };
      }
      writeReport(reportPath, plan, execution, verification, { fatal: true });
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(
    redactSecretLike(err instanceof Error ? err.message : String(err))
  );
  process.exit(1);
});
