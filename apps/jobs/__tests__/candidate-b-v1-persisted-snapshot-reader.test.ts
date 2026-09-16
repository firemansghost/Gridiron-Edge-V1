/**
 * Shared exact Candidate B persisted-snapshot reader tests.
 * Synthetic fixtures only. No DATABASE_URL. No providers. No COMMIT.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import {
  buildSourceManifest,
  buildSourceProvenanceManifest,
  deriveCandidateBSnapshot,
  emptyDirection,
  hashTalentProvenance,
  hashTalentValues,
  verifyPersistedSnapshotIntegrity,
  type TeamFeatureRow,
} from '../src/research/candidate-b/candidate-b-v1-feature-snapshot';
import {
  assertCandidateBChildSelectSqlContract,
  type CandidateBExactChildRawRow,
} from '../src/research/candidate-b/candidate-b-v1-exact-float8-reader';
import { encodeCandidateBNormalizationManifest } from '../src/research/candidate-b/candidate-b-v1-normalization-manifest-transport';
import {
  CANDIDATE_B_V1_STABLE_IDENTITY,
  candidateBParentFindUniqueArgsExcludeChildInclude,
  loadCandidateBPersistedSnapshotBySnapshotHash,
  loadCandidateBPersistedSnapshotByStableIdentity,
} from '../src/research/candidate-b/candidate-b-v1-persisted-snapshot-reader';
import { createPrismaCandidateBFeatureSnapshotStore } from '../ingest-candidate-b-v1-feature-snapshot';

const ROOT = path.resolve(__dirname, '../../..');
const SHARED = path.join(
  ROOT,
  'apps/jobs/src/research/candidate-b/candidate-b-v1-persisted-snapshot-reader.ts'
);
const CLI = path.join(ROOT, 'apps/jobs/ingest-candidate-b-v1-feature-snapshot.ts');

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

function parentFromSnapshot(snapshot: ReturnType<typeof deriveSyntheticSnapshot>, id: string) {
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
    normalizationManifest: encodeCandidateBNormalizationManifest(
      snapshot.normalizationManifest,
      snapshot.normalizationManifestHash
    ),
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

function mockDb(options: {
  parent: ReturnType<typeof parentFromSnapshot> | null;
  queryRaw?: jest.Mock;
}) {
  const queryRaw = options.queryRaw ?? jest.fn(async () => []);
  const findUnique = jest.fn(async (args: { where?: Record<string, unknown> }) => {
    expect(candidateBParentFindUniqueArgsExcludeChildInclude(args)).toBe(true);
    return options.parent;
  });
  return {
    db: {
      shadowModelFeatureSnapshot: { findUnique },
      $queryRaw: queryRaw,
    },
    findUnique,
    queryRaw,
  };
}

describe('Candidate B persisted snapshot reader', () => {
  it('parent reads exclude child Prisma include and use the exact child float8 reader', async () => {
    const snapshot = deriveSyntheticSnapshot(3);
    const parent = parentFromSnapshot(snapshot, 'parent-shared');
    const queryRaw = jest.fn(async (sql: Prisma.Sql) => {
      assertCandidateBChildSelectSqlContract(sql, 'parent-shared');
      return snapshot.teams.map(rawFromTeam);
    });
    const { db, findUnique } = mockDb({ parent, queryRaw });
    const loaded = await loadCandidateBPersistedSnapshotByStableIdentity(db);
    expect(findUnique).toHaveBeenCalledTimes(1);
    const args = findUnique.mock.calls[0][0] as Record<string, unknown>;
    expect(args).not.toHaveProperty('include');
    expect(
      (args.where as Record<string, unknown>)
        .season_featureDefinitionId_featureDefinitionVersion_derivationDefinitionId
    ).toEqual(CANDIDATE_B_V1_STABLE_IDENTITY);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(loaded?.teams).toHaveLength(3);
    expect(loaded?.normalizationManifestHash).toBe(snapshot.normalizationManifestHash);
    expect(
      verifyPersistedSnapshotIntegrity(loaded!, { expectedTeamCount: 3 })
    ).toBe(true);
  });

  it('stable-identity and snapshotHash reads return identical semantics', async () => {
    const snapshot = deriveSyntheticSnapshot(3);
    const parent = parentFromSnapshot(snapshot, 'parent-same');
    const queryRaw = jest.fn(async (sql: Prisma.Sql) => {
      assertCandidateBChildSelectSqlContract(sql, 'parent-same');
      return snapshot.teams.map(rawFromTeam);
    });
    const { db } = mockDb({ parent, queryRaw });
    const byIdentity = await loadCandidateBPersistedSnapshotByStableIdentity(db);
    const byHash = await loadCandidateBPersistedSnapshotBySnapshotHash(db, snapshot.snapshotHash);
    expect(byIdentity?.snapshotHash).toBe(byHash?.snapshotHash);
    expect(byIdentity?.teams.map((t) => t.rowHash)).toEqual(byHash?.teams.map((t) => t.rowHash));
    expect(byIdentity?.normalizationManifest).toEqual(byHash?.normalizationManifest);
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('ingest store reuses the shared exact reader', async () => {
    const snapshot = deriveSyntheticSnapshot(3);
    const parent = parentFromSnapshot(snapshot, 'store-parent');
    const queryRaw = jest.fn(async (sql: Prisma.Sql) => {
      assertCandidateBChildSelectSqlContract(sql, 'store-parent');
      return snapshot.teams.map(rawFromTeam);
    });
    const findUnique = jest.fn(async (args: Record<string, unknown>) => {
      expect(args).not.toHaveProperty('include');
      return parent;
    });
    const prisma = {
      shadowModelFeatureSnapshot: { findUnique },
      teamMembership: { findMany: async () => [] },
      teamSeasonTalent: { findMany: async () => [] },
      $queryRaw: queryRaw,
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          shadowModelFeatureSnapshot: { findUnique },
          $queryRaw: queryRaw,
        }),
    };
    const store = createPrismaCandidateBFeatureSnapshotStore(prisma as never);
    const loaded = await store.loadExistingByStableIdentity();
    expect(loaded?.id).toBe('store-parent');
    expect(loaded?.teams).toHaveLength(3);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('shared reader source uses exact child reader and canonical-text decoder', () => {
    const shared = fs.readFileSync(SHARED, 'utf8');
    const cli = fs.readFileSync(CLI, 'utf8');
    expect(shared).toContain('loadCandidateBFeatureSnapshotTeamsExact');
    expect(shared).toContain('decodeCandidateBNormalizationManifest');
    expect(shared).not.toMatch(/include:\s*\{\s*teams:\s*true\s*\}/);
    expect(cli).toContain('loadCandidateBPersistedSnapshotByStableIdentity');
    expect(cli).not.toMatch(/include:\s*\{\s*teams:\s*true\s*\}/);
  });
});
