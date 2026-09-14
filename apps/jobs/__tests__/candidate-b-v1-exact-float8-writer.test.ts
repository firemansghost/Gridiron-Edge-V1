/**
 * Candidate B V1 exact-float8 writer tests.
 * Synthetic fixtures only. No private PIT. No DATABASE_URL. No providers. No COMMIT.
 */

import * as fs from 'fs';
import * as path from 'path';
import cuid from 'cuid';
import {
  CANDIDATE_B_EXPECTED_TEAM_COUNT,
  CANDIDATE_B_FLOAT8_TRANSPORT_FIELDS,
  DERIVATION_DEFINITION_HASH,
  FEATURE_DEFINITION_HASH,
  PERSISTENCE_ENCODING_CONTRACT_HASH,
  PERSISTENCE_ENCODING_CONTRACT_ID,
  TEAM_RESOLUTION_POLICY_HASH,
  buildSourceManifest,
  buildSourceProvenanceManifest,
  candidateBFloat8StorageText,
  candidateBNullableFloat8StorageText,
  computeRowHash,
  computeSnapshotHash,
  deriveCandidateBSnapshot,
  emptyDirection,
  hashTalentProvenance,
  hashTalentValues,
  type TeamFeatureRow,
} from '../src/research/candidate-b/candidate-b-v1-feature-snapshot';
import {
  assertCandidateBChildInsertSqlContract,
  buildCandidateBChildInsertSql,
  buildCandidateBChildTransportRows,
  candidateBChildInsertSqlText,
  generateCandidateBChildCuids,
  insertCandidateBFeatureSnapshotTeamsExact,
  serializeCandidateBChildTransportPayload,
  type CandidateBChildTransportRow,
} from '../src/research/candidate-b/candidate-b-v1-exact-float8-writer';

const ROOT = path.resolve(__dirname, '../../..');
const CLI = path.join(ROOT, 'apps/jobs/ingest-candidate-b-v1-feature-snapshot.ts');
const WRITER = path.join(
  ROOT,
  'apps/jobs/src/research/candidate-b/candidate-b-v1-exact-float8-writer.ts'
);

