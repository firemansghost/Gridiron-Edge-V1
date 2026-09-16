/**
 * Shared exact Candidate B V1 persisted-snapshot reader.
 *
 * Parent Prisma read never includes child teams. Child floats use the exact
 * float8send path. normalizationManifest uses the canonical-text decoder.
 * Write semantics are unchanged and live elsewhere.
 */

import { Prisma } from '@prisma/client';
import {
  CANDIDATE_B_SEASON,
  DERIVATION_DEFINITION_ID,
  FEATURE_DEFINITION_ID,
  FEATURE_DEFINITION_VERSION,
  type PersistedSnapshot,
  type PersistedTeamRow,
} from './candidate-b-v1-feature-snapshot';
import { loadCandidateBFeatureSnapshotTeamsExact } from './candidate-b-v1-exact-float8-reader';
import { decodeCandidateBNormalizationManifest } from './candidate-b-v1-normalization-manifest-transport';

export const CANDIDATE_B_V1_STABLE_IDENTITY = {
  season: CANDIDATE_B_SEASON,
  featureDefinitionId: FEATURE_DEFINITION_ID,
  featureDefinitionVersion: FEATURE_DEFINITION_VERSION,
  derivationDefinitionId: DERIVATION_DEFINITION_ID,
} as const;

export type CandidateBPersistedSnapshotDb = {
  shadowModelFeatureSnapshot: {
    findUnique: (args: {
      where:
        | {
            season_featureDefinitionId_featureDefinitionVersion_derivationDefinitionId: typeof CANDIDATE_B_V1_STABLE_IDENTITY;
          }
        | { snapshotHash: string };
    }) => Promise<CandidateBPersistedSnapshotParentRow | null>;
  };
  $queryRaw: (query: Prisma.Sql) => PromiseLike<unknown>;
};

export interface CandidateBPersistedSnapshotParentRow {
  id: string;
  season: number;
  snapshotKind: string;
  modelFamily: string;
  modelDefinitionId: string;
  featureDefinitionId: string;
  featureDefinitionVersion: string;
  featureDefinitionHash: string;
  featureDefinitionManifest: unknown;
  derivationDefinitionId: string;
  derivationDefinitionHash: string;
  derivationDefinitionManifest: unknown;
  sourceManifest: unknown;
  sourceManifestHash: string;
  sourceProvenanceManifest: unknown;
  sourceProvenanceManifestHash: string;
  normalizationManifest: unknown;
  normalizationManifestHash: string;
  populationManifest: unknown;
  populationManifestHash: string;
  expectedTeamCount: number;
  rowCount: number;
  completeVectorCount: number;
  unavailableVectorCount: number;
  portalAvailableCount: number;
  snapshotHash: string;
}

export function mapCandidateBPersistedSnapshot(
  row: CandidateBPersistedSnapshotParentRow,
  teams: PersistedTeamRow[],
  normalizationManifest: unknown
): PersistedSnapshot {
  return {
    id: row.id,
    season: row.season,
    snapshotKind: row.snapshotKind,
    modelFamily: row.modelFamily,
    modelDefinitionId: row.modelDefinitionId,
    featureDefinitionId: row.featureDefinitionId,
    featureDefinitionVersion: row.featureDefinitionVersion,
    featureDefinitionHash: row.featureDefinitionHash,
    featureDefinitionManifest: row.featureDefinitionManifest,
    derivationDefinitionId: row.derivationDefinitionId,
    derivationDefinitionHash: row.derivationDefinitionHash,
    derivationDefinitionManifest: row.derivationDefinitionManifest,
    sourceManifest: row.sourceManifest,
    sourceManifestHash: row.sourceManifestHash,
    sourceProvenanceManifest: row.sourceProvenanceManifest,
    sourceProvenanceManifestHash: row.sourceProvenanceManifestHash,
    normalizationManifest,
    normalizationManifestHash: row.normalizationManifestHash,
    populationManifest: row.populationManifest,
    populationManifestHash: row.populationManifestHash,
    expectedTeamCount: row.expectedTeamCount,
    rowCount: row.rowCount,
    completeVectorCount: row.completeVectorCount,
    unavailableVectorCount: row.unavailableVectorCount,
    portalAvailableCount: row.portalAvailableCount,
    snapshotHash: row.snapshotHash,
    teams,
  };
}

export function candidateBParentFindUniqueArgsExcludeChildInclude(
  args: Record<string, unknown> | undefined
): boolean {
  return !args || !Object.prototype.hasOwnProperty.call(args, 'include');
}

async function hydrateCandidateBPersistedSnapshot(
  db: CandidateBPersistedSnapshotDb,
  row: CandidateBPersistedSnapshotParentRow
): Promise<PersistedSnapshot> {
  const teams = await loadCandidateBFeatureSnapshotTeamsExact(db, row.id);
  const normalizationManifest = decodeCandidateBNormalizationManifest(
    row.normalizationManifest,
    row.normalizationManifestHash
  );
  return mapCandidateBPersistedSnapshot(row, teams, normalizationManifest);
}

export async function loadCandidateBPersistedSnapshotByStableIdentity(
  db: CandidateBPersistedSnapshotDb
): Promise<PersistedSnapshot | null> {
  const row = await db.shadowModelFeatureSnapshot.findUnique({
    where: {
      season_featureDefinitionId_featureDefinitionVersion_derivationDefinitionId:
        CANDIDATE_B_V1_STABLE_IDENTITY,
    },
  });
  if (!row) return null;
  return hydrateCandidateBPersistedSnapshot(db, row);
}

export async function loadCandidateBPersistedSnapshotBySnapshotHash(
  db: CandidateBPersistedSnapshotDb,
  snapshotHash: string
): Promise<PersistedSnapshot | null> {
  if (typeof snapshotHash !== 'string' || snapshotHash.length === 0) {
    throw new Error('candidate_b_snapshot_hash_invalid');
  }
  const row = await db.shadowModelFeatureSnapshot.findUnique({
    where: { snapshotHash },
  });
  if (!row) return null;
  return hydrateCandidateBPersistedSnapshot(db, row);
}
