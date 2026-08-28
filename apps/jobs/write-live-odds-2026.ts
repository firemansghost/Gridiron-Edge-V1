/**
 * CLI — Guarded 2026 Live Odds PREVIEW/COMMIT (Phase 2C-2J-2).
 *
 * PREVIEW: one Odds API live call + DB reads; no MarketLine writes.
 * COMMIT: new live snapshot + append-only createMany of validated new rows.
 *
 * Final audit report is written AFTER persistence verification (COMMIT) or
 * with explicit non-persistence execution flags (PREVIEW).
 *
 * Does NOT invoke seed-ratings / CFBD / SGO / weather / bets / schedules / scores / unit grades.
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { OddsApiAdapter } from './adapters/OddsApiAdapter';
import { TeamResolver } from './adapters/TeamResolver';
import {
  AUTHORITATIVE_FBS_COUNT,
  LIVE_ODDS_MARKETS,
  LIVE_ODDS_REGION,
  LIVE_ODDS_SEASON,
  LIVE_ODDS_SOURCE,
  MAX_EXPECTED_REQUEST_CREDITS,
  buildFailedCommitExecution,
  buildLiveOddsPlan,
  buildPreviewExecution,
  buildSuccessfulCommitExecution,
  commitEligible,
  expectedWriteConfirmation,
  finalizeLiveOddsReport,
  fingerprintKey,
  verifyInsertedFingerprints,
  type CandidateMarketLine,
  type LiveOddsExecutionState,
  type LiveOddsMode,
  type LiveOddsPlan,
  type LiveOddsPostWriteVerification,
} from './src/odds/live-odds-2026';

function parseArgs(argv: string[]): {
  season: number;
  week: number;
  mode: LiveOddsMode;
  confirmation: string;
  reportPath?: string;
} {
  let season = LIVE_ODDS_SEASON;
  let week = 1;
  let mode: LiveOddsMode = 'PREVIEW';
  let confirmation = '';
  let reportPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--season') season = Number(argv[++i]);
    else if (a === '--week') week = Number(argv[++i]);
    else if (a === '--mode') mode = String(argv[++i]).toUpperCase() as LiveOddsMode;
    else if (a === '--confirm' || a === '--confirmation') confirmation = String(argv[++i] ?? '');
    else if (a === '--report') reportPath = String(argv[++i]);
  }

  return { season, week, mode, confirmation, reportPath };
}

function defaultReportPath(week: number, mode: LiveOddsMode): string {
  return path.join(
    process.cwd(),
    'reports',
    `live-odds-2026-w${week}-${mode.toLowerCase()}.json`
  );
}

function writeReport(
  reportPath: string,
  plan: LiveOddsPlan,
  execution: LiveOddsExecutionState,
  verification: LiveOddsPostWriteVerification | null,
  meta: Record<string, unknown>
): void {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const report = finalizeLiveOddsReport({
    plan,
    execution,
    verification,
    meta,
  });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`report=${reportPath}`);
  console.log(
    `execution.mutationsInvoked=${execution.mutationsInvoked} persistence=${execution.marketLinePersistenceInvoked} commitSucceeded=${execution.commitSucceeded}`
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  console.log('============================================================');
  console.log('GUARDED 2026 LIVE ODDS');
  console.log('============================================================');
  console.log(`season=${args.season} week=${args.week} mode=${args.mode}`);
  console.log(
    'PREVIEW IS DATABASE READ-ONLY BUT DOES CONSUME ODDS API CREDITS'
  );
  console.log(
    `expectedConfirmation=${expectedWriteConfirmation(args.week)} (value not echoed from input)`
  );
  console.log(
    `markets=${LIVE_ODDS_MARKETS} region=${LIVE_ODDS_REGION} maxCredits=${MAX_EXPECTED_REQUEST_CREDITS}`
  );
  console.log('appendOnly=true deleteMany=forbidden ratings=false bets=false');

  if (args.season !== LIVE_ODDS_SEASON) {
    throw new Error(`season must be ${LIVE_ODDS_SEASON}`);
  }
  if (!Number.isInteger(args.week) || args.week < 1) {
    throw new Error('week must be a positive integer');
  }
  if (args.mode !== 'PREVIEW' && args.mode !== 'COMMIT') {
    throw new Error('mode must be PREVIEW or COMMIT');
  }

  const prisma = new PrismaClient();
  const resolver = new TeamResolver();
  await resolver.loadFBSTeamsForSeason(LIVE_ODDS_SEASON);

  const reportPath = args.reportPath || defaultReportPath(args.week, args.mode);
  let plan: LiveOddsPlan | null = null;
  let meta: Record<string, unknown> = {
    apiKeyPresent: Boolean(process.env.ODDS_API_KEY),
  };

  try {
    const memberships = await prisma.teamMembership.findMany({
      where: { season: LIVE_ODDS_SEASON, level: 'fbs' },
      select: { teamId: true },
    });
    const fbsTeamIds = memberships.map((m) => m.teamId);
    if (fbsTeamIds.length !== AUTHORITATIVE_FBS_COUNT) {
      console.error(
        `FBS membership count ${fbsTeamIds.length} != ${AUTHORITATIVE_FBS_COUNT}`
      );
    }

    const requestedWeekGamesRaw = await prisma.game.findMany({
      where: { season: LIVE_ODDS_SEASON, week: args.week },
      select: {
        id: true,
        season: true,
        week: true,
        homeTeamId: true,
        awayTeamId: true,
        date: true,
      },
      orderBy: { id: 'asc' },
    });
    const requestedWeekGames = requestedWeekGamesRaw.map((g) => ({
      gameId: g.id,
      season: g.season,
      week: g.week,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      date: g.date,
    }));

    const seasonGamesRaw = await prisma.game.findMany({
      where: { season: LIVE_ODDS_SEASON },
      select: {
        id: true,
        season: true,
        week: true,
        homeTeamId: true,
        awayTeamId: true,
        date: true,
      },
    });
    const seasonGames = seasonGamesRaw.map((g) => ({
      gameId: g.id,
      season: g.season,
      week: g.week,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      date: g.date,
    }));

    const gameIds = requestedWeekGames.map((g) => g.gameId);
    const existingRaw = await prisma.marketLine.findMany({
      where: {
        season: LIVE_ODDS_SEASON,
        week: args.week,
        source: LIVE_ODDS_SOURCE,
        gameId: { in: gameIds },
      },
      select: {
        gameId: true,
        lineType: true,
        bookName: true,
        timestamp: true,
        teamId: true,
        lineValue: true,
        closingLine: true,
      },
    });
    const existingRows = existingRaw.map((r) => ({
      gameId: r.gameId,
      lineType: r.lineType,
      bookName: r.bookName,
      timestamp: r.timestamp,
      teamId: r.teamId,
      lineValue: Number(r.lineValue),
      closingLine: Number(r.closingLine),
    }));

    const baseUrl =
      process.env.ODDS_API_BASE_URL || 'https://api.the-odds-api.com/v4';
    const adapter = new OddsApiAdapter({
      baseUrl,
      timeoutMs: 20000,
      markets: LIVE_ODDS_MARKETS.split(','),
    });

    // Exactly one live provider call — COMMIT does NOT reuse PREVIEW snapshot.
    const snapshot = await adapter.fetchLiveNcaafOddsSnapshot();
    meta = {
      ...meta,
      endpoint: snapshot.endpoint,
      markets: snapshot.markets,
      region: snapshot.region,
      urlRedacted: snapshot.urlRedacted,
    };

    const resolveTeam = (name: string) =>
      resolver.resolveTeamDetailed(name, 'NCAAF');

    plan = buildLiveOddsPlan({
      season: args.season,
      week: args.week,
      mode: args.mode,
      confirmation: args.confirmation,
      fbsTeamIds,
      requestedWeekGames,
      seasonGames,
      providerEvents: snapshot.events,
      providerCalls: snapshot.providerCalls,
      providerUsage: snapshot.providerUsage,
      existingRows,
      resolveTeam,
      maxExpectedCredits: MAX_EXPECTED_REQUEST_CREDITS,
    });

    console.log(`writeSafe=${plan.writeSafe}`);
    console.log(`writeBlockers=${JSON.stringify(plan.writeBlockers)}`);
    console.log(
      `providerCalls=${plan.providerCalls} requestCreditsLast=${plan.requestCreditsLast}`
    );
    console.log(
      `proposedInsert=${plan.proposedInsert.length} existingIdentical=${plan.existingIdentical}`
    );

    if (args.mode === 'PREVIEW') {
      const execution = buildPreviewExecution(plan.proposedInsert.length);
      writeReport(reportPath, plan, execution, null, meta);
      console.log(
        'PREVIEW complete — credits may have been consumed; DB unchanged'
      );
      if (!plan.writeSafe) {
        process.exitCode = 1;
      }
      return;
    }

    if (!commitEligible(plan)) {
      const execution = buildFailedCommitExecution({
        proposedBeforeTransaction: plan.proposedInsert.length,
        error: 'COMMIT blocked — see writeBlockers / confirmation',
      });
      writeReport(reportPath, plan, execution, null, meta);
      console.error('COMMIT blocked — see writeBlockers / confirmation');
      process.exitCode = 1;
      return;
    }

    const proposedBeforeTransaction = plan.proposedInsert.length;
    let stillNewAtTransaction: CandidateMarketLine[] = [];
    let createManyCount = 0;
    let transactionPersisted = false;

    try {
      const txResult = await prisma.$transaction(async (tx) => {
        const freshExisting = await tx.marketLine.findMany({
          where: {
            season: LIVE_ODDS_SEASON,
            week: args.week,
            source: LIVE_ODDS_SOURCE,
            gameId: { in: gameIds },
          },
          select: {
            gameId: true,
            lineType: true,
            bookName: true,
            timestamp: true,
            teamId: true,
            lineValue: true,
            closingLine: true,
          },
        });
        const freshMap = new Map(
          freshExisting.map((r) => [
            fingerprintKey({
              gameId: r.gameId,
              lineType: r.lineType,
              bookName: r.bookName,
              timestamp: r.timestamp,
              teamId: r.teamId,
            }),
            r,
          ])
        );

        const toInsert: CandidateMarketLine[] = [];
        for (const c of plan!.proposedInsert) {
          const fp = fingerprintKey(c);
          const ex = freshMap.get(fp);
          if (!ex) {
            toInsert.push(c);
            continue;
          }
          if (
            Number(ex.lineValue) !== c.lineValue ||
            Number(ex.closingLine) !== c.closingLine
          ) {
            throw new Error(
              `COMMIT abort: fingerprint collision appeared for ${fp}`
            );
          }
        }

        if (toInsert.length === 0) {
          throw new Error('COMMIT abort: no new rows after transaction re-read');
        }

        // Append-only — no deleteMany, no update, no upsert of historical rows.
        const createResult = await tx.marketLine.createMany({
          data: toInsert.map((c) => ({
            gameId: c.gameId,
            season: c.season,
            week: c.week,
            lineType: c.lineType,
            lineValue: c.lineValue,
            closingLine: c.closingLine,
            bookName: c.bookName,
            timestamp: c.timestamp,
            source: c.source,
            teamId: c.teamId,
          })),
          skipDuplicates: true,
        });

        return {
          toInsert,
          createManyCount: createResult.count,
        };
      });

      stillNewAtTransaction = txResult.toInsert;
      createManyCount = txResult.createManyCount;
      transactionPersisted = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const execution = buildFailedCommitExecution({
        proposedBeforeTransaction,
        transactionStarted: true,
        mutationsInvoked: false,
        marketLinePersistenceInvoked: false,
        stillNewAtTransaction: stillNewAtTransaction.length || null,
        createManyCount: null,
        error: message,
      });
      writeReport(reportPath, plan, execution, null, meta);
      throw err;
    }

    const after = await prisma.marketLine.findMany({
      where: {
        season: LIVE_ODDS_SEASON,
        week: args.week,
        source: LIVE_ODDS_SOURCE,
        gameId: { in: gameIds },
      },
      select: {
        gameId: true,
        lineType: true,
        bookName: true,
        timestamp: true,
        teamId: true,
        lineValue: true,
        closingLine: true,
      },
    });
    const afterRows = after.map((r) => ({
      gameId: r.gameId,
      lineType: r.lineType,
      bookName: r.bookName,
      timestamp: r.timestamp,
      teamId: r.teamId,
      lineValue: Number(r.lineValue),
      closingLine: Number(r.closingLine),
    }));

    const verification = verifyInsertedFingerprints({
      expectedInserts: stillNewAtTransaction,
      createManyCount,
      afterRows,
    });

    const execution = buildSuccessfulCommitExecution({
      proposedBeforeTransaction,
      stillNewAtTransaction: stillNewAtTransaction.length,
      createManyCount,
      postWriteVerificationSucceeded: verification.ok,
      error: verification.ok
        ? null
        : `post-write verification failed: ${verification.reasons.join('; ')}`,
    });

    // Persistence already occurred — report must say so even if verification fails.
    writeReport(reportPath, plan, execution, verification, meta);
    console.log(JSON.stringify({ verification }, null));

    if (!verification.ok) {
      console.error(
        'COMMIT persisted rows but post-write verification failed — see report'
      );
      process.exitCode = 1;
      return;
    }

    if (!transactionPersisted) {
      process.exitCode = 1;
      return;
    }

    console.log('COMMIT complete — append-only MarketLine persistence verified');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { parseArgs, main };