function bits(value: number): string {
  const buf = Buffer.allocUnsafe(8);
  buf.writeDoubleBE(value, 0);
  return buf.toString('hex');
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function assertFloatTransport(row: CandidateBChildTransportRow): void {
  for (const field of CANDIDATE_B_FLOAT8_TRANSPORT_FIELDS) {
    const value = row[field];
    expect(value === null || typeof value === 'string').toBe(true);
    expect(typeof value === 'number').toBe(false);
    expect(value).not.toBe('null');
    expect(value).not.toBe('');
    expect(value).not.toBe('NaN');
  }
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

describe('Candidate B V1 exact float8 storage text', () => {
  const representatives = [
    0.0029999999999997806,
    0.31354777192125616,
    0.21553251917758917,
    0.2260366965246555,
    0.7543638171215621,
    0.5555555555555556,
    0,
    Number.MIN_VALUE,
    1e308,
  ];

  it('roundtrips finite semantic bits, including California forensic values', () => {
    for (const value of representatives) {
      const text = candidateBFloat8StorageText(value);
      expect(typeof text).toBe('string');
      expect(bits(Number(text))).toBe(bits(value));
    }
  });

  it('canonicalizes -0 to +0 because canonical JSON already does', () => {
    expect(candidateBFloat8StorageText(-0)).toBe('0');
    expect(Object.is(Number(candidateBFloat8StorageText(-0)), 0)).toBe(true);
    expect(bits(Number(candidateBFloat8StorageText(-0)))).toBe(bits(0));
  });

  it('rejects non-finite values and leaves null as null', () => {
    expect(() => candidateBFloat8StorageText(Number.NaN)).toThrow('non_finite_float8_storage_value');
    expect(() => candidateBFloat8StorageText(Number.POSITIVE_INFINITY)).toThrow(
      'non_finite_float8_storage_value'
    );
    expect(() => candidateBFloat8StorageText(Number.NEGATIVE_INFINITY)).toThrow(
      'non_finite_float8_storage_value'
    );
    expect(candidateBNullableFloat8StorageText(null)).toBeNull();
    expect(candidateBNullableFloat8StorageText(0)).toBe('0');
  });
});

describe('Candidate B V1 child CUID identity', () => {
  it('generates 138 unique non-empty public-API CUIDs', () => {
    const ids = generateCandidateBChildCuids(CANDIDATE_B_EXPECTED_TEAM_COUNT);
    expect(ids).toHaveLength(138);
    expect(new Set(ids).size).toBe(138);
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(ids.every((id) => cuid.isCuid(id))).toBe(true);
  });

  it('child IDs do not enter rowHash or snapshotHash', () => {
    const snapshot = deriveSyntheticSnapshot(3);
    const left = buildCandidateBChildTransportRows('snap-a', snapshot.teams, [
      'id-left-1',
      'id-left-2',
      'id-left-3',
    ]);
    const right = buildCandidateBChildTransportRows('snap-a', snapshot.teams, [
      'id-right-1',
      'id-right-2',
      'id-right-3',
    ]);
    expect(left.map((row) => row.id)).not.toEqual(right.map((row) => row.id));
    expect(left.map((row) => row.rowHash)).toEqual(right.map((row) => row.rowHash));
    expect(left.map((row) => row.rowHash)).toEqual(snapshot.teams.map((t) => t.rowHash));
    const hashInput = {
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
    };
    expect(computeSnapshotHash(hashInput)).toBe(snapshot.snapshotHash);
    expect(computeSnapshotHash({ ...hashInput, teams: snapshot.teams.map((t) => ({ ...t })) })).toBe(
      snapshot.snapshotHash
    );
    expect(JSON.stringify(snapshot.sourceManifest)).not.toContain(left[0].id);
    expect(snapshot.snapshotHash).not.toContain(left[0].id);
    expect(computeRowHash(snapshot.teams[0])).toBe(snapshot.teams[0].rowHash);
  });
});

describe('Candidate B V1 child transport payload', () => {
  it('representative row keeps floats as string|null and integers as numbers', () => {
    const snapshot = deriveSyntheticSnapshot(3);
    const [row] = buildCandidateBChildTransportRows('snap-1', snapshot.teams);
    assertFloatTransport(row);
    expect(typeof row.id).toBe('string');
    expect(cuid.isCuid(row.id)).toBe(true);
    expect(typeof row.inboundTransferCount).toBe('number');
    expect(typeof row.outboundRatedCount).toBe('number');
    expect(Array.isArray(row.unavailableReasons)).toBe(true);
    expect(row.unavailableReasons.every((reason) => typeof reason === 'string')).toBe(true);
    const unavailable = snapshot.teams.find((t) => t.portalRaw === null);
    expect(unavailable).toBeDefined();
    const unavailableRow = buildCandidateBChildTransportRows('snap-1', [unavailable as TeamFeatureRow])[0];
    expect(unavailableRow.portalRaw).toBeNull();
    expect(unavailableRow.zPortal).toBeNull();
  });

  it('all 138 derived child rows use canonical string|null float transport', () => {
    const snapshot = deriveSyntheticSnapshot(CANDIDATE_B_EXPECTED_TEAM_COUNT);
    expect(snapshot.teams).toHaveLength(138);
    const rows = buildCandidateBChildTransportRows('snap-138', snapshot.teams);
    expect(rows).toHaveLength(138);
    expect(new Set(rows.map((row) => row.id)).size).toBe(138);
    for (const row of rows) {
      assertFloatTransport(row);
      const team = snapshot.teams.find((t) => t.teamId === row.teamId)!;
      for (const field of CANDIDATE_B_FLOAT8_TRANSPORT_FIELDS) {
        const semantic = team[field];
        if (semantic === null) expect(row[field]).toBeNull();
        else expect(row[field]).toBe(candidateBFloat8StorageText(semantic));
      }
    }
  });
});

describe('Candidate B V1 child insert SQL contract', () => {
  it('uses one TEXT JSON payload, 15 explicit float8 casts, and no mutating conflict logic', () => {
    const snapshot = deriveSyntheticSnapshot(3);
    const rows = buildCandidateBChildTransportRows('snap-sql', snapshot.teams);
    const payloadJson = serializeCandidateBChildTransportPayload(rows);
    const sql = buildCandidateBChildInsertSql(payloadJson);
    expect(() => assertCandidateBChildInsertSqlContract(sql, payloadJson)).not.toThrow();
    const text = candidateBChildInsertSqlText(sql);
    expect(text).toContain('"shadow_model_feature_snapshot_teams"');
    expect((text.match(/::double precision/g) ?? []).length).toBe(15);
    expect(sql.values).toHaveLength(1);
    expect(typeof sql.values[0]).toBe('string');
    expect(sql.values[0]).toBe(payloadJson);
    expect(sql.values.some((value) => typeof value === 'number')).toBe(false);
    expect(text).not.toMatch(/ON CONFLICT/i);
    expect(text).not.toMatch(/\bUPDATE\b/i);
    expect(text).not.toMatch(/\bDELETE\b/i);
    expect(text).not.toMatch(/\bMERGE\b/i);
    expect(text).toContain('jsonb_array_elements');
  });

  it('fails closed when the child count is not 138', async () => {
    const snapshot = deriveSyntheticSnapshot(3);
    await expect(
      insertCandidateBFeatureSnapshotTeamsExact(
        { $executeRaw: async () => 3 },
        'snap-too-small',
        snapshot.teams
      )
    ).rejects.toThrow('candidate_b_child_insert_count_mismatch:3');
  });

  it('requires executeRaw to insert exactly 138 rows', async () => {
    const snapshot = deriveSyntheticSnapshot(CANDIDATE_B_EXPECTED_TEAM_COUNT);
    await expect(
      insertCandidateBFeatureSnapshotTeamsExact(
        { $executeRaw: async () => 137 },
        'snap-138',
        snapshot.teams
      )
    ).rejects.toThrow('candidate_b_child_insert_count_mismatch:137');
  });

  it('CLI no longer nested-creates children and does not persist encoding identity', () => {
    const cli = fs.readFileSync(CLI, 'utf8');
    const writer = fs.readFileSync(WRITER, 'utf8');
    expect(cli).not.toMatch(/teams:\s*\{\s*create:/);
    expect(cli).toContain('insertCandidateBFeatureSnapshotTeamsExact');
    expect(writer).toContain('cuid()');
    expect(writer).not.toContain('randomUUID');
    expect(writer).not.toContain('@paralleldrive/cuid2');
    expect(FEATURE_DEFINITION_HASH).toBe(
      '6f1f8ecc132cdd87650252d57597a657ece0dd908bdf5010897023cafe988972'
    );
    expect(DERIVATION_DEFINITION_HASH).toBe(
      '6c04627787edbcc7d1d42549f3cb19c525a6c4c31de572549f01e3efa64a638c'
    );
    expect(TEAM_RESOLUTION_POLICY_HASH).toBe(
      'de627563f2c4c2b1e195182bcd6b66dd3226daf9800e209e5f55244f94ea0efe'
    );
    expect(PERSISTENCE_ENCODING_CONTRACT_ID).toBe('candidate_b_v1_exact_float8_text_encoding_v1');
    expect(PERSISTENCE_ENCODING_CONTRACT_HASH).toBe(
      '644f51274d1630746e579f861ebd22f4e82921be7adb8372cf2fef9d9dbcd343'
    );
  });
});
