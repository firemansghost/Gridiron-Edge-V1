/**
 * CLI — Guarded 2026 generic Shadow Model Capture V1.
 *
 * PREVIEW: DB SELECTs only; zero Shadow Model writes; providerCalls=0.
 * COMMIT: Serializable create of one COMPLETE ShadowModelCaptureRun + one
 * ShadowModelPrediction per expected game, or idempotent NO-OP.
 *
 * Does NOT call CFBD/Odds/weather. Does NOT write Bet or MatchupOutput.
 * Does NOT write Hybrid Shadow Snapshot V1 rows.
 * Does NOT write closing-market or evaluation rows.
 * Does NOT run Prisma migrate.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  SHADOW_MODEL_CAPTURE_SEASON,
  SHADOW_MODEL_EVALUATION_PROTOCOL,
  executeShadowModelCapture,
  expectedShadowModelWriteConfirmation,
  fingerprintOfficialFlat100BetRows,
  isShadowModelAllowlisted,
  marketAgeDistribution,
  shadowModelCommitAuthorizationError,
  SHADOW_MODEL_ALLOWLIST,
  resolvePreviewExitCode,
  validateCaptureContext,
  type ExistingShadowModelCohort,
  type OperationalShadowModelFrame,
  type PlannedShadowModelCaptureRun,
  type PlannedShadowModelPrediction,
  type ShadowModelCaptureMode,
  type ShadowModelCapturePersistence,
  type ShadowModelDefinition,
  type ShadowModelMutationTx,
} from '../web/lib/shadow-model-capture-v1';
import {
  CORE_V1_SHADOW_BASELINE_MODEL_ID,
  createCoreV1ShadowBaselineDefinition,
} from '../web/lib/shadow-models/core-v1-shadow-baseline-v1';
import {
  CANDIDATE_B_GENERIC_SHADOW_MODEL_ID,
  createCandidateBRosterPriorShadowDefinition,
} from './src/research/candidate-b/candidate-b-v1-shadow-adapter';
import { loadOperationalShadowModelFrame } from './src/shadow-model-operational-frame';

function resolveModelDefinition(modelId: string): ShadowModelDefinition {
  if (modelId === CORE_V1_SHADOW_BASELINE_MODEL_ID) {
    return createCoreV1ShadowBaselineDefinition();
  }
  if (modelId === CANDIDATE_B_GENERIC_SHADOW_MODEL_ID) {
    return createCandidateBRosterPriorShadowDefinition();
  }
  throw new Error(`model_id_not_allowlisted:${modelId}`);
}

function parseArgs(argv: string[]): {
  season: number;
  week: number;
  mode: ShadowModelCaptureMode;
  modelId: string;
  captureContext: string;
  confirmation: string;
  reportPath?: string;
} {
  let season = SHADOW_MODEL_CAPTURE_SEASON;
  let week = 1;
  let mode: ShadowModelCaptureMode = 'PREVIEW';
  let modelId = '';
  let captureContext = '';
  let confirmation = '';
  let reportPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--season') season = Number(argv[++i]);
    else if (a === '--week') week = Number(argv[++i]);
    else if (a === '--mode') mode = String(argv[++i]).toUpperCase() as ShadowModelCaptureMode;
    else if (a === '--model-id') modelId = String(argv[++i] ?? '');
    else if (a === '--capture-context') captureContext = String(argv[++i] ?? '');
    else if (a === '--confirm' || a === '--confirmation')
      confirmation = String(argv[++i] ?? '');
    else if (a === '--report') reportPath = String(argv[++i]);
  }

  return { season, week, mode, modelId, captureContext, confirmation, reportPath };
}

function defaultReportPath(
  season: number,
  week: number,
  modelId: string,
  mode: ShadowModelCaptureMode
): string {
  return path.join(
    process.cwd(),
    'reports',
    `shadow-model-capture-v1-2026-${season}-week-${week}-${modelId}-${mode.toLowerCase()}.json`
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
  featureDefinitionId: string;
  featureDefinitionHash: string;
  policyDefinitionId: string;
  policyDefinitionHash: string;
  repoCommitSha: string;
  expectedGameIds: unknown;
  totalGames: number;
  availableCount: number;
  unavailableCount: number;
  selectionCount: number;
  noSelectionCount: number;
  predictions: Array<{
    id: string;
    gameId: string;
    predictionStatus: string;
    selectedSide: string | null;
  }>;
}): ExistingShadowModelCohort {
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
      featureDefinitionId: run.featureDefinitionId,
      featureDefinitionHash: run.featureDefinitionHash,
      policyDefinitionId: run.policyDefinitionId,
      policyDefinitionHash: run.policyDefinitionHash,
      repoCommitSha: run.repoCommitSha,
      expectedGameIds: run.expectedGameIds,
      totalGames: run.totalGames,
      availableCount: run.availableCount,
      unavailableCount: run.unavailableCount,
      selectionCount: run.selectionCount,
      noSelectionCount: run.noSelectionCount,
    },
    predictions: run.predictions,
  };
}

function predictionCreateData(row: PlannedShadowModelPrediction) {
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
    inputPayload: row.inputPayload as Prisma.InputJsonValue,
    inputHash: row.inputHash,
    featureProvenance: row.featureProvenance as Prisma.InputJsonValue,
    modelOutput: row.modelOutput as Prisma.InputJsonValue,
    marketType: row.marketType,
    selectedMarketLineId: row.selectedMarketLineId,
    selectedMarketTeamId: row.selectedMarketTeamId,
    selectedMarketLineValue: row.selectedMarketLineValue,
    canonicalMarketValue: row.canonicalMarketValue,
    marketBook: row.marketBook,
    marketSource: row.marketSource,
    marketTimestamp: row.marketTimestamp,
    marketAgeSeconds: row.marketAgeSeconds,
    marketProvenance: row.marketProvenance as Prisma.InputJsonValue,
    modelValue: row.modelValue,
    edgeValue: row.edgeValue,
    absEdgeValue: row.absEdgeValue,
    selectedSide: row.selectedSide,
    selectedTeamId: row.selectedTeamId,
    predictionPickValue: row.predictionPickValue,
  };
}

async function loadOperationalFrame(
  db: PrismaClient | Prisma.TransactionClient,
  season: number,
  week: number,
  modelDefinitionId: string
): Promise<OperationalShadowModelFrame> {
  return loadOperationalShadowModelFrame(db, { season, week, modelDefinitionId });
}

async function findCohort(
  db: PrismaClient | Prisma.TransactionClient,
  args: {
    season: number;
    week: number;
    captureContext: string;
    model: ShadowModelDefinition;
  }
): Promise<ExistingShadowModelCohort | null> {
  const run = await db.shadowModelCaptureRun.findFirst({
    where: {
      season: args.season,
      week: args.week,
      evaluationProtocol: SHADOW_MODEL_EVALUATION_PROTOCOL,
      modelDefinitionHash: args.model.modelDefinitionHash,
      featureDefinitionHash: args.model.featureDefinitionHash,
      policyDefinitionHash: args.model.policyDefinitionHash,
      captureContext: args.captureContext,
    },
    include: {
      predictions: {
        select: {
          id: true,
          gameId: true,
          predictionStatus: true,
          selectedSide: true,
        },
      },
    },
  });
  if (!run) return null;
  return mapExisting(run);
}

function createPrismaPersistence(
  prisma: PrismaClient,
  args: {
    season: number;
    week: number;
    captureContext: string;
    model: ShadowModelDefinition;
    now?: () => Date;
  }
): ShadowModelCapturePersistence {
  const clock = args.now ?? (() => new Date());
  const cohortArgs = {
    season: args.season,
    week: args.week,
    captureContext: args.captureContext,
    model: args.model,
  };

  const bindTx = (db: PrismaClient | Prisma.TransactionClient): ShadowModelMutationTx => ({
    findCohort: () => findCohort(db, cohortArgs),
    loadFrame: () =>
      loadOperationalFrame(db, cohortArgs.season, cohortArgs.week, args.model.modelDefinitionId),
    now: clock,
    createRun: async (run: PlannedShadowModelCaptureRun) => {
      await db.shadowModelCaptureRun.create({
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
          featureDefinitionId: run.featureDefinitionId,
          featureDefinitionVersion: run.featureDefinitionVersion,
          featureDefinitionHash: run.featureDefinitionHash,
          featureDefinitionManifest: run.featureDefinitionManifest as Prisma.InputJsonValue,
          policyDefinitionId: run.policyDefinitionId,
          policyDefinitionHash: run.policyDefinitionHash,
          policyDefinitionManifest: run.policyDefinitionManifest as Prisma.InputJsonValue,
          repoCommitSha: run.repoCommitSha,
          captureTimestamp: run.captureTimestamp,
          expectedGameIds: run.expectedGameIds as Prisma.InputJsonValue,
          totalGames: run.totalGames,
          availableCount: run.availableCount,
          unavailableCount: run.unavailableCount,
          selectionCount: run.selectionCount,
          noSelectionCount: run.noSelectionCount,
          status: run.status,
          failureReason: run.failureReason,
        },
      });
    },
    createPredictions: async (rows: PlannedShadowModelPrediction[]) => {
      if (rows.length === 0) return 0;
      const result = await db.shadowModelPrediction.createMany({
        data: rows.map(predictionCreateData),
      });
      return result.count;
    },
    countPredictions: (captureRunId: string) =>
      db.shadowModelPrediction.count({ where: { captureRunId } }),
  });

  return {
    now: clock,
    createId: () => randomUUID(),
    findCohort: () => findCohort(prisma, cohortArgs),
    loadFrame: () =>
      loadOperationalFrame(prisma, cohortArgs.season, cohortArgs.week, args.model.modelDefinitionId),
    runTransaction: async (fn) =>
      prisma.$transaction(
        async (tx) => fn(bindTx(tx)),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      ),
    readRun: async (id: string) => {
      const run = await prisma.shadowModelCaptureRun.findUnique({
        where: { id },
        include: {
          predictions: {
            select: {
              id: true,
              gameId: true,
              predictionStatus: true,
              selectedSide: true,
            },
          },
        },
      });
      if (!run) return null;
      return mapExisting(run);
    },
    fingerprintOfficialFlat100Bets: async () => {
      const rows = await prisma.bet.findMany({
        where: {
          season: cohortArgs.season,
          week: cohortArgs.week,
          strategyTag: 'official_flat_100',
        },
        select: {
          id: true,
          season: true,
          week: true,
          gameId: true,
          marketType: true,
          side: true,
          modelPrice: true,
          closePrice: true,
          stake: true,
          strategyTag: true,
          source: true,
          result: true,
          pnl: true,
          clv: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { id: 'asc' },
      });
      return fingerprintOfficialFlat100BetRows(
        rows.map((r) => ({
          ...r,
          modelPrice: toFinite(r.modelPrice),
          closePrice: toFinite(r.closePrice),
          stake: toFinite(r.stake),
          pnl: toFinite(r.pnl),
          clv: toFinite(r.clv),
        }))
      );
    },
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const context = validateCaptureContext(args.captureContext);
  if (!context.ok) {
    console.error(JSON.stringify({ ok: false, error: context.reason }, null, 2));
    process.exit(1);
  }
  if (!isShadowModelAllowlisted(args.modelId)) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: 'model_id_not_allowlisted',
          modelId: args.modelId,
          allowlist: [...SHADOW_MODEL_ALLOWLIST],
        },
        null,
        2
      )
    );
    process.exit(1);
  }
  if (args.mode !== 'PREVIEW' && args.mode !== 'COMMIT') {
    console.error(JSON.stringify({ ok: false, error: 'mode_invalid' }, null, 2));
    process.exit(1);
  }
  const commitBlock = shadowModelCommitAuthorizationError(args.mode, args.modelId);
  if (commitBlock) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: 'model_id_not_commit_allowlisted',
          modelId: commitBlock.modelId,
          mode: commitBlock.mode,
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const model = resolveModelDefinition(args.modelId);
  const reportPath =
    args.reportPath ??
    defaultReportPath(args.season, args.week, args.modelId, args.mode);
  const repoCommitSha = readRepoCommitSha();

  const prisma = new PrismaClient();
  try {
    const persistence = createPrismaPersistence(prisma, {
      season: args.season,
      week: args.week,
      captureContext: context.value,
      model,
    });
    const { plan, execution, report } = await executeShadowModelCapture({
      season: args.season,
      week: args.week,
      mode: args.mode,
      captureContext: context.value,
      confirmation: args.confirmation,
      repoCommitSha,
      model,
      persistence,
    });

    const artifact = {
      ...report,
      marketAgeDistribution: marketAgeDistribution(report.marketAgeSeconds),
      execution,
      expectedConfirmation:
        args.mode === 'COMMIT'
          ? expectedShadowModelWriteConfirmation(args.week, model.modelDefinitionId)
          : null,
      pinnedHashes: {
        modelDefinitionHash: model.modelDefinitionHash,
        featureDefinitionHash: model.featureDefinitionHash,
        policyDefinitionHash: model.policyDefinitionHash,
      },
      researchOnly: true,
      productionCommitAuthorized: false,
      hybridShadowSnapshotV1Untouched: true,
      prismaMigrateInvoked: false,
    };

    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(artifact, null, 2), 'utf8');

    console.log(
      JSON.stringify(
        {
          ok: plan.ok && (args.mode === 'PREVIEW' || execution.commitSucceeded || execution.transactionalIdempotentNoOp),
          mode: args.mode,
          modelDefinitionId: model.modelDefinitionId,
          writeSafe: plan.writeSafe,
          writeBlockers: plan.writeBlockers,
          counts: plan.counts,
          providerCalls: 0,
          mutationsInvoked: execution.mutationsInvoked,
          betWrites: false,
          hybridShadowWrites: false,
          reportPath,
        },
        null,
        2
      )
    );

    if (args.mode === 'PREVIEW') {
      process.exit(resolvePreviewExitCode(plan.writeSafe));
    }
    if (!execution.commitSucceeded && !execution.transactionalIdempotentNoOp) {
      process.exit(1);
    }
    process.exit(0);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
