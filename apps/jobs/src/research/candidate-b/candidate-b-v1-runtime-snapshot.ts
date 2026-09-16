/**
 * Candidate B V1 Generic Shadow runtime snapshot pin + frozen-frame mapping.
 *
 * Pure except for calling the already-proven persisted integrity verifier.
 * Does not re-derive from PIT / talent / CFBD. Runtime does not reclassify snapshots.
 */

import type {
  FrozenShadowFeatureSnapshot,
  FrozenShadowFeatureTeamRow,
} from '../../../../web/lib/shadow-model-capture-v1';
import {
  CANDIDATE_B_EXPECTED_COMPLETE_VECTOR_COUNT,
  CANDIDATE_B_EXPECTED_PORTAL_AVAILABLE_COUNT,
  CANDIDATE_B_EXPECTED_TEAM_COUNT,
  CANDIDATE_B_EXPECTED_UNAVAILABLE_VECTOR_COUNT,
  CANDIDATE_B_SEASON,
  DERIVATION_DEFINITION_HASH,
  DERIVATION_DEFINITION_ID,
  FEATURE_DEFINITION_HASH,
  FEATURE_DEFINITION_ID,
  FEATURE_DEFINITION_VERSION,
  hasExpectedTeamResolutionPolicyPin,
  verifyPersistedSnapshotIntegrity,
  type PersistedSnapshot,
  type PersistedTeamRow,
} from './candidate-b-v1-feature-snapshot';

export const CANDIDATE_B_FEATURE_SNAPSHOT_ABSENT = 'candidate_b_feature_snapshot_absent';
export const CANDIDATE_B_FEATURE_SNAPSHOT_IDENTITY_MISMATCH =
  'candidate_b_feature_snapshot_identity_mismatch';
export const CANDIDATE_B_FEATURE_SNAPSHOT_INTEGRITY_FAILED =
  'candidate_b_feature_snapshot_integrity_failed';

export const CANDIDATE_B_FROZEN_FEATURE_SNAPSHOT_HASH =
  '0332e24f97c891fd6431280fa7939c467c614714abe207eeb3dc89d466eb1148';
export const CANDIDATE_B_FROZEN_SOURCE_MANIFEST_HASH =
  '183e07cec8ab146247f8b15eda93331a1dfe03f624b06fd8b0dae886d14b14d6';
export const CANDIDATE_B_FROZEN_SOURCE_PROVENANCE_MANIFEST_HASH =
  '89ea635c89898aa2de5fad66a43e6eca36ef917f6945cc82635536746347f8da';
export const CANDIDATE_B_FROZEN_NORMALIZATION_MANIFEST_HASH =
  '9de2fdbf94581f05671349111ae36e458c94ac637b93e8db0eaea701abdeaa96';
export const CANDIDATE_B_FROZEN_POPULATION_MANIFEST_HASH =
  'ce7a633f3230864c785048047698a3ba55fef1e25339e87db2a090bd65c59f2c';

export interface CandidateBFrozenShadowFeatureTeamRow extends FrozenShadowFeatureTeamRow {
  priorCoreRaw: number | null;
  talentRaw: number | null;
  returningRaw: number | null;
  portalRaw: number | null;
  zCore: number | null;
  zTalent: number | null;
  zReturning: number | null;
  zPortal: number | null;
  candidateBRawComposite: number | null;
  candidateBCompositeZ: number | null;
  candidateBTeamRatingPoints: number | null;
}

