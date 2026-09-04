/**
 * CLI — Guarded 2026 Shadow Snapshot V1 prospective prediction capture.
 *
 * PREVIEW: DB SELECTs only; zero Shadow writes; providerCalls=0.
 * COMMIT: Serializable create of one COMPLETE ShadowCaptureRun + one
 * ShadowPredictionSnapshot per expected game, or idempotent NO-OP.
 *
 * Does NOT call CFBD/Odds/weather. Does NOT write Bet or MatchupOutput.
 * Does NOT write closing-market or evaluation rows.
 * Does NOT run Prisma migrate.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  SHADOW_CAPTURE_SEASON,
  SHADOW_EVALUATION_PROTOCOL,
  SHADOW_MODEL_DEFINITION_HASH,
  SHADOW_POLICY_DEFINITION_HASH,
  executeShadowCapture,
  expectedWriteConfirmation,
  resolvePreviewExitCode,
  validateCaptureContext,
  type ExistingShadowCohort,
  type OperationalShadowFrame,
  type PlannedShadowCaptureRun,
  type PlannedShadowPredictionSnapshot,
  type ShadowCaptureAdapter,
  type ShadowCaptureMode,
  type ShadowMarketLineRow,
  type ShadowMutationTx,
  type ShadowRatingRow,
  type ShadowUnitGradeRow,
  type ShadowV4BetRow,
} from '../web/lib/shadow-snapshot-v1';

function parseArgs(argv: string[]): {
  season: number;
  week: number;
  mode: ShadowCaptureMode;
  captureContext: string;
  confirmation: string;
  reportPath?: string;
} {
  let season = SHADOW_CAPTURE_SEASON;
  let week = 1;
  let mode: ShadowCaptureMode = 'PREVIEW';
  let captureContext = '';
  let confirmation = '';
  let reportPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--season') season = Number(argv[++i]);
    else if (a === '--week') week = Number(argv[++i]);
    else if (a === '--mode') mode = String(argv[++i]).toUpperCase() as ShadowCaptureMode;
    else if (a === '--capture-context') captureContext = String(argv[++i] ?? '');
    else if (a === '--confirm' || a === '--confirmation')
      confirmation = String(argv[++i] ?? '');
    else if (a === '--report') reportPath = String(argv[++i]);
  }

  return { season, week, mode, captureContext, confirmation, reportPath };
}

function defaultReportPath(season: number, week: number, mode: ShadowCaptureMode): string {
  return path.join(
    process.cwd(),
    'reports',
    `shadow-snapshot-v1-2026-${season}-week-${week}-${mode.toLowerCase()}.json`
  );
}

function readRepoCommitSha(): string {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error('repoCommitSha must be obtained from git rev-parse HEAD');
  }
  return sha;
}

function toFinite(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapExisting(run: {
  id: string;
  status: string;
  season: number;
  week: number;
  evaluationProtocol: string;
  captureContext: string;
  modelDefinitionId: string;
  modelDefinitionHash: string;
  policyDefinitionId: string;
  policyDefinitionHash: string;
  expectedGameIds: unknown;
  totalGames: number;
  hybridAvailableCount: number;
  hybridUnavailableCount: number;
  qualificationQualifiedCount: number;
  qualificationNotQualifiedCount: number;
  qualificationUnavailableCount: number;
  v4SideAvailableCount: number;
  v4VerifiedNoSelectionCount: number;
  v4ProvenanceUnavailableCount: number;
  predictions: Array<{
    id: string;
    gameId: string;
    predictionStatus: string;
    qualificationStatus: string | null;
    v4ComparisonStatus: string | null;
  }>;
}): ExistingShadowCohort {
  return {
    run: {
      id: run.id,
      status: run.status,
      season: run.season,
      week: run.week,
      evaluationProtocol: run.evaluationProtocol,
      captureContext: run.captureContext,
      modelDefinitionId: run.modelDefinitionId,
      modelDefinitionHash: run.modelDefinitionHash,
      policyDefinitionId: run.policyDefinitionId,
      policyDefinitionHash: run.policyDefinitionHash,
      expectedGameIds: run.expectedGameIds,
      totalGames: run.totalGames,
      hybridAvailableCount: run.hybridAvailableCount,
      hybridUnavailableCount: run.hybridUnavailableCount,
      qualificationQualifiedCount: run.qualificationQualifiedCount,
      qualificationNotQualifiedCount: run.qualificationNotQualifiedCount,
      qualificationUnavailableCount: run.qualificationUnavailableCount,
      v4SideAvailableCount: run.v4SideAvailableCount,
      v4VerifiedNoSelectionCount: run.v4VerifiedNoSelectionCount,
      v4ProvenanceUnavailableCount: run.v4ProvenanceUnavailableCount,
    },
    snapshots: run.predictions,
  };
}

function snapshotCreateData(row: PlannedShadowPredictionSnapshot) {
  return {
    id: row.id,
    captureRunId: row.captureRunId,
    gameId: row.gameId,
    season: row.season,
    week: row.week,
    homeTeamId: row.homeTeamId,
    awayTeamId: row.awayTeamId,
    kickoffTimestamp: row.kickoffTimestamp,
    neutralSite: row.neutralSite,
    predictionTimestamp: row.predictionTimestamp,
    predictionStatus: row.predictionStatus,
    unavailableReasons: row.unavailableReasons,
    homeV1Rating: row.homeV1Rating,
    awayV1Rating: row.awayV1Rating,
    ratingProvenance: row.ratingProvenance as Prisma.InputJsonValue,
    homeUnitGrades: row.homeUnitGrades as Prisma.InputJsonValue,
    awayUnitGrades: row.awayUnitGrades as Prisma.InputJsonValue,
    unitGradeProvenance: row.unitGradeProvenance as Prisma.InputJsonValue,
    weatherState: row.weatherState as Prisma.InputJsonValue,
    inputPayload: row.inputPayload as Prisma.InputJsonValue,
    inputHash: row.inputHash,
    coreV1Hma: row.coreV1Hma,
    v2Hma: row.v2Hma,
    hybridHma: row.hybridHma,
    predictionMarketHma: row.predictionMarketHma,
    spreadEdgeHma: row.spreadEdgeHma,
    absSpreadEdge: row.absSpreadEdge,
    selectedSide: row.selectedSide,
    selectedTeamId: row.selectedTeamId,
    predictionPickLine: row.predictionPickLine,
    selectedMarketLineId: row.selectedMarketLineId,
    selectedMarketTeamId: row.selectedMarketTeamId,
    selectedMarketLineValue: row.selectedMarketLineValue,
    marketBook: row.marketBook,
    marketSource: row.marketSource,
    marketTimestamp: row.marketTimestamp,
    marketAgeSeconds: row.marketAgeSeconds,
    marketFavoriteTeamId: row.marketFavoriteTeamId,
    v4ComparisonStatus: row.v4ComparisonStatus,
    v4ComparisonSide: row.v4ComparisonSide,
    v4Provenance: row.v4Provenance as Prisma.InputJsonValue,
    hybridConflictType: row.hybridConflictType,
    tierBucket: row.tierBucket,
    qualificationStatus: row.qualificationStatus,
    qualificationReasons: row.qualificationReasons,
    isSuperTierA: row.isSuperTierA,
  };
}

async function loadOperationalFrame(
  db: PrismaClient | Prisma.TransactionClient,
  season: number,
  week: number
): Promise<OperationalShadowFrame> {
  const games = await db.game.findMany({
    where: { season, week },
    select: {
      id: true,
      season: true,
      week: true,
      homeTeamId: true,
      awayTeamId: true,
      date: true,
      neutralSite: true,
    },
  });

  const ratingsRaw = await db.teamSeasonRating.findMany({
    where: { season, modelVersion: 'v1' },
    select: {
      teamId: true,
      season: true,
      modelVersion: true,
      powerRating: true,
      rating: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const unitGradesRaw = await db.teamUnitGrades.findMany({
    where: { season },
    select: {
      id: true,
      teamId: true,
      season: true,
      offRunGrade: true,
      defRunGrade: true,
      offPassGrade: true,
      defPassGrade: true,
      offExplosiveness: true,
      defExplosiveness: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const gameIds = games.map((g) => g.id);
  const marketRaw =
    gameIds.length === 0
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

  const v4Raw =
    gameIds.length === 0
      ? []
      : await db.bet.findMany({
          where: {
            gameId: { in: gameIds },
            strategyTag: 'v4_labs',
            marketType: 'spread',
          },
          select: {
            id: true,
            gameId: true,
            strategyTag: true,
            marketType: true,
            side: true,
            createdAt: true,
            updatedAt: true,
          },
        });

  const ratings: ShadowRatingRow[] = ratingsRaw.map((r) => ({
    teamId: r.teamId,
    season: r.season,
    modelVersion: r.modelVersion,
    powerRating: toFinite(r.powerRating),
    rating: toFinite(r.rating),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  const unitGrades: ShadowUnitGradeRow[] = unitGradesRaw.map((r) => ({
    id: r.id,
    teamId: r.teamId,
    season: r.season,
    offRunGrade: r.offRunGrade,
    defRunGrade: r.defRunGrade,
    offPassGrade: r.offPassGrade,
    defPassGrade: r.defPassGrade,
    offExplosiveness: r.offExplosiveness,
    defExplosiveness: r.defExplosiveness,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  const marketLines: ShadowMarketLineRow[] = marketRaw.map((r) => ({
    id: r.id,
    gameId: r.gameId,
    lineType: String(r.lineType),
    lineValue: r.lineValue,
    teamId: r.teamId,
    bookName: r.bookName,
    source: r.source,
    timestamp: r.timestamp,
  }));

  const v4Bets: ShadowV4BetRow[] = v4Raw.map((r) => ({
    id: r.id,
    gameId: r.gameId,
    strategyTag: r.strategyTag,
    marketType: String(r.marketType),
    side: String(r.side),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  return {
    games: games.map((g) => ({
      id: g.id,
      season: g.season,
      week: g.week,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      kickoffTimestamp: g.date,
      neutralSite: g.neutralSite,
    })),
    ratings,
    unitGrades,
    marketLines,
    v4Bets,
  };
}

async function findCohort(
  db: PrismaClient | Prisma.TransactionClient,
  season: number,
  week: number,
  captureContext: string
): Promise<ExistingShadowCohort | null> {
  const run = await db.shadowCaptureRun.findFirst({
    where: {
      season,
      week,
      evaluationProtocol: SHADOW_EVALUATION_PROTOCOL,
      modelDefinitionHash: SHADOW_MODEL_DEFINITION_HASH,
      policyDefinitionHash: SHADOW_POLICY_DEFINITION_HASH,
      captureContext,
    },
    include: {
      predictions: {
        select: {
          id: true,
          gameId: true,
          predictionStatus: true,
          qualificationStatus: true,
          v4ComparisonStatus: true,
        },
      },
    },
  });
  if (!run) return null;
  return mapExisting(run);
}

function createPrismaAdapter(
  prisma: PrismaClient,
  args: { season: number; week: number; captureContext: string; now?: () => Date }
): ShadowCaptureAdapter {
  const clock = args.now ?? (() => new Date());
  const cohortArgs = {
    season: args.season,
    week: args.week,
    captureContext: args.captureContext,
  };

  const bindTx = (db: PrismaClient | Prisma.TransactionClient): ShadowMutationTx => ({
    findCohort: () => findCohort(db, cohortArgs.season, cohortArgs.week, cohortArgs.captureContext),
    loadFrame: () => loadOperationalFrame(db, cohortArgs.season, cohortArgs.week),
    now: clock,
    createRun: async (run: PlannedShadowCaptureRun) => {
      await db.shadowCaptureRun.create({
        data: {
          id: run.id,
          season: run.season,
          week: run.week,
          evaluationProtocol: run.evaluationProtocol,
          captureContext: run.captureContext,
          modelFamily: run.modelFamily,
          modelDefinitionId: run.modelDefinitionId,
          modelDefinitionHash: run.modelDefinitionHash,
          modelDefinitionManifest: run.modelDefinitionManifest as Prisma.InputJsonValue,
          policyDefinitionId: run.policyDefinitionId,
          policyDefinitionHash: run.policyDefinitionHash,
          policyDefinitionManifest: run.policyDefinitionManifest as Prisma.InputJsonValue,
          repoCommitSha: run.repoCommitSha,
          captureTimestamp: run.captureTimestamp,
          expectedGameIds: run.expectedGameIds as Prisma.InputJsonValue,
          totalGames: run.totalGames,
          hybridAvailableCount: run.hybridAvailableCount,
          hybridUnavailableCount: run.hybridUnavailableCount,
          qualificationQualifiedCount: run.qualificationQualifiedCount,
          qualificationNotQualifiedCount: run.qualificationNotQualifiedCount,
          qualificationUnavailableCount: run.qualificationUnavailableCount,
          v4SideAvailableCount: run.v4SideAvailableCount,
          v4VerifiedNoSelectionCount: run.v4VerifiedNoSelectionCount,
          v4ProvenanceUnavailableCount: run.v4ProvenanceUnavailableCount,
          status: 'COMPLETE',
          failureReason: null,
        },
      });
    },
    createPredictionSnapshots: async (rows: PlannedShadowPredictionSnapshot[]) => {
      const created = await db.shadowPredictionSnapshot.createMany({
        data: rows.map(snapshotCreateData),
      });
      return created.count;
    },
    countPredictions: (captureRunId: string) =>
      db.shadowPredictionSnapshot.count({ where: { captureRunId } }),
  });

  return {
    now: clock,
    createId: () => randomUUID(),
    findCohort: () =>
      findCohort(prisma, cohortArgs.season, cohortArgs.week, cohortArgs.captureContext),
    loadFrame: () => loadOperationalFrame(prisma, cohortArgs.season, cohortArgs.week),
    runTransaction: async (fn) =>
      prisma.$transaction((tx) => fn(bindTx(tx)), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }),
    readRun: async (id: string) => {
      const run = await prisma.shadowCaptureRun.findUnique({
        where: { id },
        include: {
          predictions: {
            select: {
              id: true,
              gameId: true,
              predictionStatus: true,
              qualificationStatus: true,
              v4ComparisonStatus: true,
            },
          },
        },
      });
      return run ? mapExisting(run) : null;
    },
    countEvaluationResultsForPredictionIds: async (ids: string[]) =>
      prisma.shadowEvaluationResult.count({
        where: { predictionSnapshotId: { in: ids } },
      }),
  };
}

function writeReport(reportPath: string, report: unknown, extra: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const payload = { ...((report as object) ?? {}), ...extra };
  fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`report=${reportPath}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const reportPath = args.reportPath ?? defaultReportPath(args.season, args.week, args.mode);
  const repoCommitSha = readRepoCommitSha();

  console.log('============================================================');
  console.log('GUARDED 2026 SHADOW SNAPSHOT V1 PREDICTION CAPTURE');
  console.log('============================================================');
  console.log(`season=${args.season} week=${args.week} mode=${args.mode}`);
  console.log(`capture_context=${args.captureContext}`);
  console.log('PREVIEW IS DATABASE READ-ONLY; providerCalls=0');
  console.log(
    `expectedConfirmation=${expectedWriteConfirmation(args.week)} (value not echoed from input)`
  );
  // COMMIT phrase: CAPTURE_2026_WEEK_<week>_SHADOW_V1 via expectedWriteConfirmation()
  console.log('PREVIEW timestamp will NOT become the COMMIT prediction timestamp');
  console.log('no closing capture; no ATS evaluation; no Bet/MatchupOutput writes');

  if (args.season !== SHADOW_CAPTURE_SEASON) {
    throw new Error(`season must be ${SHADOW_CAPTURE_SEASON}`);
  }
  if (!Number.isInteger(args.week) || args.week < 1) {
    throw new Error('week must be a positive integer');
  }
  if (args.mode !== 'PREVIEW' && args.mode !== 'COMMIT') {
    throw new Error('mode must be PREVIEW or COMMIT');
  }
  const context = validateCaptureContext(args.captureContext);
  if (!context.ok) {
    throw new Error(context.reason);
  }

  const url = process.env.DIRECT_URL;
  if (!url) {
    throw new Error('DIRECT_URL required');
  }

  const prisma = new PrismaClient({
    datasources: { db: { url } },
  });

  try {
    const adapter = createPrismaAdapter(prisma, {
      season: args.season,
      week: args.week,
      captureContext: context.value,
    });

    const { plan, execution, report } = await executeShadowCapture({
      season: args.season,
      week: args.week,
      mode: args.mode,
      captureContext: context.value,
      confirmation: args.confirmation,
      repoCommitSha,
      adapter,
    });

    writeReport(reportPath, report, {
      writeSafe: plan.writeSafe,
      writeBlockers: plan.writeBlockers,
      mutationsInvoked: execution.mutationsInvoked,
      closingMutationsInvoked: execution.closingMutationsInvoked,
      commitSucceeded: execution.commitSucceeded,
      persistenceCommitted: execution.persistenceCommitted,
      rolledBack: execution.rolledBack,
      transactionalIdempotentNoOp: execution.transactionalIdempotentNoOp,
      providerCalls: 0,
      isolationLevel: args.mode === 'COMMIT' ? 'Serializable' : null,
    });

    console.log(
      `writeSafe=${plan.writeSafe} totalGames=${plan.counts.totalGames} available=${plan.counts.hybridAvailableCount} unavailable=${plan.counts.hybridUnavailableCount} mutationsInvoked=${execution.mutationsInvoked} providerCalls=0`
    );
    if (plan.writeBlockers.length) {
      console.log(`writeBlockers=${plan.writeBlockers.join(' | ')}`);
    }

    if (args.mode === 'PREVIEW') {
      console.log(
        'PREVIEW complete — DB unchanged; PREVIEW timestamp will NOT become COMMIT timestamp'
      );
      process.exitCode = resolvePreviewExitCode(plan.writeSafe);
      return;
    }

    if (execution.rolledBack || !execution.commitSucceeded) {
      console.error(
        execution.rolledBack
          ? 'COMMIT rolled back — no Shadow rows persisted'
          : 'COMMIT verification failed — see report (no repair attempted)'
      );
      process.exitCode = 1;
      return;
    }

    if (execution.transactionalIdempotentNoOp) {
      console.log('COMMIT transactional idempotent no-op — existing COMPLETE cohort unchanged');
      return;
    }

    console.log(
      `COMMIT succeeded: run=${execution.insertedRunId} snapshots=${execution.insertedSnapshotCount}`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
