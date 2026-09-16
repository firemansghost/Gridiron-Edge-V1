/**
 * Candidate B V1 runtime snapshot pin tests.
 * Synthetic fixtures only. No DATABASE_URL. No providers. No COMMIT.
 */

import {
  buildSourceManifest,
  buildSourceProvenanceManifest,
  deriveCandidateBSnapshot,
  emptyDirection,
  hashTalentProvenance,
  hashTalentValues,
  verifyPersistedSnapshotIntegrity,
  type PersistedSnapshot,
} from '../src/research/candidate-b/candidate-b-v1-feature-snapshot';
import {
  CANDIDATE_B_FEATURE_SNAPSHOT_ABSENT,
  CANDIDATE_B_FEATURE_SNAPSHOT_IDENTITY_MISMATCH,
  CANDIDATE_B_FEATURE_SNAPSHOT_INTEGRITY_FAILED,
  CANDIDATE_B_FROZEN_FEATURE_SNAPSHOT_HASH,
  asCandidateBFrozenTeamRow,
  assertCandidateBRuntimeSnapshot,
  mapCandidateBSnapshotToFrozenFeatureSnapshot,
} from '../src/research/candidate-b/candidate-b-v1-runtime-snapshot';

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function deriveSyntheticSnapshot(teamCount: number) {
  const ids = Array.from({ length: teamCount }, (_, i) => `t${String(i).padStart(3, '0')}`);
  const prior = new Map(ids.map((id, i) => [id, i + 1]));
  const talent = new Map(ids.map((id, i) => [id, 100 + i]));
  const returning = new Map(ids.map((id, i) => [id, 0.01 * (i + 1)]));
  const portalByTeamId = new Map(
    ids.map((id, i) => {
      if (i % 7 === 0) {
        return [
          id,
          { inbound: emptyDirection(), outbound: emptyDirection(), portalRaw: null },
        ] as const;
      }
      return [
        id,
        {
          inbound: {
            transferCount: 2,
            ratedCount: 2,
            ratedCoverage: 1,
            directionStatus: 'SUFFICIENT_RATED_COVERAGE' as const,
            meanRating: 0.8,
            centeredQuality: 0.1,
          },
          outbound: emptyDirection(),
          portalRaw: 0.001 * (i + 1),
        },
      ] as const;
    })
  );
  const talentRows = ids.map((teamId, i) => ({
    teamId,
    season: 2026,
    talentComposite: 100 + i,
  }));
  const snapshot = deriveCandidateBSnapshot({
    teamIds: ids,
    priorCoreByTeamId: prior,
    talentByTeamId: talent,
    returningByTeamId: returning,
    portalByTeamId: new Map(portalByTeamId),
    muPortal: 0.5,
    sourceManifest: buildSourceManifest({
      coreSha256: 'c'.repeat(64),
      returningSha256: 'd'.repeat(64),
      portalSha256: 'e'.repeat(64),
      muPortal: 0.5,
      talentValueHash: hashTalentValues(talentRows),
    }),
    sourceProvenanceManifest: buildSourceProvenanceManifest({
      coreRetrievedAt: iso(1_000),
      returningRetrievedAt: iso(2_000),
      portalRetrievedAt: iso(3_000),
      coreRelativePath: '.research-data/core/raw.json',
      returningRelativePath: '.research-data/open/returning.json',
      portalRelativePath: '.research-data/open/portal.json',
      talentProvenanceHash: hashTalentProvenance(
        ids.map((teamId) => ({
          teamId,
          season: 2026,
          createdAt: iso(1_000),
          updatedAt: iso(2_000),
          sourceUpdatedAt: null,
        }))
      ),
    }),
    talentValueHash: hashTalentValues(talentRows),
    talentProvenanceHash: hashTalentProvenance(
      ids.map((teamId) => ({
        teamId,
        season: 2026,
        createdAt: iso(1_000),
        updatedAt: iso(2_000),
        sourceUpdatedAt: null,
      }))
    ),
  });
  const persisted: PersistedSnapshot = {
    id: 'snap-runtime',
    season: snapshot.season,
    snapshotKind: snapshot.snapshotKind,
    modelFamily: snapshot.modelFamily,
    modelDefinitionId: snapshot.modelDefinitionId,
    featureDefinitionId: snapshot.featureDefinitionId,
    featureDefinitionVersion: snapshot.featureDefinitionVersion,
    featureDefinitionHash: snapshot.featureDefinitionHash,
    featureDefinitionManifest: snapshot.featureDefinitionManifest,
    derivationDefinitionId: snapshot.derivationDefinitionId,
    derivationDefinitionHash: snapshot.derivationDefinitionHash,
    derivationDefinitionManifest: snapshot.derivationDefinitionManifest,
    sourceManifest: snapshot.sourceManifest,
    sourceManifestHash: snapshot.sourceManifestHash,
    sourceProvenanceManifest: snapshot.sourceProvenanceManifest,
    sourceProvenanceManifestHash: snapshot.sourceProvenanceManifestHash,
    normalizationManifest: snapshot.normalizationManifest,
    normalizationManifestHash: snapshot.normalizationManifestHash,
    populationManifest: snapshot.populationManifest,
    populationManifestHash: snapshot.populationManifestHash,
    expectedTeamCount: snapshot.expectedTeamCount,
    rowCount: snapshot.rowCount,
    completeVectorCount: snapshot.completeVectorCount,
    unavailableVectorCount: snapshot.unavailableVectorCount,
    portalAvailableCount: snapshot.portalAvailableCount,
    snapshotHash: snapshot.snapshotHash,
    teams: snapshot.teams,
  };
  return persisted;
}

