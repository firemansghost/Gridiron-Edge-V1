/**
 * CLI — Guarded 2026 Shadow T-30 closing-market capture.
 *
 * PREVIEW: DB SELECTs only; zero writes; providerCalls=0.
 * COMMIT: Serializable append-only insert of due T-30 closing benchmarks.
 *
 * Does NOT call CFBD/Odds/weather. Does NOT write Bet, MatchupOutput,
 * ShadowPredictionSnapshot, or ShadowEvaluationResult. Does NOT migrate.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  SHADOW_CAPTURE_SEASON,
  SHADOW_EVALUATION_PROTOCOL,
  SHADOW_POLICY_DEFINITION_HASH,
  type ShadowMarketLineRow,
} from '../web/lib/shadow-snapshot-v1';
import {
  SHADOW_CLOSING_MARKET_TYPE,
  executeShadowClosingCapture,
  expectedClosingWriteConfirmation,
  resolveClosingPreviewExitCode,
  type ExistingShadowClosingRow,
  type OperationalShadowClosingFrame,
  type PlannedShadowClosingMarketSnapshot,
  type ShadowClosingAdapter,
  type ShadowClosingCaptureMode,
  type ShadowClosingMutationTx,
} from '../web/lib/shadow-closing-market-v1';

function parseArgs(argv: string[]): {
  season: number;
  week: number;
  mode: ShadowClosingCaptureMode;
  confirmation: string;
  reportPath?: string;
} {
  let season = SHADOW_CAPTURE_SEASON;
  let week = 1;
  let mode: ShadowClosingCaptureMode = 'PREVIEW';
  let confirmation = '';
  let reportPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--season') season = Number(argv[++i]);
    else if (arg === '--week') week = Number(argv[++i]);
    else if (arg === '--mode') mode = String(argv[++i]).toUpperCase() as ShadowClosingCaptureMode;
    else if (arg === '--confirm' || arg === '--confirmation') confirmation = String(argv[++i] ?? '');
    else if (arg === '--report') reportPath = String(argv[++i]);
  }
  return { season, week, mode, confirmation, reportPath };
}

function defaultReportPath(season: number, week: number, mode: ShadowClosingCaptureMode): string {
  return path.join(
    process.cwd(),
    'reports',
    `shadow-t30-closing-v1-2026-${season}-week-${week}-${mode.toLowerCase()}.json`
  );
}

function readRepoCommitSha(): string {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error('repoCommitSha must be obtained from git rev-parse HEAD');
  }
  return sha;
}

function mapExisting(row: {
  id: string;
  gameId: string;
  evaluationProtocol: string;
  policyDefinitionId: string;
  policyDefinitionHash: string;
  marketType: string;
  targetTimestamp: Date;
  status: string;
  unavailableReason: string | null;
  selectedMarketLineId: string | null;
  selectedMarketTeamId: string | null;
  selectedMarketLineValue: number | null;
  canonicalMarketHma: number | null;
  book: string | null;
  source: string | null;
  marketObservationTimestamp: Date | null;
  capturedAt: Date;
}): ExistingShadowClosingRow {
  return { ...row };
}

function closingCreateData(row: PlannedShadowClosingMarketSnapshot) {
  return {
    id: row.id,
    gameId: row.gameId,
    evaluationProtocol: row.evaluationProtocol,
    policyDefinitionId: row.policyDefinitionId,
    policyDefinitionHash: row.policyDefinitionHash,
    marketType: row.marketType,
    targetTimestamp: row.targetTimestamp,
    status: row.status,
    unavailableReason: row.unavailableReason,
    selectedMarketLineId: row.selectedMarketLineId,
    selectedMarketTeamId: row.selectedMarketTeamId,
    selectedMarketLineValue: row.selectedMarketLineValue,
    canonicalMarketHma: row.canonicalMarketHma,
    book: row.book,
    source: row.source,
    marketObservationTimestamp: row.marketObservationTimestamp,
    capturedAt: row.capturedAt,
  };
}

async function loadOperationalFrame(
  db: PrismaClient | Prisma.TransactionClient,
  season: number,
  week: number
): Promise<OperationalShadowClosingFrame> {
  const games = await db.game.findMany({
    where: { season, week },
    select: {
      id: true,
      season: true,
      week: true,
      homeTeamId: true,
      awayTeamId: true,
      date: true,
    },
  });
  const gameIds = games.map((g) => g.id);

  const marketRaw = gameIds.length === 0
    ? []
    : await db.marketLine.findMany({
        where: { gameId: { in: gameIds }, lineType: 'spread' },
        select: {
          id: true,
          gameId: true,
          lineType: true,
          lineValue: true,
          teamId: true,
          bookName: true,
          source: true,
          timestamp: true,
        },
      });

  const captureRuns = await db.shadowCaptureRun.findMany({
    where: {
      season,
      week,
      evaluationProtocol: SHADOW_EVALUATION_PROTOCOL,
      policyDefinitionHash: SHADOW_POLICY_DEFINITION_HASH,
      status: 'COMPLETE',
    },
    select: {
      predictions: { select: { gameId: true } },
    },
  });

  const existingRaw = gameIds.length === 0
    ? []
    : await db.shadowClosingMarketSnapshot.findMany({
        where: {
          gameId: { in: gameIds },
          evaluationProtocol: SHADOW_EVALUATION_PROTOCOL,
          policyDefinitionHash: SHADOW_POLICY_DEFINITION_HASH,
          marketType: SHADOW_CLOSING_MARKET_TYPE,
        },
        select: {
          id: true,
          gameId: true,
          evaluationProtocol: true,
          policyDefinitionId: true,
          policyDefinitionHash: true,
          marketType: true,
          targetTimestamp: true,
          status: true,
          unavailableReason: true,
          selectedMarketLineId: true,
          selectedMarketTeamId: true,
          selectedMarketLineValue: true,
          canonicalMarketHma: true,
          book: true,
          source: true,
          marketObservationTimestamp: true,
          capturedAt: true,
        },
      });

  const predictionFrames = captureRuns.map((run) =>
    run.predictions.map((prediction) => prediction.gameId)
  );
  const marketLines: ShadowMarketLineRow[] = marketRaw.map((row) => ({
    id: row.id,
    gameId: row.gameId,
    lineType: String(row.lineType),
    lineValue: row.lineValue,
    teamId: row.teamId,
    bookName: row.bookName,
    source: row.source,
    timestamp: row.timestamp,
  }));

  return {
    games: games.map((g) => ({
      id: g.id,
      season: g.season,
      week: g.week,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      kickoffTimestamp: g.date,
    })),
    predictionFrames,
    marketLines,
    existingClosings: existingRaw.map((row) => mapExisting({
      ...row,
      marketType: String(row.marketType),
      status: String(row.status),
    })),
  };
}

function createPrismaAdapter(
  prisma: PrismaClient,
  args: { season: number; week: number; now?: () => Date }
): ShadowClosingAdapter {
  const clock = args.now ?? (() => new Date());
  const bindTx = (db: PrismaClient | Prisma.TransactionClient): ShadowClosingMutationTx => ({
    loadFrame: () => loadOperationalFrame(db, args.season, args.week),
    now: clock,
    createClosingSnapshots: async (rows) => {
      const created = await db.shadowClosingMarketSnapshot.createMany({
        data: rows.map(closingCreateData),
      });
      return created.count;
    },
  });

  return {
    now: clock,
    createId: () => randomUUID(),
    loadFrame: () => loadOperationalFrame(prisma, args.season, args.week),
    runTransaction: async (fn) =>
      prisma.$transaction((tx) => fn(bindTx(tx)), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }),
    readClosings: async (ids) => {
      if (ids.length === 0) return [];
      const rows = await prisma.shadowClosingMarketSnapshot.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          gameId: true,
          evaluationProtocol: true,
          policyDefinitionId: true,
          policyDefinitionHash: true,
          marketType: true,
          targetTimestamp: true,
          status: true,
          unavailableReason: true,
          selectedMarketLineId: true,
          selectedMarketTeamId: true,
          selectedMarketLineValue: true,
          canonicalMarketHma: true,
          book: true,
          source: true,
          marketObservationTimestamp: true,
          capturedAt: true,
        },
      });
      return rows.map((row) => mapExisting({
        ...row,
        marketType: String(row.marketType),
        status: String(row.status),
      }));
    },
    countEvaluationResultsForClosingIds: (ids) =>
      ids.length === 0
        ? Promise.resolve(0)
        : prisma.shadowEvaluationResult.count({
            where: { closingMarketSnapshotId: { in: ids } },
          }),
  };
}

function writeReport(reportPath: string, report: unknown, extra: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({ ...((report as object) ?? {}), ...extra }, null, 2), 'utf8');
  console.log(`report=${reportPath}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const reportPath = args.reportPath ?? defaultReportPath(args.season, args.week, args.mode);
  const repoCommitSha = readRepoCommitSha();

  console.log('============================================================');
  console.log('GUARDED 2026 SHADOW T-30 CLOSING MARKET V1 CAPTURE');
  console.log('============================================================');
  console.log(`season=${args.season} week=${args.week} mode=${args.mode}`);
  console.log(`expectedConfirmation=${expectedClosingWriteConfirmation(args.week)} (value not echoed from input)`);
  console.log('providerCalls=0; uses persisted MarketLine rows only');
  console.log('PREVIEW IS DATABASE READ-ONLY');
  console.log('PREVIEW timestamp will NOT become the COMMIT capture timestamp');
  console.log('no prediction mutation; no ATS/CLV evaluation; no Bet/MatchupOutput writes');
  console.log('no fall-forward after T-30; no post-kickoff backfill');

  if (args.season !== SHADOW_CAPTURE_SEASON) throw new Error(`season must be ${SHADOW_CAPTURE_SEASON}`);
  if (!Number.isInteger(args.week) || args.week < 1) throw new Error('week must be a positive integer');
  if (args.mode !== 'PREVIEW' && args.mode !== 'COMMIT') throw new Error('mode must be PREVIEW or COMMIT');

  const url = process.env.DIRECT_URL;
  if (!url) throw new Error('DIRECT_URL required');

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const adapter = createPrismaAdapter(prisma, { season: args.season, week: args.week });
    const { plan, execution, report } = await executeShadowClosingCapture({
      season: args.season,
      week: args.week,
      mode: args.mode,
      confirmation: args.confirmation,
      adapter,
    });

    writeReport(reportPath, report, {
      repoCommitSha,
      writeSafe: plan.writeSafe,
      writeBlockers: plan.writeBlockers,
      mutationsInvoked: execution.mutationsInvoked,
      predictionMutationsInvoked: execution.predictionMutationsInvoked,
      evaluationMutationsInvoked: execution.evaluationMutationsInvoked,
      commitSucceeded: execution.commitSucceeded,
      persistenceCommitted: execution.persistenceCommitted,
      rolledBack: execution.rolledBack,
      transactionalIdempotentNoOp: execution.transactionalIdempotentNoOp,
      insertedSnapshotCount: execution.insertedSnapshotCount,
      insertedSnapshotIds: execution.insertedSnapshotIds,
      verificationOk: execution.verificationOk,
      verificationReasons: execution.verificationReasons,
      providerCalls: 0,
      isolationLevel: args.mode === 'COMMIT' ? 'Serializable' : null,
    });

    console.log(
      `writeSafe=${plan.writeSafe} totalGames=${plan.counts.totalGames} existing=${plan.counts.existingCount} future=${plan.counts.futureCount} due=${plan.counts.dueCount} missed=${plan.counts.missedCount} planned=${plan.counts.plannedInsertCount} mutationsInvoked=${execution.mutationsInvoked} providerCalls=0`
    );
    if (plan.writeBlockers.length > 0) console.log(`writeBlockers=${plan.writeBlockers.join(' | ')}`);

    if (args.mode === 'PREVIEW') {
      console.log('PREVIEW complete — DB unchanged; PREVIEW timestamp will NOT become COMMIT timestamp');
      process.exitCode = resolveClosingPreviewExitCode(plan.writeSafe);
      return;
    }

    if (execution.rolledBack || !execution.commitSucceeded) {
      console.error(execution.rolledBack
        ? 'COMMIT rolled back — no new Shadow closing rows persisted'
        : 'COMMIT verification failed — see report; no repair attempted');
      process.exitCode = 1;
      return;
    }
    if (execution.transactionalIdempotentNoOp) {
      console.log('COMMIT transactional idempotent no-op — no due new closing rows');
      return;
    }
    console.log(`COMMIT succeeded: closingSnapshots=${execution.insertedSnapshotCount}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
