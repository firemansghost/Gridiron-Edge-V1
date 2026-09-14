/**
 * Candidate B V1 normalizationManifest transport tests.
 * Synthetic fixtures plus the audited production numeric leaves.
 * No private PIT. No DATABASE_URL. No providers. No COMMIT.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import {
  CANDIDATE_B_EXPECTED_TEAM_COUNT,
  buildSourceManifest,
  buildSourceProvenanceManifest,
  classifyExistingSnapshot,
  deriveCandidateBSnapshot,
  emptyDirection,
  hashTalentProvenance,
  hashTalentValues,
  verifyPersistedSnapshotIntegrity,
  type NormalizationManifest,
  type PersistedSnapshot,
  type TeamFeatureRow,
} from '../src/research/candidate-b/candidate-b-v1-feature-snapshot';
import {
  assertCandidateBChildSelectSqlContract,
  mapCandidateBExactChildRow,
  type CandidateBExactChildRawRow,
} from '../src/research/candidate-b/candidate-b-v1-exact-float8-reader';
import {
  FROZEN_NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_HASH,
  NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_HASH,
  NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_ID,
  NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_MANIFEST,
  decodeCandidateBNormalizationManifest,
  encodeCandidateBNormalizationManifest,
} from '../src/research/candidate-b/candidate-b-v1-normalization-manifest-transport';
import { createPrismaCandidateBFeatureSnapshotStore } from '../ingest-candidate-b-v1-feature-snapshot';
import { canonicalJsonString, sha256CanonicalJson } from '../../web/lib/shadow-model-capture-v1';

const ROOT = path.resolve(__dirname, '../../..');
const CLI = path.join(ROOT, 'apps/jobs/ingest-candidate-b-v1-feature-snapshot.ts');
const TRANSPORT = path.join(
  ROOT,
  'apps/jobs/src/research/candidate-b/candidate-b-v1-normalization-manifest-transport.ts'
);
const PURE = path.join(
  ROOT,
  'apps/jobs/src/research/candidate-b/candidate-b-v1-feature-snapshot.ts'
);
const WRITER = path.join(
  ROOT,
  'apps/jobs/src/research/candidate-b/candidate-b-v1-exact-float8-writer.ts'
);
const READER = path.join(
  ROOT,
  'apps/jobs/src/research/candidate-b/candidate-b-v1-exact-float8-reader.ts'
);

const FROZEN_NORMALIZATION_MANIFEST_HASH =
  '9de2fdbf94581f05671349111ae36e458c94ac637b93e8db0eaea701abdeaa96';
const FROZEN_SNAPSHOT_HASH =
  '0332e24f97c891fd6431280fa7939c467c614714abe207eeb3dc89d466eb1148';

const PRODUCTION_NORMALIZATION_MANIFEST: NormalizationManifest = {
  priorCore: {
    n: 136,
    populationMean: -0.0000735294117644039,
    populationSD: 12.724017556916177,
    divisor: 'N',
    min: -30.52,
    max: 33.82,
    unavailableCount: 2,
  },
  talent: {
    n: 138,
    populationMean: 672.0002173913039,
    populationSD: 135.37715433786977,
    divisor: 'N',
    min: 195.68,
    max: 1003.67,
    unavailableCount: 0,
  },
  returning: {
    n: 136,
    populationMean: 0.41826470588235276,
    populationSD: 0.2782510566359652,
    divisor: 'N',
    min: -0.567,
    max: 0.997,
    unavailableCount: 2,
  },
  portal: {
    n: 104,
    populationMean: -0.0016657888521476039,
    populationSD: 0.014880631501725812,
    divisor: 'N',
    min: -0.03799999999999992,
    max: 0.06336903939184524,
    unavailableCount: 34,
  },
  completeN: 103,
  rawCompositePopulationMean: 0.0814638533778271,
  rawCompositePopulationSD: 0.6707704419661463,
  divisor: 'N',
  ratingScale: 3.5,
  muPortal: 0.8533690393918453,
  muPortalParityExpected: 0.8533690393918453,
};

const FIVE_ULP_REGRESSIONS = [
  { path: 'priorCore.populationSD', hex: '402972b26de15e9e' },
  { path: 'talent.populationSD', hex: '4060ec11a5f9563f' },
  { path: 'returning.populationMean', hex: '3fdac4d954357d28' },
  { path: 'portal.populationMean', hex: 'bf5b4ad32916c780' },
  { path: 'portal.populationSD', hex: '3f8e79bc8d266104' },
] as const;

function bits(value: number): string {
  const buf = Buffer.allocUnsafe(8);
  buf.writeDoubleBE(value, 0);
  return buf.toString('hex');
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function collectNumericLeaves(
  value: unknown,
  path = ''
): Array<{ path: string; value: number }> {
  if (typeof value === 'number') return [{ path, value }];
  if (value === null || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectNumericLeaves(item, `${path}[${index}]`));
  }
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .flatMap((key) =>
      collectNumericLeaves(
        (value as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key
      )
    );
}

function readPath(value: unknown, dotted: string): number {
  const parts = dotted.split('.');
  let current: unknown = value;
  for (const part of parts) {
    current = (current as Record<string, unknown>)[part];
  }
  if (typeof current !== 'number') {
    throw new Error(`numeric_path_missing:${dotted}`);
  }
  return current;
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
          {
            inbound: emptyDirection(),
            outbound: emptyDirection(),
            portalRaw: null,
          },
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
  return deriveCandidateBSnapshot({
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
}

function hexFromNumber(value: number | null): string | null {
  if (value === null) return null;
  return bits(value);
}

function rawFromTeam(team: TeamFeatureRow): CandidateBExactChildRawRow {
  return {
    teamId: team.teamId,
    season: team.season,
    availabilityStatus: team.availabilityStatus,
    unavailableReasons: [...team.unavailableReasons],
    inboundTransferCount: team.inboundTransferCount,
    inboundRatedCount: team.inboundRatedCount,
    inboundDirectionStatus: team.inboundDirectionStatus,
    outboundTransferCount: team.outboundTransferCount,
    outboundRatedCount: team.outboundRatedCount,
    outboundDirectionStatus: team.outboundDirectionStatus,
    rowHash: team.rowHash,
    priorCoreRawHex: hexFromNumber(team.priorCoreRaw),
    talentRawHex: hexFromNumber(team.talentRaw),
    returningRawHex: hexFromNumber(team.returningRaw),
    portalRawHex: hexFromNumber(team.portalRaw),
    zCoreHex: hexFromNumber(team.zCore),
    zTalentHex: hexFromNumber(team.zTalent),
    zReturningHex: hexFromNumber(team.zReturning),
    zPortalHex: hexFromNumber(team.zPortal),
    candidateBRawCompositeHex: hexFromNumber(team.candidateBRawComposite),
    candidateBCompositeZHex: hexFromNumber(team.candidateBCompositeZ),
    candidateBTeamRatingPointsHex: hexFromNumber(team.candidateBTeamRatingPoints),
    inboundRatedCoverageHex: hexFromNumber(team.inboundRatedCoverage),
    inboundMeanRatingHex: hexFromNumber(team.inboundMeanRating),
    outboundRatedCoverageHex: hexFromNumber(team.outboundRatedCoverage),
    outboundMeanRatingHex: hexFromNumber(team.outboundMeanRating),
  };
}

function parentFromSnapshot(
  snapshot: ReturnType<typeof deriveSyntheticSnapshot>,
  id: string,
  normalizationManifest: unknown = encodeCandidateBNormalizationManifest(
    snapshot.normalizationManifest,
    snapshot.normalizationManifestHash
  )
) {
  return {
    id,
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
    normalizationManifest,
    normalizationManifestHash: snapshot.normalizationManifestHash,
    populationManifest: snapshot.populationManifest,
    populationManifestHash: snapshot.populationManifestHash,
    expectedTeamCount: snapshot.expectedTeamCount,
    rowCount: snapshot.rowCount,
    completeVectorCount: snapshot.completeVectorCount,
    unavailableVectorCount: snapshot.unavailableVectorCount,
    portalAvailableCount: snapshot.portalAvailableCount,
    snapshotHash: snapshot.snapshotHash,
  };
}

function mockPrisma(options: {
  parent: Record<string, unknown> | null;
  queryRaw?: jest.Mock;
  create?: jest.Mock;
  executeRaw?: jest.Mock;
}) {
  const queryRaw = options.queryRaw ?? jest.fn(async () => []);
  const create = options.create ?? jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'parent-created',
    ...data,
  }));
  const executeRaw = options.executeRaw ?? jest.fn(async () => CANDIDATE_B_EXPECTED_TEAM_COUNT);
  const findUnique = jest.fn(async () => options.parent);
  const txFindUnique = jest.fn(async () => options.parent);
  const prisma = {
    shadowModelFeatureSnapshot: { findUnique, create },
    teamMembership: { findMany: async () => [] },
    teamSeasonTalent: { findMany: async () => [] },
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
    $transaction: async (
      fn: (tx: {
        shadowModelFeatureSnapshot: { findUnique: typeof txFindUnique; create: typeof create };
        $queryRaw: typeof queryRaw;
        $executeRaw: typeof executeRaw;
      }) => Promise<unknown>
    ) =>
      fn({
        shadowModelFeatureSnapshot: { findUnique: txFindUnique, create },
        $queryRaw: queryRaw,
        $executeRaw: executeRaw,
      }),
  };
  return { prisma, findUnique, queryRaw, txFindUnique, create, executeRaw };
}

describe('Candidate B V1 normalization manifest transport contract', () => {
  it('is frozen, content-addressed, and non-semantic', () => {
    expect(NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_ID).toBe(
      'candidate_b_v1_normalization_manifest_canonical_json_text_v1'
    );
    expect(NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_HASH).toBe(
      'e01fca1c21beca6303092cf5f9b45dbabe2007d9ab6766835a1c202d8104859a'
    );
    expect(FROZEN_NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_HASH).toBe(
      NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_HASH
    );
    expect(sha256CanonicalJson(NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_MANIFEST)).toBe(
      NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_HASH
    );
    const snapshot = deriveSyntheticSnapshot(3);
    const before = {
      normalizationManifestHash: snapshot.normalizationManifestHash,
      snapshotHash: snapshot.snapshotHash,
      featureDefinitionHash: snapshot.featureDefinitionHash,
      derivationDefinitionHash: snapshot.derivationDefinitionHash,
      sourceManifestHash: snapshot.sourceManifestHash,
      sourceProvenanceManifestHash: snapshot.sourceProvenanceManifestHash,
      populationManifestHash: snapshot.populationManifestHash,
      rowHashes: snapshot.teams.map((team) => team.rowHash),
    };
    encodeCandidateBNormalizationManifest(
      snapshot.normalizationManifest,
      snapshot.normalizationManifestHash
    );
    expect(snapshot.normalizationManifestHash).toBe(before.normalizationManifestHash);
    expect(snapshot.snapshotHash).toBe(before.snapshotHash);
    expect(snapshot.featureDefinitionHash).toBe(before.featureDefinitionHash);
    expect(snapshot.derivationDefinitionHash).toBe(before.derivationDefinitionHash);
    expect(snapshot.sourceManifestHash).toBe(before.sourceManifestHash);
    expect(snapshot.sourceProvenanceManifestHash).toBe(before.sourceProvenanceManifestHash);
    expect(snapshot.populationManifestHash).toBe(before.populationManifestHash);
    expect(snapshot.teams.map((team) => team.rowHash)).toEqual(before.rowHashes);
    expect(JSON.stringify(snapshot.featureDefinitionManifest)).not.toContain(
      NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_ID
    );
    expect(JSON.stringify(snapshot.derivationDefinitionManifest)).not.toContain(
      NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_ID
    );
    expect(JSON.stringify(snapshot.sourceManifest)).not.toContain(
      NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_ID
    );
    expect(JSON.stringify(snapshot.sourceProvenanceManifest)).not.toContain(
      NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_ID
    );
    expect(JSON.stringify(snapshot.normalizationManifest)).not.toContain(
      NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_ID
    );
    expect(JSON.stringify(snapshot.normalizationManifest)).not.toContain(
      NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_HASH
    );
    expect(JSON.stringify(snapshot.populationManifest)).not.toContain(
      NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_HASH
    );
    expect(snapshot.teams.every((team) => !team.rowHash.includes(NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_HASH))).toBe(
      true
    );
    expect(snapshot.snapshotHash).not.toContain(NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_HASH);
    expect(snapshot.snapshotHash).not.toContain(NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_ID);
  });
});

describe('encode/decode roundtrip', () => {
  it('restores semantic hash and canonical JSON for a derived snapshot', () => {
    const snapshot = deriveSyntheticSnapshot(3);
    const envelope = encodeCandidateBNormalizationManifest(
      snapshot.normalizationManifest,
      snapshot.normalizationManifestHash
    );
    const decoded = decodeCandidateBNormalizationManifest(
      envelope,
      snapshot.normalizationManifestHash
    );
    expect(sha256CanonicalJson(decoded)).toBe(snapshot.normalizationManifestHash);
    expect(canonicalJsonString(decoded)).toBe(canonicalJsonString(snapshot.normalizationManifest));
    expect(canonicalJsonString(decoded)).toBe(envelope.canonicalJson);
  });

  it('preserves all 30 production numeric leaves and the five known ULP regressions', () => {
    expect(sha256CanonicalJson(PRODUCTION_NORMALIZATION_MANIFEST)).toBe(
      FROZEN_NORMALIZATION_MANIFEST_HASH
    );
    const envelope = encodeCandidateBNormalizationManifest(
      PRODUCTION_NORMALIZATION_MANIFEST,
      FROZEN_NORMALIZATION_MANIFEST_HASH
    );
    expect(envelope.canonicalJson.length).toBe(860);
    const decoded = decodeCandidateBNormalizationManifest(
      envelope,
      FROZEN_NORMALIZATION_MANIFEST_HASH
    );
    const originalLeaves = collectNumericLeaves(PRODUCTION_NORMALIZATION_MANIFEST);
    const decodedLeaves = collectNumericLeaves(decoded);
    expect(originalLeaves).toHaveLength(30);
    expect(decodedLeaves).toHaveLength(30);
    expect(decodedLeaves.map((leaf) => leaf.path)).toEqual(originalLeaves.map((leaf) => leaf.path));
    for (let i = 0; i < originalLeaves.length; i++) {
      expect(bits(decodedLeaves[i].value)).toBe(bits(originalLeaves[i].value));
      expect(Object.is(decodedLeaves[i].value, originalLeaves[i].value)).toBe(true);
    }
    for (const { path, hex } of FIVE_ULP_REGRESSIONS) {
      expect(bits(readPath(decoded, path))).toBe(hex);
      expect(bits(readPath(PRODUCTION_NORMALIZATION_MANIFEST, path))).toBe(hex);
    }
    expect(sha256CanonicalJson(decoded)).toBe(FROZEN_NORMALIZATION_MANIFEST_HASH);
  });
});

describe('exact envelope shape', () => {
  const snapshot = deriveSyntheticSnapshot(3);
  const valid = encodeCandidateBNormalizationManifest(
    snapshot.normalizationManifest,
    snapshot.normalizationManifestHash
  );

  it('accepts the exact encodingId + canonicalJson envelope', () => {
    expect(Object.keys(valid).sort()).toEqual(['canonicalJson', 'encodingId']);
    expect(valid.encodingId).toBe(NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_ID);
    expect(typeof valid.canonicalJson).toBe('string');
    expect(
      decodeCandidateBNormalizationManifest(valid, snapshot.normalizationManifestHash)
    ).toEqual(JSON.parse(valid.canonicalJson));
  });

  it.each([
    ['null', null, 'candidate_b_normalization_manifest_envelope_not_object'],
    ['array', [], 'candidate_b_normalization_manifest_envelope_not_object'],
    ['string', 'nope', 'candidate_b_normalization_manifest_envelope_not_object'],
    ['number', 1, 'candidate_b_normalization_manifest_envelope_not_object'],
    ['empty object', {}, 'candidate_b_normalization_manifest_envelope_keys_invalid'],
    [
      'only encodingId',
      { encodingId: valid.encodingId },
      'candidate_b_normalization_manifest_envelope_keys_invalid',
    ],
    [
      'only canonicalJson',
      { canonicalJson: valid.canonicalJson },
      'candidate_b_normalization_manifest_envelope_keys_invalid',
    ],
    [
      'extra key',
      { ...valid, extra: true },
      'candidate_b_normalization_manifest_envelope_keys_invalid',
    ],
    [
      'wrong encodingId',
      { ...valid, encodingId: 'not_the_frozen_transport' },
      'candidate_b_normalization_manifest_encoding_id_invalid',
    ],
    [
      'canonicalJson number',
      { encodingId: valid.encodingId, canonicalJson: 1 },
      'candidate_b_normalization_manifest_canonical_json_not_string',
    ],
    [
      'canonicalJson object',
      { encodingId: valid.encodingId, canonicalJson: snapshot.normalizationManifest },
      'candidate_b_normalization_manifest_canonical_json_not_string',
    ],
    [
      'canonicalJson null',
      { encodingId: valid.encodingId, canonicalJson: null },
      'candidate_b_normalization_manifest_canonical_json_not_string',
    ],
  ])('rejects %s', (_label, value, error) => {
    expect(() =>
      decodeCandidateBNormalizationManifest(value, snapshot.normalizationManifestHash)
    ).toThrow(error);
  });
});

describe('fail-closed decode gates', () => {
  const snapshot = deriveSyntheticSnapshot(3);
  const valid = encodeCandidateBNormalizationManifest(
    snapshot.normalizationManifest,
    snapshot.normalizationManifestHash
  );

  it('rejects malformed canonicalJson', () => {
    expect(() =>
      decodeCandidateBNormalizationManifest(
        { encodingId: valid.encodingId, canonicalJson: '{"a":' },
        snapshot.normalizationManifestHash
      )
    ).toThrow('candidate_b_normalization_manifest_json_parse_failed');
  });

  it('rejects noncanonical but valid JSON text', () => {
    expect(() =>
      decodeCandidateBNormalizationManifest(
        {
          encodingId: valid.encodingId,
          canonicalJson: '{"b":2,"a":1}',
        },
        sha256CanonicalJson({ a: 1, b: 2 })
      )
    ).toThrow('candidate_b_normalization_manifest_noncanonical_text');
  });

  it('rejects semantic hash mismatch', () => {
    expect(() =>
      decodeCandidateBNormalizationManifest(valid, '0'.repeat(64))
    ).toThrow('candidate_b_normalization_manifest_hash_mismatch');
    expect(() =>
      encodeCandidateBNormalizationManifest(snapshot.normalizationManifest, '0'.repeat(64))
    ).toThrow('candidate_b_normalization_manifest_hash_mismatch');
  });

  it.each([
    ['null', 'null'],
    ['array', '[]'],
    ['string', '"string"'],
    ['number', '123'],
    ['boolean', 'true'],
  ])('rejects canonicalJson that parses to %s', (_label, canonicalJson) => {
    expect(() =>
      decodeCandidateBNormalizationManifest(
        { encodingId: valid.encodingId, canonicalJson },
        snapshot.normalizationManifestHash
      )
    ).toThrow('candidate_b_normalization_manifest_decoded_value_invalid');
  });

  it('rejects the old un-enveloped semantic object', () => {
    expect(() =>
      decodeCandidateBNormalizationManifest(
        snapshot.normalizationManifest,
        snapshot.normalizationManifestHash
      )
    ).toThrow('candidate_b_normalization_manifest_envelope_keys_invalid');
  });
});

describe('Prisma store parent write path', () => {
  it('persists the envelope and leaves other parent manifests as ordinary JSON', async () => {
    const snapshot = deriveSyntheticSnapshot(CANDIDATE_B_EXPECTED_TEAM_COUNT);
    const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'parent-write',
      ...data,
    }));
    const executeRaw = jest.fn(async () => CANDIDATE_B_EXPECTED_TEAM_COUNT);
    const { prisma } = mockPrisma({ parent: null, create, executeRaw });
    const store = createPrismaCandidateBFeatureSnapshotStore(prisma as never);
    await store.runSerializable(async (tx) => {
      await tx.insertSnapshot(snapshot, 'a'.repeat(40), new Date('2026-09-14T00:00:00.000Z'));
    });
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.normalizationManifest).toEqual({
      encodingId: NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_ID,
      canonicalJson: canonicalJsonString(snapshot.normalizationManifest),
    });
    expect(data.normalizationManifestHash).toBe(snapshot.normalizationManifestHash);
    expect(data.featureDefinitionManifest).toEqual(snapshot.featureDefinitionManifest);
    expect(data.derivationDefinitionManifest).toEqual(snapshot.derivationDefinitionManifest);
    expect(data.sourceManifest).toEqual(snapshot.sourceManifest);
    expect(data.sourceProvenanceManifest).toEqual(snapshot.sourceProvenanceManifest);
    expect(data.populationManifest).toEqual(snapshot.populationManifest);
    expect(data.snapshotHash).toBe(snapshot.snapshotHash);
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });
});

describe('Prisma store parent read path', () => {
  it('returns semantic normalizationManifest, not the envelope', async () => {
    const snapshot = deriveSyntheticSnapshot(3);
    const parent = parentFromSnapshot(snapshot, 'parent-1');
    const queryRaw = jest.fn(async (sql: Prisma.Sql) => {
      assertCandidateBChildSelectSqlContract(sql, 'parent-1');
      return snapshot.teams.map(rawFromTeam);
    });
    const { prisma, findUnique } = mockPrisma({ parent, queryRaw });
    const store = createPrismaCandidateBFeatureSnapshotStore(prisma as never);
    const loaded = await store.loadExistingByStableIdentity();
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(loaded).not.toBeNull();
    expect(loaded!.normalizationManifest).not.toHaveProperty('encodingId');
    expect(loaded!.normalizationManifest).not.toHaveProperty('canonicalJson');
    expect(canonicalJsonString(loaded!.normalizationManifest)).toBe(
      canonicalJsonString(snapshot.normalizationManifest)
    );
    expect(sha256CanonicalJson(loaded!.normalizationManifest)).toBe(
      loaded!.normalizationManifestHash
    );
    expect(loaded!.normalizationManifestHash).toBe(snapshot.normalizationManifestHash);
  });

  it('uses the same decoder inside the serializable transaction', async () => {
    const snapshot = deriveSyntheticSnapshot(3);
    const parent = parentFromSnapshot(snapshot, 'tx-parent');
    const queryRaw = jest.fn(async (sql: Prisma.Sql) => {
      assertCandidateBChildSelectSqlContract(sql, 'tx-parent');
      return snapshot.teams.map(rawFromTeam);
    });
    const { prisma } = mockPrisma({ parent, queryRaw });
    const store = createPrismaCandidateBFeatureSnapshotStore(prisma as never);
    const loaded = await store.runSerializable(async (tx) => tx.loadExistingByStableIdentity());
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(canonicalJsonString(loaded!.normalizationManifest)).toBe(
      canonicalJsonString(snapshot.normalizationManifest)
    );
  });

  it('returns null without decoding or querying children when the parent is absent', async () => {
    const queryRaw = jest.fn(async () => []);
    const { prisma, findUnique } = mockPrisma({ parent: null, queryRaw });
    const store = createPrismaCandidateBFeatureSnapshotStore(prisma as never);
    await expect(store.loadExistingByStableIdentity()).resolves.toBeNull();
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe('Prisma store corrupt envelope fail-closed', () => {
  it.each([
    [
      'wrong encodingId',
      (snapshot: ReturnType<typeof deriveSyntheticSnapshot>) => ({
        encodingId: 'not_the_frozen_transport',
        canonicalJson: canonicalJsonString(snapshot.normalizationManifest),
      }),
      'candidate_b_normalization_manifest_encoding_id_invalid',
    ],
    [
      'extra key',
      (snapshot: ReturnType<typeof deriveSyntheticSnapshot>) => ({
        encodingId: NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_ID,
        canonicalJson: canonicalJsonString(snapshot.normalizationManifest),
        extra: true,
      }),
      'candidate_b_normalization_manifest_envelope_keys_invalid',
    ],
    [
      'noncanonical text',
      () => ({
        encodingId: NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_ID,
        canonicalJson: '{"z":1,"a":2}',
      }),
      'candidate_b_normalization_manifest_noncanonical_text',
    ],
    [
      'legacy semantic object',
      (snapshot: ReturnType<typeof deriveSyntheticSnapshot>) => snapshot.normalizationManifest,
      'candidate_b_normalization_manifest_envelope_keys_invalid',
    ],
  ])('does not classify %s as ABSENT', async (_label, envelopeFor, error) => {
    const snapshot = deriveSyntheticSnapshot(3);
    const parent = parentFromSnapshot(snapshot, 'corrupt', envelopeFor(snapshot));
    const queryRaw = jest.fn(async () => snapshot.teams.map(rawFromTeam));
    const { prisma } = mockPrisma({ parent, queryRaw });
    const store = createPrismaCandidateBFeatureSnapshotStore(prisma as never);
    await expect(store.loadExistingByStableIdentity()).rejects.toThrow(error);
  });

  it('rejects a hash-mismatched envelope', async () => {
    const snapshot = deriveSyntheticSnapshot(3);
    const other = { a: 1, b: 2 };
    const parent = parentFromSnapshot(snapshot, 'hash-mismatch', {
      encodingId: NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_ID,
      canonicalJson: canonicalJsonString(other),
    });
    const queryRaw = jest.fn(async () => snapshot.teams.map(rawFromTeam));
    const { prisma } = mockPrisma({ parent, queryRaw });
    const store = createPrismaCandidateBFeatureSnapshotStore(prisma as never);
    await expect(store.loadExistingByStableIdentity()).rejects.toThrow(
      'candidate_b_normalization_manifest_hash_mismatch'
    );
  });
});

describe('integrity after semantic decode', () => {
  it('returns EXACT_EXISTING for an exact decoded fixture', async () => {
    const snapshot = deriveSyntheticSnapshot(3);
    const parent = parentFromSnapshot(snapshot, 'snap-exact');
    const queryRaw = jest.fn(async () => snapshot.teams.map(rawFromTeam));
    const { prisma } = mockPrisma({ parent, queryRaw });
    const store = createPrismaCandidateBFeatureSnapshotStore(prisma as never);
    const loaded = (await store.loadExistingByStableIdentity()) as PersistedSnapshot;
    expect(verifyPersistedSnapshotIntegrity(loaded, { expectedTeamCount: 3 })).toBe(true);
    expect(classifyExistingSnapshot(loaded, snapshot, { expectedTeamCount: 3 })).toBe(
      'EXACT_EXISTING'
    );
  });

  it('fails integrity after a one-ULP semantic alteration', () => {
    const snapshot = deriveSyntheticSnapshot(3);
    const teams = snapshot.teams.map((team) => mapCandidateBExactChildRow(rawFromTeam(team)));
    const decoded = decodeCandidateBNormalizationManifest(
      encodeCandidateBNormalizationManifest(
        snapshot.normalizationManifest,
        snapshot.normalizationManifestHash
      ),
      snapshot.normalizationManifestHash
    ) as NormalizationManifest;
    const persisted: PersistedSnapshot = {
      id: 'snap-altered',
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
      normalizationManifest: decoded,
      normalizationManifestHash: snapshot.normalizationManifestHash,
      populationManifest: snapshot.populationManifest,
      populationManifestHash: snapshot.populationManifestHash,
      expectedTeamCount: snapshot.expectedTeamCount,
      rowCount: snapshot.rowCount,
      completeVectorCount: snapshot.completeVectorCount,
      unavailableVectorCount: snapshot.unavailableVectorCount,
      portalAvailableCount: snapshot.portalAvailableCount,
      snapshotHash: snapshot.snapshotHash,
      teams,
    };
    expect(verifyPersistedSnapshotIntegrity(persisted, { expectedTeamCount: 3 })).toBe(true);
    const flipped = Buffer.allocUnsafe(8);
    flipped.writeDoubleBE(decoded.priorCore.populationSD, 0);
    flipped[7] ^= 1;
    decoded.priorCore.populationSD = flipped.readDoubleBE(0);
    expect(verifyPersistedSnapshotIntegrity(persisted, { expectedTeamCount: 3 })).toBe(false);
    expect(classifyExistingSnapshot(persisted, snapshot, { expectedTeamCount: 3 })).toBe(
      'CORRUPT_EXISTING'
    );
  });
});

describe('frozen semantic identity', () => {
  it('keeps the audited production hashes on the transport fixture', () => {
    expect(sha256CanonicalJson(PRODUCTION_NORMALIZATION_MANIFEST)).toBe(
      FROZEN_NORMALIZATION_MANIFEST_HASH
    );
    const decoded = decodeCandidateBNormalizationManifest(
      encodeCandidateBNormalizationManifest(
        PRODUCTION_NORMALIZATION_MANIFEST,
        FROZEN_NORMALIZATION_MANIFEST_HASH
      ),
      FROZEN_NORMALIZATION_MANIFEST_HASH
    );
    expect(sha256CanonicalJson(decoded)).toBe(FROZEN_NORMALIZATION_MANIFEST_HASH);
    expect(FROZEN_SNAPSHOT_HASH).toBe(
      '0332e24f97c891fd6431280fa7939c467c614714abe207eeb3dc89d466eb1148'
    );
  });
});

describe('source contract', () => {
  it('CLI encodes and decodes only normalizationManifest', () => {
    const cli = fs.readFileSync(CLI, 'utf8');
    const transport = fs.readFileSync(TRANSPORT, 'utf8');
    const pure = fs.readFileSync(PURE, 'utf8');
    const writer = fs.readFileSync(WRITER, 'utf8');
    const reader = fs.readFileSync(READER, 'utf8');
    expect(cli).toContain('encodeCandidateBNormalizationManifest');
    expect(cli).toContain('decodeCandidateBNormalizationManifest');
    expect(cli).toContain('snapshot.normalizationManifest');
    expect(cli).not.toMatch(/encodeCandidateBNormalizationManifest\(\s*snapshot\.featureDefinitionManifest/);
    expect(cli).not.toMatch(/encodeCandidateBNormalizationManifest\(\s*snapshot\.populationManifest/);
    expect(transport).toContain(NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_ID);
    expect(pure).not.toContain(NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_ID);
    expect(writer).not.toContain(NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_ID);
    expect(reader).not.toContain(NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_ID);
    expect(pure).not.toContain(FROZEN_NORMALIZATION_MANIFEST_HASH);
    expect(pure).not.toContain(FROZEN_SNAPSHOT_HASH);
  });
});