function pinsMatch(snapshot: PersistedSnapshot): boolean {
  return (
    snapshot.season === CANDIDATE_B_SEASON &&
    snapshot.snapshotHash === CANDIDATE_B_FROZEN_FEATURE_SNAPSHOT_HASH &&
    snapshot.featureDefinitionId === FEATURE_DEFINITION_ID &&
    snapshot.featureDefinitionVersion === FEATURE_DEFINITION_VERSION &&
    snapshot.featureDefinitionHash === FEATURE_DEFINITION_HASH &&
    snapshot.derivationDefinitionId === DERIVATION_DEFINITION_ID &&
    snapshot.derivationDefinitionHash === DERIVATION_DEFINITION_HASH &&
    snapshot.sourceManifestHash === CANDIDATE_B_FROZEN_SOURCE_MANIFEST_HASH &&
    snapshot.sourceProvenanceManifestHash === CANDIDATE_B_FROZEN_SOURCE_PROVENANCE_MANIFEST_HASH &&
    snapshot.normalizationManifestHash === CANDIDATE_B_FROZEN_NORMALIZATION_MANIFEST_HASH &&
    snapshot.populationManifestHash === CANDIDATE_B_FROZEN_POPULATION_MANIFEST_HASH &&
    hasExpectedTeamResolutionPolicyPin(snapshot.sourceManifest) &&
    snapshot.expectedTeamCount === CANDIDATE_B_EXPECTED_TEAM_COUNT &&
    snapshot.rowCount === CANDIDATE_B_EXPECTED_TEAM_COUNT &&
    snapshot.completeVectorCount === CANDIDATE_B_EXPECTED_COMPLETE_VECTOR_COUNT &&
    snapshot.unavailableVectorCount === CANDIDATE_B_EXPECTED_UNAVAILABLE_VECTOR_COUNT &&
    snapshot.portalAvailableCount === CANDIDATE_B_EXPECTED_PORTAL_AVAILABLE_COUNT &&
    snapshot.teams.length === CANDIDATE_B_EXPECTED_TEAM_COUNT
  );
}

export function assertCandidateBRuntimeSnapshot(
  snapshot: PersistedSnapshot | null
): PersistedSnapshot {
  if (!snapshot) {
    throw new Error(CANDIDATE_B_FEATURE_SNAPSHOT_ABSENT);
  }
  if (
    !verifyPersistedSnapshotIntegrity(snapshot, {
      expectedTeamCount: CANDIDATE_B_EXPECTED_TEAM_COUNT,
    })
  ) {
    throw new Error(CANDIDATE_B_FEATURE_SNAPSHOT_INTEGRITY_FAILED);
  }
  if (!pinsMatch(snapshot)) {
    throw new Error(CANDIDATE_B_FEATURE_SNAPSHOT_IDENTITY_MISMATCH);
  }
  return snapshot;
}

export function candidateBTeamRowToFrozenView(
  row: PersistedTeamRow
): CandidateBFrozenShadowFeatureTeamRow {
  return {
    teamId: row.teamId,
    season: row.season,
    availabilityStatus: row.availabilityStatus,
    unavailableReasons: [...row.unavailableReasons],
    priorCoreRaw: row.priorCoreRaw,
    talentRaw: row.talentRaw,
    returningRaw: row.returningRaw,
    portalRaw: row.portalRaw,
    zCore: row.zCore,
    zTalent: row.zTalent,
    zReturning: row.zReturning,
    zPortal: row.zPortal,
    candidateBRawComposite: row.candidateBRawComposite,
    candidateBCompositeZ: row.candidateBCompositeZ,
    candidateBTeamRatingPoints: row.candidateBTeamRatingPoints,
    rowHash: row.rowHash,
  };
}

export function mapCandidateBSnapshotToFrozenFeatureSnapshot(
  snapshot: PersistedSnapshot
): FrozenShadowFeatureSnapshot {
  const teamsById: Record<string, CandidateBFrozenShadowFeatureTeamRow> = {};
  for (const team of snapshot.teams) {
    teamsById[team.teamId] = candidateBTeamRowToFrozenView(team);
  }
  return {
    parentId: snapshot.id,
    season: snapshot.season,
    snapshotHash: snapshot.snapshotHash,
    featureDefinitionId: snapshot.featureDefinitionId,
    featureDefinitionVersion: snapshot.featureDefinitionVersion,
    featureDefinitionHash: snapshot.featureDefinitionHash,
    derivationDefinitionId: snapshot.derivationDefinitionId,
    derivationDefinitionHash: snapshot.derivationDefinitionHash,
    sourceManifestHash: snapshot.sourceManifestHash,
    sourceProvenanceManifestHash: snapshot.sourceProvenanceManifestHash,
    normalizationManifestHash: snapshot.normalizationManifestHash,
    populationManifestHash: snapshot.populationManifestHash,
    expectedTeamCount: snapshot.expectedTeamCount,
    rowCount: snapshot.rowCount,
    completeVectorCount: snapshot.completeVectorCount,
    unavailableVectorCount: snapshot.unavailableVectorCount,
    portalAvailableCount: snapshot.portalAvailableCount,
    teamsById,
  };
}

export function asCandidateBFrozenTeamRow(
  row: FrozenShadowFeatureTeamRow | undefined
): CandidateBFrozenShadowFeatureTeamRow | undefined {
  if (!row) return undefined;
  return row as CandidateBFrozenShadowFeatureTeamRow;
}
