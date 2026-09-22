/**
 * Jobs-layer model-aware OperationalShadowModelFrame loader.
 *
 * Core keeps the current V1 TeamSeasonRating path.
 * Candidate B loads the exact pinned persisted feature snapshot only.
 * Prisma stays in the jobs layer. No provider calls.
 */

import { Prisma, PrismaClient } from '@prisma/client';
import {
  CORE_V1_SHADOW_BASELINE_MODEL_ID,
} from '../../web/lib/shadow-models/core-v1-shadow-baseline-v1';
import type { OperationalShadowModelFrame } from '../../web/lib/shadow-model-capture-v1';
import { CANDIDATE_B_GENERIC_SHADOW_MODEL_ID } from './research/candidate-b/candidate-b-v1-shadow-adapter';
import { CANDIDATE_B_ELO_GENERIC_SHADOW_MODEL_ID } from './research/candidate-b/candidate-b-elo-prior-v1-shadow-adapter';
import {
  loadCandidateBPersistedSnapshotBySnapshotHash,
  type CandidateBPersistedSnapshotDb,
} from './research/candidate-b/candidate-b-v1-persisted-snapshot-reader';
import {
  CANDIDATE_B_FROZEN_FEATURE_SNAPSHOT_HASH,
  assertCandidateBRuntimeSnapshot,
  mapCandidateBSnapshotToFrozenFeatureSnapshot,
} from './research/candidate-b/candidate-b-v1-runtime-snapshot';

export type ShadowModelOperationalFrameDb = PrismaClient | Prisma.TransactionClient;

function toFinite(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

async function loadGamesAndSpreadMarkets(
  db: ShadowModelOperationalFrameDb,
  season: number,
  week: number
): Promise<Pick<OperationalShadowModelFrame, 'games' | 'marketLines'>> {
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
    marketLines: marketRaw.map((r) => ({
      id: r.id,
      gameId: r.gameId,
      lineType: String(r.lineType),
      lineValue: r.lineValue,
      teamId: r.teamId,
      bookName: r.bookName,
      source: r.source,
      timestamp: r.timestamp,
    })),
  };
}

async function loadCoreV1Ratings(
  db: ShadowModelOperationalFrameDb,
  season: number
): Promise<OperationalShadowModelFrame['ratings']> {
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
  return ratingsRaw.map((r) => ({
    teamId: r.teamId,
    season: r.season,
    modelVersion: r.modelVersion,
    powerRating: toFinite(r.powerRating),
    rating: toFinite(r.rating),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function loadCandidateBFrozenFeatureFrame(
  db: CandidateBPersistedSnapshotDb
): Promise<OperationalShadowModelFrame['frozenFeatureSnapshots']> {
  const snapshot = await loadCandidateBPersistedSnapshotBySnapshotHash(
    db,
    CANDIDATE_B_FROZEN_FEATURE_SNAPSHOT_HASH
  );
  const validated = assertCandidateBRuntimeSnapshot(snapshot);
  return [mapCandidateBSnapshotToFrozenFeatureSnapshot(validated)];
}

export async function loadOperationalShadowModelFrame(
  db: ShadowModelOperationalFrameDb,
  args: {
    season: number;
    week: number;
    modelDefinitionId: string;
  }
): Promise<OperationalShadowModelFrame> {
  const { games, marketLines } = await loadGamesAndSpreadMarkets(db, args.season, args.week);

  if (args.modelDefinitionId === CORE_V1_SHADOW_BASELINE_MODEL_ID) {
    const ratings = await loadCoreV1Ratings(db, args.season);
    return {
      games,
      ratings,
      marketLines,
    };
  }

  if (args.modelDefinitionId === CANDIDATE_B_GENERIC_SHADOW_MODEL_ID) {
    const frozenFeatureSnapshots = await loadCandidateBFrozenFeatureFrame(db);
    return {
      games,
      ratings: [],
      marketLines,
      frozenFeatureSnapshots,
    };
  }

  if (args.modelDefinitionId === CANDIDATE_B_ELO_GENERIC_SHADOW_MODEL_ID) {
    return {
      games,
      ratings: [],
      marketLines,
    };
  }

  throw new Error(`shadow_model_frame_model_unsupported:${args.modelDefinitionId}`);
}
