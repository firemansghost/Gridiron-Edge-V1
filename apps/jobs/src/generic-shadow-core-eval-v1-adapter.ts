/**
 * Generic Shadow CORE_EVAL_V1 — SELECT-only Prisma adapter.
 *
 * Loads one exact Generic Shadow capture cohort plus canonical Game results and
 * legitimately persisted Generic T-30 closing evidence. No providers, writes,
 * transactions, migrations, or Hybrid evidence.
 */

import type { PrismaClient } from '@prisma/client';
import type {
  GenericShadowCoreEvalFrame,
  GenericShadowEvalClosing,
  GenericShadowEvalGame,
  GenericShadowEvalPrediction,
} from '../../web/lib/generic-shadow-core-eval-v1';

export interface GenericShadowCoreEvalLoadResult {
  frame: GenericShadowCoreEvalFrame | null;
  blockers: string[];
  providerCalls: 0;
  mutationsInvoked: false;
}

export async function loadGenericShadowCoreEvalFrame(
  prisma: PrismaClient,
  captureRunId: string
): Promise<GenericShadowCoreEvalLoadResult> {
  const run = await prisma.shadowModelCaptureRun.findUnique({
    where: { id: captureRunId },
    select: {
      id: true,
      season: true,
      week: true,
      captureContext: true,
      evaluationProtocol: true,
      modelFamily: true,
      modelDefinitionId: true,
      modelDefinitionHash: true,
      featureDefinitionId: true,
      featureDefinitionHash: true,
      policyDefinitionId: true,
      policyDefinitionHash: true,
      repoCommitSha: true,
      captureTimestamp: true,
      expectedGameIds: true,
      totalGames: true,
      availableCount: true,
      unavailableCount: true,
      selectionCount: true,
      noSelectionCount: true,
      status: true,
    },
  });

  if (!run) {
    return {
      frame: null,
      blockers: ['capture_run_not_found'],
      providerCalls: 0,
      mutationsInvoked: false,
    };
  }

  const predictionRows = await prisma.shadowModelPrediction.findMany({
    where: { captureRunId },
    select: {
      id: true,
      captureRunId: true,
      gameId: true,
      season: true,
      week: true,
      homeTeamId: true,
      awayTeamId: true,
      kickoffTimestamp: true,
      predictionTimestamp: true,
      predictionStatus: true,
      unavailableReasons: true,
      marketType: true,
      selectedSide: true,
      selectedTeamId: true,
      predictionPickValue: true,
    },
    orderBy: [{ gameId: 'asc' }, { id: 'asc' }],
  });

  const gameIds = [...new Set(predictionRows.map((row) => row.gameId))];
  const predictionIds = predictionRows.map((row) => row.id);

  const gameRows = gameIds.length
    ? await prisma.game.findMany({
        where: { id: { in: gameIds } },
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
        orderBy: { id: 'asc' },
      })
    : [];

  const closingRows = predictionIds.length
    ? await prisma.shadowModelClosingMarketSnapshot.findMany({
        where: { predictionId: { in: predictionIds } },
        select: {
          id: true,
          predictionId: true,
          gameId: true,
          evaluationProtocol: true,
          closingDefinitionId: true,
          closingDefinitionHash: true,
          status: true,
          unavailableReason: true,
          canonicalMarketHma: true,
        },
        orderBy: [{ predictionId: 'asc' }, { id: 'asc' }],
      })
    : [];

  const predictions: GenericShadowEvalPrediction[] = predictionRows.map((row) => ({
    id: row.id,
    captureRunId: row.captureRunId,
    gameId: row.gameId,
    season: row.season,
    week: row.week,
    homeTeamId: row.homeTeamId,
    awayTeamId: row.awayTeamId,
    kickoffTimestamp: row.kickoffTimestamp,
    predictionTimestamp: row.predictionTimestamp,
    predictionStatus: String(row.predictionStatus),
    unavailableReasons: [...row.unavailableReasons],
    marketType: String(row.marketType),
    selectedSide: row.selectedSide == null ? null : String(row.selectedSide),
    selectedTeamId: row.selectedTeamId,
    predictionPickValue: row.predictionPickValue,
  }));

  const games: GenericShadowEvalGame[] = gameRows.map((row) => ({
    id: row.id,
    season: row.season,
    week: row.week,
    homeTeamId: row.homeTeamId,
    awayTeamId: row.awayTeamId,
    status: String(row.status),
    homeScore: row.homeScore,
    awayScore: row.awayScore,
  }));

  const closings: GenericShadowEvalClosing[] = closingRows.map((row) => ({
    id: row.id,
    predictionId: row.predictionId,
    gameId: row.gameId,
    evaluationProtocol: row.evaluationProtocol,
    closingDefinitionId: row.closingDefinitionId,
    closingDefinitionHash: row.closingDefinitionHash,
    status: String(row.status),
    unavailableReason: row.unavailableReason,
    canonicalMarketHma: row.canonicalMarketHma,
  }));

  return {
    frame: {
      captureRun: {
        id: run.id,
        season: run.season,
        week: run.week,
        captureContext: run.captureContext,
        evaluationProtocol: run.evaluationProtocol,
        modelFamily: run.modelFamily,
        modelDefinitionId: run.modelDefinitionId,
        modelDefinitionHash: run.modelDefinitionHash,
        featureDefinitionId: run.featureDefinitionId,
        featureDefinitionHash: run.featureDefinitionHash,
        policyDefinitionId: run.policyDefinitionId,
        policyDefinitionHash: run.policyDefinitionHash,
        repoCommitSha: run.repoCommitSha,
        captureTimestamp: run.captureTimestamp,
        expectedGameIds: run.expectedGameIds,
        totalGames: run.totalGames,
        availableCount: run.availableCount,
        unavailableCount: run.unavailableCount,
        selectionCount: run.selectionCount,
        noSelectionCount: run.noSelectionCount,
        status: String(run.status),
      },
      predictions,
      closings,
      games,
    },
    blockers: [],
    providerCalls: 0,
    mutationsInvoked: false,
  };
}
