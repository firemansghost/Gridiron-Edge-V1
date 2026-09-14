/**
 * Candidate B V1 feature-snapshot ingest — focused unit + migration contract tests.
 * Synthetic fixtures only. No private PIT. No DATABASE_URL. No providers.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  DERIVATION_DEFINITION_HASH,
  DERIVATION_DEFINITION_MANIFEST,
  FEATURE_DEFINITION_HASH,
  FEATURE_DEFINITION_MANIFEST,
  FROZEN_TEAM_RESOLUTION_POLICY_HASH,
  RATING_SCALE,
  TEAM_RESOLUTION_POLICY_HASH,
  TEAM_RESOLUTION_POLICY_ID,
  TEAM_RESOLUTION_POLICY_MANIFEST,
  aggregatePortalByTeam,
  aggregatePortalDirection,
  assessCandidateBV1Invariants,
  assertAuthoritativeFbsPopulation,
  buildSourceManifest,
  buildSourceProvenanceManifest,
  calculateMuPortal,
  classifyExistingSnapshot,
  computeRowHash,
  computeSnapshotHash,
  createCandidateBCfbdFbsResolver,
  deriveCandidateBSnapshot,
  emptyDirection,
  executeCandidateBFeatureSnapshotIngest,
  expectedCandidateBFeatureSnapshotConfirmation,
  hashTalentProvenance,
  hashTalentValues,
  hasExpectedTeamResolutionPolicyPin,
  isCandidateBAcceptedTeamResolutionMethod,
  parseFrozenPortalPayload,
  parseVerifiedFrozenJson,
  resolveNamedTeamsToFbs,
  resolvePortalCounterpart,
  sha256RawBytes,
  toIsoStringOrNull,
  verifyPersistedSnapshotIntegrity,
  type CandidateBFeatureSnapshotStore,
  type DerivedSnapshot,
  type PersistedSnapshot,
  type TeamFeatureRow,
} from '../src/research/candidate-b/candidate-b-v1-feature-snapshot';
import { TeamResolver, type TeamResolveResult } from '../adapters/TeamResolver';
import { sha256CanonicalJson } from '../../web/lib/shadow-model-capture-v1';

const ROOT = path.resolve(__dirname, '../../..');
const SCHEMA = path.join(ROOT, 'prisma/schema.prisma');
const MIGRATION = path.join(
  ROOT,
  'prisma/migrations/20260914120000_add_shadow_model_feature_snapshot_v1/migration.sql'
);
const PURE = path.join(
  ROOT,
  'apps/jobs/src/research/candidate-b/candidate-b-v1-feature-snapshot.ts'
);
const CLI = path.join(ROOT, 'apps/jobs/ingest-candidate-b-v1-feature-snapshot.ts');

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function teamIds(): string[] {
  return ['alpha', 'beta', 'gamma'];
}

function completePortal(raw: number) {
  return {
    inbound: {
      transferCount: 2,
      ratedCount: 2,
      ratedCoverage: 1,
      directionStatus: 'SUFFICIENT_RATED_COVERAGE' as const,
      meanRating: raw,
      centeredQuality: raw,
    },
    outbound: emptyDirection(),
    portalRaw: raw,
  };
}

function deriveThreeTeamSnapshot(overrides?: {
  missingPortalFor?: string;
  provenanceExtra?: string;
  talentValues?: Record<string, number>;
  sourceManifestPatch?: Record<string, unknown>;
  sourceManifestTransform?: (manifest: Record<string, unknown>) => Record<string, unknown>;
}): DerivedSnapshot {
  const ids = teamIds();
  const talentValues = overrides?.talentValues ?? { alpha: 10, beta: 20, gamma: 30 };
  const prior = new Map([
    ['alpha', 1],
    ['beta', 2],
    ['gamma', 3],
  ]);
  const talent = new Map(Object.entries(talentValues));
  const returning = new Map([
    ['alpha', 0.1],
    ['beta', 0.2],
    ['gamma', 0.3],
  ]);
  const portalRaws: Record<string, number> = { alpha: 0.2, beta: 0.4, gamma: 0.8 };
  const portalByTeamId = new Map(
    ids.map((id) => [
      id,
      id === overrides?.missingPortalFor
        ? {
            inbound: emptyDirection(),
            outbound: aggregatePortalDirection([null, null, 1], 0.5),
            portalRaw: null,
          }
        : completePortal(portalRaws[id]),
    ])
  );
  const talentRows = ids.map((teamId) => ({
    teamId,
    season: 2026,
    talentComposite: talentValues[teamId],
  }));
  const talentValueHash = hashTalentValues(talentRows);
  const talentProvenanceHash = hashTalentProvenance(
    ids.map((teamId) => ({
      teamId,
      season: 2026,
      createdAt: iso(1_000),
      updatedAt: iso(2_000),
      sourceUpdatedAt: null,
    }))
  );
  let sourceManifest: Record<string, unknown> = {
    ...buildSourceManifest({
      coreSha256: 'c'.repeat(64),
      returningSha256: 'd'.repeat(64),
      portalSha256: 'e'.repeat(64),
      muPortal: 0.5,
      talentValueHash,
    }),
    ...overrides?.sourceManifestPatch,
  };
  if (overrides?.sourceManifestTransform) {
    sourceManifest = overrides.sourceManifestTransform(sourceManifest);
  }
  const sourceProvenanceManifest = {
    ...buildSourceProvenanceManifest({
      coreRetrievedAt: iso(3_000),
      returningRetrievedAt: iso(4_000),
      portalRetrievedAt: iso(5_000),
      coreRelativePath: '.research-data/core/raw.json',
      returningRelativePath: '.research-data/open/returning.json',
      portalRelativePath: '.research-data/open/portal.json',
      talentProvenanceHash,
    }),
    diagnostic: overrides?.provenanceExtra ?? null,
  };
  return deriveCandidateBSnapshot({
    teamIds: ids,
    priorCoreByTeamId: prior,
    talentByTeamId: talent,
    returningByTeamId: returning,
    portalByTeamId,
    muPortal: 0.5,
    sourceManifest,
    sourceProvenanceManifest,
    talentValueHash,
    talentProvenanceHash,
  });
}

function toPersisted(snapshot: DerivedSnapshot, provenanceHash = snapshot.sourceProvenanceManifestHash): PersistedSnapshot {
  return {
    id: 'snap-1',
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
    sourceProvenanceManifestHash: provenanceHash,
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
    teams: snapshot.teams.map((t) => ({ ...t })),
  };
}

function memoryStore(
  existing: PersistedSnapshot | null,
  options?: { corruptAfterInsert?: (row: PersistedSnapshot) => PersistedSnapshot }
): Pick<CandidateBFeatureSnapshotStore, 'loadExistingByStableIdentity' | 'runSerializable'> {
  let current = existing;
  let inserted = false;
  return {
    loadExistingByStableIdentity: async () => current,
    runSerializable: async (fn) =>
      fn({
        loadExistingByStableIdentity: async () => {
          if (inserted && options?.corruptAfterInsert && current) {
            return options.corruptAfterInsert(current);
          }
          return current;
        },
        insertSnapshot: async (snapshot) => {
          current = toPersisted(snapshot);
          current.id = 'inserted';
          inserted = true;
        },
      }),
  };
}

describe('Candidate B V1 feature snapshot hashing', () => {
  it('feature manifest hashes deterministically', () => {
    expect(FEATURE_DEFINITION_HASH).toBe(
      '6f1f8ecc132cdd87650252d57597a657ece0dd908bdf5010897023cafe988972'
    );
    expect(sha256CanonicalJson(FEATURE_DEFINITION_MANIFEST)).toBe(FEATURE_DEFINITION_HASH);
    expect(sha256CanonicalJson(FEATURE_DEFINITION_MANIFEST)).toBe(
      sha256CanonicalJson(JSON.parse(JSON.stringify(FEATURE_DEFINITION_MANIFEST)))
    );
  });

  it('derivation manifest hashes deterministically', () => {
    expect(DERIVATION_DEFINITION_HASH).toBe(
      '6c04627787edbcc7d1d42549f3cb19c525a6c4c31de572549f01e3efa64a638c'
    );
    expect(sha256CanonicalJson(DERIVATION_DEFINITION_MANIFEST)).toBe(DERIVATION_DEFINITION_HASH);
    expect(FEATURE_DEFINITION_HASH).not.toBe(DERIVATION_DEFINITION_HASH);
  });

  it('team-resolution policy identity is frozen and content-addressed', () => {
    expect(TEAM_RESOLUTION_POLICY_ID).toBe('candidate_b_v1_team_resolution_policy_v1');
    expect(TEAM_RESOLUTION_POLICY_HASH).toBe(
      'de627563f2c4c2b1e195182bcd6b66dd3226daf9800e209e5f55244f94ea0efe'
    );
    expect(FROZEN_TEAM_RESOLUTION_POLICY_HASH).toBe(TEAM_RESOLUTION_POLICY_HASH);
    expect(sha256CanonicalJson(TEAM_RESOLUTION_POLICY_MANIFEST)).toBe(TEAM_RESOLUTION_POLICY_HASH);
    expect(FEATURE_DEFINITION_HASH).toBe(
      '6f1f8ecc132cdd87650252d57597a657ece0dd908bdf5010897023cafe988972'
    );
    expect(DERIVATION_DEFINITION_HASH).toBe(
      '6c04627787edbcc7d1d42549f3cb19c525a6c4c31de572549f01e3efa64a638c'
    );
  });

  it('sourceManifest pins teamResolution and provenance does not', () => {
    const snapshot = deriveThreeTeamSnapshot();
    expect(snapshot.sourceManifest.teamResolution).toEqual({
      policyId: TEAM_RESOLUTION_POLICY_ID,
      policyHash: TEAM_RESOLUTION_POLICY_HASH,
    });
    expect(snapshot.sourceProvenanceManifest).not.toHaveProperty('teamResolution');
    const provenanceJson = JSON.stringify(snapshot.sourceProvenanceManifest);
    expect(provenanceJson).not.toContain('teamResolution');
    expect(provenanceJson).not.toContain(TEAM_RESOLUTION_POLICY_HASH);
  });

  it('changing only team-resolution policy identity changes sourceManifestHash and snapshotHash', () => {
    const snapshot = deriveThreeTeamSnapshot();
    const mutated = deriveThreeTeamSnapshot({
      sourceManifestPatch: {
        teamResolution: {
          policyId: TEAM_RESOLUTION_POLICY_ID,
          policyHash: '0'.repeat(64),
        },
      },
    });
    expect(mutated.featureDefinitionHash).toBe(FEATURE_DEFINITION_HASH);
    expect(mutated.derivationDefinitionHash).toBe(DERIVATION_DEFINITION_HASH);
    expect(mutated.featureDefinitionHash).toBe(snapshot.featureDefinitionHash);
    expect(mutated.derivationDefinitionHash).toBe(snapshot.derivationDefinitionHash);
    expect(mutated.sourceManifestHash).not.toBe(snapshot.sourceManifestHash);
    expect(mutated.snapshotHash).not.toBe(snapshot.snapshotHash);
  });

  it('canonical key order does not alter hash', () => {
    expect(sha256CanonicalJson({ b: 1, a: { z: 2, y: 3 } })).toBe(
      sha256CanonicalJson({ a: { y: 3, z: 2 }, b: 1 })
    );
  });

  it('timestamps are ISO strings or null before provenance hashing', () => {
    const at = new Date('2026-08-27T17:10:00.000Z');
    const fromDate = hashTalentProvenance([
      { teamId: 'a', season: 2026, createdAt: at, updatedAt: at, sourceUpdatedAt: null },
    ]);
    const fromIso = hashTalentProvenance([
      {
        teamId: 'a',
        season: 2026,
        createdAt: '2026-08-27T17:10:00.000Z',
        updatedAt: '2026-08-27T17:10:00.000Z',
        sourceUpdatedAt: null,
      },
    ]);
    expect(fromDate).toBe(fromIso);
    expect(toIsoStringOrNull(at)).toBe('2026-08-27T17:10:00.000Z');
    expect(toIsoStringOrNull(null)).toBeNull();
  });

  it('talentValueHash is unchanged when only timestamps change', () => {
    const values = [{ teamId: 'a', season: 2026, talentComposite: 12.5 }];
    const a = hashTalentValues(values);
    const b = hashTalentValues(values);
    expect(a).toBe(b);
    const p1 = hashTalentProvenance([
      { teamId: 'a', season: 2026, createdAt: iso(1), updatedAt: iso(1), sourceUpdatedAt: null },
    ]);
    const p2 = hashTalentProvenance([
      { teamId: 'a', season: 2026, createdAt: iso(2), updatedAt: iso(2), sourceUpdatedAt: null },
    ]);
    expect(p1).not.toBe(p2);
    expect(a).toBe(hashTalentValues([{ teamId: 'a', season: 2026, talentComposite: 12.5 }]));
  });

  it('talentProvenanceHash changes when timestamps change', () => {
    const p1 = hashTalentProvenance([
      { teamId: 'z', season: 2026, createdAt: iso(10), updatedAt: iso(10), sourceUpdatedAt: iso(10) },
    ]);
    const p2 = hashTalentProvenance([
      { teamId: 'z', season: 2026, createdAt: iso(11), updatedAt: iso(10), sourceUpdatedAt: iso(10) },
    ]);
    expect(p1).not.toBe(p2);
  });

  it('sourceManifestHash excludes supporting provenance', () => {
    const snapshot = deriveThreeTeamSnapshot();
    const same = deriveThreeTeamSnapshot({ provenanceExtra: 'later-operator-timestamp' });
    expect(snapshot.sourceManifestHash).toBe(same.sourceManifestHash);
    expect(snapshot.sourceProvenanceManifestHash).not.toBe(same.sourceProvenanceManifestHash);
  });

  it('snapshotHash excludes supporting provenance', () => {
    const a = deriveThreeTeamSnapshot();
    const b = deriveThreeTeamSnapshot({ provenanceExtra: 'changed' });
    expect(a.snapshotHash).toBe(b.snapshotHash);
    expect(a.sourceProvenanceManifestHash).not.toBe(b.sourceProvenanceManifestHash);
  });

  it('snapshotHash excludes repo SHA / derivedAt / createdAt', () => {
    const snapshot = deriveThreeTeamSnapshot();
    const withMeta = {
      ...JSON.parse(JSON.stringify(snapshot.teams.map((t) => ({ teamId: t.teamId, rowHash: t.rowHash })))),
    };
    const hash = computeSnapshotHash({
      season: snapshot.season,
      snapshotKind: snapshot.snapshotKind,
      modelFamily: snapshot.modelFamily,
      modelDefinitionId: snapshot.modelDefinitionId,
      featureDefinitionId: snapshot.featureDefinitionId,
      featureDefinitionVersion: snapshot.featureDefinitionVersion,
      featureDefinitionHash: snapshot.featureDefinitionHash,
      derivationDefinitionId: snapshot.derivationDefinitionId,
      derivationDefinitionHash: snapshot.derivationDefinitionHash,
      sourceManifestHash: snapshot.sourceManifestHash,
      normalizationManifestHash: snapshot.normalizationManifestHash,
      populationManifestHash: snapshot.populationManifestHash,
      expectedTeamCount: snapshot.expectedTeamCount,
      rowCount: snapshot.rowCount,
      completeVectorCount: snapshot.completeVectorCount,
      unavailableVectorCount: snapshot.unavailableVectorCount,
      portalAvailableCount: snapshot.portalAvailableCount,
      teams: snapshot.teams,
    });
    expect(hash).toBe(snapshot.snapshotHash);
    expect(snapshot.snapshotHash).not.toContain('repoCommitSha');
    expect(withMeta.derivedAt).toBeUndefined();
  });

  it('rowHash sorts unavailable reasons and preserves explicit nulls', () => {
    const row: Omit<TeamFeatureRow, 'rowHash'> = {
      teamId: 'x',
      season: 2026,
      availabilityStatus: 'UNAVAILABLE',
      unavailableReasons: ['TEAM_FEATURE_VECTOR_UNAVAILABLE', 'PORTAL_FEATURE_UNAVAILABLE'],
      priorCoreRaw: 1,
      talentRaw: 2,
      returningRaw: 3,
      portalRaw: null,
      zCore: 0.1,
      zTalent: 0.2,
      zReturning: 0.3,
      zPortal: null,
      candidateBRawComposite: null,
      candidateBCompositeZ: null,
      candidateBTeamRatingPoints: null,
      inboundTransferCount: 1,
      inboundRatedCount: 0,
      inboundRatedCoverage: 0,
      inboundDirectionStatus: 'INSUFFICIENT_RATED_COVERAGE',
      inboundMeanRating: null,
      outboundTransferCount: 0,
      outboundRatedCount: 0,
      outboundRatedCoverage: null,
      outboundDirectionStatus: 'NO_TRANSFERS',
      outboundMeanRating: null,
    };
    const sorted = computeRowHash({
      ...row,
      unavailableReasons: ['PORTAL_FEATURE_UNAVAILABLE', 'TEAM_FEATURE_VECTOR_UNAVAILABLE'],
    });
    const unsorted = computeRowHash(row);
    expect(sorted).toBe(unsorted);
    const payload = JSON.parse(
      JSON.stringify({
        portalRaw: null,
        inboundMeanRating: null,
        outboundRatedCoverage: null,
      })
    );
    expect(payload.portalRaw).toBeNull();
  });

  it('verifies raw SHA-256 before JSON.parse', () => {
    const bytes = Buffer.from('{not-valid-json', 'utf8');
    expect(() => parseVerifiedFrozenJson(bytes, '0'.repeat(64), 'core')).toThrow(/^core_sha_mismatch:/);
    expect(() => parseVerifiedFrozenJson(bytes, '0'.repeat(64), 'core')).not.toThrow(/JSON/);
    const matching = sha256RawBytes(bytes);
    expect(() => parseVerifiedFrozenJson(bytes, matching, 'core')).toThrow();
  });
});

describe('Candidate B V1 formula', () => {
  it('population SD uses divisor N', () => {
    const snapshot = deriveThreeTeamSnapshot();
    expect(snapshot.normalizationManifest.divisor).toBe('N');
    expect(snapshot.normalizationManifest.talent.n).toBe(3);
    expect(snapshot.normalizationManifest.talent.populationMean).toBe(20);
    expect(snapshot.normalizationManifest.talent.populationSD).toBeCloseTo(Math.sqrt(200 / 3), 12);
  });

  it('exactly 0.50 portal coverage is sufficient', () => {
    const dir = aggregatePortalDirection([1, null], 0.4);
    expect(dir.directionStatus).toBe('SUFFICIENT_RATED_COVERAGE');
    expect(dir.ratedCoverage).toBe(0.5);
    expect(dir.meanRating).toBe(1);
    expect(dir.centeredQuality).toBeCloseTo(0.6, 12);
  });

  it('below 0.50 is unavailable', () => {
    const dir = aggregatePortalDirection([1, null, null], 0.4);
    expect(dir.directionStatus).toBe('INSUFFICIENT_RATED_COVERAGE');
    expect(dir.ratedCoverage).toBeCloseTo(1 / 3, 12);
    expect(dir.meanRating).toBeNull();
    expect(dir.centeredQuality).toBeNull();
  });

  it('NO_TRANSFERS uses centered zero but persists null coverage/mean', () => {
    const dir = emptyDirection();
    expect(dir.directionStatus).toBe('NO_TRANSFERS');
    expect(dir.transferCount).toBe(0);
    expect(dir.ratedCount).toBe(0);
    expect(dir.ratedCoverage).toBeNull();
    expect(dir.meanRating).toBeNull();
    expect(dir.centeredQuality).toBe(0);
  });

  it('global muPortal uses every finite provider rating in the payload', () => {
    const rows = parseFrozenPortalPayload([
      {
        season: 2026,
        firstName: 'A',
        lastName: 'B',
        position: 'QB',
        origin: 'School A',
        destination: null,
        transferDate: '2026-01-01',
        rating: 0.5,
        stars: 3,
        eligibility: 'Immediate',
      },
      {
        season: 2026,
        firstName: 'C',
        lastName: 'D',
        position: 'WR',
        origin: 'School B',
        destination: 'School C',
        transferDate: '2026-01-02',
        rating: null,
        stars: null,
        eligibility: 'Immediate',
      },
      {
        season: 2026,
        firstName: 'E',
        lastName: 'F',
        position: 'RB',
        origin: 'School D',
        destination: 'School E',
        transferDate: '2026-01-03',
        rating: 1.5,
        stars: 4,
        eligibility: 'Immediate',
      },
    ]);
    expect(calculateMuPortal(rows)).toBe(1);
  });

  it('missing component keeps other known raw/z values', () => {
    const snapshot = deriveThreeTeamSnapshot({ missingPortalFor: 'alpha' });
    const alpha = snapshot.teams.find((t) => t.teamId === 'alpha')!;
    expect(alpha.portalRaw).toBeNull();
    expect(alpha.zPortal).toBeNull();
    expect(alpha.priorCoreRaw).toBe(1);
    expect(alpha.zCore).not.toBeNull();
    expect(alpha.talentRaw).toBe(10);
    expect(alpha.returningRaw).toBe(0.1);
  });

  it('incomplete vector nulls all 3 derived composite/rating values', () => {
    const snapshot = deriveThreeTeamSnapshot({ missingPortalFor: 'alpha' });
    const alpha = snapshot.teams.find((t) => t.teamId === 'alpha')!;
    expect(alpha.candidateBRawComposite).toBeNull();
    expect(alpha.candidateBCompositeZ).toBeNull();
    expect(alpha.candidateBTeamRatingPoints).toBeNull();
    expect(alpha.unavailableReasons).toEqual([
      'PORTAL_FEATURE_UNAVAILABLE',
      'TEAM_FEATURE_VECTOR_UNAVAILABLE',
    ]);
  });

  it('equal 25% composite math', () => {
    const snapshot = deriveThreeTeamSnapshot();
    const team = snapshot.teams.find((t) => t.teamId === 'beta')!;
    expect(team.candidateBRawComposite).toBeCloseTo(
      0.25 * team.zCore! + 0.25 * team.zTalent! + 0.25 * team.zReturning! + 0.25 * team.zPortal!,
      12
    );
  });

  it('second-stage population normalization', () => {
    const snapshot = deriveThreeTeamSnapshot();
    const raw = snapshot.teams.map((t) => t.candidateBRawComposite!);
    const mean = raw.reduce((s, n) => s + n, 0) / raw.length;
    const sd = Math.sqrt(raw.reduce((s, n) => s + (n - mean) ** 2, 0) / raw.length);
    for (const team of snapshot.teams) {
      expect(team.candidateBCompositeZ).toBeCloseTo((team.candidateBRawComposite! - mean) / sd, 12);
    }
  });

  it('3.5-point population SD on synthetic complete set', () => {
    const snapshot = deriveThreeTeamSnapshot();
    const points = snapshot.teams.map((t) => t.candidateBTeamRatingPoints!);
    const mean = points.reduce((s, n) => s + n, 0) / points.length;
    const sd = Math.sqrt(points.reduce((s, n) => s + (n - mean) ** 2, 0) / points.length);
    expect(sd).toBeCloseTo(RATING_SCALE, 12);
    expect(snapshot.teams[0].candidateBTeamRatingPoints).toBeCloseTo(
      snapshot.teams[0].candidateBCompositeZ! * 3.5,
      12
    );
  });

  it('exact confirmation string contains full hash', () => {
    const snapshot = deriveThreeTeamSnapshot();
    const confirmation = expectedCandidateBFeatureSnapshotConfirmation(snapshot.snapshotHash);
    expect(confirmation).toBe(`INGEST_2026_CANDIDATE_B_V1_FEATURE_SNAPSHOT_${snapshot.snapshotHash}`);
    expect(confirmation).toMatch(/INGEST_2026_CANDIDATE_B_V1_FEATURE_SNAPSHOT_[0-9a-f]{64}$/);
  });
});

describe('Candidate B V1 idempotency classifier', () => {
  it('exact existing snapshot → NO-OP', async () => {
    const snapshot = deriveThreeTeamSnapshot();
    const { report } = await executeCandidateBFeatureSnapshotIngest({
      mode: 'COMMIT',
      confirmation: expectedCandidateBFeatureSnapshotConfirmation(snapshot.snapshotHash),
      snapshot,
      store: memoryStore(toPersisted(snapshot)),
      repoCommitSha: 'a'.repeat(40),
      derivedAt: new Date('2026-09-14T00:00:00.000Z'),
      requireFrozenCounts: false,
    });
    expect(report.existingState).toBe('EXACT_EXISTING');
    expect(report.alreadyPresent).toBe(true);
    expect(report.commitSucceeded).toBe(false);
    expect(report.persistenceCommitted).toBe(false);
  });

  it('provenance-only difference → NO-OP', async () => {
    const existingSnap = deriveThreeTeamSnapshot();
    const snapshot = deriveThreeTeamSnapshot({ provenanceExtra: 'later' });
    expect(classifyExistingSnapshot(toPersisted(existingSnap), snapshot)).toBe(
      'PROVENANCE_ONLY_DIFFERENCE'
    );
    const { report } = await executeCandidateBFeatureSnapshotIngest({
      mode: 'PREVIEW',
      snapshot,
      store: memoryStore(toPersisted(existingSnap)),
      repoCommitSha: 'a'.repeat(40),
      derivedAt: new Date(),
      requireFrozenCounts: false,
    });
    expect(report.existingState).toBe('PROVENANCE_ONLY_DIFFERENCE');
    expect(report.alreadyPresent).toBe(true);
    expect(report.writeSafe).toBe(true);
  });

  it('semantic difference → FAIL CLOSED', async () => {
    const snapshot = deriveThreeTeamSnapshot();
    const other = deriveThreeTeamSnapshot({ talentValues: { alpha: 11, beta: 20, gamma: 30 } });
    expect(classifyExistingSnapshot(toPersisted(other), snapshot)).toBe('SEMANTIC_CONFLICT');
    const { report } = await executeCandidateBFeatureSnapshotIngest({
      mode: 'PREVIEW',
      snapshot,
      store: memoryStore(toPersisted(other)),
      repoCommitSha: 'a'.repeat(40),
      derivedAt: new Date(),
      requireFrozenCounts: false,
    });
    expect(report.existingState).toBe('SEMANTIC_CONFLICT');
    expect(report.writeSafe).toBe(false);
    expect(report.blockers).toContain('semantic_conflict');
  });

  it('corrupt child hash/count → FAIL CLOSED', () => {
    const snapshot = deriveThreeTeamSnapshot();
    const corrupt = toPersisted(snapshot);
    corrupt.teams[0].rowHash = '0'.repeat(64);
    expect(classifyExistingSnapshot(corrupt, snapshot)).toBe('CORRUPT_EXISTING');
    const missing = toPersisted(snapshot);
    missing.teams = missing.teams.slice(0, 2);
    missing.rowCount = 2;
    expect(classifyExistingSnapshot(missing, snapshot)).toBe('CORRUPT_EXISTING');
  });

  it('persisted parent identity/manifest corruption → CORRUPT_EXISTING', () => {
    const snapshot = deriveThreeTeamSnapshot();

    const family = toPersisted(snapshot);
    family.modelFamily = 'not_candidate_b';
    expect(family.snapshotHash).toBe(snapshot.snapshotHash);
    expect(classifyExistingSnapshot(family, snapshot)).toBe('CORRUPT_EXISTING');
    expect(verifyPersistedSnapshotIntegrity(family)).toBe(false);

    const source = toPersisted(snapshot);
    source.sourceManifest = { ...snapshot.sourceManifest, tampered: true };
    expect(source.sourceManifestHash).toBe(snapshot.sourceManifestHash);
    expect(classifyExistingSnapshot(source, snapshot)).toBe('CORRUPT_EXISTING');

    const feature = toPersisted(snapshot);
    feature.featureDefinitionManifest = { ...snapshot.featureDefinitionManifest, tampered: true };
    expect(feature.featureDefinitionHash).toBe(snapshot.featureDefinitionHash);
    expect(classifyExistingSnapshot(feature, snapshot)).toBe('CORRUPT_EXISTING');

    const provenance = toPersisted(snapshot);
    provenance.sourceProvenanceManifest = {
      ...snapshot.sourceProvenanceManifest,
      tampered: true,
    };
    expect(provenance.sourceProvenanceManifestHash).toBe(snapshot.sourceProvenanceManifestHash);
    expect(classifyExistingSnapshot(provenance, snapshot)).toBe('CORRUPT_EXISTING');

    expect(verifyPersistedSnapshotIntegrity(toPersisted(snapshot))).toBe(false);
    expect(
      verifyPersistedSnapshotIntegrity(toPersisted(snapshot), {
        expectedTeamCount: snapshot.expectedTeamCount,
      })
    ).toBe(true);
  });

  it('fresh post-insert re-read is the post-write proof', async () => {
    const snapshot = deriveThreeTeamSnapshot();
    await expect(
      executeCandidateBFeatureSnapshotIngest({
        mode: 'COMMIT',
        confirmation: expectedCandidateBFeatureSnapshotConfirmation(snapshot.snapshotHash),
        snapshot,
        store: memoryStore(null, {
          corruptAfterInsert: (row) => ({ ...row, modelFamily: 'tampered' }),
        }),
        repoCommitSha: 'a'.repeat(40),
        derivedAt: new Date('2026-09-14T00:00:00.000Z'),
        requireFrozenCounts: false,
      })
    ).rejects.toThrow(/post_write_integrity_failed|post_write_hash_mismatch/);
  });
});

describe('Candidate B V1 schema + migration contract', () => {
  const schema = fs.readFileSync(SCHEMA, 'utf8');
  const sql = fs.readFileSync(MIGRATION, 'utf8');

  function modelBlock(name: string): string {
    const match = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`));
    if (!match) throw new Error(`missing model ${name}`);
    return match[0];
  }

  it('schema has no @updatedAt on new models', () => {
    expect(modelBlock('ShadowModelFeatureSnapshot')).not.toContain('@updatedAt');
    expect(modelBlock('ShadowModelFeatureSnapshotTeam')).not.toContain('@updatedAt');
    expect(modelBlock('ShadowModelFeatureSnapshotTeam')).not.toContain('Team @relation');
  });

  it('migration contains append-only trigger protection for both tables', () => {
    expect(sql).toContain('shadow_model_feature_snapshot_v1_reject_mutation');
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON "shadow_model_feature_snapshots"');
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON "shadow_model_feature_snapshot_teams"');
    expect(sql).toContain('USING ERRCODE = \'restrict_violation\'');
  });

  it('migration has required unique indexes, parent/child FK, and RESTRICT', () => {
    expect(sql).toContain('CREATE TABLE "shadow_model_feature_snapshots"');
    expect(sql).toContain('CREATE TABLE "shadow_model_feature_snapshot_teams"');
    expect(sql).toContain('shadow_model_feature_snapshots_snapshot_hash_key');
    expect(sql).toContain('shadow_model_feature_snapshots_v1_identity_key');
    expect(sql).toContain('shadow_model_feature_snapshot_teams_snapshot_team_key');
    expect(sql).toContain('shadow_model_feature_snapshot_teams_snapshot_id_fkey');
    expect(sql).toContain('ON DELETE RESTRICT ON UPDATE RESTRICT');
  });

  it('migration has no operational Team/Game/MarketLine/Bet FK and no DML/backfill', () => {
    expect(sql).not.toMatch(/ALTER TABLE "teams"/);
    expect(sql).not.toMatch(/ALTER TABLE "games"/);
    expect(sql).not.toMatch(/ALTER TABLE "market_lines"/);
    expect(sql).not.toMatch(/ALTER TABLE "bets"/);
    expect(sql).not.toMatch(/REFERENCES "teams"/);
    expect(sql).not.toMatch(/INSERT\s+INTO/i);
    expect(sql).not.toMatch(/UPDATE\s+\w+\s+SET/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
  });

  it('no provider/fetch path exists in Candidate B ingest implementation', () => {
    const pure = fs.readFileSync(PURE, 'utf8');
    const cli = fs.readFileSync(CLI, 'utf8');
    for (const src of [pure, cli]) {
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toContain('collegefootballdata.com');
      expect(src).not.toContain('CFBD_API_KEY');
      expect(src).not.toContain('ODDS_API');
      expect(src).not.toContain("from '../../src/cfbd/cfbd-client'");
    }
  });

  it('authoritative membership fails closed on duplicates and count mismatch', () => {
    expect(() =>
      assertAuthoritativeFbsPopulation(
        [
          { teamId: 'a', level: 'fbs' },
          { teamId: 'a', level: 'FBS' },
        ],
        2
      )
    ).toThrow(/duplicate_fbs_membership/);
    expect(() => assertAuthoritativeFbsPopulation([{ teamId: 'a', level: 'fbs' }], 2)).toThrow(
      /authoritative_fbs_count_mismatch/
    );
  });

  it('raw SHA helper hashes bytes not re-serialized JSON', () => {
    const bytes = Buffer.from('{"a":1}', 'utf8');
    expect(sha256RawBytes(bytes)).toBe(sha256RawBytes(Buffer.from('{"a":1}', 'utf8')));
    expect(sha256RawBytes(bytes)).not.toBe(sha256RawBytes(Buffer.from('{"a": 1}', 'utf8')));
  });

  it('portal aggregation keeps a valid FBS side when the counterparty is unresolved', () => {
    const result = aggregatePortalByTeam(
      ['alpha'],
      [
        { originTeamId: 'alpha', destinationTeamId: null, rating: 1 },
        { originTeamId: null, destinationTeamId: 'alpha', rating: 2 },
      ],
      0
    );
    const row = result.get('alpha')!;
    expect(row.outbound.transferCount).toBe(1);
    expect(row.inbound.transferCount).toBe(1);
    expect(row.portalRaw).toBe(1);
  });
});

describe('Candidate B V1 strict team resolution', () => {
  function mockResolver(
    responses: Record<string, TeamResolveResult>
  ): Pick<TeamResolver, 'resolveTeamDetailed'> {
    return {
      resolveTeamDetailed: (providerName) =>
        responses[providerName] ?? { teamId: null, method: null },
    };
  }

  it('createCandidateBCfbdFbsResolver accepts only guard / cfbd_alias / alias', () => {
    const resolve = createCandidateBCfbdFbsResolver(
      mockResolver({
        Guarded: { teamId: 'miami-oh', method: 'guard' },
        Cfbd: { teamId: 'california', method: 'cfbd_alias' },
        Alias: { teamId: 'marshall', method: 'alias' },
        Normalized: { teamId: 'alabama', method: 'normalized_alias' },
        Fuzzy: { teamId: 'georgia', method: 'fuzzy' },
        Missing: { teamId: null, method: null },
      }),
      ['miami-oh', 'california', 'marshall', 'alabama', 'georgia']
    );
    expect(resolve('Guarded')).toBe('miami-oh');
    expect(resolve('Cfbd')).toBe('california');
    expect(resolve('Alias')).toBe('marshall');
    expect(resolve('Normalized')).toBeNull();
    expect(resolve('Fuzzy')).toBeNull();
    expect(resolve('Missing')).toBeNull();
    expect(isCandidateBAcceptedTeamResolutionMethod('normalized_alias')).toBe(false);
    expect(isCandidateBAcceptedTeamResolutionMethod('fuzzy')).toBe(false);
    expect(isCandidateBAcceptedTeamResolutionMethod('future_method')).toBe(false);
  });

  it('rejects non-authoritative output even when the resolver returns an accepted method', () => {
    const resolve = createCandidateBCfbdFbsResolver(
      mockResolver({
        'California (PA)': { teamId: 'california-pa', method: 'alias' },
      }),
      ['california', 'marshall']
    );
    expect(resolve('California (PA)')).toBeNull();
  });

  it('team-level sources fail closed on unresolved, non-authoritative, and duplicate targets', () => {
    expect(() =>
      resolveNamedTeamsToFbs(['Unknown'], (name) => (name === 'Known' ? 'alpha' : null), ['alpha'], 'core')
    ).toThrow(/core_unresolved_or_non_fbs:Unknown/);
    expect(() =>
      resolveNamedTeamsToFbs(['FCS School'], () => 'not-fbs', ['alpha'], 'returning')
    ).toThrow(/returning_unresolved_or_non_fbs:FCS School/);
    expect(() =>
      resolveNamedTeamsToFbs(['School A', 'School B'], () => 'alpha', ['alpha'], 'core')
    ).toThrow(/core_duplicate_resolved_team:alpha/);
  });

  it('strict CFBD full-identity names resolve as frozen', () => {
    const resolver = new TeamResolver();
    const resolve = createCandidateBCfbdFbsResolver(resolver, [
      'california',
      'miami-oh',
      'miami',
      'texas-a-m',
      'san-jos-state',
      'marshall',
      'boise-state',
      'san-diego-state',
    ]);
    expect(resolve('California (PA)')).toBeNull();
    expect(resolve('California')).toBe('california');
    expect(resolve('Miami (OH)')).toBe('miami-oh');
    expect(resolve('Miami (FL)')).toBe('miami');
    expect(resolve('Texas A&M')).toBe('texas-a-m');
    expect(resolve('San José State')).toBe('san-jos-state');
    expect(resolve('San Diego State')).toBe('san-diego-state');
    expect(resolve('Boise State (Fake)')).toBeNull();
    expect(resolve('Texas A&M (Fake)')).toBeNull();
    expect(resolve('Miami (OH) (Fake)')).toBeNull();
    expect(resolve('San José State (Fake)')).toBeNull();
    expect(resolve('San Diego State (Fake)')).toBeNull();
    expect(resolve('Texas A&M Corpus Christi')).toBeNull();
  });

  it('California (PA) origin does not count outbound for Cal; Marshall inbound remains', () => {
    const resolver = new TeamResolver();
    const resolve = createCandidateBCfbdFbsResolver(resolver, ['california', 'marshall']);
    const originTeamId = resolvePortalCounterpart('California (PA)', resolve, ['california', 'marshall']);
    const destinationTeamId = resolvePortalCounterpart('Marshall', resolve, ['california', 'marshall']);
    expect(originTeamId).toBeNull();
    expect(destinationTeamId).toBe('marshall');
    const result = aggregatePortalByTeam(
      ['california', 'marshall'],
      [{ originTeamId, destinationTeamId, rating: 0.91 }],
      0
    );
    expect(result.get('california')!.outbound.transferCount).toBe(0);
    expect(result.get('california')!.inbound.transferCount).toBe(0);
    expect(result.get('marshall')!.inbound.transferCount).toBe(1);
    expect(result.get('marshall')!.inbound.ratedCount).toBe(1);
    expect(result.get('marshall')!.outbound.transferCount).toBe(0);
  });

  it('valid FBS origin still counts outbound when destination is unresolved', () => {
    const resolver = new TeamResolver();
    const resolve = createCandidateBCfbdFbsResolver(resolver, ['marshall', 'california']);
    const originTeamId = resolvePortalCounterpart('Marshall', resolve, ['marshall', 'california']);
    const destinationTeamId = resolvePortalCounterpart('California (PA)', resolve, [
      'marshall',
      'california',
    ]);
    expect(originTeamId).toBe('marshall');
    expect(destinationTeamId).toBeNull();
    const result = aggregatePortalByTeam(
      ['marshall', 'california'],
      [{ originTeamId, destinationTeamId, rating: 0.4 }],
      0
    );
    expect(result.get('marshall')!.outbound.transferCount).toBe(1);
    expect(result.get('california')!.inbound.transferCount).toBe(0);
  });

  it('runtime Candidate B code does not hardcode the rejected provisional snapshotHash', () => {
    const pure = fs.readFileSync(PURE, 'utf8');
    const cli = fs.readFileSync(CLI, 'utf8');
    const rejected = '7bb754768d32008ade0ad352b69cb8832af7aa893e7be75396a7a58efa76399d';
    expect(pure).not.toContain(rejected);
    expect(cli).not.toContain(rejected);
    expect(cli).toContain('createCandidateBCfbdFbsResolver');
    expect(pure).toContain('strictFullIdentity: true');
  });
});

describe('Candidate B V1 team-resolution policy pin invariant', () => {
  it('normal buildSourceManifest carries the exact frozen policy pin', () => {
    const snapshot = deriveThreeTeamSnapshot();
    expect(hasExpectedTeamResolutionPolicyPin(snapshot.sourceManifest)).toBe(true);
    expect(hasExpectedTeamResolutionPolicyPin(buildSourceManifest({
      coreSha256: 'c'.repeat(64),
      returningSha256: 'd'.repeat(64),
      portalSha256: 'e'.repeat(64),
      muPortal: 0.5,
      talentValueHash: snapshot.talentValueHash,
    }))).toBe(true);
    expect(assessCandidateBV1Invariants(snapshot, { requireFrozenCounts: false })).not.toContain(
      'team_resolution_policy_mismatch'
    );
  });

  it('missing teamResolution is a PREVIEW/COMMIT blocker', () => {
    const snapshot = deriveThreeTeamSnapshot({
      sourceManifestTransform: (manifest) => {
        const next = { ...manifest };
        delete next.teamResolution;
        return next;
      },
    });
    expect(hasExpectedTeamResolutionPolicyPin(snapshot.sourceManifest)).toBe(false);
    expect(assessCandidateBV1Invariants(snapshot, { requireFrozenCounts: false })).toContain(
      'team_resolution_policy_mismatch'
    );
  });

  it('wrong policyId is a PREVIEW/COMMIT blocker', () => {
    const snapshot = deriveThreeTeamSnapshot({
      sourceManifestPatch: {
        teamResolution: {
          policyId: 'not_the_frozen_policy',
          policyHash: TEAM_RESOLUTION_POLICY_HASH,
        },
      },
    });
    expect(assessCandidateBV1Invariants(snapshot, { requireFrozenCounts: false })).toContain(
      'team_resolution_policy_mismatch'
    );
  });

  it('wrong policyHash is a PREVIEW/COMMIT blocker even if it is 64 hex chars', () => {
    const snapshot = deriveThreeTeamSnapshot({
      sourceManifestPatch: {
        teamResolution: {
          policyId: TEAM_RESOLUTION_POLICY_ID,
          policyHash: '0'.repeat(64),
        },
      },
    });
    expect(assessCandidateBV1Invariants(snapshot, { requireFrozenCounts: false })).toContain(
      'team_resolution_policy_mismatch'
    );
  });

  it('PREVIEW with the wrong policy pin is not commitEligible', async () => {
    const snapshot = deriveThreeTeamSnapshot({
      sourceManifestPatch: {
        teamResolution: {
          policyId: TEAM_RESOLUTION_POLICY_ID,
          policyHash: '0'.repeat(64),
        },
      },
    });
    const { report } = await executeCandidateBFeatureSnapshotIngest({
      mode: 'PREVIEW',
      snapshot,
      store: memoryStore(null),
      repoCommitSha: 'a'.repeat(40),
      derivedAt: new Date(),
      requireFrozenCounts: false,
    });
    expect(report.blockers).toContain('team_resolution_policy_mismatch');
    expect(report.commitEligible).toBe(false);
    expect(report.writeSafe).toBe(false);
  });

  it('self-consistent persisted snapshot with the wrong policy is CORRUPT_EXISTING', () => {
    const snapshot = deriveThreeTeamSnapshot();
    const wrongManifest = {
      ...snapshot.sourceManifest,
      teamResolution: {
        policyId: TEAM_RESOLUTION_POLICY_ID,
        policyHash: '0'.repeat(64),
      },
    };
    const sourceManifestHash = sha256CanonicalJson(wrongManifest);
    const snapshotHash = computeSnapshotHash({
      season: snapshot.season,
      snapshotKind: snapshot.snapshotKind,
      modelFamily: snapshot.modelFamily,
      modelDefinitionId: snapshot.modelDefinitionId,
      featureDefinitionId: snapshot.featureDefinitionId,
      featureDefinitionVersion: snapshot.featureDefinitionVersion,
      featureDefinitionHash: snapshot.featureDefinitionHash,
      derivationDefinitionId: snapshot.derivationDefinitionId,
      derivationDefinitionHash: snapshot.derivationDefinitionHash,
      sourceManifestHash,
      normalizationManifestHash: snapshot.normalizationManifestHash,
      populationManifestHash: snapshot.populationManifestHash,
      expectedTeamCount: snapshot.expectedTeamCount,
      rowCount: snapshot.rowCount,
      completeVectorCount: snapshot.completeVectorCount,
      unavailableVectorCount: snapshot.unavailableVectorCount,
      portalAvailableCount: snapshot.portalAvailableCount,
      teams: snapshot.teams,
    });
    const persisted = toPersisted({
      ...snapshot,
      sourceManifest: wrongManifest,
      sourceManifestHash,
      snapshotHash,
    });
    expect(sha256CanonicalJson(persisted.sourceManifest)).toBe(persisted.sourceManifestHash);
    expect(hasExpectedTeamResolutionPolicyPin(persisted.sourceManifest)).toBe(false);
    expect(
      verifyPersistedSnapshotIntegrity(persisted, { expectedTeamCount: snapshot.expectedTeamCount })
    ).toBe(false);
    expect(
      classifyExistingSnapshot(persisted, snapshot, { expectedTeamCount: snapshot.expectedTeamCount })
    ).toBe('CORRUPT_EXISTING');
  });
});
