/**
 * Candidate B V1 exact-float8 reader tests.
 * Synthetic fixtures only. No private PIT. No DATABASE_URL. No providers. No COMMIT.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import {
  CANDIDATE_B_FLOAT8_TRANSPORT_FIELDS,
  buildSourceManifest,
  buildSourceProvenanceManifest,
  classifyExistingSnapshot,
  deriveCandidateBSnapshot,
  emptyDirection,
  hashTalentProvenance,
  hashTalentValues,
  verifyPersistedSnapshotIntegrity,
  type PersistedSnapshot,
  type PersistedTeamRow,
  type TeamFeatureRow,
} from '../src/research/candidate-b/candidate-b-v1-feature-snapshot';
import {
  CANDIDATE_B_FLOAT8_READ_COLUMNS,
  FROZEN_PERSISTENCE_READ_CONTRACT_HASH,
  PERSISTENCE_READ_CONTRACT_HASH,
  PERSISTENCE_READ_CONTRACT_ID,
  PERSISTENCE_READ_CONTRACT_MANIFEST,
  assertCandidateBChildSelectSqlContract,
  buildCandidateBChildSelectSql,
  candidateBChildSelectSqlText,
  candidateBFloat8FromHex,
  candidateBNullableFloat8FromHex,
  loadCandidateBFeatureSnapshotTeamsExact,
  mapCandidateBExactChildRow,
  type CandidateBExactChildRawRow,
} from '../src/research/candidate-b/candidate-b-v1-exact-float8-reader';
import { createPrismaCandidateBFeatureSnapshotStore } from '../ingest-candidate-b-v1-feature-snapshot';
import { sha256CanonicalJson } from '../../web/lib/shadow-model-capture-v1';

const ROOT = path.resolve(__dirname, '../../..');
const CLI = path.join(ROOT, 'apps/jobs/ingest-candidate-b-v1-feature-snapshot.ts');
const READER = path.join(
  ROOT,
  'apps/jobs/src/research/candidate-b/candidate-b-v1-exact-float8-reader.ts'
);
const PURE = path.join(
  ROOT,
  'apps/jobs/src/research/candidate-b/candidate-b-v1-feature-snapshot.ts'
);

const CALIFORNIA_PORTAL_HEX = '3f689374bc6a7d00';
const CALIFORNIA_PORTAL_ULP_HEX = '3f689374bc6a7d01';
const AIR_FORCE_ZTALENT_HEX = 'c0079df37676fdec';
const AKRON_PORTAL_HEX = 'bf87a647313fe080';

function bits(value: number): string {
  const buf = Buffer.allocUnsafe(8);
  buf.writeDoubleBE(value, 0);
  return buf.toString('hex');
}

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

function toPersisted(snapshot: ReturnType<typeof deriveSyntheticSnapshot>, teams: PersistedTeamRow[]): PersistedSnapshot {
  return {
    id: 'snap-exact',
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
    teams,
  };
}

describe('Candidate B V1 persistence read contract', () => {
  it('is frozen, content-addressed, and non-semantic', () => {
    expect(PERSISTENCE_READ_CONTRACT_ID).toBe('candidate_b_v1_exact_float8_binary_read_v1');
    expect(PERSISTENCE_READ_CONTRACT_HASH).toBe(
      '88e6f3ac4b2761cf56509842be8c9d52f342d3b9f611cf3add655b68f448592e'
    );
    expect(FROZEN_PERSISTENCE_READ_CONTRACT_HASH).toBe(PERSISTENCE_READ_CONTRACT_HASH);
    expect(sha256CanonicalJson(PERSISTENCE_READ_CONTRACT_MANIFEST)).toBe(PERSISTENCE_READ_CONTRACT_HASH);
    const snapshot = deriveSyntheticSnapshot(3);
    expect(JSON.stringify(snapshot.sourceManifest)).not.toContain(PERSISTENCE_READ_CONTRACT_ID);
    expect(JSON.stringify(snapshot.sourceManifest)).not.toContain(PERSISTENCE_READ_CONTRACT_HASH);
    expect(JSON.stringify(snapshot.featureDefinitionManifest)).not.toContain(PERSISTENCE_READ_CONTRACT_ID);
    expect(JSON.stringify(snapshot.derivationDefinitionManifest)).not.toContain(PERSISTENCE_READ_CONTRACT_ID);
    expect(JSON.stringify(snapshot.sourceProvenanceManifest)).not.toContain(PERSISTENCE_READ_CONTRACT_ID);
    expect(JSON.stringify(snapshot.normalizationManifest)).not.toContain(PERSISTENCE_READ_CONTRACT_HASH);
    expect(JSON.stringify(snapshot.populationManifest)).not.toContain(PERSISTENCE_READ_CONTRACT_HASH);
    expect(snapshot.teams.every((t) => !t.rowHash.includes(PERSISTENCE_READ_CONTRACT_HASH))).toBe(true);
    expect(snapshot.snapshotHash).not.toContain(PERSISTENCE_READ_CONTRACT_HASH);
    expect(snapshot.snapshotHash).not.toContain(PERSISTENCE_READ_CONTRACT_ID);
  });
});

describe('candidateBFloat8FromHex', () => {
  it('decodes California portalRaw and representative forensic hexes exactly', () => {
    const california = candidateBFloat8FromHex(CALIFORNIA_PORTAL_HEX);
    expect(bits(california)).toBe(CALIFORNIA_PORTAL_HEX);
    expect(california).toBe(0.0029999999999997806);
    expect(bits(candidateBFloat8FromHex(AIR_FORCE_ZTALENT_HEX))).toBe(AIR_FORCE_ZTALENT_HEX);
    expect(bits(candidateBFloat8FromHex(AKRON_PORTAL_HEX))).toBe(AKRON_PORTAL_HEX);
  });

  it('distinguishes the historical one-ULP Prisma model neighbor', () => {
    const expected = candidateBFloat8FromHex(CALIFORNIA_PORTAL_HEX);
    const ulp = candidateBFloat8FromHex(CALIFORNIA_PORTAL_ULP_HEX);
    expect(bits(expected)).toBe(CALIFORNIA_PORTAL_HEX);
    expect(bits(ulp)).toBe(CALIFORNIA_PORTAL_ULP_HEX);
    expect(Object.is(expected, ulp)).toBe(false);
  });

  it('decodes zero, negative, small, and large finite values exactly', () => {
    expect(candidateBFloat8FromHex('0000000000000000')).toBe(0);
    expect(Object.is(candidateBFloat8FromHex('0000000000000000'), 0)).toBe(true);
    expect(bits(candidateBFloat8FromHex(bits(-12.5)))).toBe(bits(-12.5));
    expect(bits(candidateBFloat8FromHex(bits(1e-20)))).toBe(bits(1e-20));
    expect(bits(candidateBFloat8FromHex(bits(1e20)))).toBe(bits(1e20));
  });

  it('rejects malformed hex', () => {
    expect(() => candidateBFloat8FromHex('3F689374BC6A7D00')).toThrow('candidate_b_float8_hex_invalid');
    expect(() => candidateBFloat8FromHex('3f689374bc6a7d0')).toThrow('candidate_b_float8_hex_invalid');
    expect(() => candidateBFloat8FromHex('3f689374bc6a7d000')).toThrow('candidate_b_float8_hex_invalid');
    expect(() => candidateBFloat8FromHex('zz689374bc6a7d00')).toThrow('candidate_b_float8_hex_invalid');
    expect(() => candidateBFloat8FromHex('')).toThrow('candidate_b_float8_hex_invalid');
    expect(() => candidateBFloat8FromHex(' 3f689374bc6a7d00')).toThrow('candidate_b_float8_hex_invalid');
    expect(() => candidateBFloat8FromHex('0x3f689374bc6a7d00')).toThrow('candidate_b_float8_hex_invalid');
  });
});

describe('nullable hex decode', () => {
  it('maps SQL null to null and does not treat sentinels as null', () => {
    expect(candidateBNullableFloat8FromHex(null)).toBeNull();
    expect(() => candidateBNullableFloat8FromHex('')).toThrow('candidate_b_float8_hex_invalid');
    expect(() => candidateBNullableFloat8FromHex('null')).toThrow('candidate_b_float8_hex_invalid');
    expect(candidateBNullableFloat8FromHex('0000000000000000')).toBe(0);
  });
});

describe('Candidate B V1 child select SQL contract', () => {
  it('uses snapshot_id filter, team_id order, and 15 float8send hex extractions', () => {
    const sql = buildCandidateBChildSelectSql('snap-sql');
    expect(() => assertCandidateBChildSelectSqlContract(sql, 'snap-sql')).not.toThrow();
    const text = candidateBChildSelectSqlText(sql);
    expect(text).toContain('"shadow_model_feature_snapshot_teams"');
    expect(text).toContain('"snapshot_id"');
    expect(text).toMatch(/ORDER BY\s+"team_id"\s+ASC/i);
    expect((text.match(/float8send\(/g) ?? []).length).toBe(15);
    expect((text.match(/encode\(/g) ?? []).length).toBe(15);
    expect(sql.values).toHaveLength(1);
    expect(sql.values[0]).toBe('snap-sql');
    expect(text).not.toMatch(/INSERT/i);
    expect(text).not.toMatch(/\bUPDATE\b/i);
    expect(text).not.toMatch(/\bDELETE\b/i);
    expect(text).not.toMatch(/\bMERGE\b/i);
    for (const { column, hexAlias } of CANDIDATE_B_FLOAT8_READ_COLUMNS) {
      expect(text).toContain(`encode(float8send("${column}"), 'hex')`);
      expect(text).toContain(`AS "${hexAlias}"`);
      expect(text).not.toMatch(new RegExp(`AS\\s+"${column}"`, 'i'));
    }
  });
});

describe('exact child mapper', () => {
  it('reconstructs exact binary bits including null floats', () => {
    const snapshot = deriveSyntheticSnapshot(3);
    const unavailable = snapshot.teams.find((team) => team.portalRaw === null);
    expect(unavailable).toBeDefined();
    const mapped = mapCandidateBExactChildRow(rawFromTeam(unavailable as TeamFeatureRow));
    expect(mapped.portalRaw).toBeNull();
    expect(mapped.zPortal).toBeNull();
    expect(mapped.rowHash).toBe((unavailable as TeamFeatureRow).rowHash);
    expect(mapped.unavailableReasons).toEqual((unavailable as TeamFeatureRow).unavailableReasons);
    expect(mapped.inboundTransferCount).toBe((unavailable as TeamFeatureRow).inboundTransferCount);
    for (const field of CANDIDATE_B_FLOAT8_TRANSPORT_FIELDS) {
      const expected = (unavailable as TeamFeatureRow)[field];
      if (expected === null) expect(mapped[field]).toBeNull();
      else expect(bits(mapped[field] as number)).toBe(bits(expected));
    }
  });

  it('routes every one of the 15 Float fields through hex decode', () => {
    expect(CANDIDATE_B_FLOAT8_READ_COLUMNS).toHaveLength(15);
    expect(CANDIDATE_B_FLOAT8_READ_COLUMNS.map((col) => col.field)).toEqual([
      ...CANDIDATE_B_FLOAT8_TRANSPORT_FIELDS,
    ]);
    const hexes = {
      priorCoreRawHex: bits(1.25),
      talentRawHex: bits(2.5),
      returningRawHex: bits(0.5),
      portalRawHex: CALIFORNIA_PORTAL_HEX,
      zCoreHex: bits(-0.25),
      zTalentHex: AIR_FORCE_ZTALENT_HEX,
      zReturningHex: bits(0.75),
      zPortalHex: bits(-1.5),
      candidateBRawCompositeHex: bits(0.125),
      candidateBCompositeZHex: bits(-0.0625),
      candidateBTeamRatingPointsHex: bits(3.5),
      inboundRatedCoverageHex: bits(1),
      inboundMeanRatingHex: bits(0.2),
      outboundRatedCoverageHex: bits(0.4),
      outboundMeanRatingHex: bits(-0.3),
    };
    const mapped = mapCandidateBExactChildRow({
      teamId: 'california',
      season: 2026,
      availabilityStatus: 'AVAILABLE',
      unavailableReasons: [],
      inboundTransferCount: 1,
      inboundRatedCount: 1,
      inboundDirectionStatus: 'SUFFICIENT_RATED_COVERAGE',
      outboundTransferCount: 0,
      outboundRatedCount: 0,
      outboundDirectionStatus: 'NO_TRANSFERS',
      rowHash: 'a'.repeat(64),
      ...hexes,
    });
    for (const { field, hexAlias } of CANDIDATE_B_FLOAT8_READ_COLUMNS) {
      expect(bits(mapped[field] as number)).toBe(hexes[hexAlias]);
    }
    expect(mapped.portalRaw).toBe(0.0029999999999997806);
  });
});

describe('exact child loader', () => {
  it('maps raw query rows and fails closed on duplicate team IDs', async () => {
    const snapshot = deriveSyntheticSnapshot(3);
    const rows = snapshot.teams.map(rawFromTeam);
    const loaded = await loadCandidateBFeatureSnapshotTeamsExact(
      { $queryRaw: async () => rows },
      'snap-1'
    );
    expect(loaded).toHaveLength(3);
    expect(new Set(loaded.map((row) => row.teamId)).size).toBe(3);
    await expect(
      loadCandidateBFeatureSnapshotTeamsExact(
        { $queryRaw: async () => [rows[0], { ...rows[0], teamId: rows[0].teamId }] },
        'snap-dup'
      )
    ).rejects.toThrow('candidate_b_child_select_duplicate_team_id');
  });

  it('fails closed on malformed hex in a raw row', async () => {
    const snapshot = deriveSyntheticSnapshot(3);
    const bad = { ...rawFromTeam(snapshot.teams[0]), portalRawHex: '3F689374BC6A7D00' };
    await expect(
      loadCandidateBFeatureSnapshotTeamsExact({ $queryRaw: async () => [bad] }, 'snap-bad')
    ).rejects.toThrow('candidate_b_float8_hex_invalid');
  });
});

describe('Prisma store exact child load path', () => {
  function mockPrisma(options: {
    parent: { id: string } | null;
    queryRaw?: jest.Mock;
  }) {
    const queryRaw = options.queryRaw ?? jest.fn(async () => []);
    const findUnique = jest.fn(async () => options.parent);
    const txFindUnique = jest.fn(async () => options.parent);
    const txQueryRaw = options.queryRaw ?? queryRaw;
    const prisma = {
      shadowModelFeatureSnapshot: { findUnique },
      teamMembership: { findMany: async () => [] },
      teamSeasonTalent: { findMany: async () => [] },
      $queryRaw: queryRaw,
      $transaction: async (
        fn: (tx: {
          shadowModelFeatureSnapshot: { findUnique: typeof txFindUnique };
          $queryRaw: typeof txQueryRaw;
        }) => Promise<unknown>
      ) =>
        fn({
          shadowModelFeatureSnapshot: { findUnique: txFindUnique },
          $queryRaw: txQueryRaw,
        }),
    };
    return { prisma, findUnique, queryRaw, txFindUnique };
  }

  it('does not include teams and loads children through the exact reader', async () => {
    const snapshot = deriveSyntheticSnapshot(3);
    const parent = {
      id: 'parent-1',
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
    };
    const queryRaw = jest.fn(async (sql: Prisma.Sql) => {
      assertCandidateBChildSelectSqlContract(sql, 'parent-1');
      return snapshot.teams.map(rawFromTeam);
    });
    const { prisma, findUnique } = mockPrisma({ parent, queryRaw });
    const store = createPrismaCandidateBFeatureSnapshotStore(prisma as never);
    const loaded = await store.loadExistingByStableIdentity();
    expect(findUnique).toHaveBeenCalledTimes(1);
    const parentCalls = findUnique.mock.calls as unknown as Array<[Record<string, unknown>]>;
    expect(parentCalls[0][0]).not.toHaveProperty('include');
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(loaded?.teams).toHaveLength(3);
    expect(loaded?.id).toBe('parent-1');
    expect(bits(loaded!.teams.find((row) => row.teamId === snapshot.teams[1].teamId)!.zCore!)).toBe(
      bits(snapshot.teams[1].zCore!)
    );
  });

  it('returns null without querying children when the parent is absent', async () => {
    const queryRaw = jest.fn(async () => []);
    const { prisma, findUnique } = mockPrisma({ parent: null, queryRaw });
    const store = createPrismaCandidateBFeatureSnapshotStore(prisma as never);
    await expect(store.loadExistingByStableIdentity()).resolves.toBeNull();
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('uses the same exact reader inside the serializable transaction', async () => {
    const snapshot = deriveSyntheticSnapshot(3);
    const parent = {
      id: 'tx-parent',
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
    };
    const queryRaw = jest.fn(async (sql: Prisma.Sql) => {
      assertCandidateBChildSelectSqlContract(sql, 'tx-parent');
      return snapshot.teams.map(rawFromTeam);
    });
    const { prisma } = mockPrisma({ parent, queryRaw });
    const store = createPrismaCandidateBFeatureSnapshotStore(prisma as never);
    const loaded = await store.runSerializable(async (tx) => tx.loadExistingByStableIdentity());
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(loaded?.id).toBe('tx-parent');
    expect(loaded?.teams).toHaveLength(3);
  });
});

describe('integrity through exact hex reconstruction', () => {
  it('accepts exact hex-decoded children and fails closed on a one-ULP perturbation', () => {
    const snapshot = deriveSyntheticSnapshot(3);
    const teams = snapshot.teams.map((team) => mapCandidateBExactChildRow(rawFromTeam(team)));
    const persisted = toPersisted(snapshot, teams);
    expect(verifyPersistedSnapshotIntegrity(persisted, { expectedTeamCount: 3 })).toBe(true);
    expect(classifyExistingSnapshot(persisted, snapshot, { expectedTeamCount: 3 })).toBe('EXACT_EXISTING');
    const target = persisted.teams.find((team) => team.portalRaw !== null);
    expect(target).toBeDefined();
    const original = target!.portalRaw as number;
    const flipped = Buffer.allocUnsafe(8);
    flipped.writeDoubleBE(original, 0);
    flipped[7] ^= 1;
    target!.portalRaw = flipped.readDoubleBE(0);
    expect(Object.is(target!.portalRaw, original)).toBe(false);
    expect(verifyPersistedSnapshotIntegrity(persisted, { expectedTeamCount: 3 })).toBe(false);
    expect(classifyExistingSnapshot(persisted, snapshot, { expectedTeamCount: 3 })).toBe('CORRUPT_EXISTING');
  });
});

describe('source contract', () => {
  it('CLI parent load no longer includes Prisma teams and uses the exact reader', () => {
    const cli = fs.readFileSync(CLI, 'utf8');
    const reader = fs.readFileSync(READER, 'utf8');
    const pure = fs.readFileSync(PURE, 'utf8');
    expect(cli).not.toMatch(/include:\s*\{\s*teams:\s*true\s*\}/);
    expect(cli).toContain('loadCandidateBFeatureSnapshotTeamsExact');
    expect(reader).toContain("encode(float8send(");
    expect(reader).toContain('candidateBFloat8FromHex');
    expect(pure).not.toContain(PERSISTENCE_READ_CONTRACT_ID);
  });
});
