/**
 * CLI — Guarded 2026 Core V1 Weekly Card PREVIEW/COMMIT (Phase 2C-2J-5).
 *
 * PREVIEW: DB reads only; zero mutations; providerCalls=0.
 * COMMIT: atomic append-safe createMany of official_flat_100 only (or idempotent NO-OP).
 * Optional --kickoff-before (exclusive ISO-8601 upper bound) for split-slate tranches.
 *
 * Does NOT call Odds/CFBD/SGO/weather. No ratings/Game/MarketLine/score writes.
 * Does NOT write hybrid_v2 / v4 / Fade. Does NOT update/delete prior Bet rows.
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  getCoreV1SpreadFromTeams,
} from '../web/lib/core-v1-spread';
import {
  indexGameMarketSelections,
  type MarketLineObservation,
} from '../web/lib/market-line-snapshot';
import {
  AUTHORITATIVE_FBS_COUNT,
  CORE_CARD_SEASON,
  CORE_CARD_STRATEGY_TAG,
  LIVE_ODDS_SOURCE,
  buildCoreWeeklyCardPlan,
  buildFailedCommitExecution,
  buildIdempotentNoOpExecution,
  buildPreviewExecution,
  buildSuccessfulCommitExecution,
  buildCommittedVerificationFailureExecution,
  buildRolledBackTransactionExecution,
  commitEligible,
  executeAtomicAppendCommit,
  expectedWriteConfirmation,
  finalizeCoreCardReport,
  isIdempotentNoOp,
  parseKickoffBefore,
  resolvePreviewExitCode,
  verifyCoreCardPostWrite,
  type CoreCardExecutionState,
  type CoreCardMode,
  type CoreCardPostWriteVerification,
  type CoreWeeklyCardPlan,
  type ExistingOfficialBetRow,
  type WeeklyCardGameInput,
} from '../web/lib/core-v1-weekly-card';

function parseArgs(argv: string[]): {
  season: number;
  week: number;
  mode: CoreCardMode;
  confirmation: string;
  kickoffBefore: string;
  reportPath?: string;
} {
  let season = CORE_CARD_SEASON;
  let week = 1;
  let mode: CoreCardMode = 'PREVIEW';
  let confirmation = '';
  let kickoffBefore = '';
  let reportPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--season') season = Number(argv[++i]);
    else if (a === '--week') week = Number(argv[++i]);
    else if (a === '--mode') mode = String(argv[++i]).toUpperCase() as CoreCardMode;
    else if (a === '--confirm' || a === '--confirmation')
      confirmation = String(argv[++i] ?? '');
    else if (a === '--kickoff-before') kickoffBefore = String(argv[++i] ?? '');
    else if (a === '--report') reportPath = String(argv[++i]);
  }

  return { season, week, mode, confirmation, kickoffBefore, reportPath };
}

function defaultReportPath(season: number, week: number, mode: CoreCardMode): string {
  return path.join(
    process.cwd(),
    'reports',
    `core-v1-weekly-card-2026-${season}-week-${week}-${mode.toLowerCase()}.json`
  );
}

function writeReport(
  reportPath: string,
  plan: CoreWeeklyCardPlan,
  execution: CoreCardExecutionState,
  verification: CoreCardPostWriteVerification | null,
  meta: Record<string, unknown>
): void {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const report = finalizeCoreCardReport({ plan, execution, verification, meta });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`report=${reportPath}`);
  console.log(
    `execution.mutationsInvoked=${execution.mutationsInvoked} betPersistence=${execution.betPersistenceInvoked} commitSucceeded=${execution.commitSucceeded} providerCalls=0`
  );
}

function mapExisting(rows: Array<{
  id: string;
  season: number;
  week: number;
  gameId: string;
  marketType: string;
  side: string;
  modelPrice: unknown;
  closePrice: unknown;
  stake: unknown;
  source: string;
  strategyTag: string;
  result: string | null;
  pnl: unknown;
  clv: unknown;
  hybridConflictType: string | null;
}>): ExistingOfficialBetRow[] {
  return rows.map((r) => ({
    id: r.id,
    season: r.season,
    week: r.week,
    gameId: r.gameId,
    marketType: r.marketType,
    side: r.side,
    modelPrice: Number(r.modelPrice),
    closePrice: r.closePrice === null || r.closePrice === undefined ? null : Number(r.closePrice),
    stake: Number(r.stake),
    source: r.source,
    strategyTag: r.strategyTag,
    result: r.result,
    pnl: r.pnl === null || r.pnl === undefined ? null : Number(r.pnl),
    clv: r.clv === null || r.clv === undefined ? null : Number(r.clv),
    hybridConflictType: r.hybridConflictType,
  }));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const reportPath =
    args.reportPath ?? defaultReportPath(args.season, args.week, args.mode);

  console.log('============================================================');
  console.log('GUARDED 2026 CORE V1 WEEKLY CARD');
  console.log('============================================================');
  console.log(`season=${args.season} week=${args.week} mode=${args.mode}`);
  console.log('PREVIEW IS DATABASE READ-ONLY; providerCalls=0');
  console.log(
    `expectedConfirmation=${expectedWriteConfirmation(args.week)} (value not echoed from input)`
  );
  console.log(
    `strategyTag=${CORE_CARD_STRATEGY_TAG} only; hybrid/v4/fade forbidden`
  );
  if (args.kickoffBefore.trim()) {
    console.log(`kickoff_before=${args.kickoffBefore.trim()} (exclusive upper bound)`);
  } else {
    console.log('kickoff_before=(none)');
  }

  if (args.season !== CORE_CARD_SEASON) {
    throw new Error(`season must be ${CORE_CARD_SEASON}`);
  }
  if (!Number.isInteger(args.week) || args.week < 1) {
    throw new Error('week must be a positive integer');
  }
  if (args.mode !== 'PREVIEW' && args.mode !== 'COMMIT') {
    throw new Error('mode must be PREVIEW or COMMIT');
  }
  const kickoffParsed = parseKickoffBefore(args.kickoffBefore);
  if (!kickoffParsed.ok) {
    throw new Error(kickoffParsed.reason ?? 'invalid kickoff_before');
  }

  const url = process.env.DIRECT_URL;
  if (!url) {
    throw new Error('DIRECT_URL required');
  }

  const prisma = new PrismaClient({
    datasources: { db: { url } },
  });

  let execution: CoreCardExecutionState = buildPreviewExecution(args.mode);
  let verification: CoreCardPostWriteVerification | null = null;
  let plan: CoreWeeklyCardPlan | null = null;

  try {
    const executionNow = new Date();

    const fbsCount = await prisma.teamMembership.count({
      where: { season: args.season, level: 'fbs' },
    });

    const games = await prisma.game.findMany({
      where: { season: args.season, week: args.week },
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
      },
      orderBy: { date: 'asc' },
    });

    const membershipRows = await prisma.teamMembership.findMany({
      where: { season: args.season, level: 'fbs' },
      select: { teamId: true },
    });
    const fbsSet = new Set(membershipRows.map((m) => m.teamId));

    const ratings = await prisma.teamSeasonRating.findMany({
      where: { season: args.season, modelVersion: 'v1' },
      select: { teamId: true, powerRating: true, rating: true },
    });
    const ratingByTeam = new Map<string, typeof ratings[0]>();
    const duplicateRatingTeamIds: string[] = [];
    for (const r of ratings) {
      if (ratingByTeam.has(r.teamId)) duplicateRatingTeamIds.push(r.teamId);
      ratingByTeam.set(r.teamId, r);
    }

    const teamIdsNeeded = new Set<string>();
    for (const g of games) {
      teamIdsNeeded.add(g.homeTeamId);
      teamIdsNeeded.add(g.awayTeamId);
    }
    const missingRatingTeamIds: string[] = [];
    for (const tid of Array.from(teamIdsNeeded)) {
      const row = ratingByTeam.get(tid);
      if (
        !row ||
        !Number.isFinite(Number(row.powerRating ?? row.rating))
      ) {
        missingRatingTeamIds.push(tid);
      }
    }

    const gameIds = games.map((g) => g.id);
    const marketLines =
      gameIds.length === 0
        ? []
        : await prisma.marketLine.findMany({
            where: {
              gameId: { in: gameIds },
              source: LIVE_ODDS_SOURCE,
            },
            select: {
              id: true,
              gameId: true,
              lineType: true,
              lineValue: true,
              bookName: true,
              timestamp: true,
              teamId: true,
              source: true,
            },
          });

    const observations: MarketLineObservation[] = marketLines.map((r) => ({
      id: r.id,
      gameId: r.gameId,
      lineType: r.lineType,
      lineValue: Number(r.lineValue),
      bookName: r.bookName,
      timestamp: r.timestamp,
      teamId: r.teamId,
      source: r.source,
    }));

    const byGame = indexGameMarketSelections({
      rows: observations,
      games: games.map((g) => ({
        gameId: g.id,
        homeTeamId: g.homeTeamId,
        awayTeamId: g.awayTeamId,
        kickoff: g.date,
        status: g.status,
      })),
    });

    const gameInputs: WeeklyCardGameInput[] = [];
    for (const g of games) {
      const homeRating = ratingByTeam.get(g.homeTeamId);
      const awayRating = ratingByTeam.get(g.awayTeamId);
      let coreSpreadHma = NaN;
      if (homeRating && awayRating) {
        try {
          const info = await getCoreV1SpreadFromTeams(
            args.season,
            g.homeTeamId,
            g.awayTeamId,
            Boolean(g.neutralSite),
            g.homeTeam.name,
            g.awayTeam.name
          );
          coreSpreadHma = info.coreSpreadHma;
        } catch {
          coreSpreadHma = NaN;
        }
      }

      const sel = byGame.get(g.id);
      if (!sel) continue;

      gameInputs.push({
        gameId: g.id,
        season: args.season,
        week: args.week,
        status: g.status,
        kickoff: g.date,
        homeTeamId: g.homeTeamId,
        awayTeamId: g.awayTeamId,
        homeTeamName: g.homeTeam.name,
        awayTeamName: g.awayTeam.name,
        bothFbs: fbsSet.has(g.homeTeamId) && fbsSet.has(g.awayTeamId),
        coreSpreadHma,
        marketSelection: sel,
      });
    }

    const officialRows = await prisma.bet.findMany({
      where: {
        season: args.season,
        week: args.week,
        strategyTag: CORE_CARD_STRATEGY_TAG,
      },
    });
    const hybridRows = await prisma.bet.findMany({
      where: {
        season: args.season,
        week: args.week,
        strategyTag: 'hybrid_v2',
      },
    });

    plan = buildCoreWeeklyCardPlan({
      season: args.season,
      week: args.week,
      mode: args.mode,
      confirmation: args.confirmation,
      executionNow,
      kickoffBefore: kickoffParsed.value,
      fbsMembershipCount: fbsCount,
      games: gameInputs,
      existingOfficial: mapExisting(officialRows),
      existingHybrid: mapExisting(hybridRows),
      missingRatingTeamIds,
      duplicateRatingTeamIds,
    });

    console.log(
      `writeSafe=${plan.writeSafe} planned=${plan.counts.totalPlannedBets} newPlanned=${plan.counts.newPlannedBets} selected=${plan.counts.selectedGames} eligible=${plan.counts.eligibleGames} tracked=${plan.counts.games} existingOfficial=${plan.counts.existingOfficial} existingHybrid=${plan.counts.existingHybrid} safety=${plan.existingSafety.mode}`
    );
    if (plan.writeBlockers.length) {
      console.log(`writeBlockers=${plan.writeBlockers.join(' | ')}`);
    }

    if (args.mode === 'PREVIEW') {
      execution = buildPreviewExecution('PREVIEW');
      writeReport(reportPath, plan, execution, null, {
        fbsMembershipCount: fbsCount,
        authoritativeFbs: AUTHORITATIVE_FBS_COUNT,
      });
      console.log(
        'PREVIEW complete — DB unchanged; providerCalls=0; see report for writeSafe'
      );
      // Artifact written first; unsafe PREVIEW must fail the workflow (Odds pattern).
      process.exitCode = resolvePreviewExitCode(plan.writeSafe);
      return;
    }

    // COMMIT
    if (isIdempotentNoOp(plan) && plan.confirmationValid) {
      execution = buildIdempotentNoOpExecution();
      verification = verifyCoreCardPostWrite({
        plannedBets: plan.plannedBets,
        newPlannedBets: [],
        createManyCount: 0,
        beforeOfficial: mapExisting(officialRows),
        afterOfficial: mapExisting(officialRows),
        afterHybrid: mapExisting(hybridRows),
      });
      writeReport(reportPath, plan, execution, verification, {
        idempotentNoOp: true,
        safetyMode: plan.existingSafety.mode,
      });
      return;
    }

    if (!commitEligible(plan)) {
      execution = buildFailedCommitExecution({
        error: `COMMIT blocked: writeSafe=${plan.writeSafe} confirmationValid=${plan.confirmationValid} existingSafety=${plan.existingSafety.mode} planned=${plan.plannedBets.length} newPlanned=${plan.newPlannedBets.length}`,
      });
      writeReport(reportPath, plan, execution, null, {});
      process.exitCode = 1;
      return;
    }

    let createManyCount = 0;
    let beforeOfficialSnapshot: ExistingOfficialBetRow[] = mapExisting(officialRows);
    let newPlannedAtCommit = plan.newPlannedBets;
    let transactionPersisted = false;
    let txMutationInvoked = false;
    let txCreateManyCount: number | null = null;

    // --- A. TRANSACTION PHASE ---
    try {
      const txResult = await prisma.$transaction(async (tx) => {
        const result = await executeAtomicAppendCommit({
          plannedBets: plan!.plannedBets,
          trackedGameIds: gameInputs.map((g) => g.gameId),
          reReadOfficial: async () =>
            mapExisting(
              await tx.bet.findMany({
                where: {
                  season: args.season,
                  week: args.week,
                  strategyTag: CORE_CARD_STRATEGY_TAG,
                },
              })
            ),
          reReadHybrid: async () =>
            mapExisting(
              await tx.bet.findMany({
                where: {
                  season: args.season,
                  week: args.week,
                  strategyTag: 'hybrid_v2',
                },
              })
            ),
          createMany: async (rows) => {
            // Track invocation even if later assert/rollback aborts the transaction.
            txMutationInvoked = true;
            const created = await tx.bet.createMany({
              data: rows.map((r) => ({
                ...r,
                modelPrice: r.modelPrice,
                closePrice: r.closePrice,
                stake: r.stake,
              })),
            });
            txCreateManyCount = created.count;
            return created;
          },
        });
        return result;
      });
      createManyCount = txResult.count;
      beforeOfficialSnapshot = txResult.beforeOfficial;
      newPlannedAtCommit = txResult.newPlannedBets;
      transactionPersisted = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Transaction rolled back — ZERO Bet rows committed.
      // Truthfully report whether createMany was reached (mutation attempted != committed).
      execution = buildRolledBackTransactionExecution({
        createManyInvoked: txMutationInvoked,
        createManyCount: txCreateManyCount,
        error: msg,
      });
      writeReport(reportPath, plan, execution, null, {
        persistenceHappened: false,
        rolledBack: true,
        mutationAttempted: txMutationInvoked,
        persistenceCommitted: false,
      });
      throw err;
    }

    // Idempotent race: transaction found nothing missing and skipped createMany.
    if (createManyCount === 0 && !txMutationInvoked) {
      execution = buildIdempotentNoOpExecution();
      verification = verifyCoreCardPostWrite({
        plannedBets: plan.plannedBets,
        newPlannedBets: [],
        createManyCount: 0,
        beforeOfficial: beforeOfficialSnapshot,
        afterOfficial: beforeOfficialSnapshot,
        afterHybrid: mapExisting(hybridRows),
      });
      writeReport(reportPath, plan, execution, verification, {
        idempotentNoOp: true,
        raceSafeNoOp: true,
      });
      return;
    }

    // --- B. TRANSACTION SUCCESS: persistence happened. Never revert these flags. ---
    // --- C. POST-WRITE VERIFICATION (separate from transaction) ---
    try {
      const afterOfficial = mapExisting(
        await prisma.bet.findMany({
          where: {
            season: args.season,
            week: args.week,
            strategyTag: CORE_CARD_STRATEGY_TAG,
          },
        })
      );
      const afterHybrid = mapExisting(
        await prisma.bet.findMany({
          where: {
            season: args.season,
            week: args.week,
            strategyTag: 'hybrid_v2',
          },
        })
      );

      verification = verifyCoreCardPostWrite({
        plannedBets: plan.plannedBets,
        newPlannedBets: newPlannedAtCommit,
        createManyCount,
        beforeOfficial: beforeOfficialSnapshot,
        afterOfficial,
        afterHybrid,
      });

      if (!verification.ok) {
        execution = buildCommittedVerificationFailureExecution({
          createManyCount,
          error: `BET ROWS MAY / DO EXIST — transaction committed; post-write verification failed: ${verification.reasons.join('; ')}`,
        });
        writeReport(reportPath, plan, execution, verification, {
          persistenceHappened: true,
          transactionCommitted: true,
          verificationFailed: true,
          rolledBack: false,
        });
        console.error(
          'COMMIT persisted bets but post-write verification failed — see report (NOT a rollback)'
        );
        process.exitCode = 1;
        return;
      }

      execution = buildSuccessfulCommitExecution({
        createManyCount,
        postWriteVerificationSucceeded: true,
      });
      writeReport(reportPath, plan, execution, verification, {
        persistenceHappened: true,
        transactionCommitted: true,
        verificationFailed: false,
      });
      console.log(
        `COMMIT succeeded: inserted=${createManyCount} existingBefore=${beforeOfficialSnapshot.length} rowsAfter=${verification.rowsAfter}`
      );
      if (!transactionPersisted) {
        process.exitCode = 1;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      execution = buildCommittedVerificationFailureExecution({
        createManyCount,
        error: `BET ROWS MAY / DO EXIST — transaction committed; verification read/error: ${msg}`,
      });
      writeReport(reportPath, plan, execution, null, {
        persistenceHappened: true,
        transactionCommitted: true,
        verificationReadFailed: true,
        rolledBack: false,
      });
      console.error(
        'COMMIT persisted bets but verification read failed — see report (NOT a rollback)'
      );
      process.exitCode = 1;
      return;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