describe('Candidate B runtime snapshot validation', () => {
  it('missing snapshot fails closed as absent', () => {
    expect(() => assertCandidateBRuntimeSnapshot(null)).toThrow(
      CANDIDATE_B_FEATURE_SNAPSHOT_ABSENT
    );
  });

  it('failed integrity fails closed before pin comparison', () => {
    const snapshot = deriveSyntheticSnapshot(138);
    expect(
      verifyPersistedSnapshotIntegrity(snapshot, { expectedTeamCount: 138 })
    ).toBe(true);
    snapshot.teams[0] = { ...snapshot.teams[0], rowHash: '0'.repeat(64) };
    expect(() => assertCandidateBRuntimeSnapshot(snapshot)).toThrow(
      CANDIDATE_B_FEATURE_SNAPSHOT_INTEGRITY_FAILED
    );
  });

  it('integrity-valid synthetic snapshot is identity-mismatch against the frozen pin', () => {
    const snapshot = deriveSyntheticSnapshot(138);
    expect(
      verifyPersistedSnapshotIntegrity(snapshot, { expectedTeamCount: 138 })
    ).toBe(true);
    expect(snapshot.snapshotHash).not.toBe(CANDIDATE_B_FROZEN_FEATURE_SNAPSHOT_HASH);
    expect(() => assertCandidateBRuntimeSnapshot(snapshot)).toThrow(
      CANDIDATE_B_FEATURE_SNAPSHOT_IDENTITY_MISMATCH
    );
  });

  it.each([
    ['wrong snapshotHash', (s: PersistedSnapshot) => {
      s.snapshotHash = CANDIDATE_B_FROZEN_FEATURE_SNAPSHOT_HASH;
    }],
    ['wrong feature id', (s: PersistedSnapshot) => {
      s.featureDefinitionId = 'not_candidate_b';
    }],
    ['wrong feature version', (s: PersistedSnapshot) => {
      s.featureDefinitionVersion = 'v2';
    }],
    ['wrong feature hash', (s: PersistedSnapshot) => {
      s.featureDefinitionHash = '0'.repeat(64);
    }],
    ['wrong derivation id', (s: PersistedSnapshot) => {
      s.derivationDefinitionId = 'not_candidate_b';
    }],
    ['wrong derivation hash', (s: PersistedSnapshot) => {
      s.derivationDefinitionHash = '0'.repeat(64);
    }],
    ['wrong source hash', (s: PersistedSnapshot) => {
      s.sourceManifestHash = '0'.repeat(64);
    }],
    ['wrong provenance hash', (s: PersistedSnapshot) => {
      s.sourceProvenanceManifestHash = '0'.repeat(64);
    }],
    ['wrong normalization hash', (s: PersistedSnapshot) => {
      s.normalizationManifestHash = '0'.repeat(64);
    }],
    ['wrong population hash', (s: PersistedSnapshot) => {
      s.populationManifestHash = '0'.repeat(64);
    }],
    ['wrong team-resolution', (s: PersistedSnapshot) => {
      s.sourceManifest = { teamResolution: { policyId: 'x', policyHash: 'y' } };
    }],
    ['wrong expectedTeamCount', (s: PersistedSnapshot) => {
      s.expectedTeamCount = 137;
    }],
    ['wrong rowCount', (s: PersistedSnapshot) => {
      s.rowCount = 137;
    }],
    ['wrong completeVectorCount', (s: PersistedSnapshot) => {
      s.completeVectorCount = 1;
    }],
    ['wrong unavailableVectorCount', (s: PersistedSnapshot) => {
      s.unavailableVectorCount = 1;
    }],
    ['wrong portalAvailableCount', (s: PersistedSnapshot) => {
      s.portalAvailableCount = 1;
    }],
  ])('%s fails closed', (_label, mutate) => {
    const snapshot = deriveSyntheticSnapshot(138);
    mutate(snapshot);
    expect(() => assertCandidateBRuntimeSnapshot(snapshot)).toThrow(
      /candidate_b_feature_snapshot_(identity_mismatch|integrity_failed)/
    );
  });

  it('does not call classifyExistingSnapshot', () => {
    const src = require('fs').readFileSync(
      require('path').join(
        __dirname,
        '../src/research/candidate-b/candidate-b-v1-runtime-snapshot.ts'
      ),
      'utf8'
    );
    expect(src).not.toMatch(/\bclassifyExistingSnapshot\b/);
  });

  it('maps persisted teams into teamsById without copying runtime-only fields into predictions', () => {
    const snapshot = deriveSyntheticSnapshot(3);
    const frozen = mapCandidateBSnapshotToFrozenFeatureSnapshot(snapshot);
    expect(frozen.parentId).toBe(snapshot.id);
    expect(frozen.snapshotHash).toBe(snapshot.snapshotHash);
    expect(Object.keys(frozen.teamsById).sort()).toEqual(
      snapshot.teams.map((t) => t.teamId).sort()
    );
    const team = asCandidateBFrozenTeamRow(frozen.teamsById[snapshot.teams[0].teamId]);
    expect(team?.priorCoreRaw).toBe(snapshot.teams[0].priorCoreRaw);
    expect(team?.candidateBTeamRatingPoints).toBe(snapshot.teams[0].candidateBTeamRatingPoints);
    expect(team?.rowHash).toBe(snapshot.teams[0].rowHash);
    expect(team).not.toHaveProperty('inboundTransferCount');
  });
});
